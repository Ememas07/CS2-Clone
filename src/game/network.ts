import type { BotDifficulty, GrenadeId, RoomInfo, Team, WeaponId } from './types';

export interface RemoteActorSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  alive: boolean;
  hp: number;
  armor: number;
  hasHelmet: boolean;
  weaponId: WeaponId;
  hasC4: boolean;
}

export interface NetworkCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected', error?: string) => void;
  onWelcome?: (clientId: string) => void;
  onRoomJoined?: (room: RoomInfo, yourId: string) => void;
  onRoomUpdate?: (room: RoomInfo) => void;
  onRoomError?: (error: string) => void;
  onMatchStarted?: (room: RoomInfo) => void;
  onSessionRestored?: (room: RoomInfo, yourId: string) => void;
  onPingUpdate?: (pingMs: number) => void;
  onPlayerConnectionState?: (playerId: string, connected: boolean) => void;
  onPlayerState?: (senderId: string, snapshot: RemoteActorSnapshot) => void;
  onShoot?: (
    senderId: string,
    payload: {
      ox: number;
      oy: number;
      oz: number;
      dx: number;
      dy: number;
      dz: number;
      weaponId: WeaponId;
      silenced: boolean;
    }
  ) => void;
  onBombEvent?: (senderId: string, payload: Record<string, unknown>) => void;
  onRoundSync?: (senderId: string, payload: Record<string, unknown>) => void;
  onGrenadeEvent?: (
    senderId: string,
    payload: {
      grenadeId: GrenadeId;
      ox: number;
      oy: number;
      oz: number;
      vx: number;
      vy: number;
      vz: number;
    }
  ) => void;
  onHitClaim?: (
    senderId: string,
    payload: {
      targetId: string;
      damage: number;
      armorDamage: number;
      headshot: boolean;
      wallbang: boolean;
      weaponId: WeaponId;
    }
  ) => void;
}

