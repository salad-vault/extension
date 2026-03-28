/**
 * WebSocket bridge client for communicating with the SaladVault desktop app.
 * Connects to the local WebSocket server running inside Tauri.
 */

const BRIDGE_URL = "ws://127.0.0.1:17295";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const REQUEST_TIMEOUT_MS = 5000;

export interface BridgeCredentials {
  title: string;
  username: string;
  password: string;
  url: string;
  notes?: string;
}

export interface BridgeSearchResult {
  feuille_id: string;
  saladier_id: string;
  title: string;
  username: string;
  url: string;
}

export interface BridgeSaladier {
  uuid: string;
  name: string;
  hidden: boolean;
}

type PendingRequest = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class BridgeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestId = 0;
  private _connected = false;
  private _authenticated = false;
  private reconnectDelay = RECONNECT_BASE_MS;
  private shouldReconnect = true;

  get connected() { return this._connected; }
  get authenticated() { return this._authenticated; }

  /** Load stored token from chrome.storage.local */
  async init() {
    const data = await chrome.storage.local.get("bridge_token");
    if (data.bridge_token) {
      this.token = data.bridge_token;
    }
    this.connect();
  }

  /** Connect to the desktop app WebSocket */
  connect() {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(BRIDGE_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = async () => {
      this._connected = true;
      this.reconnectDelay = RECONNECT_BASE_MS;
      console.log("[Bridge] Connected");

      // Auto-authenticate if we have a token
      if (this.token) {
        try {
          await this.authenticate(this.token);
        } catch {
          console.warn("[Bridge] Stored token invalid, need re-pairing");
        }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const req = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          clearTimeout(req.timer);
          if (msg.ok) {
            req.resolve(msg.data);
          } else {
            req.reject(new Error(msg.error || "Unknown bridge error"));
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this._authenticated = false;
      this.ws = null;
      // Reject all pending requests
      for (const [id, req] of this.pending) {
        clearTimeout(req.timer);
        req.reject(new Error("Connection closed"));
      }
      this.pending.clear();
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.ws?.close();
  }

  private scheduleReconnect() {
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private send(request: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }
      const id = String(++this.requestId);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, ...request }));
    });
  }

  // ── API ──

  async authenticate(token: string): Promise<void> {
    await this.send({ type: "auth", token });
    this._authenticated = true;
    this.token = token;
  }

  async pair(code: string): Promise<string> {
    const data = await this.send({ type: "pair", code });
    const token = data.token as string;
    this.token = token;
    this._authenticated = true;
    // Persist token
    await chrome.storage.local.set({ bridge_token: token });
    return token;
  }

  async getStatus(): Promise<{ unlocked: boolean }> {
    return await this.send({ type: "get_status" });
  }

  async listSaladiers(): Promise<BridgeSaladier[]> {
    return await this.send({ type: "list_saladiers" });
  }

  async search(query: string): Promise<BridgeSearchResult[]> {
    return await this.send({ type: "search", query });
  }

  async getCredentials(feuilleId: string): Promise<BridgeCredentials> {
    return await this.send({ type: "get_credentials", feuille_id: feuilleId });
  }
}

export const bridgeClient = new BridgeClient();
