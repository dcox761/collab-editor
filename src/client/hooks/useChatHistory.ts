import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChatEdit {
  search: string;
  replace: string;
  applied: boolean;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  edits?: ChatEdit[];
}

function storageKey(filePath: string): string {
  return `collab-chat:${filePath}`;
}

function loadMessages(filePath: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(filePath));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function persistMessages(filePath: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(storageKey(filePath), JSON.stringify(messages));
  } catch (err) {
    console.warn('[ChatHistory] localStorage write failed:', err);
  }
}

export function useChatHistory(filePath: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const filePathRef = useRef(filePath);

  // Load messages when filePath changes
  useEffect(() => {
    filePathRef.current = filePath;
    if (filePath) {
      setMessages(loadMessages(filePath));
    } else {
      setMessages([]);
    }
  }, [filePath]);

  const addMessage = useCallback(
    (msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage => {
      const newMsg: ChatMessage = {
        ...msg,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const next = [...prev, newMsg];
        if (filePathRef.current) persistMessages(filePathRef.current, next);
        return next;
      });
      return newMsg;
    },
    []
  );

  const updateMessage = useCallback(
    (id: string, updates: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === id ? { ...m, ...updates } : m));
        if (filePathRef.current) persistMessages(filePathRef.current, next);
        return next;
      });
    },
    []
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    if (filePathRef.current) {
      try {
        localStorage.removeItem(storageKey(filePathRef.current));
      } catch {
        // ignore
      }
    }
  }, []);

  return { messages, addMessage, updateMessage, clearHistory };
}
