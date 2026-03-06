import { useState, useCallback, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { ChatMessage, ChatEdit } from './useChatHistory';
import { applyAiEdits, type EditOperation } from '../services/applyAiEdits';

interface UseAiChatOpts {
  filePath: string | null;
  yText: Y.Text | null;
  awareness: Awareness | null;
  chatHistory: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => ChatMessage;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  userName: string;
}

interface AiConfig {
  enabled: boolean;
  model: string;
}

interface AiBudget {
  contextWindow: number;
  maxTokens: number;
  availableForDoc: number;
}

export function useAiChat({
  filePath,
  yText,
  awareness,
  chatHistory,
  addMessage,
  updateMessage,
  userName,
}: UseAiChatOpts) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig>({ enabled: false, model: '' });
  const [aiBudget, setAiBudget] = useState<AiBudget | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);

  // Fetch AI config on mount
  useEffect(() => {
    fetch('/api/ai/config')
      .then((r) => r.json())
      .then((data) => setAiConfig(data))
      .catch(() => setAiConfig({ enabled: false, model: '' }));

    fetch('/api/ai/budget')
      .then((r) => r.json())
      .then((data) => setAiBudget(data))
      .catch(() => {});
  }, []);

  /**
   * Estimate tokens for a string (same heuristic as server).
   */
  const estimateTokens = useCallback((text: string) => Math.ceil(text.length / 4), []);

  /**
   * Check whether the document exceeds the available context budget.
   * Returns true if summarisation should be offered.
   */
  const needsSummarisation = useCallback(
    (docContent: string): boolean => {
      if (!aiBudget) return false;
      return estimateTokens(docContent) > aiBudget.availableForDoc;
    },
    [aiBudget, estimateTokens]
  );

  /**
   * Send a message to the AI and stream the response.
   */
  const sendMessage = useCallback(
    async (content: string, summarise = false) => {
      console.log('[Chat] sendMessage called', { filePath, hasYText: !!yText, content: content.slice(0, 50) });
      if (!filePath || !yText) {
        console.warn('[Chat] sendMessage aborted: filePath or yText is null', { filePath, yText: !!yText });
        return;
      }

      setError(null);
      setIsQueued(false);
      setQueuePosition(0);

      // Add user message to history
      addMessage({ role: 'user', content });

      // Create placeholder assistant message for streaming
      const assistantMsg = addMessage({ role: 'assistant', content: '' });
      streamingMsgIdRef.current = assistantMsg.id;
      setIsStreaming(true);

      // Set awareness AI-thinking flag
      if (awareness) {
        awareness.setLocalStateField('aiThinking', true);
      }

      // Build request body
      const documentContent = yText.toString();
      const historyForApi = chatHistory
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Add the current user message
      historyForApi.push({ role: 'user', content });

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulatedContent = '';
      let allEdits: ChatEdit[] = [];

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath,
            messages: historyForApi,
            documentContent,
            userName,
            summarise,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
              continue;
            }
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            let data: any;
            try {
              data = JSON.parse(dataStr);
            } catch {
              continue;
            }

            switch (currentEvent) {
              case 'delta': {
                accumulatedContent += data.content || '';
                updateMessage(assistantMsg.id, { content: accumulatedContent });
                break;
              }
              case 'edit': {
                if (data.edits && Array.isArray(data.edits) && yText) {
                  const editOps: EditOperation[] = data.edits;
                  const results = applyAiEdits(yText, editOps);
                  const chatEdits: ChatEdit[] = results.map((r) => ({
                    search: r.search,
                    replace: r.replace,
                    applied: r.applied,
                    reason: r.reason,
                  }));
                  allEdits = [...allEdits, ...chatEdits];
                  updateMessage(assistantMsg.id, {
                    content: accumulatedContent,
                    edits: allEdits,
                  });
                }
                break;
              }
              case 'queued': {
                setIsQueued(true);
                setQueuePosition(data.position || 0);
                break;
              }
              case 'error': {
                setError(data.message || 'AI error');
                break;
              }
              case 'done': {
                // Streaming complete
                break;
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to get AI response');
          // Update assistant message to show error
          if (streamingMsgIdRef.current) {
            updateMessage(streamingMsgIdRef.current, {
              content:
                accumulatedContent || `*Error: ${err.message || 'Failed to get AI response'}*`,
            });
          }
        }
      } finally {
        setIsStreaming(false);
        setIsQueued(false);
        setQueuePosition(0);
        streamingMsgIdRef.current = null;
        abortRef.current = null;

        // Clear awareness AI-thinking flag
        if (awareness) {
          awareness.setLocalStateField('aiThinking', false);
        }
      }
    },
    [filePath, yText, awareness, chatHistory, addMessage, updateMessage, userName]
  );

  /**
   * Cancel an in-flight AI request.
   */
  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    sendMessage,
    cancelRequest,
    isStreaming,
    isQueued,
    queuePosition,
    error,
    aiEnabled: aiConfig.enabled,
    aiModel: aiConfig.model,
    needsSummarisation,
  };
}
