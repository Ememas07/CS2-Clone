import { useCallback, useEffect, useRef, useState } from 'react';
import { BuyMenu } from './components/BuyMenu';
import { MainMenu } from './components/MainMenu';
import { type EditorHistoryState, MapEditor } from './components/MapEditor';
import { StatusModal } from './components/StatusModal';
import { TacticalHUD } from './components/TacticalHUD';
import { loadCrosshairConfig, saveCrosshairConfig } from './game/crosshair';
import {
  compactCustomMapJson,
  createCustomMapTemplate,
  customMapToDefinition,
} from './game/customMaps';
import {
  deleteCustomMapEntry,
  loadSavedCustomMaps,
  renameCustomMapEntry,
  resolveActiveCustomMap,
  type SavedCustomMapEntry,
  saveCustomMapEntry,
  setActiveCustomMapId,
} from './game/customMapStore';
import { GameEngine, type MatchConfig } from './game/engine';
import { registerCustomMap } from './game/mapData';
import { networkClient } from './game/network';
import { ROUND_CONSTANTS } from './game/rules';
import type {
  BuyableGearId,
  CrosshairConfig,
  CustomMapJson,
  HudSnapshot,
  MapId,
  WeaponSlot,
} from './game/types';

function loadInitialSensitivity(): number {
  try {
    const raw = window.localStorage.getItem('sandline_sensitivity');
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return Math.max(0.2, Math.min(3.0, Math.round(parsed * 100) / 100));
    }
  } catch {
    // Ignore storage access errors
  }
  return 1.0;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const inputType = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'].includes(inputType);
  }
  return false;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const lastConfigRef = useRef<MatchConfig>({
    mode: 'bots',
    mapId: 'sandline',
    customMapData: null,
    playerTeam: 'attackers',
    playerName: 'Operator',
    difficulty: 55,
    maxRounds: ROUND_CONSTANTS.DEFAULT_MAX_ROUNDS,
  });

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [buyMenuOpen, setBuyMenuOpen] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [sensitivity, setSensitivity] = useState<number>(loadInitialSensitivity);
  const [crosshairConfig, setCrosshairConfig] = useState<CrosshairConfig>(loadCrosshairConfig);
  const initialSensitivityRef = useRef(sensitivity);

  const initialSavedRef = useRef<SavedCustomMapEntry[] | null>(null);
  if (!initialSavedRef.current) {
    initialSavedRef.current = loadSavedCustomMaps();
  }
  const [savedCustomMaps, setSavedCustomMaps] = useState<SavedCustomMapEntry[]>(
    initialSavedRef.current
  );
  const [activeCustomMapId, setActiveSavedIdState] = useState<string | null>(
    () => resolveActiveCustomMap(initialSavedRef.current!)?.id ?? null
  );
  const [preferredCustomSyncStamp, setPreferredCustomSyncStamp] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorHistory, setEditorHistory] = useState<EditorHistoryState>(() => {
    const resolved = resolveActiveCustomMap(initialSavedRef.current!);
    return {
      draft: resolved ? structuredClone(resolved.data) : compactCustomMapJson(createCustomMapTemplate()),
      undoStack: [],
      redoStack: [],
    };
  });

  const handleStartMatch = useCallback((cfg: MatchConfig) => {
    lastConfigRef.current = cfg;
    setBuyMenuOpen(false);
    setShowScoreboard(false);
    engineRef.current?.startMatch(cfg);
  }, []);

  const handlePreviewMap = useCallback((mapId: MapId, customMapData?: CustomMapJson | null) => {
    lastConfigRef.current = {
      ...lastConfigRef.current,
      mapId,
      customMapData: customMapData ?? null,
    };
    engineRef.current?.loadMap(mapId, customMapData);
  }, []);

  const handleChangeCrosshair = useCallback((next: CrosshairConfig) => {
    const saved = saveCrosshairConfig(next);
    setCrosshairConfig(saved);
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    document.body.dataset.state = 'title';
    const engine = new GameEngine(container, (snapshot) => {
      setHud(snapshot);
    });
    engine.setEscapePauseHandler(() => {
      setBuyMenuOpen(false);
      setShowScoreboard(false);
      engine.setScreen('paused');
    });
    engine.setSensitivity(initialSensitivityRef.current);
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startMatch(lastConfigRef.current);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const closeBuyMenu = useCallback(() => {
    setBuyMenuOpen(false);
    try {
      engineRef.current?.requestPointerLock();
    } catch {}
  }, []);

  const handleReturnToEditor = useCallback(() => {
    setBuyMenuOpen(false);
    setShowScoreboard(false);
    engineRef.current?.exitPointerLock();
    engineRef.current?.setScreen('title');
    engineRef.current?.setSuspended(true);
    setEditorOpen(true);
  }, []);

  const handleOpenMapEditor = useCallback((initialMap?: CustomMapJson | null) => {
    if (initialMap) {
      setEditorHistory({
        draft: structuredClone(initialMap),
        undoStack: [],
        redoStack: [],
      });
    }
    engineRef.current?.setSuspended(true);
    setEditorOpen(true);
  }, []);

  const handleSelectSavedCustomMap = useCallback((entry: SavedCustomMapEntry) => {
    setActiveCustomMapId(entry.id);
    setActiveSavedIdState(entry.id);
    registerCustomMap(customMapToDefinition(entry.data));
    setEditorHistory({
      draft: structuredClone(entry.data),
      undoStack: [],
      redoStack: [],
    });
  }, []);

  const handleSaveToLibrary = useCallback(
    (map: CustomMapJson, asNew = false): SavedCustomMapEntry | null => {
      const { entries, saved } = saveCustomMapEntry(map, asNew ? undefined : activeCustomMapId);
      setSavedCustomMaps(entries);
      setActiveSavedIdState(saved.id);
      registerCustomMap(customMapToDefinition(saved.data));
      return saved;
    },
    [activeCustomMapId]
  );

  const handleRenameSavedMap = useCallback((id: string, nextName: string) => {
    const entries = renameCustomMapEntry(id, nextName);
    setSavedCustomMaps(entries);
  }, []);

  const handleDeleteSavedMap = useCallback(
    (id: string) => {
      const entries = deleteCustomMapEntry(id);
      setSavedCustomMaps(entries);
      if (activeCustomMapId === id) {
        const nextActive = entries[0] ?? null;
        setActiveSavedIdState(nextActive?.id ?? null);
        if (nextActive) {
          setEditorHistory({
            draft: structuredClone(nextActive.data),
            undoStack: [],
            redoStack: [],
          });
        }
      }
    },
    [activeCustomMapId]
  );

  const handleTestPlayCustomMap = useCallback(
    (map: CustomMapJson, withBots: boolean) => {
      registerCustomMap(customMapToDefinition(map));
      setEditorOpen(false);
      engineRef.current?.setSuspended(false);
      const cfg: MatchConfig = {
        mode: 'bots',
        mapId: 'custom',
        customMapData: map,
        playerTeam: 'attackers',
        playerName: 'Builder',
        difficulty: 55,
        maxRounds: ROUND_CONSTANTS.DEFAULT_MAX_ROUNDS,
        isTestPlay: true,
        testPlayBots: withBots,
      };
      lastConfigRef.current = cfg;
      setBuyMenuOpen(false);
      setShowScoreboard(false);
      engineRef.current?.startMatch(cfg);
      try {
        engineRef.current?.requestPointerLock();
      } catch {}
    },
    []
  );

  const handleFinishEditorToMenu = useCallback((map: CustomMapJson) => {
    registerCustomMap(customMapToDefinition(map));
    setEditorOpen(false);
    setPreferredCustomSyncStamp((n) => n + 1);
    engineRef.current?.setSuspended(false);
    engineRef.current?.loadMap('custom', map);
  }, []);

  const handleExitEditorWithoutSave = useCallback(() => {
    setEditorOpen(false);
    engineRef.current?.setSuspended(false);
  }, []);

  // Global HUD/Menu hotkeys: B (Buy Menu), F2 (Return to Map Editor during Test Play), F3 (Rebuy), Escape (Pause or close Buy Menu), M (Mute), Tab (Scoreboard)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine || !hud || editorOpen) return;
      if (isTextEntryTarget(e.target)) return;

      if (e.code === 'F2' && hud.isTestPlay) {
        e.preventDefault();
        handleReturnToEditor();
        return;
      }

      if (e.code === 'KeyM') {
        engine.toggleMute();
        return;
      }

      if (hud.screen === 'playing') {
        if (e.code === 'KeyB') {
          e.preventDefault();
          if (buyMenuOpen) {
            closeBuyMenu();
          } else if (hud.canBuy && hud.localAlive) {
            engine.exitPointerLock(true);
            setBuyMenuOpen(true);
          }
          return;
        }

        if (e.code === 'F3' && !buyMenuOpen && hud.canBuy && hud.localAlive) {
          e.preventDefault();
          engine.rebuyPreviousLoadout();
          return;
        }

        if (e.code === 'Escape') {
          e.preventDefault();
          if (buyMenuOpen) {
            closeBuyMenu();
          } else {
            setShowScoreboard(false);
            engine.setScreen('paused');
          }
          return;
        }

        if (e.code === 'Tab') {
          e.preventDefault();
          setShowScoreboard(true);
        }
      } else if (hud.screen === 'paused') {
        if (e.code === 'Escape') {
          e.preventDefault();
          engine.setScreen('playing');
          engine.requestPointerLock();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        setShowScoreboard(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [buyMenuOpen, closeBuyMenu, editorOpen, handleReturnToEditor, hud]);

  // Close buy menu automatically if buy phase ends or player dies
  useEffect(() => {
    if (buyMenuOpen && (!hud?.canBuy || !hud?.localAlive || hud?.screen !== 'playing')) {
      closeBuyMenu();
    }
  }, [buyMenuOpen, closeBuyMenu, hud?.canBuy, hud?.localAlive, hud?.screen]);

  // Whenever buyMenuOpen transitions from true -> false while playing, ensure pointer lock is requested
  const prevBuyMenuOpenRef = useRef(buyMenuOpen);
  useEffect(() => {
    if (prevBuyMenuOpenRef.current && !buyMenuOpen && hud?.screen === 'playing') {
      try {
        engineRef.current?.requestPointerLock();
      } catch {}
    }
    prevBuyMenuOpenRef.current = buyMenuOpen;
  }, [buyMenuOpen, hud?.screen]);

  const handleBuyItem = useCallback((itemId: BuyableGearId) => {
    if (!engineRef.current) return { ok: false, reason: 'Engine unavailable' };
    return engineRef.current.buyWeaponOrItem(itemId);
  }, []);

  const handleRebuyLoadout = useCallback(() => {
    if (!engineRef.current) return { ok: false, reason: 'Engine unavailable' };
    return engineRef.current.rebuyPreviousLoadout();
  }, []);

  const handleSelectSlot = useCallback((slot: WeaponSlot) => {
    engineRef.current?.selectSlot(slot);
  }, []);

  const handleToggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  const handleToggleXray = useCallback(() => {
    engineRef.current?.toggleXray();
  }, []);

  const handleChangeSensitivity = useCallback((val: number) => {
    const clamped = Math.max(0.2, Math.min(3.0, Math.round(val * 100) / 100));
    setSensitivity(clamped);
    engineRef.current?.setSensitivity(clamped);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    void engineRef.current?.toggleFullscreenLock();
  }, []);

  const handlePause = useCallback(() => {
    setBuyMenuOpen(false);
    setShowScoreboard(false);
    engineRef.current?.setScreen('paused');
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.setScreen('playing');
    engineRef.current?.requestPointerLock();
  }, []);

  const handleRestart = useCallback(() => {
    setBuyMenuOpen(false);
    setShowScoreboard(false);
    engineRef.current?.startMatch(lastConfigRef.current);
  }, []);

  const handleMainMenu = useCallback(() => {
    setBuyMenuOpen(false);
    setShowScoreboard(false);
    networkClient.leaveRoom();
    engineRef.current?.setSuspended(false);
    engineRef.current?.setScreen('title');
  }, []);

  const screen = hud?.screen ?? 'title';

  useEffect(() => {
    engineRef.current?.setUiOverlayOpen(buyMenuOpen || showScoreboard);
  }, [buyMenuOpen, showScoreboard]);

  useEffect(() => {
    if (screen !== 'title') {
      engineRef.current?.setupNetworkListeners();
    }
  }, [screen]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0e1116]">
      {/* Dedicated isolated WebGL mount node */}
      <div
        ref={mountRef}
        className="fixed inset-0"
        onMouseDown={(e) => {
          const el = e.target as HTMLElement | null;
          if (el?.closest('[data-ui-interactive="true"]')) return;
          if (!editorOpen && screen === 'playing' && !buyMenuOpen && !showScoreboard) {
            try {
              engineRef.current?.requestPointerLock();
            } catch {}
          }
        }}
      />

      {screen === 'title' && !editorOpen && (
        <MainMenu
          sensitivity={sensitivity}
          onChangeSensitivity={handleChangeSensitivity}
          crosshairConfig={crosshairConfig}
          onChangeCrosshair={handleChangeCrosshair}
          onStartMatch={handleStartMatch}
          onPreviewMap={handlePreviewMap}
          savedCustomMaps={savedCustomMaps}
          activeCustomMapId={activeCustomMapId}
          preferredCustomSyncStamp={preferredCustomSyncStamp}
          onSelectSavedCustomMap={handleSelectSavedCustomMap}
          onSaveImportedCustomMap={(map) => {
            const saved = handleSaveToLibrary(map, true);
            return (
              saved ?? {
                id: 'imported_temp',
                updatedAt: Date.now(),
                data: map,
                byteSize: JSON.stringify(map).length,
              }
            );
          }}
          onOpenMapEditor={handleOpenMapEditor}
        />
      )}

      {editorOpen && (
        <MapEditor
          history={editorHistory}
          onChangeHistory={setEditorHistory}
          savedMaps={savedCustomMaps}
          activeSavedId={activeCustomMapId}
          onSelectSavedMap={handleSelectSavedCustomMap}
          onSaveToLibrary={handleSaveToLibrary}
          onRenameSavedMap={handleRenameSavedMap}
          onDeleteSavedMap={handleDeleteSavedMap}
          onTestPlay={handleTestPlayCustomMap}
          onFinishAndReturnToMenu={handleFinishEditorToMenu}
          onExitWithoutSave={handleExitEditorWithoutSave}
        />
      )}

      {screen === 'playing' && hud && (
        <TacticalHUD
          hud={hud}
          crosshairConfig={crosshairConfig}
          showScoreboard={showScoreboard}
          buyMenuOpen={buyMenuOpen}
          onOpenBuyMenu={() => {
            if (!hud.canBuy || !hud.localAlive) return;
            engineRef.current?.exitPointerLock(true);
            setBuyMenuOpen(true);
          }}
          onSelectSlot={handleSelectSlot}
          onToggleMute={handleToggleMute}
          onToggleXray={handleToggleXray}
          onToggleFullscreen={handleToggleFullscreen}
          onPause={handlePause}
          onReturnToEditor={hud.isTestPlay ? handleReturnToEditor : undefined}
        />
      )}

      {screen === 'playing' && hud && buyMenuOpen && (
        <BuyMenu
          hud={hud}
          onBuy={handleBuyItem}
          onRebuy={handleRebuyLoadout}
          onClose={closeBuyMenu}
        />
      )}

      {(screen === 'paused' || screen === 'gameover') && hud && (
        <StatusModal
          hud={hud}
          sensitivity={sensitivity}
          onChangeSensitivity={handleChangeSensitivity}
          crosshairConfig={crosshairConfig}
          onChangeCrosshair={handleChangeCrosshair}
          onResume={handleResume}
          onRestart={handleRestart}
          onMainMenu={handleMainMenu}
          onReturnToEditor={hud.isTestPlay ? handleReturnToEditor : undefined}
        />
      )}
    </div>
  );
}
