import type { FastifyInstance } from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "node:stream";

import { createLogger } from "../lib/logger.js";

const logger = createLogger("WebSocket");

type Client = {
  socket: WebSocket;
  id: string;
};

type FileChangeMessage = {
  type: "file_change";
  event: {
    type: "add" | "change" | "unlink";
    path: string;
    libraryRootId: string;
    timestamp: string;
  };
};

type ScanCompleteMessage = {
  type: "scan_complete";
  event: {
    libraryRootId: string;
    albumsDiscovered: number;
    assetsDiscovered: number;
    timestamp: string;
  };
};

type Message = FileChangeMessage | ScanCompleteMessage;

class WebSocketService {
  private clients: Map<string, Client> = new Map();
  private server: WebSocketServer | null = null;

  initialize(fastify: FastifyInstance): void {
    this.server = new WebSocketServer({ noServer: true });

    fastify.server.on("upgrade", (request, socket, head) => {
      if (request.url === "/ws") {
        this.handleUpgrade(request, socket, head);
      }
    });

    this.server.on("connection", (ws: WebSocket, request: IncomingMessage) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const client: Client = { socket: ws, id: clientId };
      this.clients.set(clientId, client);

      ws.on("close", () => {
        this.clients.delete(clientId);
      });

      ws.on("error", (error) => {
        logger.error(`客户端连接异常：clientId=${clientId}`, error);
        this.clients.delete(clientId);
      });
    });
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.server) return;

    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.server?.emit("connection", ws, request);
    });
  }

  broadcast(message: Message): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data);
      }
    }
  }

  sendFileChange(event: FileChangeMessage["event"]): void {
    this.broadcast({
      type: "file_change",
      event
    });
  }

  sendScanComplete(event: ScanCompleteMessage["event"]): void {
    this.broadcast({
      type: "scan_complete",
      event
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    for (const client of this.clients.values()) {
      client.socket.close();
    }
    this.clients.clear();
    this.server?.close();
  }
}

export const wsService = new WebSocketService();
