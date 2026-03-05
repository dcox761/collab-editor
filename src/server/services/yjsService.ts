import * as Y from 'yjs';

interface RoomInfo {
  doc: Y.Doc;
  clients: Set<object>;  // WebSocket connections
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, RoomInfo>();

/**
 * Grace period before destroying an idle room (30 seconds).
 * Allows clients to reconnect after brief disconnections.
 */
const CLEANUP_DELAY_MS = 30_000;

/**
 * Get an existing room's Y.Doc, or return null if the room doesn't exist.
 */
export function getDoc(roomName: string): Y.Doc | null {
  return rooms.get(roomName)?.doc ?? null;
}

/**
 * Get or create a Y.Doc for the given room.
 * Returns the doc, whether it was newly created, and whether it was
 * recovered from the grace-period (no active clients, cleanup pending).
 */
export function getOrCreateDoc(roomName: string): { doc: Y.Doc; isNew: boolean; wasGracePeriod: boolean } {
  const existing = rooms.get(roomName);
  if (existing) {
    const wasGracePeriod = existing.cleanupTimer !== null;
    // Cancel any pending cleanup since a new connection is arriving
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer);
      existing.cleanupTimer = null;
      console.log(`[Y.js] Room revived from grace period: ${roomName}`);
    }
    return { doc: existing.doc, isNew: false, wasGracePeriod };
  }

  const doc = new Y.Doc({ gc: true });
  rooms.set(roomName, {
    doc,
    clients: new Set(),
    cleanupTimer: null,
  });

  console.log(`[Y.js] Created room: ${roomName}`);
  return { doc, isNew: true, wasGracePeriod: false };
}

/**
 * Register a client connection to a room.
 */
export function addClient(roomName: string, client: object): void {
  const room = rooms.get(roomName);
  if (room) {
    room.clients.add(client);
    console.log(`[Y.js] Client joined room: ${roomName} (${room.clients.size} clients)`);
  }
}

/**
 * Remove a client connection from a room.
 * If the room has no more clients, schedule cleanup after grace period.
 */
export function removeClient(
  roomName: string,
  client: object,
  onCleanup: (roomName: string, doc: Y.Doc) => Promise<void>
): void {
  const room = rooms.get(roomName);
  if (!room) return;

  room.clients.delete(client);
  console.log(`[Y.js] Client left room: ${roomName} (${room.clients.size} clients)`);

  if (room.clients.size === 0) {
    // Schedule cleanup after grace period
    room.cleanupTimer = setTimeout(async () => {
      // Double-check no clients reconnected
      const currentRoom = rooms.get(roomName);
      if (currentRoom && currentRoom.clients.size === 0) {
        try {
          await onCleanup(roomName, currentRoom.doc);
        } catch (err) {
          console.error(`[Y.js] Error during room cleanup for ${roomName}:`, err);
        }
        currentRoom.doc.destroy();
        rooms.delete(roomName);
        console.log(`[Y.js] Destroyed room: ${roomName}`);
      }
    }, CLEANUP_DELAY_MS);
  }
}

/**
 * Get all active room names. Used by the periodic save loop.
 */
export function getActiveRoomNames(): string[] {
  return Array.from(rooms.keys());
}

/**
 * Get the number of connected clients for a room.
 */
export function getClientCount(roomName: string): number {
  return rooms.get(roomName)?.clients.size ?? 0;
}

/**
 * Force destroy all rooms. Used during server shutdown.
 */
export async function destroyAllRooms(
  onCleanup: (roomName: string, doc: Y.Doc) => Promise<void>
): Promise<void> {
  for (const [roomName, room] of rooms) {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }
    try {
      await onCleanup(roomName, room.doc);
    } catch (err) {
      console.error(`[Y.js] Error saving room ${roomName} during shutdown:`, err);
    }
    room.doc.destroy();
  }
  rooms.clear();
  console.log('[Y.js] All rooms destroyed');
}
