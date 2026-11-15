import { useEffect, useRef } from 'react';
import { MAPS } from '../game/mapData';
import type { HudSnapshot, WeaponSlot } from '../game/types';
import { WEAPONS } from '../game/weapons';

interface TacticalHUDProps {
  hud: HudSnapshot;
  showScoreboard: boolean;
  buyMenuOpen: boolean;
  onOpenBuyMenu: () => void;
  onSelectSlot: (slot: WeaponSlot) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onPause: () => void;
}

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function TacticalHUD({
  hud,
  showScoreboard,
  buyMenuOpen,
  onOpenBuyMenu,
  onSelectSlot,
  onToggleMute,
  onToggleFullscreen,
  onPause,
}: TacticalHUDProps) {
  const radarRef = useRef<HTMLCanvasElement | null>(null);

  // Draw crisp 2D tactical radar for active map
  useEffect(() => {
    const canvas = radarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapDef = MAPS[hud.mapId] ?? MAPS.sandline;
    const bounds = mapDef.bounds;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0c1118';
    ctx.fillRect(0, 0, w, h);

    const mapW = bounds.maxX - bounds.minX;
    const mapD = bounds.maxZ - bounds.minZ;
    const pad = 8;
    const scale = Math.min((w - pad * 2) / mapW, (h - pad * 2) / mapD);
    const offsetX = w * 0.5;
    const offsetY = h * 0.5;

    const toRadar = (wx: number, wz: number): [number, number] => [
      offsetX + wx * scale,
      offsetY + wz * scale,
    ];

    // Arena boundary floor
    const [bx0, by0] = toRadar(bounds.minX, bounds.minZ);
    const [bx1, by1] = toRadar(bounds.maxX, bounds.maxZ);
    ctx.fillStyle = '#18212e';
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

    // Bomb site zones
    for (const site of mapDef.siteZones) {
      const [sx, sy] = toRadar(site.x, site.z);
      const r = site.radius * scale;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site.site, sx, sy);
    }

    // Map geometry footprint
    for (const box of mapDef.boxes) {
      const [x, y] = toRadar(box.x - box.w * 0.5, box.z - box.d * 0.5);
      const bw = Math.max(1.5, box.w * scale);
      const bd = Math.max(1.5, box.d * scale);
      ctx.fillStyle =
        box.material === 'wood'
          ? '#6f563d'
          : box.material.startsWith('metal')
            ? '#475569'
            : '#334155';
      ctx.fillRect(x, y, bw, bd);
    }

    // Active viewer FOV cone
    const [lx, ly] = toRadar(hud.localX, hud.localZ);
    const fx = -Math.sin(hud.localYaw);
    const fz = -Math.cos(hud.localYaw);
    const angle = Math.atan2(fz, fx);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.16)';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, 26, angle - 0.52, angle + 0.52);
    ctx.closePath();
    ctx.fill();

    // Bomb icon: Attackers always know dropped/planted C4 location; Defenders only see it when right next to it
    const canSeeBombOnRadar =
      hud.localTeam === 'attackers' ||
      Math.hypot(hud.bomb.x - hud.localX, hud.bomb.z - hud.localZ) < 6;
    if (
      canSeeBombOnRadar &&
      (hud.bomb.status === 'dropped' ||
        hud.bomb.status === 'planted' ||
        hud.bomb.status === 'defusing')
    ) {
      const [cx, cy] = toRadar(hud.bomb.x, hud.bomb.z);
      ctx.fillStyle = hud.bomb.status === 'planted' ? '#ef4444' : '#f59e0b';
      ctx.fillRect(cx - 3.5, cy - 3.5, 7, 7);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 3.5, cy - 3.5, 7, 7);
    }

    // Player blips
    for (const blip of hud.radarBlips) {
      if (!blip.alive) continue;
      const isAlly = blip.team === hud.localTeam;
      if (!isAlly && !blip.spotted) continue;

      const [px, py] = toRadar(blip.x, blip.z);
      ctx.beginPath();
      ctx.arc(px, py, blip.isLocal ? 4.2 : 3.4, 0, Math.PI * 2);
      if (blip.isLocal) {
        ctx.fillStyle = '#ffffff';
      } else if (isAlly) {
        ctx.fillStyle = blip.team === 'attackers' ? '#f59e0b' : '#38bdf8';
      } else {
        ctx.fillStyle = '#ef4444';
      }
      ctx.fill();
      ctx.strokeStyle = '#090d12';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (blip.hasC4 && isAlly) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(px + 3, py - 5, 4, 4);
      }
    }
  }, [hud.bomb, hud.localTeam, hud.localX, hud.localYaw, hud.localZ, hud.mapId, hud.radarBlips]);

  const gapPx = Math.max(4, Math.min(34, hud.crosshairSpread));
  const isGun = hud.activeSlot === 1 || hud.activeSlot === 2;
  const spec = WEAPONS[hud.activeWeaponId];
  const canBuyNow = hud.canBuy && hud.localAlive;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Flashbang blind overlay */}
      {hud.blindAlpha > 0.01 && (
        <div
          className="fixed inset-0 bg-white pointer-events-none"
          style={{ opacity: Math.min(0.98, hud.blindAlpha) }}
        />
      )}

      {/* Damage vignette */}
      {hud.damageFlash > 0.01 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            opacity: Math.min(0.7, hud.damageFlash),
            boxShadow: 'inset 0 0 110px 38px rgba(220, 38, 38, 0.85)',
          }}
        />
      )}

      {/* AWP Scope Overlay */}
      {hud.scopeZoom > 0 && hud.localAlive && !buyMenuOpen && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
          <div
            className="fixed inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 34%, rgba(4,6,10,0.96) 36%)',
            }}
          />
          <div className="fixed left-0 right-0 top-1/2 h-px bg-black/90" />
          <div className="fixed top-0 bottom-0 left-1/2 w-px bg-black/90" />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />
          <span className="relative mt-44 px-2 py-0.5 rounded bg-black/80 text-xs font-tactical-mono text-amber-300">
            {hud.scopeZoom === 2 ? '4.0x ZOOM' : '2.0x ZOOM'}
          </span>
        </div>
      )}

      {/* Dynamic Crosshair (hidden while scoped or dead without target or in buy menu) */}
      {hud.scopeZoom === 0 && (hud.localAlive || Boolean(hud.spectatingName)) && !buyMenuOpen && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[9px] bg-emerald-300 shadow-[0_0_2px_#000]"
            style={{ bottom: `${gapPx}px` }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[9px] bg-emerald-300 shadow-[0_0_2px_#000]"
            style={{ top: `${gapPx}px` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] w-[9px] bg-emerald-300 shadow-[0_0_2px_#000]"
            style={{ right: `${gapPx}px` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-[2px] w-[9px] bg-emerald-300 shadow-[0_0_2px_#000]"
            style={{ left: `${gapPx}px` }}
          />
          <div className="w-[2px] h-[2px] bg-emerald-300" />
        </div>
      )}

      {/* Hitmarker */}
      {hud.hitmarker !== 'none' && (
        <div
          className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${
            hud.hitmarker === 'head' ? 'text-rose-400' : 'text-white'
          }`}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <line x1="4" y1="4" x2="10" y2="10" stroke="currentColor" strokeWidth="2.2" />
            <line x1="22" y1="4" x2="16" y2="10" stroke="currentColor" strokeWidth="2.2" />
            <line x1="4" y1="22" x2="10" y2="16" stroke="currentColor" strokeWidth="2.2" />
            <line x1="22" y1="22" x2="16" y2="16" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        </div>
      )}

      {/* Top Row: Mini-Radar | Scoreline + Timer | Kill Feed + Controls */}
      <div className="flex items-start justify-between p-4 gap-4">
        {/* Top-Left: Mini-Radar */}
        <div className="bg-[#0b0e14]/88 border border-white/15 rounded p-1.5 shadow-lg">
          <canvas
            ref={radarRef}
            width={176}
            height={176}
            aria-label="Tactical Mini-Radar"
            className="block rounded-sm"
          />
          <div className="flex items-center justify-between text-[11px] font-tactical-mono text-slate-300 px-1 pt-1">
            <span>RADAR</span>
            <span className={hud.inBuyZone ? 'text-emerald-400' : 'text-slate-400'}>
              {hud.inBuyZone ? 'BUY ZONE' : hud.localTeam === 'attackers' ? 'ATK' : 'DEF'}
            </span>
          </div>
        </div>

        {/* Top-Center: Competitive Scoreline & Round Timer */}
        <div className="flex flex-col items-center">
          <div className="flex items-center bg-[#0b0e14]/90 border border-white/15 rounded overflow-hidden shadow-lg">
            {/* Attackers Score + Alive Pips */}
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 border-r border-white/10">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-3.5 rounded-xs ${
                      i < hud.attackersAlive ? 'bg-amber-400' : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xl font-bold tabular-nums text-amber-400">
                {hud.attackerScore}
              </span>
            </div>

            {/* Timer */}
            <div className="px-4 py-1 text-center min-w-[96px]">
              {hud.phase === 'planted' ? (
                <div className="text-rose-400 font-bold tabular-nums text-lg leading-tight">
                  C4 {formatTimer(hud.bomb.timerRemaining)}
                </div>
              ) : (
                <div
                  className={`font-bold tabular-nums text-xl leading-tight ${
                    hud.phase === 'buy'
                      ? 'text-emerald-400'
                      : hud.phaseTimeRemaining <= 15
                        ? 'text-rose-400'
                        : 'text-slate-50'
                  }`}
                >
                  {formatTimer(hud.phaseTimeRemaining)}
                </div>
              )}
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                R{hud.roundNumber}/{hud.maxRounds} ·{' '}
                {hud.phase === 'buy' ? 'BUY' : hud.phase === 'planted' ? 'PLANTED' : 'LIVE'}
              </div>
            </div>

            {/* Defenders Score + Alive Pips */}
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 border-l border-white/10">
              <span className="text-xl font-bold tabular-nums text-sky-400">
                {hud.defenderScore}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-3.5 rounded-xs ${
                      i < hud.defendersAlive ? 'bg-sky-400' : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Round Banner */}
          {hud.roundBanner && (
            <div className="mt-3 px-5 py-2 bg-[#0b0e14]/92 border border-amber-400/50 rounded text-sm font-bold tracking-wider uppercase text-amber-300 shadow-lg">
              {hud.roundBanner}
            </div>
          )}
        </div>

        {/* Top-Right: Mute / Pause + Kill Feed */}
        <div className="flex flex-col items-end gap-2 min-w-[240px]">
          <div className="flex items-center gap-1.5 pointer-events-auto" data-ui-interactive="true">
            <a
              href="/"
              title="Return to Hub"
              aria-label="Return to Hub"
              className="px-2.5 py-1 text-xs font-semibold bg-[#0b0e14]/88 hover:bg-slate-800 text-amber-400 border border-white/15 rounded flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>←</span>
              <span>Hub</span>
            </a>
            <button
              type="button"
              tabIndex={-1}
              aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
              onClick={onToggleMute}
              className="px-2.5 py-1 text-xs font-semibold bg-[#0b0e14]/88 hover:bg-slate-800 text-slate-200 border border-white/15 rounded"
            >
              {hud.muted ? 'Muted [M]' : 'Audio [M]'}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle fullscreen keyboard lock"
              onClick={onToggleFullscreen}
              className="px-2.5 py-1 text-xs font-semibold bg-[#0b0e14]/88 hover:bg-slate-800 text-slate-200 border border-white/15 rounded"
            >
              Lock Keys
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause match"
              onClick={onPause}
              className="px-2.5 py-1 text-xs font-semibold bg-[#0b0e14]/88 hover:bg-slate-800 text-slate-200 border border-white/15 rounded"
            >
              Pause [Esc]
            </button>
          </div>

          <div className="flex flex-col items-end gap-1">
            {hud.killFeed.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0b0e14]/85 border border-white/10 rounded text-xs hud-text-shadow"
              >
                <span
                  className={
                    entry.killerTeam === 'attackers'
                      ? 'text-amber-300 font-semibold'
                      : entry.killerTeam === 'defenders'
                        ? 'text-sky-300 font-semibold'
                        : 'text-slate-300 font-semibold'
                  }
                >
                  {entry.killerName}
                </span>
                <span className="text-slate-400 font-tactical-mono text-[11px]">
                  [{entry.weaponName}]
                </span>
                {entry.wallbang && (
                  <span className="text-[10px] font-bold px-1 rounded bg-slate-700 text-slate-200">
                    WB
                  </span>
                )}
                {entry.headshot && (
                  <span className="text-[10px] font-bold px-1 rounded bg-rose-600 text-white">
                    HS
                  </span>
                )}
                <span
                  className={
                    entry.victimTeam === 'attackers'
                      ? 'text-amber-300 font-semibold'
                      : 'text-sky-300 font-semibold'
                  }
                >
                  {entry.victimName}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Center-Bottom Context Prompts: Interact / Bomb Progress / Click to Lock Pointer */}
      <div className="fixed left-1/2 bottom-28 -translate-x-1/2 flex flex-col items-center gap-2">
        {hud.bomb.status === 'planting' && (
          <div className="w-60 bg-[#0b0e14]/92 border border-amber-400/50 rounded p-2 text-center">
            <div className="text-xs font-bold text-amber-300 uppercase mb-1">
              Planting C4...
            </div>
            <div className="h-2 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.round(hud.bomb.plantProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {hud.bomb.status === 'defusing' && (
          <div className="w-60 bg-[#0b0e14]/92 border border-sky-400/50 rounded p-2 text-center">
            <div className="text-xs font-bold text-sky-300 uppercase mb-1">
              Defusing C4...
            </div>
            <div className="h-2 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-sky-400"
                style={{ width: `${Math.round(hud.bomb.defuseProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {hud.interactPrompt && (
          <div className="px-3.5 py-1.5 bg-[#0b0e14]/90 border border-white/20 rounded text-xs font-semibold text-amber-200">
            {hud.interactPrompt}
          </div>
        )}

        {!hud.localAlive && (
          <div className="px-4 py-2 bg-[#0b0e14]/92 border border-rose-500/40 rounded text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
              {hud.spectatingName
                ? `Spectating: ${hud.spectatingName}`
                : 'Eliminated — Free Camera'}
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">
              LMB Next · RMB Prev
              {hud.spectatingCanControl && (
                <span className="text-amber-300 font-semibold"> · [E] Take Control</span>
              )}
            </div>
          </div>
        )}

        {hud.localAlive && !hud.pointerLocked && !buyMenuOpen && !showScoreboard && (
          <div className="px-3.5 py-1 bg-[#0b0e14]/82 border border-white/15 rounded text-[11px] text-slate-300">
            Click viewport to lock mouse aim · B Buy · Esc Pause
          </div>
        )}
      </div>

      {/* Bottom Row: HP / Armor / Cash (Left) | Ammo & 4-Slot + C4 Inventory (Right) */}
      <div className="fixed bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        {/* Bottom-Left: Vitals & Economy */}
        <div className="flex flex-col gap-2">
          {canBuyNow && (
            <button
              type="button"
              tabIndex={-1}
              data-ui-interactive="true"
              onClick={onOpenBuyMenu}
              className="pointer-events-auto self-start px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider rounded border border-emerald-300/30 shadow"
            >
              [B] Open Buy Menu
            </button>
          )}
          <div className="flex items-center gap-4 bg-[#0b0e14]/90 border border-white/15 rounded px-4 py-2.5 shadow-lg">
            {/* HP */}
            <div className="flex items-center gap-2 min-w-[92px]">
              <span className="text-xs font-bold text-slate-400">HP</span>
              <span
                className={`text-2xl font-bold tabular-nums leading-none ${
                  hud.hp <= 25 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {hud.hp}
              </span>
            </div>

            {/* Armor + Helmet */}
            <div className="flex items-center gap-2 border-l border-white/10 pl-4 min-w-[96px]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2L4 5v6.5c0 5 3.4 9.5 8 10.5 4.6-1 8-5.5 8-10.5V5l-8-3z"
                  stroke={hud.armor > 0 ? '#38bdf8' : '#64748b'}
                  strokeWidth="2"
                  fill={hud.armor > 0 ? 'rgba(56,189,248,0.2)' : 'none'}
                />
                {hud.hasHelmet && (
                  <circle cx="12" cy="10" r="2.5" fill="#38bdf8" />
                )}
              </svg>
              <span className="text-xl font-bold tabular-nums leading-none text-sky-300">
                {hud.armor}
              </span>
            </div>

            {/* Cash */}
            <div className="border-l border-white/10 pl-4">
              <span className="text-xl font-bold tabular-nums text-emerald-400 leading-none">
                ${hud.cash.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom-Right: Weapon Slots & Ammo */}
        <div className="flex flex-col items-end gap-2">
          {/* Active Weapon & Ammo */}
          <div className="flex items-center gap-4 bg-[#0b0e14]/90 border border-white/15 rounded px-4 py-2 shadow-lg">
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {hud.activeWeaponName}
              </div>
              <div className="text-[11px] text-slate-400">
                {hud.isReloading
                  ? 'RELOADING...'
                  : spec?.hasSilencer
                    ? hud.silenced
                      ? 'SUPPRESSED [RMB]'
                      : 'UNSUPPRESSED [RMB]'
                    : spec?.hasBurst
                      ? hud.burstMode
                        ? '3-ROUND BURST [RMB]'
                        : 'SEMI-AUTO [RMB]'
                      : spec?.hasScope
                        ? '2x/4x SCOPE [RMB]'
                        : spec?.category === 'knife'
                          ? 'SLASH / STAB [RMB]'
                          : spec?.category === 'grenade'
                            ? 'THROW / UNDERHAND [RMB]'
                            : 'HOLD E AT SITE'}
              </div>
            </div>
            {isGun && (
              <div className="border-l border-white/10 pl-4 flex items-baseline gap-1 tabular-nums">
                <span
                  className={`text-2xl font-bold leading-none ${
                    hud.mag <= 3 ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {hud.mag}
                </span>
                <span className="text-sm text-slate-400">/ {hud.reserve}</span>
              </div>
            )}
          </div>

          {/* Slots 1-5 */}
          <div className="flex items-center gap-1.5 pointer-events-auto" data-ui-interactive="true">
            {(
              [
                {
                  slot: 1 as WeaponSlot,
                  label: hud.primaryId ? WEAPONS[hud.primaryId].name : 'Empty',
                  active: !!hud.primaryId,
                },
                {
                  slot: 2 as WeaponSlot,
                  label: hud.secondaryId ? WEAPONS[hud.secondaryId].name : 'Empty',
                  active: !!hud.secondaryId,
                },
                {
                  slot: 3 as WeaponSlot,
                  label: WEAPONS[hud.knifeId].name,
                  active: true,
                },
                {
                  slot: 4 as WeaponSlot,
                  label:
                    hud.grenades.length > 0
                      ? `${WEAPONS[hud.grenades[0]].name}${
                          hud.grenades.length > 1 ? ` (${hud.grenades.length})` : ''
                        }`
                      : 'No Util',
                  active: hud.grenades.length > 0,
                },
                ...(hud.hasC4
                  ? [
                      {
                        slot: 5 as WeaponSlot,
                        label: 'C4 Bomb',
                        active: true,
                      },
                    ]
                  : []),
              ] as const
            ).map((item) => {
              const selected = hud.activeSlot === item.slot;
              return (
                <button
                  key={item.slot}
                  type="button"
                  tabIndex={-1}
                  disabled={!item.active}
                  onClick={() => onSelectSlot(item.slot)}
                  className={`px-2.5 py-1.5 rounded border text-xs transition-colors ${
                    selected
                      ? 'bg-amber-500/90 text-slate-950 border-amber-300 font-bold'
                      : item.active
                        ? 'bg-[#0b0e14]/88 text-slate-200 border-white/15 hover:bg-slate-800'
                        : 'bg-[#0b0e14]/50 text-slate-600 border-white/5 cursor-default'
                  }`}
                >
                  <span className="font-tactical-mono mr-1.5 opacity-75">
                    {item.slot}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Scoreboard Overlay */}
      {showScoreboard && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-black/55">
          <div className="w-full max-w-3xl bg-[#11151d]/96 border border-white/15 rounded-lg p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wider text-white">
                  Match Scoreboard
                </h2>
                <p className="text-xs text-slate-400">
                  Round {hud.roundNumber} of {hud.maxRounds} · Halftime swap after Round{' '}
                  {hud.halftimeRound - 1}
                </p>
              </div>
              <div className="flex items-center gap-4 text-lg font-bold tabular-nums">
                <span className="text-amber-400">ATK {hud.attackerScore}</span>
                <span className="text-slate-500">:</span>
                <span className="text-sky-400">{hud.defenderScore} DEF</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['attackers', 'defenders'] as const).map((team) => {
                const members = hud.scoreboard
                  .filter((p) => p.team === team)
                  .sort((a, b) => b.kills - a.kills);
                return (
                  <div key={team} className="bg-[#0b0e14] border border-white/10 rounded p-3">
                    <div
                      className={`text-xs font-bold uppercase tracking-wider mb-2 ${
                        team === 'attackers' ? 'text-amber-400' : 'text-sky-400'
                      }`}
                    >
                      {team === 'attackers' ? 'Attackers' : 'Defenders'}
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-white/10">
                          <th className="text-left py-1">Player</th>
                          <th className="text-right py-1">K</th>
                          <th className="text-right py-1">D</th>
                          <th className="text-right py-1">HS</th>
                          <th className="text-right py-1">Cash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr
                            key={m.id}
                            className={`border-b border-white/5 last:border-0 ${
                              m.isLocal ? 'text-amber-200 font-semibold' : 'text-slate-200'
                            } ${!m.alive ? 'opacity-50' : ''}`}
                          >
                            <td className="py-1.5">
                              {m.name} {!m.alive ? '(Dead)' : ''}
                            </td>
                            <td className="text-right tabular-nums">{m.kills}</td>
                            <td className="text-right tabular-nums">{m.deaths}</td>
                            <td className="text-right tabular-nums">{m.headshots}</td>
                            <td className="text-right tabular-nums text-emerald-400">
                              ${m.cash}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
