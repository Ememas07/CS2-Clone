import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || '';
const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const VOICELINE_SCRIPTS: Record<string, string> = {
  round_start: 'Round start. Lock and load, move out.',
  bomb_planted: 'Warning. The bomb has been planted.',
  bomb_defused: 'The bomb has been defused.',
  round_end_attackers: 'Attackers win the round.',
  round_end_defenders: 'Defenders win the round.',
  match_end_attackers: 'Match complete. Attackers are victorious.',
  match_end_defenders: 'Match complete. Defenders are victorious.',
};

const voicelineCache = new Map<string, Buffer>();
const voicelineInFlight = new Map<string, Promise<Buffer>>();

async function generateVoicelineWav(eventKey: string, text: string): Promise<Buffer> {
  const cached = voicelineCache.get(eventKey);
  if (cached) return cached;

  const existing = voicelineInFlight.get(eventKey);
  if (existing) return existing;

  const promise = (async () => {
    if (!ai) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
              speechMetadata: {
                style: 'Crisp, authoritative tactical radio announcer, concise military comms',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('Gemini TTS returned no audio payload');
    }
    const wavBuffer = Buffer.from(base64Audio, 'base64');
    voicelineCache.set(eventKey, wavBuffer);
    return wavBuffer;
  })();

  voicelineInFlight.set(eventKey, promise);
  try {
    return await promise;
  } finally {
    voicelineInFlight.delete(eventKey);
  }
}

interface ClientMeta {
  id: string;
  name: string;
  roomId: string | null;
  team: 'attackers' | 'defenders';
  ws: WebSocket;
  isAlive?: boolean;
  disconnectedAt?: number;
  disconnectTimer?: NodeJS.Timeout;
}

interface RoomState {
  id: string;
  hostId: string;
  mode: 'pvp' | 'mixed' | 'awp' | 'ffa';
  mapId: 'sandline' | 'dust2' | 'mirage' | 'inferno' | 'overpass' | 'awp_arena' | 'custom';
  botDifficulty: number;
  clients: Map<string, ClientMeta>;
  started: boolean;
  customMapData?: unknown;
}

const PORT = Number(process.env.PORT || 3000);
const rooms = new Map<string, RoomState>();
const clients = new Map<WebSocket, ClientMeta>();

let nextClientNum = 1;

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? makeRoomCode() : code;
}

function sendJson(ws: WebSocket | null | undefined, payload: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    console.warn('[ws sendJson error]:', err);
  }
}

function broadcastRoom(room: RoomState, payload: unknown, excludeId?: string): void {
  const raw = JSON.stringify(payload);
  for (const client of room.clients.values()) {
    if (excludeId && client.id === excludeId) continue;
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(raw);
      } catch (err) {
        console.warn(`[broadcastRoom error client ${client.id}]:`, err);
      }
    }
  }
}

function serializeRoom(room: RoomState) {
  return {
    id: room.id,
    hostId: room.hostId,
    mode: room.mode,
    mapId: room.mapId,
    botDifficulty: room.botDifficulty,
    started: room.started,
    customMapData: room.customMapData,
    players: Array.from(room.clients.values()).map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      isHost: c.id === room.hostId,
      connected: !c.disconnectedAt && c.ws.readyState === WebSocket.OPEN,
    })),
  };
}

function leaveCurrentRoom(meta: ClientMeta): void {
  if (meta.disconnectTimer) {
    clearTimeout(meta.disconnectTimer);
    meta.disconnectTimer = undefined;
  }
  if (!meta.roomId) return;
  const room = rooms.get(meta.roomId);
  meta.roomId = null;
  if (!room) return;

  room.clients.delete(meta.id);
  if (room.clients.size === 0) {
    rooms.delete(room.id);
    return;
  }

  let migrated = false;
  if (room.hostId === meta.id) {
    const nextHost = room.clients.values().next().value as ClientMeta | undefined;
    if (nextHost) {
      room.hostId = nextHost.id;
      migrated = true;
    }
  }

  broadcastRoom(room, {
    type: 'room_update',
    room: serializeRoom(room),
    hostMigrated: migrated,
  });
}

