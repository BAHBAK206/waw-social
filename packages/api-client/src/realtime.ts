/** WebSocket client for the Go realtime hub: auth frame, ref-counted subscriptions, auto-reconnect. */

export interface Peer {
  connId: string;
  uid: string;
  name: string;
}

export interface Frame {
  type: 'welcome' | 'event' | 'signal' | 'peers' | 'subscribed' | 'unsubscribed' | 'error' | 'pong' | 'authed';
  id?: string;
  channel?: string;
  event?: string;
  code?: string;
  connId?: string;
  uid?: string;
  from?: Peer;
  peers?: Peer[];
  data?: unknown;
}

export type ChannelHandler = (frame: Frame) => void;
export type Status = 'idle' | 'connecting' | 'open' | 'closed';

export interface RealtimeOptions {
  url: () => string | null;
  token: () => string | null | Promise<string | null>;
  WebSocketImpl?: typeof WebSocket;
  onStatus?: (s: Status) => void;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private status: Status = 'idle';
  private handlers = new Map<string, Set<ChannelHandler>>();
  private global = new Set<ChannelHandler>();
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  connId: string | null = null;

  constructor(private readonly opts: RealtimeOptions) {}

  get state() {
    return this.status;
  }

  private setStatus(s: Status) {
    this.status = s;
    this.opts.onStatus?.(s);
  }

  connect() {
    this.wanted = true;
    if (this.ws && (this.status === 'open' || this.status === 'connecting')) return;
    void this.open();
  }

  disconnect() {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.ws?.close(1000, 'bye');
    this.ws = null;
    this.connId = null;
    this.setStatus('closed');
  }

  private async open() {
    const url = this.opts.url();
    const token = await this.opts.token();
    if (!url || !token) {
      this.scheduleReconnect();
      return;
    }
    const Impl = this.opts.WebSocketImpl ?? WebSocket;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new Impl(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (ev) => {
      let frame: Frame;
      try {
        frame = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as Frame;
      } catch {
        return;
      }
      this.dispatch(frame);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (this.ping) clearInterval(this.ping);
      this.connId = null;
      this.setStatus('closed');
      if (this.wanted) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect() {
    if (!this.wanted) return;
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.min(30_000, 1000 * 2 ** this.attempts) + Math.random() * 500;
    this.attempts = Math.min(this.attempts + 1, 6);
    this.timer = setTimeout(() => void this.open(), delay);
  }

  private dispatch(frame: Frame) {
    if (frame.type === 'welcome') {
      this.connId = frame.connId ?? null;
      this.attempts = 0;
      this.setStatus('open');
      for (const ch of this.handlers.keys()) this.send({ type: 'subscribe', channel: ch });
      if (this.ping) clearInterval(this.ping);
      this.ping = setInterval(() => this.send({ type: 'ping' }), 25_000);
    }
    for (const g of this.global) g(frame);
    if (frame.channel) for (const h of this.handlers.get(frame.channel) ?? []) h(frame);
  }

  private send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  /** Subscribes to a channel; returns an unsubscribe function. Personal and site channels are automatic. */
  subscribe(channel: string, handler: ChannelHandler): () => void {
    let set = this.handlers.get(channel);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    if (isNew && !channel.startsWith('user:') && channel !== 'site') this.send({ type: 'subscribe', channel });
    return () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(channel);
        if (!channel.startsWith('user:') && channel !== 'site') this.send({ type: 'unsubscribe', channel });
      }
    };
  }

  /** Receives every frame (used for personal notifications and site-wide config changes). */
  onAny(handler: ChannelHandler): () => void {
    this.global.add(handler);
    return () => this.global.delete(handler);
  }

  publish(channel: string, event: string, data?: unknown) {
    return this.send({ type: 'publish', channel, event, data });
  }

  signal(channel: string, to: string, data: unknown) {
    return this.send({ type: 'signal', channel, to, data });
  }

  /** Sends a fresh access token so long sessions are not closed when the old one expires. */
  async reauth() {
    const token = await this.opts.token();
    if (token) this.send({ type: 'auth', token });
  }
}
