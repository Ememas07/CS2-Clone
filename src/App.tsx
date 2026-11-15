import { useCallback, useEffect, useRef, useState } from 'react';
import { BuyMenu } from './components/BuyMenu';
import { MainMenu } from './components/MainMenu';
import { StatusModal } from './components/StatusModal';
import { TacticalHUD } from './components/TacticalHUD';
import { GameEngine, type MatchConfig } from './game/engine';
import { networkClient } from './game/network';
import { ROUND_CONSTANTS } from './game/rules';
import type { BuyableGearId, HudSnapshot, MapId, WeaponSlot } from './game/types';

function loadInitialSensitivity(): number {
  try {
    const raw = window.localStorage.getItem('sandline_sensitivity');
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return Math.max(0.2, Math.min(3.0, parsed));
    }
  } catch {
    // Ignore storage access errors
  }
  return 1.0;
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const lastConfigRef = useRef<MatchConfig>({
    mode: 'bots',
    mapId: 'sandline',
    playerTeam: 'attackers',
    playerName: 'Operator',
    difficulty: 55,
    maxRounds: ROUND_CONSTANTS.DEFAULT_MAX_ROUNDS,
  });

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [buyMenuOpen, setBuyMenuOpen] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [sensitivity, setSensitivity] = useState<number>(loadInitialSensitivity);
  const initialSensitivityRef = useRef(sensitivity);

  const handleStartMatch = useCallback((cfg: MatchConfig) => {
    lastConfigRef.current = cfg;
    setBuyMenuOpen(false);
    setShowScoreboard(false);
    engineRef.current?.startMatch(cfg);
  }, []);

  const handlePreviewMap = useCallback((mapId: MapId) => {
    lastConfigRef.current = { ...lastConfigRef.current, mapId };
    engineRef.current?.loadMap(mapId);
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

  // Global HUD/Menu hotkeys: B (Buy Menu), Escape (Pause or close Buy Menu), M (Mute), Tab (Scoreboard)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine || !hud) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (e.code === 'KeyM') {
        engine.toggleMute();
        return;
      }

      if (hud.screen === 'playing') {
        if (e.code === 'KeyB') {
          e.preventDefault();
          setBuyMenuOpen((prev) => {
            const next = !prev;
            if (next) engine.exitPointerLock(true);
            return next;
          });
          return;
        }

        if (e.code === 'Escape') {
          e.preventDefault();
          if (buyMenuOpen) {
            setBuyMenuOpen(false);
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
  }, [buyMenuOpen, hud]);

  // Close buy menu automatically if buy phase ends or player dies
  useEffect(() => {
    if (buyMenuOpen && (!hud?.canBuy || !hud?.localAlive || hud?.screen !== 'playing')) {
      setBuyMenuOpen(false);
    }
  }, [buyMenuOpen, hud?.canBuy, hud?.localAlive, hud?.screen]);

  const handleBuyItem = useCallback((itemId: BuyableGearId) => {
    if (!engineRef.current) return { ok: false, reason: 'Engine unavailable' };
    return engineRef.current.buyWeaponOrItem(itemId);
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
    engineRef.current?.setScreen('title');
  }, []);

  const screen = hud?.screen ?? 'title';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0e1116]">
      {/* Dedicated isolated WebGL mount node */}
      <div ref={mountRef} className="fixed inset-0" />

      {screen === 'title' && (
        <MainMenu
          sensitivity={sensitivity}
          onChangeSensitivity={handleChangeSensitivity}
          onStartMatch={handleStartMatch}
          onPreviewMap={handlePreviewMap}
        />
      )}

      {screen === 'playing' && hud && (
        <TacticalHUD
          hud={hud}
          showScoreboard={showScoreboard}
          buyMenuOpen={buyMenuOpen}
          onOpenBuyMenu={() => {
            engineRef.current?.exitPointerLock(true);
            setBuyMenuOpen(true);
          }}
          onSelectSlot={handleSelectSlot}
          onToggleMute={handleToggleMute}
          onToggleXray={handleToggleXray}
          onToggleFullscreen={handleToggleFullscreen}
          onPause={handlePause}
        />
      )}

      {screen === 'playing' && hud && buyMenuOpen && (
        <BuyMenu
          hud={hud}
          onBuy={handleBuyItem}
          onClose={() => {
            setBuyMenuOpen(false);
            engineRef.current?.requestPointerLock();
          }}
        />
      )}

      {(screen === 'paused' || screen === 'gameover') && hud && (
        <StatusModal
          hud={hud}
          sensitivity={sensitivity}
          onChangeSensitivity={handleChangeSensitivity}
          onResume={handleResume}
          onRestart={handleRestart}
          onMainMenu={handleMainMenu}
        />
      )}
    </div>
  );
}
