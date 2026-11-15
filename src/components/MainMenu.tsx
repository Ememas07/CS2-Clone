import { useEffect, useState } from 'react';
import { MAP_LIST } from '../game/mapData';
import { getDefaultWebSocketUrl, networkClient } from '../game/network';
import type { BotDifficulty, GameMode, MapId, RoomInfo, Team } from '../game/types';
import type { MatchConfig } from '../game/engine';

interface MainMenuProps {
  sensitivity: number;
  onChangeSensitivity: (val: number) => void;
  onStartMatch: (config: MatchConfig) => void;
  onPreviewMap: (mapId: MapId) => void;
}

function getDifficultyLabel(val: number): string {
  if (val >= 95) return 'Max (Original)';
  if (val >= 70) return 'Hard';
  if (val >= 35) return 'Standard';
  return 'Chill';
}

export function MainMenu({
  sensitivity,
  onChangeSensitivity,
  onStartMatch,
  onPreviewMap,
}: MainMenuProps) {
  const [mode, setMode] = useState<GameMode>('bots');
  const [mapId, setMapId] = useState<MapId>('sandline');
  const [playerName, setPlayerName] = useState('Operator');
  const [playerTeam, setPlayerTeam] = useState<Team>('attackers');
  const [difficulty, setDifficulty] = useState<BotDifficulty>(55);
  const [legacyBots, setLegacyBots] = useState(false);
  const [maxRounds, setMaxRounds] = useState<number>(12);

  // Multiplayer Lobby State
  const [wsUrl, setWsUrl] = useState<string>(() => getDefaultWebSocketUrl());
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [yourId, setYourId] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  useEffect(() => {
    networkClient.setCallbacks({
      onStatusChange: (status, err) => {
        setWsStatus(status);
        if (err) setLobbyError(err);
      },
      onWelcome: (id) => setYourId(id),
      onRoomJoined: (r, id) => {
        setRoom(r);
        setYourId(id);
        setMapId(r.mapId);
        onPreviewMap(r.mapId);
        setLobbyError(null);
      },
      onRoomUpdate: (r) => setRoom(r),
      onRoomError: (err) => setLobbyError(err),
      onMatchStarted: (r) => {
        const me = r.players.find((p) => p.id === (yourId ?? networkClient.clientId));
        onStartMatch({
          mode: r.mode,
          mapId: r.mapId,
          playerTeam: me?.team ?? playerTeam,
          playerName: me?.name ?? playerName,
          difficulty: r.botDifficulty,
          maxRounds,
          legacyBots,
          room: r,
          localClientId: yourId ?? networkClient.clientId,
        });
      },
    });
  }, [legacyBots, maxRounds, onPreviewMap, onStartMatch, playerName, playerTeam, yourId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (mode !== 'bots' && mode !== 'spectate') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStartMatch({
          mode,
          mapId,
          playerTeam,
          playerName: playerName.trim() || 'Operator',
          difficulty,
          maxRounds,
          legacyBots,
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [difficulty, legacyBots, mapId, maxRounds, mode, onStartMatch, playerName, playerTeam]);

  const handleSelectMap = (id: MapId) => {
    setMapId(id);
    onPreviewMap(id);
  };

  const handleConnect = () => {
    setLobbyError(null);
    networkClient.connect(wsUrl);
  };

  const handleCreateRoom = () => {
    setLobbyError(null);
    if (wsStatus !== 'connected') {
      networkClient.connect(wsUrl);
    }
    networkClient.createRoom({
      playerName: playerName.trim() || 'Operator',
      team: playerTeam,
      mode: mode === 'mixed' ? 'mixed' : 'pvp',
      mapId,
      botDifficulty: difficulty,
    });
  };

  const handleJoinRoom = () => {
    if (!roomCodeInput.trim()) {
      setLobbyError('Enter a 5-character room code');
      return;
    }
    setLobbyError(null);
    if (wsStatus !== 'connected') {
      networkClient.connect(wsUrl);
    }
    networkClient.joinRoom({
      roomId: roomCodeInput.trim().toUpperCase(),
      playerName: playerName.trim() || 'Operator',
      team: playerTeam,
    });
  };

  const isHost = !room || room.hostId === (yourId ?? networkClient.clientId);
  const selectedMapMeta = MAP_LIST.find((m) => m.id === mapId) ?? MAP_LIST[0];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-8 pointer-events-none">
      {/* Top-Left Bespoke SVG Title Lockup over calm negative space */}
      <div className="flex items-start justify-between">
        <div className="pointer-events-auto w-full max-w-[440px] bg-[#11151d]/92 border border-white/15 rounded-lg p-5 shadow-2xl max-h-[86vh] overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <svg
              width="36"
              height="36"
              viewBox="0 0 38 38"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <polygon
                points="19,2 35,10 35,28 19,36 3,28 3,10"
                stroke="#f59e0b"
                strokeWidth="2.2"
                fill="#181e28"
              />
              <circle cx="19" cy="19" r="6.5" stroke="#f8fafc" strokeWidth="1.8" />
              <line x1="19" y1="7" x2="19" y2="12" stroke="#f59e0b" strokeWidth="2" />
              <line x1="19" y1="26" x2="19" y2="31" stroke="#f59e0b" strokeWidth="2" />
              <line x1="7" y1="19" x2="12" y2="19" stroke="#f59e0b" strokeWidth="2" />
              <line x1="26" y1="19" x2="31" y2="19" stroke="#f59e0b" strokeWidth="2" />
            </svg>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-50 uppercase leading-none">
                Sandline Tactical
              </h1>
              <p className="text-[11px] text-amber-400/90 mt-1 tracking-wider uppercase">
                5v5 Competitive Bomb Defusal
              </p>
            </div>
          </div>

          {/* 4 Mode Tabs */}
          <div
            role="tablist"
            aria-label="Game Mode"
            className="grid grid-cols-4 gap-1 p-1 bg-[#0b0e14] rounded-md mb-4 border border-white/10"
          >
            {(
              [
                { id: 'bots', label: 'vs. Bots' },
                { id: 'spectate', label: 'Watch Bots' },
                { id: 'pvp', label: 'Players PvP' },
                { id: 'mixed', label: 'Mixed' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => {
                  setMode(tab.id);
                  setLobbyError(null);
                }}
                className={`py-2 px-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Arena / Map Selector */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-300">Combat Map</span>
              <span className="text-[11px] text-amber-300/90">{selectedMapMeta.subtitle}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
              {MAP_LIST.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={Boolean(room)}
                  onClick={() => handleSelectMap(m.id)}
                  className={`py-1.5 px-1 text-[11px] font-semibold rounded transition-colors truncate ${
                    mapId === m.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  } ${room ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Player Name & Team Row */}
          <div className={`grid ${mode === 'spectate' ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mb-4`}>
            {mode !== 'spectate' && (
              <div>
                <label
                  htmlFor="callsign-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Callsign
                </label>
                <input
                  id="callsign-input"
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-[#0b0e14] border border-white/15 rounded text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            )}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-1">
                {mode === 'spectate' ? 'Initial Camera Side (LMB/RMB switches all bots)' : 'Starting Side'}
              </span>
              <div className="grid grid-cols-2 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
                <button
                  type="button"
                  onClick={() => {
                    setPlayerTeam('attackers');
                    if (room) networkClient.switchTeam('attackers');
                  }}
                  className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                    playerTeam === 'attackers'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Attackers
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlayerTeam('defenders');
                    if (room) networkClient.switchTeam('defenders');
                  }}
                  className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                    playerTeam === 'defenders'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Defenders
                </button>
              </div>
            </div>
          </div>

          {mode === 'bots' || mode === 'spectate' ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="bot-difficulty-slider" className="font-medium text-slate-300">
                    Bot Difficulty
                  </label>
                  <span className="font-tactical-mono text-amber-300 font-semibold">
                    {difficulty} / 100 · {getDifficultyLabel(difficulty)}
                  </span>
                </div>
                <input
                  id="bot-difficulty-slider"
                  type="range"
                  min={1}
                  max={100}
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-slate-300">Bot Vision</span>
                  <span className="text-[11px] text-slate-400">
                    {legacyBots ? '360° Classic Snap' : 'FOV + Threat Memory'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
                  <button
                    type="button"
                    onClick={() => setLegacyBots(false)}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      !legacyBots
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tactical Vision
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegacyBots(true)}
                    className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                      legacyBots
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Legacy Bots
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="menu-sensitivity-slider" className="font-medium text-slate-300">
                    Mouse Sensitivity
                  </label>
                  <span className="font-tactical-mono text-sky-300 font-semibold">
                    {sensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="menu-sensitivity-slider"
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  value={sensitivity}
                  onChange={(e) => onChangeSensitivity(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1">
                  Match Format
                </span>
                <div className="grid grid-cols-2 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
                  {[
                    { label: 'MR6 (12 Rounds)', val: 12 },
                    { label: 'MR12 (24 Rounds)', val: 24 },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setMaxRounds(opt.val)}
                      className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                        maxRounds === opt.val
                          ? 'bg-slate-200 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                data-start="true"
                onClick={() =>
                  onStartMatch({
                    mode,
                    mapId,
                    playerTeam,
                    playerName: playerName.trim() || 'Operator',
                    difficulty,
                    maxRounds,
                    legacyBots,
                  })
                }
                className="w-full py-3 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider rounded transition-colors"
              >
                {mode === 'spectate'
                  ? `Watch 5v5 Bots on ${selectedMapMeta.name}`
                  : `Deploy on ${selectedMapMeta.name} (5v5)`}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="ws-override"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  WebSocket Server URL ({wsStatus})
                </label>
                <div className="flex gap-2">
                  <input
                    id="ws-override"
                    type="text"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs font-tactical-mono bg-[#0b0e14] border border-white/15 rounded text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleConnect}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded border border-white/15 whitespace-nowrap"
                  >
                    Connect
                  </button>
                </div>
              </div>

              {mode === 'mixed' && (
                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor="mixed-difficulty-slider" className="font-medium text-slate-300">
                        Fill Bot Difficulty (5v5)
                      </label>
                      <span className="font-tactical-mono text-amber-300 font-semibold">
                        {difficulty} / 100 · {getDifficultyLabel(difficulty)}
                      </span>
                    </div>
                    <input
                      id="mixed-difficulty-slider"
                      type="range"
                      min={1}
                      max={100}
                      value={difficulty}
                      onChange={(e) => setDifficulty(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
                    <button
                      type="button"
                      onClick={() => setLegacyBots(false)}
                      className={`py-1 text-xs font-semibold rounded transition-colors ${
                        !legacyBots
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Tactical Vision
                    </button>
                    <button
                      type="button"
                      onClick={() => setLegacyBots(true)}
                      className={`py-1 text-xs font-semibold rounded transition-colors ${
                        legacyBots
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Legacy Bots
                    </button>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <label htmlFor="pvp-sensitivity-slider" className="font-medium text-slate-300">
                    Mouse Sensitivity
                  </label>
                  <span className="font-tactical-mono text-sky-300 font-semibold">
                    {sensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="pvp-sensitivity-slider"
                  type="range"
                  min={0.2}
                  max={3.0}
                  step={0.05}
                  value={sensitivity}
                  onChange={(e) => onChangeSensitivity(Number(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer"
                />
              </div>

              {!room ? (
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded transition-colors"
                  >
                    Create {mode === 'mixed' ? 'Mixed (5v5 Bots)' : 'PvP'} Room on{' '}
                    {selectedMapMeta.name}
                  </button>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Room Code"
                      aria-label="Room Code"
                      maxLength={6}
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 text-xs font-tactical-mono uppercase bg-[#0b0e14] border border-white/15 rounded text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleJoinRoom}
                      className="px-4 py-2 text-xs font-bold uppercase bg-sky-600 hover:bg-sky-500 text-white rounded whitespace-nowrap"
                    >
                      Join Room
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0b0e14] border border-white/15 rounded p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">
                      Room{' '}
                      <strong className="font-tactical-mono text-amber-400 text-sm">
                        {room.id}
                      </strong>{' '}
                      · {MAP_LIST.find((m) => m.id === room.mapId)?.name ?? room.mapId}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        networkClient.leaveRoom();
                        setRoom(null);
                      }}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      Leave
                    </button>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {room.players.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/5"
                      >
                        <span className="text-slate-100">
                          {p.name} {p.isHost ? '(Host)' : ''}
                        </span>
                        <span
                          className={
                            p.team === 'attackers' ? 'text-amber-400' : 'text-sky-400'
                          }
                        >
                          {p.team === 'attackers' ? 'ATK' : 'DEF'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {isHost ? (
                    <button
                      type="button"
                      data-start="true"
                      onClick={() => networkClient.startMatch()}
                      className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded transition-colors"
                    >
                      Launch Match
                    </button>
                  ) : (
                    <p className="text-xs text-center text-slate-400 py-1">
                      Waiting for room host to start match...
                    </p>
                  )}
                </div>
              )}

              {lobbyError && (
                <p className="text-xs text-rose-400 bg-rose-950/50 border border-rose-500/30 rounded px-2.5 py-1.5">
                  {lobbyError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quiet Single-Line Bottom Control Hint */}
      <div className="text-center">
        <p className="inline-block px-4 py-1.5 rounded bg-[#0e1116]/85 text-xs text-slate-300 tracking-wide">
          WASD Move · Shift Walk · Ctrl/C Crouch · B Buy · 1-5 Slots · Q Quick-Switch · R Reload · F Inspect · G Drop · E Plant/Defuse/Takeover · Esc Pause
        </p>
      </div>
    </div>
  );
}
