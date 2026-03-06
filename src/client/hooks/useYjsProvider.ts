import { useEffect, useRef, useState, useMemo } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';

interface YjsProviderState {
  yDoc: Y.Doc;
  yText: Y.Text;
  provider: WebsocketProvider;
  awareness: Awareness;
  connected: boolean;
}

/**
 * Hook that manages a Y.Doc + WebSocket connection for a given file path.
 * Returns the Y.Doc, Y.Text, provider, awareness, and connection status.
 *
 * The WebSocket URL is derived from the current page origin, connecting
 * to our custom Y.js server at /yjs/<roomName>.
 */
export function useYjsProvider(filePath: string | null): YjsProviderState | null {
  const [state, setState] = useState<YjsProviderState | null>(null);
  const [connected, setConnected] = useState(false);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);

  // Build the WebSocket URL from the page origin
  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }, []);

  useEffect(() => {
    if (!filePath) {
      setState(null);
      return;
    }

    // Create a new Y.Doc for this file
    const doc = new Y.Doc();
    const yText = doc.getText('document');

    // Room name is the file path (e.g. "welcome.md", "example/nested-doc.md")
    const roomName = filePath;

    // Connect to the Y.js WebSocket server
    // y-websocket's WebsocketProvider connects to `${wsUrl}/yjs/${roomName}`
    // when we use the url as the base and roomName as the room
    const provider = new WebsocketProvider(
      `${wsUrl}/yjs`,
      roomName,
      doc,
      {
        connect: true,
        // Disable y-websocket's built-in awareness protocol handling
        // since our server handles it manually via the same protocol
      }
    );

    const awareness = provider.awareness;

    docRef.current = doc;
    providerRef.current = provider;

    // Track connection status
    const onStatus = ({ status }: { status: string }) => {
      const isConnected = status === 'connected';
      setConnected(isConnected);
    };
    provider.on('status', onStatus);

    setState({
      yDoc: doc,
      yText,
      provider,
      awareness,
      connected: false,
    });

    return () => {
      provider.off('status', onStatus);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      docRef.current = null;
      setState(null);
      setConnected(false);
    };
  }, [filePath, wsUrl]);

  // Keep the connected status in sync with the state object
  return state ? { ...state, connected } : null;
}
