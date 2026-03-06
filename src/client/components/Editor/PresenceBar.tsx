import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
}

interface PresenceBarProps {
  awareness: Awareness | null;
}

/**
 * Displays a row of colored dots/names for each connected user.
 * Reads from the Y.js awareness protocol.
 */
export default function PresenceBar({ awareness }: PresenceBarProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!awareness) {
      setUsers([]);
      return;
    }

    const updateUsers = () => {
      const states = awareness.getStates();
      const result: PresenceUser[] = [];
      states.forEach((state, clientId) => {
        if (state.user) {
          result.push({
            clientId,
            name: state.user.name || `User-${clientId}`,
            color: state.user.color || '#888',
          });
        }
      });
      setUsers(result);
    };

    updateUsers();
    awareness.on('change', updateUsers);
    return () => {
      awareness.off('change', updateUsers);
    };
  }, [awareness]);

  if (users.length === 0) return null;

  return (
    <div className="presence-bar">
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
