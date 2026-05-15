import { useState, useEffect, useRef } from 'react';

import { createLogger } from '../lib/logger';

const logger = createLogger('WebSocket');

export type FileChangeEvent = {
  type: 'add' | 'change' | 'unlink';
  path: string;
  libraryRootId: string;
  timestamp: string;
};

export type ScanCompleteEvent = {
  libraryRootId: string;
  albumsDiscovered: number;
  assetsDiscovered: number;
  timestamp: string;
};

type WebSocketMessage = 
  | { type: 'file_change'; event: FileChangeEvent }
  | { type: 'scan_complete'; event: ScanCompleteEvent };

interface UseWebSocketReturn {
  isConnected: boolean;
  lastFileChange: FileChangeEvent | null;
  lastScanComplete: ScanCompleteEvent | null;
}

export function useWebSocket(
  onFileChange?: (event: FileChangeEvent) => void,
  onScanComplete?: (event: ScanCompleteEvent) => void
): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastFileChange, setLastFileChange] = useState<FileChangeEvent | null>(null);
  const [lastScanComplete, setLastScanComplete] = useState<ScanCompleteEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const onFileChangeRef = useRef(onFileChange);
  const onScanCompleteRef = useRef(onScanComplete);
  const connectRef = useRef<() => void>();

  onFileChangeRef.current = onFileChange;
  onScanCompleteRef.current = onScanComplete;

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.DEV
      ? `${window.location.hostname}:3211`
      : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      logger.info('连接已建立');
    };

    ws.onclose = () => {
      setIsConnected(false);
      logger.info('连接已断开');
      wsRef.current = null;
      
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectRef.current?.();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      logger.error('连接异常', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        if (message.type === 'file_change') {
          setLastFileChange(message.event);
          onFileChangeRef.current?.(message.event);
        } else if (message.type === 'scan_complete') {
          setLastScanComplete(message.event);
          onScanCompleteRef.current?.(message.event);
        }
      } catch (error) {
        logger.error('消息解析失败', error);
      }
    };
  };

  connectRef.current = connect;

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return { isConnected, lastFileChange, lastScanComplete };
}
