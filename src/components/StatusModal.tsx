import { useState } from 'react';
import type { CrosshairConfig, HudSnapshot } from '../game/types';
import { CrosshairCustomizer } from './CrosshairCustomizer';

interface StatusModalProps {
  hud: HudSnapshot;
  sensitivity: number;
  onChangeSensitivity: (val: number) => void;
  crosshairConfig: CrosshairConfig;
  onChangeCrosshair: (next: CrosshairConfig) => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onReturnToEditor?: () => void;
}

export function StatusModal({
  hud,
  sensitivity,
  onChangeSensitivity,
  crosshairConfig,
  onChangeCrosshair,
  onResume,
  onRestart,
  onMainMenu,
  onReturnToEditor,
}: StatusModalProps) {
  const [pauseTab, setPauseTab] = useState<'match' | 'crosshair'>('match');
  const isPaused = hud.screen === 'paused';
  const isFfa = hud.mode === 'ffa';

  const ffaSorted = isFfa
    ? [...hud.scoreboard].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    : [];
  const ffaWinner = ffaSorted[0];

  const attackersWon = hud.attackerScore >= hud.defenderScore;
  const localWon = isFfa
    ? Boolean(ffaWinner?.isLocal)
    : (hud.localTeam === 'attackers' && attackersWon) ||
      (hud.localTeam === 'defenders' && !attackersWon);

  const localStats = hud.scoreboard.find((p) => p.isLocal);

  return (
    <div
      data-ui-interactive="true"
      role="dialog"
      aria-label={isPaused ? 'Match Paused' : 'Match Complete'}
      className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/70"
    >
      <div className="w-full max-w-md bg-[#11151d] border border-white/15 rounded-lg p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        {isPaused ? (
          <>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
                  Match Paused
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isFfa
                    ? `Free-for-All · First to ${hud.ffaTargetKills} Kills`
                    : `Round ${hud.roundNumber} of ${hud.maxRounds} · ATK ${hud.attackerScore} – ${hud.defenderScore} DEF`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0b0e14] rounded border border-white/10 mb-4">
              <button
                type="button"
                onClick={() => setPauseTab('match')}
                className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                  pauseTab === 'match'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Match & Aim
              </button>
              <button
                type="button"
                onClick={() => setPauseTab('crosshair')}
                className={`py-1.5 text-xs font-semibold rounded transition-colors ${
                  pauseTab === 'crosshair'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Crosshair
              </button>
            </div>

            {pauseTab === 'match' ? (
              <>
                <div className="mb-4 p-3 rounded bg-[#0b0e14] border border-white/10">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label
                      htmlFor="pause-sensitivity-slider"
                      className="font-medium text-slate-300"
                    >
                      Mouse Sensitivity
                    </label>
                    <span className="font-tactical-mono text-sky-300 font-semibold">
                      {sensitivity.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    id="pause-sensitivity-slider"
                    type="range"
                    min={0.2}
                    max={3.0}
                    step={0.05}
                    value={sensitivity}
                    onChange={(e) => onChangeSensitivity(Number(e.target.value))}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={onResume}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider rounded transition-colors"
                  >
                    Resume Match [Esc]
                  </button>
                  {hud.isTestPlay && onReturnToEditor && (
                    <button
                      type="button"
                      onClick={onReturnToEditor}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm uppercase tracking-wider rounded transition-colors"
                    >
                      Return to Map Editor [F2]
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onRestart}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded border border-white/15 transition-colors"
                  >
                    Restart Match
                  </button>
                  <button
                    type="button"
                    onClick={onMainMenu}
                    className="w-full py-2.5 px-4 bg-transparent hover:bg-white/5 text-slate-300 font-semibold text-sm rounded border border-white/10 transition-colors"
                  >
                    Return to Main Menu
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <CrosshairCustomizer config={crosshairConfig} onChange={onChangeCrosshair} />
                <button
                  type="button"
                  onClick={onResume}
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider rounded transition-colors"
                >
                  Resume Match [Esc]
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-1 ${
                localWon ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {localWon ? 'Victory' : 'Match Complete'}
            </div>
            <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
              {isFfa
                ? ffaWinner
                  ? `${ffaWinner.name} Wins FFA`
                  : 'FFA Complete'
                : attackersWon
                  ? 'Attackers Win Match'
                  : 'Defenders Win Match'}
            </h2>

            {isFfa ? (
              <div className="my-4 p-3 bg-[#0b0e14] border border-white/10 rounded space-y-1.5">
                {ffaSorted.slice(0, 3).map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded ${
                      p.isLocal ? 'bg-amber-500/20 text-amber-200 font-semibold' : 'bg-white/5 text-slate-200'
                    }`}
                  >
                    <span>
                      #{idx + 1} {p.name}
                    </span>
                    <span className="font-tactical-mono tabular-nums">
                      {p.kills} K · {p.deaths} D
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="my-4 p-4 bg-[#0b0e14] border border-white/10 rounded flex items-center justify-around tabular-nums">
                <div className="text-center">
                  <div className="text-xs text-amber-400 font-bold uppercase">Attackers</div>
                  <div className="text-3xl font-bold text-white">{hud.attackerScore}</div>
                </div>
                <div className="text-slate-500 text-xl font-bold">:</div>
                <div className="text-center">
                  <div className="text-xs text-sky-400 font-bold uppercase">Defenders</div>
                  <div className="text-3xl font-bold text-white">{hud.defenderScore}</div>
                </div>
              </div>
            )}

            {localStats && (
              <div className="grid grid-cols-3 gap-2 mb-5 text-center bg-[#0b0e14] border border-white/10 rounded p-3 tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-400 uppercase">Kills</div>
                  <div className="text-lg font-bold text-white">{localStats.kills}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase">Deaths</div>
                  <div className="text-lg font-bold text-white">{localStats.deaths}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 uppercase">Headshots</div>
                  <div className="text-lg font-bold text-amber-400">{localStats.headshots}</div>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {hud.isTestPlay && onReturnToEditor && (
                <button
                  type="button"
                  onClick={onReturnToEditor}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm uppercase tracking-wider rounded transition-colors"
                >
                  Return to Map Editor [F2]
                </button>
              )}
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider rounded transition-colors"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={onMainMenu}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm rounded border border-white/15 transition-colors"
              >
                Main Menu
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