async function startServer(): Promise<void> {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('error', (err) => {
    console.error('[wss error]:', err);
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
        return;
      }
    } catch {
      socket.destroy();
    }
  });

  // Heartbeat ping-pong every 10s to keep connections alive and clear dead sockets
  const HEARTBEAT_INTERVAL_MS = 10000;
  const heartbeatTimer = setInterval(() => {
    for (const [ws, meta] of clients.entries()) {
      if (meta.isAlive === false) {
        console.log(`[ws] Heartbeat timed out for client ${meta.id}. Closing.`);
        try {
          ws.terminate();
        } catch {}
        clients.delete(ws);
        continue;
      }
      meta.isAlive = false;
      try {
        ws.ping();
      } catch {
        try {
          ws.terminate();
        } catch {}
        clients.delete(ws);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  server.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/voiceline', async (req, res) => {
    const eventKey = String(req.query.event || '').trim();
    const script = VOICELINE_SCRIPTS[eventKey];
    if (!script) {
      res.status(400).json({ available: false, error: 'Unknown voiceline event' });
      return;
    }

    if (!ai) {
      res.status(200).json({
        available: false,
        error: 'GEMINI_API_KEY not configured',
        text: script,
      });
      return;
    }

    try {
      const wavBuffer = await generateVoicelineWav(eventKey, script);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(wavBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS generation failed';
      console.warn(`[voiceline] Gemini TTS fallback for ${eventKey}:`, message);
      res.status(200).json({
        available: false,
        error: message,
        text: script,
      });
    }
  });

  wss.on('connection', (ws) => {
    const clientId = `p_${nextClientNum++}_${Math.random().toString(36).slice(2, 6)}`;
    const meta: ClientMeta = {
      id: clientId,
      name: `Operator ${nextClientNum - 1}`,
      roomId: null,
      team: 'attackers',
      ws,
      isAlive: true,
    };
    clients.set(ws, meta);

    ws.on('pong', () => {
      meta.isAlive = true;
    });

    ws.on('error', (err) => {
      console.warn(`[ws client error ${meta.id}]:`, err.message);
    });

    sendJson(ws, { type: 'welcome', clientId });

    ws.on('message', (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');

      // Heartbeat ping/pong for RTT measurement and keepalive
      if (type === 'ping') {
        meta.isAlive = true;
        sendJson(ws, {
          type: 'pong',
          clientTime: msg.clientTime ?? 0,
          serverTime: Date.now(),
        });
        return;
      }

      if (type === 'reconnect_session') {
        const roomId = String(msg.roomId || '').trim().toUpperCase();
        const existingClientId = String(msg.clientId || '');
        const room = rooms.get(roomId);
        if (room) {
          const existingClient = room.clients.get(existingClientId);
          if (existingClient) {
            console.log(`[ws] Restoring session for client ${existingClientId} in room ${roomId}`);
            if (existingClient.disconnectTimer) {
              clearTimeout(existingClient.disconnectTimer);
              existingClient.disconnectTimer = undefined;
            }
            existingClient.disconnectedAt = undefined;
            if (existingClient.ws && existingClient.ws !== ws && existingClient.ws.readyState === WebSocket.OPEN) {
              try {
                existingClient.ws.close();
              } catch {}
            }
            clients.delete(existingClient.ws);
            existingClient.ws = ws;
            existingClient.isAlive = true;
            clients.set(ws, existingClient);
            clients.delete(meta.ws);

            sendJson(ws, {
              type: 'session_restored',
              room: serializeRoom(room),
              yourId: existingClient.id,
            });
            broadcastRoom(
              room,
              {
                type: 'player_connection_state',
                playerId: existingClient.id,
                connected: true,
              },
              existingClient.id
            );
            return;
          }
        }
        sendJson(ws, { type: 'room_error', error: 'Previous session expired or room closed' });
        return;
      }

      if (type === 'create_room') {
        leaveCurrentRoom(meta);
        const roomId = makeRoomCode();
        meta.name = String(msg.playerName || meta.name).slice(0, 18);
        meta.team = msg.team === 'defenders' ? 'defenders' : 'attackers';
        meta.roomId = roomId;

        const validMaps = new Set([
          'sandline',
          'dust2',
          'mirage',
          'inferno',
          'overpass',
          'awp_arena',
          'custom',
        ]);
        const rawMap = String(msg.mapId || 'sandline');
        const mapId = (validMaps.has(rawMap) ? rawMap : 'sandline') as RoomState['mapId'];
        const rawMode = String(msg.mode || 'pvp');
        const mode: RoomState['mode'] =
          rawMode === 'mixed' || rawMode === 'awp' || rawMode === 'ffa' ? rawMode : 'pvp';

        let safeCustomMap: unknown = undefined;
        if (mapId === 'custom' && msg.customMapData && typeof msg.customMapData === 'object') {
          const serialized = JSON.stringify(msg.customMapData);
          if (serialized.length <= 200_000) {
            safeCustomMap = msg.customMapData;
          }
        }

        const room: RoomState = {
          id: roomId,
          hostId: meta.id,
          mode,
          mapId,
          botDifficulty:
            msg.botDifficulty === 'easy'
              ? 25
              : msg.botDifficulty === 'hard'
                ? 100
                : msg.botDifficulty === 'medium'
                  ? 55
                  : Math.max(
                      1,
                      Math.min(100, Math.round(Number(msg.botDifficulty) || 55))
                    ),
          clients: new Map([[meta.id, meta]]),
          started: false,
          customMapData: safeCustomMap,
        };
        rooms.set(roomId, room);
        sendJson(ws, {
          type: 'room_joined',
          room: serializeRoom(room),
          yourId: meta.id,
        });
        return;
      }

      if (type === 'join_room') {
        const roomId = String(msg.roomId || '').trim().toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'room_error', error: `Room ${roomId || 'CODE'} not found` });
          return;
        }
        if (room.clients.size >= 10) {
          sendJson(ws, { type: 'room_error', error: 'Room is full (10/10)' });
          return;
        }
        leaveCurrentRoom(meta);
        meta.name = String(msg.playerName || meta.name).slice(0, 18);
        let atkCount = 0;
        let defCount = 0;
        for (const c of room.clients.values()) {
          if (c.team === 'attackers') atkCount++;
          else defCount++;
        }
        if (msg.team === 'attackers' || msg.team === 'defenders') {
          meta.team = msg.team;
        } else {
          meta.team = atkCount <= defCount ? 'attackers' : 'defenders';
        }
        meta.roomId = roomId;
        room.clients.set(meta.id, meta);

        sendJson(ws, {
          type: 'room_joined',
          room: serializeRoom(room),
          yourId: meta.id,
        });
        broadcastRoom(
          room,
          {
            type: 'room_update',
            room: serializeRoom(room),
          },
          meta.id
        );
        return;
      }

      if (type === 'switch_team') {
        if (!meta.roomId) return;
        const room = rooms.get(meta.roomId);
        if (!room) return;
        meta.team = msg.team === 'defenders' ? 'defenders' : 'attackers';
        broadcastRoom(room, { type: 'room_update', room: serializeRoom(room) });
        return;
      }

      if (type === 'start_match') {
        if (!meta.roomId) return;
        const room = rooms.get(meta.roomId);
        if (!room || room.hostId !== meta.id) return;
        room.started = true;
        broadcastRoom(room, {
          type: 'match_started',
          room: serializeRoom(room),
        });
        return;
      }

      if (type === 'leave_room') {
        leaveCurrentRoom(meta);
        return;
      }

      // Relay tactical gameplay packets inside the room
      if (!meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room) return;

      if (
        type === 'player_state' ||
        type === 'shoot' ||
        type === 'bomb_event' ||
        type === 'round_sync' ||
        type === 'grenade_event' ||
        type === 'hit_claim'
      ) {
        broadcastRoom(
          room,
          {
            ...msg,
            senderId: meta.id,
          },
          meta.id
        );
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      if (!meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room) return;

      if (room.started) {
        // Grace period (25s) before kicking the player out, giving client time to reconnect
        console.log(`[ws] Client ${meta.id} in active room ${room.id} disconnected. Starting 25s grace period.`);
        meta.disconnectedAt = Date.now();
        broadcastRoom(
          room,
          {
            type: 'player_connection_state',
            playerId: meta.id,
            connected: false,
          },
          meta.id
        );

        meta.disconnectTimer = setTimeout(() => {
          console.log(`[ws] Grace period expired for client ${meta.id} in room ${room.id}.`);
          leaveCurrentRoom(meta);
        }, 25000);
      } else {
        leaveCurrentRoom(meta);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sandline Tactical server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
