import { useState, useEffect, useRef } from 'react';

import { createLogger } from '../lib/logger';
import { clearAuthSession, notifyAuthExpired } from '../app/auth-session';
import { api } from '../lib/api';

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
  failureCount?: number;
  message?: string | null;
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
  onScanComplete?: (event: ScanCompleteEvent) => void,
  enabled = false
): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastFileChange, setLastFileChange] = useState<FileChangeEvent | null>(null);
  const [lastScanComplete, setLastScanComplete] = useState<ScanCompleteEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const onFileChangeRef = useRef(onFileChange);
  const onScanCompleteRef = useRef(onScanComplete);
  const connectRef = useRef<() => void>();
  const activeRef = useRef(false);
  const lifecycleRef = useRef(0);

  onFileChangeRef.current = onFileChange;
  onScanCompleteRef.current = onScanComplete;

  const connect = async () => {
    if (!activeRef.current) return;
    const lifecycle = lifecycleRef.current;
    try { await api.get('/auth/session'); }
    catch (error) {
      if (!activeRef.current || lifecycleRef.current !== lifecycle) return;
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401) { activeRef.current = false; clearAuthSession(); notifyAuthExpired(); return; }
      reconnectTimeoutRef.current = window.setTimeout(() => { reconnectTimeoutRef.current = null; void connectRef.current?.(); }, 3000);
      return;
    }
    if (!activeRef.current || lifecycleRef.current !== lifecycle) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!activeRef.current || wsRef.current !== ws) return;
      setIsConnected(true);
      logger.info('连接已建立');
    };

    ws.onclose = (event) => {
      if (!activeRef.current || wsRef.current !== ws) return;
      setIsConnected(false);
      logger.info('连接已断开');
      wsRef.current = null;
      if (event.code === 4001) {
        activeRef.current = false;
        clearAuthSession();
        notifyAuthExpired();
        return;
      }
      
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
      if (!activeRef.current || wsRef.current !== ws) return;
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
    lifecycleRef.current += 1;
    activeRef.current = enabled;
    if (!enabled) { setIsConnected(false); return; }
    connect();

    return () => {
      lifecycleRef.current += 1;
      activeRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [enabled]);

  return { isConnected, lastFileChange, lastScanComplete };
}
