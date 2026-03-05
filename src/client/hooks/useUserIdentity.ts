import { useState, useEffect, useCallback } from 'react';
import type { Awareness } from 'y-protocols/awareness';

const STORAGE_KEY = 'collab-editor-identity';

interface UserIdentity {
  name: string;
  color: string;
}

/**
 * Generate a random vibrant color for cursor/selection highlighting.
 */
function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 45%)`;
}

/**
 * Load or create the user identity from localStorage.
 */
function loadIdentity(): UserIdentity {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.name && parsed.color) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  // First-time user — generate a random identity
  const identity: UserIdentity = {
    name: `User-${Math.floor(Math.random() * 10000)}`,
    color: randomColor(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

/**
 * Hook that manages user identity (display name + color) and publishes it
 * to the Y.js awareness protocol for cursor/presence sharing.
 */
export function useUserIdentity(awareness: Awareness | null) {
  const [identity, setIdentity] = useState<UserIdentity>(loadIdentity);

  // Publish identity to awareness whenever it changes
  useEffect(() => {
    if (!awareness) return;
    awareness.setLocalStateField('user', {
      name: identity.name,
      color: identity.color,
    });
  }, [awareness, identity]);

  const setName = useCallback((newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIdentity((prev) => {
      const updated = { ...prev, name: trimmed };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const setColor = useCallback((newColor: string) => {
    setIdentity((prev) => {
      const updated = { ...prev, color: newColor };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { identity, setName, setColor };
}
