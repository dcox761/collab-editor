import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'collab-editor-identity';
const CHANNEL_NAME = 'collab-editor-presence';

interface UserIdentity {
  name: string;
  color: string;
}

interface PresenceMessage {
  type: 'hello' | 'bye' | 'roll-call' | 'here';
  sessionId: string;
  baseName: string;
}

/**
 * Generate a random vibrant color for cursor/selection highlighting.
 */
function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 45%)`;
}

/**
 * Generate a unique session ID for this tab/window.
 * Uses crypto.randomUUID if available, falls back to Math.random.
 */
function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Load the stored user identity from localStorage, or return null if none exists.
 */
function loadStoredIdentity(): UserIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.name && parsed.color) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Save identity to localStorage.
 */
function saveIdentity(identity: UserIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

/**
 * Hook that manages user identity (display name + color), prompt state,
 * multi-window session suffix, and change dialog state.
 *
 * - On first visit (no stored name), shows a prompt dialog.
 * - Different browser windows/private sessions can have different names.
 * - If the same user opens multiple windows, a numeric suffix is auto-added
 *   to the session name (e.g. "Alice (2)") but NOT stored in localStorage.
 * - Exposes a change-name dialog trigger.
 */
export function useUserIdentity() {
  // Unique ID for this tab — stable across re-renders, NOT persisted to storage
  const sessionIdRef = useRef(generateSessionId());

  // Base identity from localStorage
  const [identity, setIdentity] = useState<UserIdentity>(() => {
    const stored = loadStoredIdentity();
    if (stored) return stored;
    // Generate random identity — user will be prompted to change it
    return { name: `User-${Math.floor(Math.random() * 10000)}`, color: randomColor() };
  });

  // Whether we need to show the initial username prompt
  const [needsPrompt, setNeedsPrompt] = useState(() => loadStoredIdentity() === null);

  // Tracks other sessions with the same base name
  const [otherSessions, setOtherSessions] = useState<Map<string, string>>(new Map());

  // Whether the "change username" dialog is open
  const [showChangeDialog, setShowChangeDialog] = useState(false);

  // BroadcastChannel for multi-window coordination
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Set up BroadcastChannel for multi-window detection
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    const handleMessage = (event: MessageEvent<PresenceMessage>) => {
      const msg = event.data;
      if (!msg || msg.sessionId === sessionIdRef.current) return;

      switch (msg.type) {
        case 'hello':
        case 'here':
          // Another tab announced itself
          setOtherSessions((prev) => {
            const next = new Map(prev);
            next.set(msg.sessionId, msg.baseName);
            return next;
          });
          // Respond so they know about us too (only on hello, not on here to avoid loops)
          if (msg.type === 'hello') {
            channel.postMessage({
              type: 'here',
              sessionId: sessionIdRef.current,
              baseName: identity.name,
            } satisfies PresenceMessage);
          }
          break;
        case 'bye':
          setOtherSessions((prev) => {
            const next = new Map(prev);
            next.delete(msg.sessionId);
            return next;
          });
          break;
      }
    };

    channel.addEventListener('message', handleMessage);

    // Announce ourselves
    channel.postMessage({
      type: 'hello',
      sessionId: sessionIdRef.current,
      baseName: identity.name,
    } satisfies PresenceMessage);

    // Clean up on tab close
    const handleUnload = () => {
      channel.postMessage({
        type: 'bye',
        sessionId: sessionIdRef.current,
        baseName: identity.name,
      } satisfies PresenceMessage);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      handleUnload();
      channel.removeEventListener('message', handleMessage);
      channel.close();
      channelRef.current = null;
      window.removeEventListener('beforeunload', handleUnload);
    };
    // Re-run when identity.name changes so we announce the new name
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.name]);

  // Compute the session-specific display name (with suffix if needed)
  const sessionName = (() => {
    // Count how many other sessions share our base name
    const sameNameSessions: string[] = [];
    otherSessions.forEach((baseName, sid) => {
      if (baseName === identity.name) {
        sameNameSessions.push(sid);
      }
    });

    if (sameNameSessions.length === 0) {
      return identity.name; // No duplicates
    }

    // Sort session IDs to get a deterministic ordering
    const allSessions = [sessionIdRef.current, ...sameNameSessions].sort();
    const myIndex = allSessions.indexOf(sessionIdRef.current);

    if (myIndex === 0) {
      return identity.name; // First session keeps the plain name
    }
    return `${identity.name} (${myIndex + 1})`;
  })();

  const setName = useCallback((newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIdentity((prev) => {
      const updated = { ...prev, name: trimmed };
      saveIdentity(updated);
      return updated;
    });
  }, []);

  const setColor = useCallback((newColor: string) => {
    setIdentity((prev) => {
      const updated = { ...prev, color: newColor };
      saveIdentity(updated);
      return updated;
    });
  }, []);

  const dismissPrompt = useCallback(() => {
    setNeedsPrompt(false);
    // Even if they dismiss without changing, save the generated identity
    saveIdentity(identity);
  }, [identity]);

  return {
    /** The base identity stored in localStorage */
    identity,
    /** The session-specific display name (may include suffix for duplicate tabs) */
    sessionName,
    /** Whether the initial "choose your name" prompt should be shown */
    needsPrompt,
    /** Set the base display name (saved to localStorage) */
    setName,
    /** Set the cursor/presence color */
    setColor,
    /** Dismiss the initial prompt */
    dismissPrompt,
    /** Whether the "change username" dialog is open */
    showChangeDialog,
    /** Toggle the change-username dialog */
    setShowChangeDialog,
  };
}
