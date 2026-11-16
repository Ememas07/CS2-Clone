import { useEffect, useRef, useState } from 'react';
import {
  createCustomMapTemplate,
  customMapToDefinition,
  validateCustomMapJson,
} from '../game/customMaps';
import type { MatchConfig } from '../game/engine';
import { MAP_LIST, registerCustomMap } from '../game/mapData';
import { getDefaultWebSocketUrl, networkClient } from '../game/network';
import type {
  BotDifficulty,
  CrosshairConfig,
  CustomMapJson,
  GameMode,
  MapId,
  RoomInfo,
  Team,
} from '../game/types';
import { CrosshairCustomizer } from './CrosshairCustomizer';

const PLAYER_NAME_STORAGE_KEY = 'sandline_player_name';

function loadSavedPlayerName(): string {
  try {
    const raw = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (raw && raw.trim().length > 0) return raw.trim().slice(0, 16);
  } catch {
    // Ignore storage errors
  }
  return 'Operator';
}

interface MainMenuProps {
  sensitivity: number;
  onChangeSensitivity: (val: number) => void;
  crosshairConfig: CrosshairConfig;
  onChangeCrosshair: (next: CrosshairConfig) => void;
  onStartMatch: (config: MatchConfig) => void;
  onPreviewMap: (mapId: MapId, customMapData?: CustomMapJson | null) => void;
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
  crosshairConfig,
  onChangeCrosshair,
  onStartMatch,
  onPreviewMap,
}: MainMenuProps) {
  const [mode, setMode] = useState<GameMode>('bots');
  const [lobbyStyle, setLobbyStyle] = useState<'solo' | 'multiplayer'>('solo');
  const [mapId, setMapId] = useState<MapId>('sandline');
  const [customMap, setCustomMap] = useState<CustomMapJson | null>(null);
  const [playerName, setPlayerName] = useState<string>(loadSavedPlayerName);
  const [playerTeam, setPlayerTeam] = useState<Team>('attackers');
  const [difficulty, setDifficulty] = useState<BotDifficulty>(55);
  const [legacyBots, setLegacyBots] = useState(false);
  const [maxRounds, setMaxRounds] = useState<number>(12);

  // Modals
  const [showCrosshairModal, setShowCrosshairModal] = useState(false);
  const [showCustomMapModal, setShowCustomMapModal] = useState(false);
  const [customJsonInput, setCustomJsonInput] = useState('');
  const [customMapError, setCustomMapError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Multiplayer Lobby State
  const [wsUrl, setWsUrl] = useState<string>(() => getDefaultWebSocketUrl());
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [yourId, setYourId] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const trimmed = playerName.trim();
      if (trimmed.length > 0) {
        window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmed.slice(0, 16));
      }
    } catch {
      // Ignore storage errors
    }
  }, [playerName]);

  useEffect(() => {
    const syncRoomCustomMap = (r: RoomInfo): CustomMapJson | null => {
      if (r.mapId === 'custom' && r.customMapData) {
        const res = validateCustomMapJson(r.customMapData);
        if (res.ok) {
          registerCustomMap(customMapToDefinition(res.data));
          setCustomMap(res.data);
          return res.data;
        }
      }
      return null;
    };

    networkClient.setCallbacks({
      onStatusChange: (status, err) => {
        setWsStatus(status);
        if (err) setLobbyError(err);
      },
      onWelcome: (id) => setYourId(id),
      onRoomJoined: (r, id) => {
        const syncedCustom = syncRoomCustomMap(r);
        setRoom(r);
        setYourId(id);
        setMapId(r.mapId);
        onPreviewMap(r.mapId, syncedCustom);
        setLobbyError(null);
      },
      onRoomUpdate: (r) => setRoom(r),
      onRoomError: (err) => setLobbyError(err),
      onSessionRestored: (r, id) => {
        const syncedCustom = syncRoomCustomMap(r);
        setRoom(r);
        setYourId(id);
        setMapId(r.mapId);
        onPreviewMap(r.mapId, syncedCustom);
        setLobbyError(null);
        if (r.started) {
          const me = r.players.find((p) => p.id === (id ?? networkClient.clientId));
          onStartMatch({
            mode: r.mode,
            mapId: r.mapId,
            customMapData: syncedCustom ?? r.customMapData ?? customMap,
            playerTeam: me?.team ?? playerTeam,
            playerName: me?.name ?? playerName,
            difficulty: r.botDifficulty,
            maxRounds,
            legacyBots,
            room: r,
            localClientId: id ?? networkClient.clientId,
          });
        }
      },
      onMatchStarted: (r) => {
        const syncedCustom = syncRoomCustomMap(r);
        const me = r.players.find((p) => p.id === (yourId ?? networkClient.clientId));
        onStartMatch({
          mode: r.mode,
          mapId: r.mapId,
          customMapData: syncedCustom ?? r.customMapData ?? customMap,
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
  }, [customMap, legacyBots, maxRounds, onPreviewMap, onStartMatch, playerName, playerTeam, yourId]);

  const isOfflineStartMode =
    mode === 'bots' ||
    mode === 'spectate' ||
    ((mode === 'awp' || mode === 'ffa') && lobbyStyle === 'solo');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showCrosshairModal || showCustomMapModal) return;
      if (!isOfflineStartMode) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStartMatch({
          mode,
          mapId,
          customMapData: mapId === 'custom' ? customMap : null,
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
  }, [
    customMap,
    difficulty,
    isOfflineStartMode,
    legacyBots,
    mapId,
    maxRounds,
    mode,
    onStartMatch,
    playerName,
    playerTeam,
    showCrosshairModal,
    showCustomMapModal,
  ]);

  const handleSelectMode = (nextMode: GameMode) => {
    setMode(nextMode);
    setLobbyError(null);
    if (nextMode === 'awp' && mapId !== 'awp_arena' && mapId !== 'custom') {
      setMapId('awp_arena');
      onPreviewMap('awp_arena');
    } else if (nextMode !== 'awp' && mapId === 'awp_arena') {
      setMapId('sandline');
      onPreviewMap('sandline');
    }
  };

  const handleSelectMap = (id: MapId) => {
    setMapId(id);
    onPreviewMap(id, id === 'custom' ? customMap : null);
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
    const netMode: 'pvp' | 'mixed' | 'awp' | 'ffa' =
      mode === 'mixed' || mode === 'awp' || mode === 'ffa' ? mode : 'pvp';
    networkClient.createRoom({
      playerName: playerName.trim() || 'Operator',
      team: playerTeam,
      mode: netMode,
      mapId,
      botDifficulty: difficulty,
      customMapData: mapId === 'custom' && customMap ? customMap : undefined,
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

  const handleDownloadTemplate = () => {
    const sample = createCustomMapTemplate();
    const json = JSON.stringify(sample, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'citadel-courtyard.map.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const applyCustomMapJsonText = (rawText: string) => {
    setCustomMapError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      setCustomMapError(
        `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse error'}`
      );
      return;
    }
    const res = validateCustomMapJson(parsed);
    if (!res.ok) {
      setCustomMapError(res.error);
      return;
    }
    const def = customMapToDefinition(res.data);
    registerCustomMap(def);
    setCustomMap(res.data);
    setMapId('custom');
    onPreviewMap('custom', res.data);
    setShowCustomMapModal(false);
  };

  const handleCustomFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setCustomJsonInput(text);
      applyCustomMapJsonText(text);
    } catch {
      setCustomMapError('Could not read the selected file.');
    } finally {
      e.target.value = '';
    }
  };

  const isHost = !room || room.hostId === (yourId ?? networkClient.clientId);

  const mapOptions: Array<{ id: MapId; name: string; subtitle: string }> = [
    ...MAP_LIST,
    { id: 'awp_arena', name: 'AWP Arena', subtitle: 'Symmetric sniper sightlines & towers' },
    ...(customMap
      ? [
          {
            id: 'custom' as MapId,
            name: customMap.mapName,
            subtitle: `Custom · ${customMap.skyTheme}`,
          },
        ]
      : []),
  ];

  const selectedMapMeta = mapOptions.find((m) => m.id === mapId) ?? mapOptions[0];

  const modeDeployLabel = (() => {
    if (mode === 'spectate') return `Watch 5v5 Bots on ${selectedMapMeta.name}`;
    if (mode === 'awp') return `Deploy AWP Duel on ${selectedMapMeta.name} (5v5)`;
    if (mode === 'ffa') return `Deploy Free-for-All on ${selectedMapMeta.name} (10P)`;
    return `Deploy on ${selectedMapMeta.name} (5v5)`;
  })();

  const showMultiplayerSection =
    mode === 'pvp' ||
    mode === 'mixed' ||
    ((mode === 'awp' || mode === 'ffa') && lobbyStyle === 'multiplayer');

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-8 pointer-events-none">
      {/* Top-Left Bespoke SVG Title Lockup */}
      <div className="flex items-start justify-between">
        <div className="pointer-events-auto w-full max-w-[465px] bg-[#11151d]/94 border border-white/15 rounded-lg p-5 shadow-2xl max-h-[86vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-3">
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
                  {mode === 'ffa'
                    ? 'Free-for-All · 30 Kill Race'
                    : mode === 'awp'
                      ? 'AWP Only · 5v5 Marksman'
                      : '5v5 Competitive Bomb Defusal'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCustomMapError(null);
                  setShowCustomMapModal(true);
                }}
                className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-[#0b0e14] hover:bg-white/10 text-slate-200 border border-white/15 transition-colors whitespace-nowrap"
              >
                Custom Maps
              </button>
              <button
                type="button"
                onClick={() => setShowCrosshairModal(true)}
                className="px-2.5 py-1.5 rounded text-[11px] font-semibold bg-[#0b0e14] hover:bg-white/10 text-emerald-300 border border-white/15 transition-colors whitespace-nowrap"
              >
                Crosshair
              </button>
            </div>
          </div>

          {/* 6 Mode Tabs */}
          <div
            role="tablist"
            aria-label="Game Mode"
            className="grid grid-cols-3 gap-1 p-1 bg-[#0b0e14] rounded-md mb-3.5 border border-white/10"
          >
            {(
              [
                { id: 'bots', label: 'vs. Bots' },
                { id: 'spectate', label: 'Watch Bots' },
                { id: 'pvp', label: 'Players PvP' },
                { id: 'mixed', label: 'Mixed' },
                { id: 'awp', label: 'AWP Only' },
                { id: 'ffa', label: 'Free-for-All' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => handleSelectMode(tab.id)}
                className={`py-1.5 px-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Solo/Bots vs Multiplayer Toggle for AWP & FFA */}
          {(mode === 'awp' || mode === 'ffa') && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0e14] rounded mb-3 border border-white/10">
              <button
                type="button"
                onClick={() => setLobbyStyle('solo')}
                className={`py-1 text-[11px] font-semibold rounded transition-colors ${
                  lobbyStyle === 'solo'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Solo + Bots (Instant)
              </button>
              <button
                type="button"
                onClick={() => setLobbyStyle('multiplayer')}
                className={`py-1 text-[11px] font-semibold rounded transition-colors ${
                  lobbyStyle === 'multiplayer'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Multiplayer Room (/ws)
              </button>
            </div>
          )}

          {/* Combat Map Selector */}
          <div className="mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-300">Combat Map</span>
              <span className="text-[11px] text-amber-300/90 truncate max-w-[240px]">
                {selectedMapMeta.subtitle}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
              {mapOptions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={Boolean(room)}
                  onClick={() => handleSelectMap(m.id)}
                  className={`py-1.5 px-1.5 text-[11px] font-semibold rounded transition-colors truncate ${
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
          <div
            className={`grid ${mode === 'spectate' || mode === 'ffa' ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mb-3.5`}
          >
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
            {mode !== 'ffa' && (
              <div>
                <span className="block text-xs font-medium text-slate-300 mb-1">
                  {mode === 'spectate' ? 'Initial Camera Side' : 'Starting Side'}
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
            )}
          </div>

          {!showMultiplayerSection ? (
            <div className="space-y-3">
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

              {mode !== 'ffa' && (
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
              )}

              <button
                type="button"
                data-start="true"
                onClick={() =>
                  onStartMatch({
                    mode,
                    mapId,
                    customMapData: mapId === 'custom' ? customMap : null,
                    playerTeam,
                    playerName: playerName.trim() || 'Operator',
                    difficulty,
                    maxRounds,
                    legacyBots,
                  })
                }
                className="w-full py-3 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider rounded transition-colors"
              >
                {modeDeployLabel}
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
                    Create{' '}
                    {mode === 'mixed'
                      ? 'Mixed (5v5)'
                      : mode === 'awp'
                        ? 'AWP Room'
                        : mode === 'ffa'
                          ? 'FFA Room'
                          : 'PvP Room'}{' '}
                    on {selectedMapMeta.name}
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
                      · {mapOptions.find((m) => m.id === room.mapId)?.name ?? room.mapId}
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

      {/* Custom Maps Modal */}
      {showCustomMapModal && (
        <div
          role="dialog"
          aria-label="Custom Maps"
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 pointer-events-auto"
        >
          <div className="w-full max-w-xl bg-[#11151d] border border-white/15 rounded-lg p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold uppercase tracking-wider text-white">
                  Custom Maps (JSON)
                </h2>
                <p className="text-xs text-slate-400">
                  Download the template, edit geometry/spawns/waypoints, and load directly into Bot, PvP, Mixed, AWP, or FFA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomMapModal(false)}
                className="px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/15 text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3.5 py-2 rounded text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
              >
                Download Map Template (.json)
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors"
              >
                Load Custom Map (.json) File
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample = createCustomMapTemplate();
                  setCustomJsonInput(JSON.stringify(sample, null, 2));
                  setCustomMapError(null);
                }}
                className="px-3 py-2 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15"
              >
                Insert Sample JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleCustomFileChange}
                className="hidden"
              />
            </div>

            <div>
              <label
                htmlFor="custom-map-json-textarea"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Or Paste Custom Map JSON
              </label>
              <textarea
                id="custom-map-json-textarea"
                rows={9}
                value={customJsonInput}
                onChange={(e) => setCustomJsonInput(e.target.value)}
                placeholder='{"mapName":"My Arena","skyTheme":"desert","blocks":[...], ...}'
                className="w-full p-2.5 text-xs font-tactical-mono bg-[#0b0e14] border border-white/15 rounded text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            {customMapError && (
              <p className="text-xs text-rose-300 bg-rose-950/60 border border-rose-500/40 rounded px-3 py-2">
                {customMapError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCustomMapModal(false)}
                className="px-3.5 py-2 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyCustomMapJsonText(customJsonInput)}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950"
              >
                Validate & Load Custom Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crosshair Customizer Modal */}
      {showCrosshairModal && (
        <div
          role="dialog"
          aria-label="Crosshair Customizer"
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 pointer-events-auto"
        >
          <div className="w-full max-w-md bg-[#11151d] border border-white/15 rounded-lg p-5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <h2 className="text-base font-bold uppercase tracking-wider text-white">
                Crosshair Customizer
              </h2>
              <button
                type="button"
                onClick={() => setShowCrosshairModal(false)}
                className="px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/15 text-slate-300"
              >
                Close
              </button>
            </div>
            <CrosshairCustomizer
              config={crosshairConfig}
              onChange={onChangeCrosshair}
              onClose={() => setShowCrosshairModal(false)}
            />
          </div>
        </div>
      )}

      {/* Quiet Single-Line Bottom Control Hint */}
      <div className="text-center">
        <p className="inline-block px-4 py-1.5 rounded bg-[#0e1116]/85 text-xs text-slate-300 tracking-wide">
          WASD Move · Space Bhop · Shift Walk · Ctrl/C Crouch · B Buy · F3 Rebuy · 1-5 Slots · Q Quick-Switch · R Reload · F Inspect · G Drop · E Plant/Defuse/Takeover · Esc Pause
        </p>
      </div>
    </div>
  );
}
