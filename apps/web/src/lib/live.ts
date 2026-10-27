import type { Frame, Peer, RealtimeClient } from '@qubedu/api-client';

export interface MediaState {
  mic: boolean;
  cam: boolean;
  /** Stream id of the screen share, when this peer is presenting. */
  screen: string | null;
}

export interface RemotePeer extends Peer {
  streams: MediaStream[];
  media: MediaState;
  hand: boolean;
  speaking: boolean;
  state: RTCPeerConnectionState;
}

interface PeerInternal {
  peer: Peer;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  streams: Map<string, MediaStream>;
  media: MediaState;
  hand: boolean;
  speaking: boolean;
}

type Listener = () => void;

/**
 * Full-mesh WebRTC for small live classes, signaled through the realtime hub.
 * Uses "perfect negotiation" so either side can renegotiate (screen share, track changes) without glare.
 * Mesh is right for ≲8 simultaneous senders; larger audiences should use an SFU (the hub's signaling stays the same).
 */
export class LiveSession {
  private peers = new Map<string, PeerInternal>();
  private listeners = new Set<Listener>();
  private unsubs: (() => void)[] = [];
  local: MediaStream | null = null;
  screen: MediaStream | null = null;
  media: MediaState = { mic: false, cam: false, screen: null };
  hand = false;
  private audioCtx: AudioContext | null = null;

  constructor(
    private readonly rt: RealtimeClient,
    private readonly channel: string,
    private readonly iceServers: RTCIceServer[],
    /** Called for non-media events (hand, whiteboard, pdf…) from other peers. */
    private readonly onEvent: (frame: Frame) => void,
  ) {}

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  snapshot(): RemotePeer[] {
    return [...this.peers.values()].map((p) => ({
      ...p.peer,
      streams: [...p.streams.values()],
      media: p.media,
      hand: p.hand,
      speaking: p.speaking,
      state: p.pc.connectionState,
    }));
  }

  start(local: MediaStream | null) {
    this.local = local;
    this.media = { mic: !!local?.getAudioTracks().some((t) => t.enabled), cam: !!local?.getVideoTracks().some((t) => t.enabled), screen: null };
    this.unsubs.push(this.rt.subscribe(this.channel, (f) => this.onFrame(f)));
  }

  private onFrame(f: Frame) {
    switch (f.type) {
      case 'peers':
        // We are the newcomer: connect to everyone already here and tell them our state.
        for (const p of f.peers ?? []) this.ensure(p);
        this.broadcastState();
        break;
      case 'signal':
        if (f.from) void this.handleSignal(f.from, f.data as SignalData);
        break;
      case 'event':
        this.handleEvent(f);
        break;
    }
  }

  private handleEvent(f: Frame) {
    const from = f.from;
    switch (f.event) {
      case 'peer-joined':
        // The newcomer initiates; just make sure we know about them (offer will arrive).
        if (from) this.ensure(from);
        this.broadcastState();
        break;
      case 'peer-left':
        if (from) this.drop(from.connId);
        break;
      case 'media-state': {
        const p = from && this.peers.get(from.connId);
        if (p) {
          p.media = f.data as MediaState;
          this.emit();
        }
        break;
      }
      case 'hand': {
        const p = from && this.peers.get(from.connId);
        if (p) {
          p.hand = !!(f.data as { raised?: boolean })?.raised;
          this.emit();
        }
        break;
      }
      case 'speaking': {
        const p = from && this.peers.get(from.connId);
        if (p) {
          p.speaking = !!(f.data as { on?: boolean })?.on;
          this.emit();
        }
        break;
      }
      default:
        this.onEvent(f);
    }
  }

