import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
  aiThinking?: boolean;
}

interface PresenceBarProps {
  awareness: Awareness | null;
}

/**
 * Displays a row of colored dots/names for each connected user.
 * Reads from the Y.js awareness protocol.
 * Shows an AI thinking indicator when any peer has an active AI request.
 */
export default function PresenceBar({ awareness }: PresenceBarProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [aiThinking, setAiThinking] = useState(false);

  useEffect(() => {
    if (!awareness) {
      setUsers([]);
      setAiThinking(false);
      return;
    }

    const updateUsers = () => {
      const states = awareness.getStates();
      const result: PresenceUser[] = [];
      let anyAiThinking = false;
      states.forEach((state, clientId) => {
        if (state.user) {
          result.push({
            clientId,
            name: state.user.name || `User-${clientId}`,
            color: state.user.color || '#888',
            aiThinking: !!state.aiThinking,
          });
        }
        if (state.aiThinking) {
          anyAiThinking = true;
        }
      });
      setUsers(result);
      setAiThinking(anyAiThinking);
    };

    updateUsers();
    awareness.on('change', updateUsers);
    return () => {
      awareness.off('change', updateUsers);
    };
  }, [awareness]);

  if (users.length === 0 && !aiThinking) return null;

  return (
    <div className="presence-bar">
      {aiThinking && (
        <div className="ai-thinking-indicator" title="AI is thinking...">
          <span className="ai-thinking-icon">🤖</span>
          <span className="ai-thinking-text">AI thinking...</span>
        </div>
      )}
      {users.map((user) => (
        <div key={user.clientId} className="presence-user" title={user.name}>
          <span
            className="presence-dot"
            style={{ backgroundColor: user.color }}
          />
          <span className="presence-name">{user.name}</span>
        </div>
      ))}
    </div>
  );
}
