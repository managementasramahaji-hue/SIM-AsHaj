// @ts-nocheck
import { ChatChannel, ChatMessage, WorkSession } from '../types';

export interface OnlinePresenceInfo {
  clientId: string;
  userId: string;
  userName: string;
  userRole: string;
  department?: string;
  assignedBuilding?: string;
  sessionId?: string;
  loginTime?: string;
  activeTab?: string;
  lastSeenMs: number;
}

export type RealtimeEventType =
  | 'init'
  | 'state:sync'
  | 'presence:sync'
  | 'presence:heartbeat'
  | 'presence:leave'
  | 'session:upsert'
  | 'session:superseded'
  | 'session:clear'
  | 'chat:message'
  | 'chat:read'
  | 'chat:channel'
  | 'chat:clear'
  | 'chat:typing'
  | 'config:reset'
  | 'database:sync';

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  payload: any;
  senderClientId?: string | null;
  timestamp: number;
}

type RealtimeEventListener = (event: RealtimeEventPayload) => void;

class RealtimeService {
  private clientId: string;
  private listeners: Set<RealtimeEventListener> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private eventSource: EventSource | null = null;
  private reconnectTimer: any = null;
  private pollingTimer: any = null;
  private isPolling = false;
  private isInitialized = false;
  private presencesMap: Map<string, OnlinePresenceInfo> = new Map();

