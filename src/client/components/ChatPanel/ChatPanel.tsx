import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useChatHistory } from '../../hooks/useChatHistory';
import { useAiChat } from '../../hooks/useAiChat';

interface ChatPanelProps {
  activeFilePath: string | null;
  identity: { name: string; color: string };
  yText: Y.Text | null;
  awareness: Awareness | null;
}

export default function ChatPanel({ activeFilePath, identity, yText, awareness }: ChatPanelProps) {
  const { messages, addMessage, updateMessage, clearHistory } = useChatHistory(activeFilePath);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSummarisePrompt, setShowSummarisePrompt] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const {
    sendMessage,
    cancelRequest,
    isStreaming,
    isQueued,
    queuePosition,
    error,
    aiEnabled,
    aiModel,
    needsSummarisation,
  } = useAiChat({
    filePath: activeFilePath,
    yText,
    awareness,
    chatHistory: messages,
    addMessage,
    updateMessage,
    userName: identity.name,
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content: string) => {
    if (!yText) return;

    // Check if summarisation is needed
    const docContent = yText.toString();
    if (needsSummarisation(docContent)) {
      setPendingMessage(content);
      setShowSummarisePrompt(true);
      return;
    }

    sendMessage(content);
  };

  const handleSummariseChoice = (summarise: boolean) => {
    setShowSummarisePrompt(false);
    if (pendingMessage) {
      sendMessage(pendingMessage, summarise);
      setPendingMessage(null);
    }
  };

  const handleCancelSummarise = () => {
    setShowSummarisePrompt(false);
    setPendingMessage(null);
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <span className="chat-title">Chat</span>
        {aiEnabled && (
          <span className="chat-model-badge" title={`Model: ${aiModel}`}>
            🤖 {aiModel}
          </span>
        )}
        <div className="chat-header-actions">
          {messages.length > 0 && (
            <button
              className="chat-clear-btn"
              onClick={clearHistory}
              title="Clear chat history"
              disabled={isStreaming}
            >
              🗑
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {!activeFilePath && (
          <div className="chat-placeholder">
            <p>Open a file to start chatting</p>
          </div>
        )}

        {activeFilePath && !aiEnabled && (
          <div className="chat-unavailable">
            <p>🤖 AI is not configured</p>
            <p className="chat-unavailable-hint">
              Set <code>AI_ENDPOINT</code> in .env to enable AI features.
            </p>
          </div>
        )}

        {activeFilePath && aiEnabled && messages.length === 0 && !isStreaming && (
          <div className="chat-placeholder">
            <p>💬 Ask the AI about this document</p>
            <p className="chat-placeholder-hint">
              The AI can answer questions, review content, and make edits.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
          />
        ))}

        {isQueued && (
          <div className="chat-queue-indicator">
            ⏳ Your request is #{queuePosition} in queue...
          </div>
        )}

        {error && (
          <div className="chat-error">
            ⚠️ {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Summarise prompt overlay */}
      {showSummarisePrompt && (
        <div className="chat-summarise-prompt">
          <p>⚠️ This document may exceed the AI context limit.</p>
          <div className="chat-summarise-actions">
            <button onClick={() => handleSummariseChoice(true)}>Send summarised</button>
            <button onClick={() => handleSummariseChoice(false)}>Send anyway (truncated)</button>
            <button onClick={handleCancelSummarise}>Cancel</button>
          </div>
        </div>
      )}

      <div className="chat-input-wrapper">
        {isStreaming && (
          <button className="chat-cancel-btn" onClick={cancelRequest}>
            ⏹ Stop
          </button>
        )}
        <ChatInput
          onSend={handleSend}
          disabled={!activeFilePath || !aiEnabled || isStreaming}
          placeholder={
            !activeFilePath
              ? 'Open a file first...'
              : !aiEnabled
                ? 'AI not configured...'
                : isStreaming
                  ? 'AI is responding...'
                  : 'Ask the AI... (Enter to send)'
          }
        />
      </div>
    </div>
  );
}
