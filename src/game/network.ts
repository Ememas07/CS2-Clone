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

  public setCallbacks(cb: NetworkCallbacks): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  public connect(url?: string): void {
    const targetUrl = (url && url.trim()) || getDefaultWebSocketUrl();
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }

    this.callbacks.onStatusChange?.('connecting');
    try {
      const ws = new WebSocket(targetUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.callbacks.onStatusChange?.('connected');
        while (this.pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
          const msg = this.pendingQueue.shift();
          if (msg) ws.send(msg);
        }
      };

      ws.onmessage = (evt) => {
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
            this.clientId = String(msg.clientId || '');
            this.callbacks.onWelcome?.(this.clientId);
            break;
          case 'room_joined':
            this.currentRoom = msg.room as RoomInfo;
            this.callbacks.onRoomJoined?.(this.currentRoom, String(msg.yourId || ''));
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
        this.callbacks.onStatusChange?.('disconnected', 'WebSocket connection error');
      };

      ws.onclose = () => {
        this.callbacks.onStatusChange?.('disconnected');
      };
    } catch (err) {
      this.callbacks.onStatusChange?.('disconnected', String(err));
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentRoom = null;
  }

  public send(payload: unknown): void {
    const raw = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      this.pendingQueue.push(raw);
    }
  }

  public createRoom(params: {
    playerName: string;
    team: Team;
    mode: 'pvp' | 'mixed';
    mapId: import('./types').MapId;
    botDifficulty: BotDifficulty;
  }): void {
    this.send({ type: 'create_room', ...params });
  }

  public joinRoom(params: { roomId: string; playerName: string; team?: Team }): void {
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
