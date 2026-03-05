import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import {
  getOrCreateDoc,
  addClient,
  removeClient,
} from '../services/yjsService.js';
import {
  loadDocFromDisk,
  markDirty,
  saveDocToDisk,
} from '../services/yjsPersistence.js';

// Y.js WebSocket message types
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// Module-level reference to the WebSocket server (set once in setupYjsWebSocket)
let wss: WebSocketServer;

/**
 * Per-room awareness instance.
 * Awareness tracks user presence (name, color, cursor position).
 */
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();

function getOrCreateAwareness(roomName: string, doc: Y.Doc): awarenessProtocol.Awareness {
  let awareness = awarenessMap.get(roomName);
  if (!awareness) {
    awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(roomName, awareness);
  }
  return awareness;
}

function destroyAwareness(roomName: string): void {
  const awareness = awarenessMap.get(roomName);
  if (awareness) {
    awareness.destroy();
    awarenessMap.delete(roomName);
  }
}

interface ClientInfo {
  roomName: string;
  awareness: awarenessProtocol.Awareness;
}

/**
 * Set up the Y.js WebSocket server on the given HTTP server.
 * Handles upgrade requests at /yjs/* paths.
 */
export function setupYjsWebSocket(server: http.Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';

    // Only handle /yjs/* paths
    if (!url.startsWith('/yjs/')) {
      // Let other upgrade handlers (if any) handle it, or destroy
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
      handleConnection(ws, url);
    });
  });

  console.log('[Y.js WS] WebSocket server attached to HTTP server');
}

/**
 * Handle a new WebSocket connection for a Y.js room.
 */
async function handleConnection(ws: WebSocket, url: string): Promise<void> {
  // Extract room name from URL: /yjs/welcome.md or /yjs/example%2Fnested-doc.md
  const roomName = decodeURIComponent(url.slice('/yjs/'.length));

  if (!roomName) {
    ws.close(4000, 'Missing room name');
    return;
  }

  console.log(`[Y.js WS] New connection for room: ${roomName}`);

  // Get or create the Y.Doc for this room
  const { doc, isNew } = getOrCreateDoc(roomName);

  // If this is a brand new room, load content from disk
  if (isNew) {
    try {
      await loadDocFromDisk(roomName, doc);
    } catch (err) {
      console.error(`[Y.js WS] Failed to initialize room ${roomName}:`, err);
      ws.close(4001, 'Failed to initialize document');
      return;
    }
  }

  // Get or create awareness for this room
  const awareness = getOrCreateAwareness(roomName, doc);

  // Register this client
  addClient(roomName, ws);

  // Listen for Y.Doc updates → broadcast to all clients in the room
  const docUpdateHandler = (update: Uint8Array, origin: any) => {
    // Don't echo back to the origin client
    if (origin === ws) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    broadcastToRoom(wss, ws, roomName, message);

    // Mark as dirty for periodic save
    markDirty(roomName);
  };
  doc.on('update', docUpdateHandler);

  // Listen for awareness updates → broadcast to all clients
  const awarenessChangeHandler = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: any
  ) => {
    const changedClients = [...added, ...updated, ...removed];
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const message = encoding.toUint8Array(encoder);
    broadcastToRoom(wss, null, roomName, message);
  };
  awareness.on('update', awarenessChangeHandler);

  // Send initial sync step 1 to the new client
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(ws, encoding.toUint8Array(encoder));
  }

  // Send current awareness state to the new client
  {
    const states = awareness.getStates();
    if (states.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          Array.from(states.keys())
        )
      );
      send(ws, encoding.toUint8Array(encoder));
    }
  }

  // Store client info for cleanup
  const clientInfo: ClientInfo = { roomName, awareness };
  (ws as any).__yjsInfo = clientInfo;

  // Handle incoming messages from this client
  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const message = new Uint8Array(
        data instanceof ArrayBuffer ? data : (data as Buffer)
      );
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MSG_SYNC: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MSG_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
          if (encoding.length(encoder) > 1) {
            send(ws, encoding.toUint8Array(encoder));
          }
          // Mark dirty if the sync message contained an update
          markDirty(roomName);
          break;
        }
        case MSG_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          break;
        }
        default:
          console.warn(`[Y.js WS] Unknown message type: ${messageType}`);
      }
    } catch (err) {
      console.error(`[Y.js WS] Error processing message in room ${roomName}:`, err);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    doc.off('update', docUpdateHandler);
    awareness.off('update', awarenessChangeHandler);

    // Remove this client's awareness state
    awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);

    removeClient(roomName, ws, async (name, d) => {
      // Cleanup callback — save to disk and destroy awareness
      await saveDocToDisk(name, d);
      destroyAwareness(name);
    });
  });

  ws.on('error', (err: Error) => {
    console.error(`[Y.js WS] WebSocket error in room ${roomName}:`, err);
  });
}

/**
 * Send a message to a specific WebSocket client.
 */
function send(ws: WebSocket, message: Uint8Array): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  }
}

/**
 * Broadcast a message to all clients in a room, optionally excluding one.
 */
function broadcastToRoom(
  wss: WebSocketServer,
  exclude: WebSocket | null,
  roomName: string,
  message: Uint8Array
): void {
  wss.clients.forEach((client) => {
    if (
      client !== exclude &&
      client.readyState === WebSocket.OPEN &&
      (client as any).__yjsInfo?.roomName === roomName
    ) {
      client.send(message);
    }
  });
}