export function getDefaultWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export class TacticalNetworkClient {
  private ws: WebSocket | null = null;
  private callbacks: NetworkCallbacks = {};
  private pendingQueue: string[] = [];
  public clientId: string | null = null;
  public currentRoom: RoomInfo | null = null;
  public latency: number = 0;

  private lastUrl: string | undefined;
  public lastPlayerName: string = 'Operator';
  private intentionalDisconnect: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private lastMessageTime: number = 0;

  public setCallbacks(cb: NetworkCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  public connect(url?: string): void {
    const targetUrl = (url && url.trim()) || this.lastUrl || getDefaultWebSocketUrl();
    this.lastUrl = targetUrl;
    this.intentionalDisconnect = false;

    if (this.reconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      try {
        this.ws.close();
      } catch {}
    }

    this.callbacks.onStatusChange?.('connecting');
    try {
      const ws = new WebSocket(targetUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.lastMessageTime = Date.now();
        this.callbacks.onStatusChange?.('connected');

        this.startHeartbeat();

        // If we previously had an active room & client ID, attempt immediate session recovery
        if (this.currentRoom && this.clientId) {
          console.log(`[network] Attempting session recovery for client ${this.clientId} in room ${this.currentRoom.id}`);
          this.send({
            type: 'reconnect_session',
            roomId: this.currentRoom.id,
            clientId: this.clientId,
            playerName: this.lastPlayerName,
          });
        }

        while (this.pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
          const msg = this.pendingQueue.shift();
          if (msg) {
            try {
              ws.send(msg);
            } catch (e) {
              console.warn('[network] Pending send failed:', e);
            }
          }
        }
      };

      ws.onmessage = (evt) => {
        this.lastMessageTime = Date.now();
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(evt.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(msg.type || '');
        const senderId = String(msg.senderId || '');

        switch (type) {
          case 'welcome':
            // Only adopt new client ID if we do not already have an established one
            if (!this.clientId) {
              this.clientId = String(msg.clientId || '');
            }
            this.callbacks.onWelcome?.(this.clientId);
            break;
          case 'pong': {
            const clientTime = Number(msg.clientTime || 0);
            if (clientTime > 0) {
              this.latency = Math.max(1, Math.round(performance.now() - clientTime));
              this.callbacks.onPingUpdate?.(this.latency);
            }
            break;
          }
          case 'session_restored':
            this.currentRoom = msg.room as RoomInfo;
            this.clientId = String(msg.yourId || this.clientId);
            console.log(`[network] Session restored in room ${this.currentRoom.id}`);
            this.callbacks.onSessionRestored?.(this.currentRoom, this.clientId);
            this.callbacks.onRoomUpdate?.(this.currentRoom);
            break;
          case 'player_connection_state':
            this.callbacks.onPlayerConnectionState?.(
              String(msg.playerId || ''),
              Boolean(msg.connected)
            );
            break;
          case 'room_joined':
            this.currentRoom = msg.room as RoomInfo;
            this.clientId = String(msg.yourId || this.clientId);
            this.callbacks.onRoomJoined?.(this.currentRoom, this.clientId);
            break;
          case 'room_update':
            this.currentRoom = msg.room as RoomInfo;
            this.callbacks.onRoomUpdate?.(this.currentRoom);
            break;
          case 'room_error':
            this.callbacks.onRoomError?.(String(msg.error || 'Room error'));
            break;
          case 'match_started':
            this.currentRoom = msg.room as RoomInfo;
            this.callbacks.onMatchStarted?.(this.currentRoom);
            break;
          case 'player_state':
            this.callbacks.onPlayerState?.(senderId, msg.state as RemoteActorSnapshot);
            break;
          case 'shoot':
            this.callbacks.onShoot?.(
              senderId,
              msg.payload as {
                ox: number;
                oy: number;
                oz: number;
                dx: number;
                dy: number;
                dz: number;
                weaponId: WeaponId;
                silenced: boolean;
              }
            );
            break;
          case 'bomb_event':
            this.callbacks.onBombEvent?.(senderId, msg.payload as Record<string, unknown>);
            break;
          case 'round_sync':
            this.callbacks.onRoundSync?.(senderId, msg.payload as Record<string, unknown>);
            break;
          case 'grenade_event':
            this.callbacks.onGrenadeEvent?.(
              senderId,
              msg.payload as {
                grenadeId: GrenadeId;
                ox: number;
                oy: number;
                oz: number;
                vx: number;
                vy: number;
                vz: number;
              }
            );
            break;
          case 'hit_claim':
            this.callbacks.onHitClaim?.(
              senderId,
              msg.payload as {
                targetId: string;
                damage: number;
                armorDamage: number;
                headshot: boolean;
                wallbang: boolean;
                weaponId: WeaponId;
              }
            );
            break;
        }
      };

      ws.onerror = () => {
        this.stopHeartbeat();
        this.callbacks.onStatusChange?.('disconnected', 'WebSocket connection error');
        this.scheduleReconnect();
      };

      ws.onclose = () => {
        this.stopHeartbeat();
        this.callbacks.onStatusChange?.('disconnected');
        this.scheduleReconnect();
      };
    } catch (err) {
      this.stopHeartbeat();
      this.callbacks.onStatusChange?.('disconnected', String(err));
      this.scheduleReconnect();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (typeof window === 'undefined') return;
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send application ping
        this.send({ type: 'ping', clientTime: performance.now() });

        // Check if connection is stale (no message for > 15s)
        if (Date.now() - this.lastMessageTime > 15000) {
          console.warn('[network] Connection stale (no frames for >15s). Reconnecting.');
          try {
            this.ws.close();
          } catch {}
        }
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval !== null && typeof window !== 'undefined') {
      window.clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect || typeof window === 'undefined') return;
    if (this.reconnectTimer !== null) return;

    this.reconnectAttempts++;
    const delay = Math.min(10000, 500 * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)));
    console.log(`[network] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.currentRoom = null;
  }

  public send(payload: unknown): void {
    const raw = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(raw);
      } catch (e) {
        console.warn('[network] ws.send failed:', e);
      }
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      if (this.pendingQueue.length < 50) {
        this.pendingQueue.push(raw);
      }
    }
  }

  public createRoom(params: {
    playerName: string;
    team: Team;
    mode: 'pvp' | 'mixed' | 'awp' | 'ffa';
    mapId: import('./types').MapId;
    botDifficulty: BotDifficulty;
    customMapData?: import('./types').CustomMapJson;
  }): void {
    this.lastPlayerName = params.playerName;
    this.send({ type: 'create_room', ...params });
  }

  public joinRoom(params: { roomId: string; playerName: string; team?: Team }): void {
    this.lastPlayerName = params.playerName;
    this.send({ type: 'join_room', ...params });
  }

  public switchTeam(team: Team): void {
    this.send({ type: 'switch_team', team });
  }

  public startMatch(): void {
    this.send({ type: 'start_match' });
  }

  public leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.currentRoom = null;
  }
}

export const networkClient = new TacticalNetworkClient();
