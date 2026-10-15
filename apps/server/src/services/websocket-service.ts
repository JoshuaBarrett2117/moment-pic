import type { FastifyInstance } from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { AUTH_COOKIE_NAME, isAuthenticated, parseCookies } from "../lib/auth.js";
import { isAllowedOrigin } from "../lib/origin.js";

type FileChangeMessage = {
  type: "file_change";
  event: { type: "add" | "change" | "unlink"; path: string; libraryRootId: string; timestamp: string };
};
type ScanCompleteMessage = {
  type: "scan_complete";
  event: { libraryRootId: string; albumsDiscovered: number; assetsDiscovered: number; timestamp: string; failureCount?: number; message?: string | null };
};
type Message = FileChangeMessage | ScanCompleteMessage;
type Client = { socket: WebSocket; ip: string; expiresAt: number; expiry: NodeJS.Timeout };
type SocketLimits = { global: number; perClient: number; bufferedBytes: number };
const DEFAULT_LIMITS: SocketLimits = { global: 64, perClient: 4, bufferedBytes: 1024 * 1024 };

export class WebSocketService {
  private readonly clients = new Set<Client>();
  private server: WebSocketServer | null = null;

  constructor(private readonly limits: SocketLimits = DEFAULT_LIMITS) {}

  initialize(fastify: FastifyInstance): void {
    this.server = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
    const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      socket.once("error", () => socket.destroy());
      const deny = (status: number) => {
        const deadline = setTimeout(() => socket.destroy(), 250);
        deadline.unref();
        socket.once("close", () => clearTimeout(deadline));
        socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => socket.destroy());
      };
      if (request.url !== "/ws" || request.method !== "GET") { deny(400); return; }
      if (!isAuthenticated(request, fastify.config.adminPassword)) { deny(401); return; }
      if (!isAllowedOrigin(request, fastify.config.wsAllowedOrigins)) { deny(403); return; }
      const ip = request.socket.remoteAddress ?? "unknown";
      if (this.clients.size >= this.limits.global || [...this.clients].filter((client) => client.ip === ip).length >= this.limits.perClient) { deny(429); return; }
      const token = parseCookies(request.headers.cookie)[AUTH_COOKIE_NAME];
      const expiresAt = (JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()) as { exp: number }).exp;
      try {
        this.server?.handleUpgrade(request, socket, head, (ws) => {
          const expiry = setTimeout(() => {
            ws.close(4001, "会话已过期");
            const terminate = setTimeout(() => ws.terminate(), 1000);
            terminate.unref();
          }, Math.min(expiresAt - Date.now(), 2_147_483_647));
          expiry.unref();
          const client: Client = { socket: ws, ip, expiresAt, expiry };
          this.clients.add(client);
          ws.on("error", () => ws.terminate());
          ws.once("close", () => { clearTimeout(expiry); this.clients.delete(client); });
        });
      } catch { socket.destroy(); }
    };
    fastify.server.on("upgrade", upgrade);
    fastify.addHook("onClose", async () => { fastify.server.removeListener("upgrade", upgrade); this.close(); });
  }

  broadcast(message: Message): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.expiresAt <= Date.now()) { client.socket.close(4001, "会话已过期"); continue; }
      if (client.socket.bufferedAmount + Buffer.byteLength(data) > this.limits.bufferedBytes) { client.socket.terminate(); continue; }
      if (client.socket.readyState === WebSocket.OPEN) client.socket.send(data, (error) => { if (error) client.socket.terminate(); });
    }
  }

  sendFileChange(event: FileChangeMessage["event"]): void {
    const normalized = event.path.replace(/\\/g, "/");
    const safePath = normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").includes("..") ? "" : normalized;
    this.broadcast({ type: "file_change", event: { ...event, path: safePath } });
  }

  sendScanComplete(event: ScanCompleteMessage["event"]): void { this.broadcast({ type: "scan_complete", event }); }
  getClientCount(): number { return this.clients.size; }
  close(): void {
    for (const client of this.clients) { clearTimeout(client.expiry); client.socket.terminate(); }
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }
}

export const wsService = new WebSocketService();