  constructor() {
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  public getClientId(): string {
    return this.clientId;
  }

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // 1. Cross-Tab Instant BroadcastChannel (0ms latency in same browser)
    try {
      if ('BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('sim_haji_realtime_bus_v2');
        this.broadcastChannel.onmessage = (ev) => {
          const data = ev.data as RealtimeEventPayload;
          if (!data || data.senderClientId === this.clientId) return;
          this.handleIncomingEvent(data);
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel warning:', e);
    }

    // 2. Server-Sent Events (SSE) Stream to Express Server (/api/realtime/stream)
    this.connectSSE();

    // 3. Bulletproof Automatic HTTP Polling Fallback (setiap 2.5 detik)
    // Memastikan koneksi multi-perangkat / beda laptop selalu sinkron 100% meskipun SSE terhalang proxy
    this.startPollingLoop();

    // 4. Polling seketika saat window kembali fokus / tab aktif
    try {
      window.addEventListener('focus', () => this.pollNow());
      window.addEventListener('online', () => this.pollNow());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.pollNow();
        }
      });
    } catch (_) {}
  }

  private connectSSE() {
    if (typeof window === 'undefined' || !('EventSource' in window)) return;
    try {
      if (this.eventSource) {
        this.eventSource.close();
      }
      const es = new EventSource('/api/realtime/stream');
      this.eventSource = es;

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEventPayload;
          if (!parsed || parsed.senderClientId === this.clientId) return;
          this.handleIncomingEvent(parsed);
        } catch (_) {}
      };

      es.onerror = () => {
        es.close();
        this.eventSource = null;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connectSSE(), 3000);
      };
    } catch (_) {}
  }

  private startPollingLoop() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    // Jalankan poll pertama segera
    this.pollNow();
    this.pollingTimer = setInterval(() => {
      this.pollState();
    }, 2500);
  }

  public async pollState(): Promise<void> {
    if (typeof window === 'undefined' || this.isPolling) return;
    this.isPolling = true;

    try {
      const res = await fetch('/api/realtime/state', {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return;
        const data = await res.json();
        const now = Date.now();

        if (Array.isArray(data.presences)) {
          const newMap = new Map<string, OnlinePresenceInfo>();
          data.presences.forEach((p: OnlinePresenceInfo) => {
            if (p && p.userId) {
              newMap.set(`${p.userId}___${p.clientId || 'srv'}`, {
                ...p,
                lastSeenMs: p.lastSeenMs || now,
              });
            }
          });

          // Pertahankan keberadaan diri sendiri jika baru saja mengirim heartbeat
          for (const [key, val] of this.presencesMap.entries()) {
            if (val.clientId === this.clientId && now - val.lastSeenMs < 30000) {
              newMap.set(key, val);
            }
          }
          this.presencesMap = newMap;

          this.notifyListeners({
            type: 'presence:sync',
            payload: this.getActivePresences(),
            senderClientId: 'server',
            timestamp: now,
          });
        }

        // Siarkan pembaruan state agregat (workSessions, chatMessages, chatChannels) ke seluruh store listener
        this.notifyListeners({
          type: 'state:sync',
          payload: data,
          senderClientId: 'server',
          timestamp: now,
        });
      }
    } catch (_) {
      // Silence network glitches during polling
    } finally {
      this.isPolling = false;
    }
  }

  public pollNow() {
    this.pollState().catch(() => {});
  }

  private handleIncomingEvent(event: RealtimeEventPayload) {
    const now = Date.now();
    if (event.type === 'config:reset' && typeof window !== 'undefined') {
      window.location.reload();
    }

    if (event.type === 'init' && event.payload) {
      if (Array.isArray(event.payload.presences)) {
        event.payload.presences.forEach((p: OnlinePresenceInfo) => {
          if (p && p.userId) {
            this.presencesMap.set(`${p.userId}___${p.clientId || 'srv'}`, {
              ...p,
              lastSeenMs: p.lastSeenMs || now,
            });
          }
        });
      }
    } else if (event.type === 'presence:sync' && Array.isArray(event.payload)) {
      const newMap = new Map<string, OnlinePresenceInfo>();
      event.payload.forEach((p: OnlinePresenceInfo) => {
        if (p && p.userId) {
          newMap.set(`${p.userId}___${p.clientId || 'srv'}`, {
            ...p,
            lastSeenMs: p.lastSeenMs || now,
          });
        }
      });
      // Pertahankan status lokal jika baru
      for (const [key, val] of this.presencesMap.entries()) {
        if (val.clientId === this.clientId && now - val.lastSeenMs < 30000) {
          newMap.set(key, val);
        }
      }
      this.presencesMap = newMap;
    } else if (event.type === 'presence:heartbeat' && event.payload?.userId) {
      const p = event.payload as OnlinePresenceInfo;
      this.presencesMap.set(`${p.userId}___${p.clientId || event.senderClientId || 'peer'}`, {
        ...p,
        lastSeenMs: now,
      });
    } else if (event.type === 'presence:leave' && event.payload?.userId) {
      for (const [key, val] of this.presencesMap.entries()) {
        if (
          val.userId === event.payload.userId &&
          (event.payload.allDevices || !event.senderClientId || val.clientId === event.senderClientId)
        ) {
          this.presencesMap.delete(key);
        }
      }
    }

    this.notifyListeners(event);
  }

  public getActivePresences(): OnlinePresenceInfo[] {
    const now = Date.now();
    const byUser = new Map<string, OnlinePresenceInfo>();
    for (const [key, p] of this.presencesMap.entries()) {
      const lastSeen = p.lastSeenMs || 0;
      if (now - lastSeen > 120000) {
        this.presencesMap.delete(key);
        continue;
      }
      const existing = byUser.get(p.userId);
      if (!existing || lastSeen > (existing.lastSeenMs || 0)) {
        byUser.set(p.userId, p);
      }
    }
    return Array.from(byUser.values());
  }

  public subscribe(listener: RealtimeEventListener): () => void {
    this.init();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: RealtimeEventPayload) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.warn('Realtime listener error:', err);
      }
    });
  }

  public emit(type: RealtimeEventType, payload: any) {
    this.init();
    const eventObj: RealtimeEventPayload = {
      type,
      payload,
      senderClientId: this.clientId,
      timestamp: Date.now(),
    };

    // 1. Update local presence cache if heartbeat/leave
    if (type === 'presence:heartbeat' && payload?.userId) {
      this.presencesMap.set(`${payload.userId}___${this.clientId}`, {
        ...payload,
        clientId: this.clientId,
        lastSeenMs: Date.now(),
      });
    } else if (type === 'presence:leave' && payload?.userId) {
      for (const [key, val] of this.presencesMap.entries()) {
        if (val.userId === payload.userId && (payload.allDevices || val.clientId === this.clientId)) {
          this.presencesMap.delete(key);
        }
      }
    }

    // 2. Broadcast to same-browser tabs immediately
    try {
      this.broadcastChannel?.postMessage(eventObj);
    } catch (_) {}

    // 3. Send to Express Server SSE & Realtime Hub
    try {
      fetch('/api/realtime/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          payload,
          clientId: this.clientId,
        }),
      }).then(() => {
        // Trigger quick poll to get authoritative sync
        setTimeout(() => this.pollNow(), 300);
      }).catch(() => {});
    } catch (_) {}
  }

  public sendHeartbeat(info: Omit<OnlinePresenceInfo, 'clientId' | 'lastSeenMs'>) {
    this.emit('presence:heartbeat', {
      ...info,
      clientId: this.clientId,
      lastSeenMs: Date.now(),
    });
  }

  public sendLeave(userId: string, allDevices: boolean = false) {
    this.emit('presence:leave', { userId, allDevices });
  }

  public broadcastWorkSession(session: WorkSession, closeOtherUserSessions: boolean = false) {
    this.emit('session:upsert', { ...session, closeOtherUserSessions });
  }

  public broadcastClearWorkSessions() {
    this.emit('session:clear', {});
  }

  public broadcastChatMessage(message: ChatMessage, channel?: ChatChannel) {
    this.emit('chat:message', { message, channel });
  }

  public broadcastChatRead(channelId: string, userId: string) {
    this.emit('chat:read', { channelId, userId });
  }

  public broadcastChatChannel(channel: ChatChannel) {
    this.emit('chat:channel', channel);
  }

  public broadcastChatClear(channelId?: string) {
    this.emit('chat:clear', { channelId });
  }

  public broadcastChatTyping(channelId: string, userId: string, userName: string) {
    this.emit('chat:typing', { channelId, userId, userName });
  }

  public broadcastDatabaseSync(payload?: any) {
    this.emit('database:sync', payload || { timestamp: Date.now() });
  }
}

export const realtimeService = new RealtimeService();