  private ensure(peer: Peer): PeerInternal {
    const existing = this.peers.get(peer.connId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry: PeerInternal = {
      peer,
      pc,
      polite: (this.rt.connId ?? '') < peer.connId,
      makingOffer: false,
      ignoreOffer: false,
      streams: new Map(),
      media: { mic: false, cam: false, screen: null },
      hand: false,
      speaking: false,
    };
    this.peers.set(peer.connId, entry);
    pc.onicecandidate = ({ candidate }) => candidate && this.rt.signal(this.channel, peer.connId, { candidate: candidate.toJSON() });
    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        this.rt.signal(this.channel, peer.connId, { description: pc.localDescription?.toJSON() });
      } catch {
        /* negotiation will be retried by the browser on the next change */
      } finally {
        entry.makingOffer = false;
      }
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      entry.streams.set(stream.id, stream);
      ev.track.onended = () => {
        if (stream.getTracks().every((t) => t.readyState === 'ended')) {
          entry.streams.delete(stream.id);
          this.emit();
        }
      };
      stream.onremovetrack = () => {
        if (!stream.getTracks().length) {
          entry.streams.delete(stream.id);
          this.emit();
        }
      };
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      this.emit();
    };
    if (this.local) for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    if (this.screen) for (const t of this.screen.getTracks()) pc.addTrack(t, this.screen);
    this.emit();
    return entry;
  }

  private async handleSignal(from: Peer, data: SignalData) {
    const entry = this.ensure(from);
    const { pc } = entry;
    try {
      if (data.description) {
        const offerCollision = data.description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          this.rt.signal(this.channel, from.connId, { description: pc.localDescription?.toJSON() });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!entry.ignoreOffer) throw e;
        }
      }
    } catch {
      /* a failed negotiation step must not take the room down */
    }
  }

  private drop(connId: string) {
    const p = this.peers.get(connId);
    if (!p) return;
    p.pc.close();
    this.peers.delete(connId);
    this.emit();
  }

  broadcastState() {
    this.rt.publish(this.channel, 'media-state', this.media);
    this.rt.publish(this.channel, 'hand', { raised: this.hand });
  }

  setMic(on: boolean) {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.media = { ...this.media, mic: on };
    this.rt.publish(this.channel, 'media-state', this.media);
    this.emit();
  }

  setCam(on: boolean) {
    this.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.media = { ...this.media, cam: on };
    this.rt.publish(this.channel, 'media-state', this.media);
    this.emit();
  }

  setHand(raised: boolean) {
    this.hand = raised;
    this.rt.publish(this.channel, 'hand', { raised });
    this.emit();
  }

  /** Detects when the local user is talking and tells others (drives the speaking highlight). */
  watchLocalSpeaking(onChange: (on: boolean) => void) {
    const stream = this.local;
    if (!stream || !stream.getAudioTracks().length) return () => undefined;
    const ctx = (this.audioCtx ??= new AudioContext());
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let speaking = false;
    let quietSince = 0;
    const id = setInterval(() => {
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      const on = this.media.mic && avg > 14;
      const now = Date.now();
      if (on) quietSince = now;
      const next = on || (speaking && now - quietSince < 600);
      if (next !== speaking) {
        speaking = next;
        onChange(next);
        this.rt.publish(this.channel, 'speaking', { on: next });
      }
    }, 150);
    return () => {
      clearInterval(id);
      src.disconnect();
    };
  }

  async startScreen(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    this.screen = stream;
    for (const p of this.peers.values()) for (const t of stream.getTracks()) p.pc.addTrack(t, stream);
    stream.getVideoTracks()[0]!.onended = () => this.stopScreen();
    this.media = { ...this.media, screen: stream.id };
    this.rt.publish(this.channel, 'media-state', this.media);
    this.emit();
    return stream;
  }

  stopScreen() {
    const s = this.screen;
    if (!s) return;
    this.screen = null;
    s.getTracks().forEach((t) => t.stop());
    for (const p of this.peers.values())
      for (const sender of p.pc.getSenders()) if (sender.track && s.getTracks().includes(sender.track)) p.pc.removeTrack(sender);
    this.media = { ...this.media, screen: null };
    this.rt.publish(this.channel, 'media-state', this.media);
    this.emit();
  }

  /** Mixed audio of everyone (for recording). */
  mixedAudio(): MediaStream {
    const ctx = (this.audioCtx ??= new AudioContext());
    const dest = ctx.createMediaStreamDestination();
    const add = (s: MediaStream) => s.getAudioTracks().length && ctx.createMediaStreamSource(s).connect(dest);
    if (this.local) add(this.local);
    for (const p of this.peers.values()) for (const s of p.streams.values()) add(s);
    return dest.stream;
  }

  leave() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    for (const id of [...this.peers.keys()]) this.drop(id);
    this.stopScreen();
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.listeners.clear();
  }
}

interface SignalData {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}
