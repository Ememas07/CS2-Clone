import type { HudSnapshot } from '../game/types';

interface StatusModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
}

export function StatusModal({
  hud,
  onResume,
  onRestart,
  onMainMenu,
}: StatusModalProps) {
  const isPaused = hud.screen === 'paused';
  const attackersWon = hud.attackerScore >= hud.defenderScore;
  const localWon =
    (hud.localTeam === 'attackers' && attackersWon) ||
    (hud.localTeam === 'defenders' && !attackersWon);

  const localStats = hud.scoreboard.find((p) => p.isLocal);

  return (
    <div
      data-ui-interactive="true"
      role="dialog"
      aria-label={isPaused ? 'Match Paused' : 'Match Complete'}
      className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-black/68"
    >
      <div className="w-full max-w-md bg-[#11151d] border border-white/15 rounded-lg p-6 shadow-2xl text-slate-100">
        {isPaused ? (
          <>
            <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
              Match Paused
            </h2>
            <p className="text-xs text-slate-400 mt-1 mb-5">
              Round {hud.roundNumber} of {hud.maxRounds} · ATK {hud.attackerScore} –{' '}
              {hud.defenderScore} DEF
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onResume}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm uppercase tracking-wider rounded transition-colors"
              >
                Resume Match [Esc]
              </button>
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
              <a
                href="/"
                className="w-full py-2.5 px-4 bg-transparent hover:bg-white/5 text-amber-400 font-semibold text-sm rounded border border-white/10 transition-colors text-center block"
              >
                Exit to AI Studio Hub
              </a>
            </div>
          </>
        ) : (
          <>
            <div
              className={`text-xs font-bold uppercase tracking-widest mb-1 ${
                localWon ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {localWon ? 'Victory' : 'Defeat'}
            </div>
            <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
              {attackersWon ? 'Attackers Win Match' : 'Defenders Win Match'}
            </h2>
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
                  <div className="text-lg font-bold text-amber-400">
                    {localStats.headshots}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
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
              <a
                href="/"
                className="w-full py-2.5 px-4 bg-transparent hover:bg-white/5 text-amber-400 font-semibold text-sm rounded border border-white/10 transition-colors text-center block"
              >
                Exit to AI Studio Hub
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
