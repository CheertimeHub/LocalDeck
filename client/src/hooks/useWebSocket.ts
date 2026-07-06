import { useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '../types';

// เชื่อม WebSocket เส้นเดียวทั้งแอป พร้อม auto-reconnect
export function useWebSocket(onMessage: (msg: ServerMessage) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => handlerRef.current(JSON.parse(event.data));
      ws.onclose = () => {
        setConnected(false);
        if (!disposed) retry = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return connected;
}
