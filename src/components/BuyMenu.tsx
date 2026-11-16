import { useCallback, useEffect, useMemo, useState } from 'react';
import { ECONOMY_CONSTANTS } from '../game/rules';
import type { BuyableGearId, HudSnapshot, WeaponId } from '../game/types';
import { KNIFE_IDS, WEAPONS } from '../game/weapons';

interface BuyMenuProps {
  hud: HudSnapshot;
  onBuy: (itemId: BuyableGearId) => { ok: boolean; reason?: string };
  onRebuy: () => { ok: boolean; reason?: string };
  onClose: () => void;
}

type BuyCategoryKey = 'primary' | 'secondary' | 'utility' | 'armor' | 'knives';

const PRIMARY_ORDER: WeaponId[] = ['mac10', 'mp7', 'ak47', 'm4a1s', 'awp'];
const SECONDARY_ORDER: WeaponId[] = ['usps', 'glock18', 'fiveseven', 'tec9', 'deagle'];
const GRENADE_ORDER: WeaponId[] = ['flashbang', 'he', 'smoke', 'molotov', 'incendiary'];

function StatBar({
  label,
  valueLabel,
  pct,
  accentClass,
}: {
  label: string;
  valueLabel: string;
  pct: number;
  accentClass: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400 uppercase tracking-wide">{label}</span>
        <span className="font-tactical-mono text-slate-100 font-semibold tabular-nums">
          {valueLabel}
        </span>
      </div>
      <div className="h-1.5 rounded-xs bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-150 ${accentClass}`}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function BuyMenu({ hud, onBuy, onRebuy, onClose }: BuyMenuProps) {
  const isFfa = hud.mode === 'ffa';
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [hoveredWeaponId, setHoveredWeaponId] = useState<WeaponId>(
    hud.primaryId ?? hud.secondaryId ?? 'ak47'
  );
  const [activeCategory, setActiveCategory] = useState<BuyCategoryKey>('primary');

  const handlePurchase = useCallback(
    (id: BuyableGearId, label: string) => {
      if (isFfa && WEAPONS[id as WeaponId]?.category === 'grenade') return;
      const res = onBuy(id);
      if (res.ok) {
        setFeedback({ text: `Equipped ${label}`, ok: true });
        // In FFA mode, selecting an item equips it and immediately closes the buy menu
        if (isFfa && WEAPONS[id as WeaponId]?.category !== 'knife') {
          onClose();
        }
      } else {
        setFeedback({ text: res.reason || 'Purchase unavailable', ok: false });
      }
    },
    [isFfa, onBuy, onClose]
  );

  const handleRebuyClick = useCallback(() => {
    const res = onRebuy();
    if (res.ok) {
      setFeedback({ text: 'Rebought previous loadout', ok: true });
      if (isFfa) {
        onClose();
      }
    } else {
      setFeedback({ text: res.reason || 'Rebuy unavailable', ok: false });
    }
  }, [isFfa, onClose, onRebuy]);

  const canBuyPhase = hud.canBuy && hud.localAlive;
  const kevlarCost = hud.armor >= 100 ? null : ECONOMY_CONSTANTS.KEVLAR_PRICE;
  const helmetCost =
    hud.armor >= 100 && hud.hasHelmet
      ? null
      : hud.armor >= 100
        ? ECONOMY_CONSTANTS.HELMET_UPGRADE_PRICE
        : ECONOMY_CONSTANTS.KEVLAR_HELMET_PRICE;

  const teamPrimaries = useMemo(
    () =>
      PRIMARY_ORDER.filter(
        (id) => isFfa || WEAPONS[id].team === 'both' || WEAPONS[id].team === hud.localTeam
      ),
    [isFfa, hud.localTeam]
  );
  const teamSecondaries = useMemo(
    () =>
      SECONDARY_ORDER.filter(
        (id) => isFfa || WEAPONS[id].team === 'both' || WEAPONS[id].team === hud.localTeam
      ),
    [isFfa, hud.localTeam]
  );
  const teamGrenades = useMemo(
    () =>
      GRENADE_ORDER.filter(
        (id) => !isFfa && (WEAPONS[id].team === 'both' || WEAPONS[id].team === hud.localTeam)
      ),
    [isFfa, hud.localTeam]
  );

  // Number-key quick-buying (1-5 within focused category) + F3 Rebuy
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'F3') {
        e.preventDefault();
        handleRebuyClick();
        return;
      }

      const match = /^Digit([1-5])$/.exec(e.code);
      if (!match) return;
      const idx = Number(match[1]) - 1;
      e.preventDefault();

      if (activeCategory === 'primary') {
        const id = teamPrimaries[idx];
        if (id) {
          setHoveredWeaponId(id);
          handlePurchase(id, WEAPONS[id].name);
        }
      } else if (activeCategory === 'secondary') {
        const id = teamSecondaries[idx];
        if (id) {
          setHoveredWeaponId(id);
          handlePurchase(id, WEAPONS[id].name);
        }
      } else if (activeCategory === 'utility') {
        if (isFfa) return; // Completely disable number-key utility buying in FFA
        const id = teamGrenades[idx];
        if (id) {
          setHoveredWeaponId(id);
          handlePurchase(id, WEAPONS[id].name);
        }
      } else if (activeCategory === 'knives') {
        const id = KNIFE_IDS[idx];
        if (id) {
          setHoveredWeaponId(id);
          handlePurchase(id, WEAPONS[id].name);
        }
      } else if (activeCategory === 'armor') {
        if (isFfa) return;
        const gearOrder: Array<{ id: BuyableGearId; label: string }> = [
          { id: 'kevlar', label: 'Kevlar Vest' },
          { id: 'kevlar_helmet', label: 'Kevlar + Helmet' },
          ...(hud.localTeam === 'defenders'
            ? [{ id: 'defuse_kit' as BuyableGearId, label: 'Defuse Kit' }]
            : []),
        ];
        const entry = gearOrder[idx];
        if (entry) handlePurchase(entry.id, entry.label);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeCategory,
    handlePurchase,
    handleRebuyClick,
    hud.localTeam,
    isFfa,
    teamGrenades,
    teamPrimaries,
    teamSecondaries,
  ]);

  const hoveredSpec = WEAPONS[hoveredWeaponId] ?? WEAPONS.ak47;
  const dmgPct = (hoveredSpec.damage / 115) * 100;
  const rofPct = (hoveredSpec.fireRateRpm / 800) * 100;
  const penPct = hoveredSpec.armorPen * 100;
  const mobPct = (hoveredSpec.moveSpeed / 8.1) * 100;

  return (
    <div
      data-ui-interactive="true"
      role="dialog"
      aria-label="Buy Menu"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65"
    >
      <div className="w-full max-w-6xl bg-[#11151d]/98 border border-white/15 rounded-lg p-5 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold uppercase tracking-wider text-white">
              Tactical Armory
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                isFfa
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : hud.localTeam === 'attackers'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              }`}
            >
              {isFfa ? 'Free-For-All' : hud.localTeam === 'attackers' ? 'Attackers' : 'Defenders'}
            </span>
            {!canBuyPhase && (
              <span className="text-xs font-semibold text-rose-400">
                {isFfa ? 'Spawn protection window closed' : 'Buy phase closed or outside spawn zone'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canBuyPhase || !hud.hasPreviousLoadout}
              onClick={handleRebuyClick}
              className="px-3.5 py-1.5 text-xs font-bold uppercase bg-emerald-600/90 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white border border-emerald-300/30 disabled:border-white/10 rounded transition-colors"
            >
              Rebuy Previous [F3]
            </button>
            <div className="text-right pl-2 border-l border-white/10">
              <div className="text-[11px] uppercase text-slate-400">Available Cash</div>
              <div className="text-xl font-bold tabular-nums text-emerald-400 leading-none">
                ${hud.cash.toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold uppercase bg-slate-800 hover:bg-slate-700 text-white border border-white/15 rounded"
            >
              Close / Resume [B]
            </button>
          </div>
        </div>

        {/* Quick-Buy Category Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-[#0b0e14] border border-white/10 rounded p-1.5">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'primary', label: 'Primary [1-5]' },
                { id: 'secondary', label: 'Pistols [1-5]' },
                { id: 'utility', label: 'Utility [1-5]' },
                { id: 'armor', label: 'Armor & Gear [1-3]' },
                { id: 'knives', label: 'Knives [1-3]' },
              ] as Array<{ id: BuyCategoryKey; label: string }>
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase rounded transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400 pr-2">
            Hover any weapon to inspect stats · Press 1–5 to quick-buy active column
          </span>
        </div>

        {/* Categorized 4-Column CS2-Style Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: Armor & Pistols */}
          <div className="space-y-4">
            <div onMouseEnter={() => setActiveCategory('armor')}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Armor & Gear {activeCategory === 'armor' ? '· [1-3]' : ''}
              </h3>
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={!canBuyPhase || kevlarCost === null}
                  onClick={() => handlePurchase('kevlar', 'Kevlar Vest')}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${
                    kevlarCost === null
                      ? 'bg-amber-500/15 border-amber-400/60'
                      : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                  } disabled:opacity-60`}
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>
                      {activeCategory === 'armor' && (
                        <span className="font-tactical-mono text-amber-400 mr-1.5">[1]</span>
                      )}
                      Kevlar Vest
                    </span>
                    <span
                      className={`tabular-nums text-xs ${
                        kevlarCost === null
                          ? 'text-amber-300'
                          : hud.cash >= kevlarCost
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {kevlarCost === null ? 'EQUIPPED' : `$${kevlarCost}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Body protection & eliminates aimpunch.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={!canBuyPhase || helmetCost === null}
                  onClick={() => handlePurchase('kevlar_helmet', 'Kevlar + Helmet')}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${
                    helmetCost === null
                      ? 'bg-amber-500/15 border-amber-400/60'
                      : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                  } disabled:opacity-60`}
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>
                      {activeCategory === 'armor' && (
                        <span className="font-tactical-mono text-amber-400 mr-1.5">[2]</span>
                      )}
                      Kevlar + Helmet
                    </span>
                    <span
                      className={`tabular-nums text-xs ${
                        helmetCost === null
                          ? 'text-amber-300'
                          : hud.cash >= helmetCost
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {helmetCost === null ? 'EQUIPPED' : `$${helmetCost}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Survives starter pistol & SMG headshots.
                  </p>
                </button>

                {hud.localTeam === 'defenders' && !isFfa && (
                  <button
                    type="button"
                    disabled={!canBuyPhase || hud.hasDefuseKit}
                    onClick={() => handlePurchase('defuse_kit', 'Defuse Kit')}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      hud.hasDefuseKit
                        ? 'bg-amber-500/15 border-amber-400/60'
                        : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>
                        {activeCategory === 'armor' && (
                          <span className="font-tactical-mono text-amber-400 mr-1.5">[3]</span>
                        )}
                        Defuse Kit
                      </span>
                      <span
                        className={`tabular-nums text-xs ${
                          hud.hasDefuseKit
                            ? 'text-amber-300'
                            : hud.cash >= ECONOMY_CONSTANTS.DEFUSE_KIT_PRICE
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {hud.hasDefuseKit ? 'EQUIPPED' : `$${ECONOMY_CONSTANTS.DEFUSE_KIT_PRICE}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Cuts C4 defusal time from 10s to 5s.
                    </p>
                  </button>
                )}
              </div>
            </div>

            <div onMouseEnter={() => setActiveCategory('secondary')}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Slot 2 · Pistols {activeCategory === 'secondary' ? '· [1-5]' : ''}
              </h3>
              <div className="space-y-1.5">
                {SECONDARY_ORDER.map((id) => {
                  const spec = WEAPONS[id];
                  const teamAllowed = isFfa || spec.team === 'both' || spec.team === hud.localTeam;
                  const owned = hud.secondaryId === id;
                  const affordable = isFfa || hud.cash >= spec.price;
                  const keyIdx = teamSecondaries.indexOf(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!canBuyPhase || owned || !teamAllowed}
                      onMouseEnter={() => setHoveredWeaponId(id)}
                      onFocus={() => setHoveredWeaponId(id)}
                      onClick={() => handlePurchase(id, spec.name)}
                      className={`w-full text-left p-2 rounded border transition-colors ${
                        owned
                          ? 'bg-amber-500/15 border-amber-400/70'
                          : !teamAllowed
                            ? 'bg-[#0b0e14]/60 border-white/5 opacity-45 cursor-not-allowed'
                            : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>
                          {activeCategory === 'secondary' && keyIdx >= 0 && (
                            <span className="font-tactical-mono text-amber-400 mr-1.5">
                              [{keyIdx + 1}]
                            </span>
                          )}
                          {spec.name}
                        </span>
                        <span
                          className={`tabular-nums ${
                            owned
                              ? 'text-amber-300'
                              : !teamAllowed
                                ? 'text-slate-500'
                                : affordable
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                          }`}
                        >
                          {owned
                            ? 'EQUIPPED'
                            : !teamAllowed
                              ? spec.team === 'attackers'
                                ? 'ATK ONLY'
                                : 'DEF ONLY'
                              : isFfa
                                ? 'FREE'
                                : `$${spec.price}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        DMG {spec.damage} · {spec.magSize}/{spec.reserveAmmo}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Column 2: Primary Weapons */}
          <div onMouseEnter={() => setActiveCategory('primary')}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Slot 1 · SMGs, Rifles & Sniper {activeCategory === 'primary' ? '· [1-5]' : ''}
            </h3>
            <div className="space-y-1.5">
              {PRIMARY_ORDER.map((id) => {
                const spec = WEAPONS[id];
                const teamAllowed = isFfa || spec.team === 'both' || spec.team === hud.localTeam;
                const owned = hud.primaryId === id;
                const affordable = isFfa || hud.cash >= spec.price;
                const keyIdx = teamPrimaries.indexOf(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canBuyPhase || owned || !teamAllowed}
                    onMouseEnter={() => setHoveredWeaponId(id)}
                    onFocus={() => setHoveredWeaponId(id)}
                    onClick={() => handlePurchase(id, spec.name)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      owned
                        ? 'bg-amber-500/15 border-amber-400/70'
                        : !teamAllowed
                          ? 'bg-[#0b0e14]/60 border-white/5 opacity-45 cursor-not-allowed'
                          : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>
                        {activeCategory === 'primary' && keyIdx >= 0 && (
                          <span className="font-tactical-mono text-amber-400 mr-1.5">
                            [{keyIdx + 1}]
                          </span>
                        )}
                        {spec.name}
                      </span>
                      <span
                        className={`tabular-nums text-xs ${
                          owned
                            ? 'text-amber-300'
                            : !teamAllowed
                              ? 'text-slate-500'
                              : affordable
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }`}
                      >
                        {owned
                          ? 'EQUIPPED'
                          : !teamAllowed
                            ? spec.team === 'attackers'
                              ? 'ATK ONLY'
                              : 'DEF ONLY'
                            : isFfa
                              ? 'FREE'
                              : `$${spec.price.toLocaleString()}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {spec.category.toUpperCase()} · DMG {spec.damage} · Kill +${spec.killReward}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{spec.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 3: Grenades (Slot 4) */}
          <div onMouseEnter={() => setActiveCategory('utility')}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Slot 4 · Utility {isFfa ? '' : `(${hud.grenades.length}/4)`} {!isFfa && activeCategory === 'utility' ? '· [1-5]' : ''}
              </h3>
              {isFfa && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  Disabled in FFA
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {GRENADE_ORDER.map((id) => {
                const spec = WEAPONS[id];
                const teamAllowed = !isFfa && (spec.team === 'both' || spec.team === hud.localTeam);
                const count = hud.grenades.filter((g) => g === id).length;
                const maxed =
                  hud.grenades.length >= 4 ||
                  (id === 'flashbang' ? count >= 2 : count >= 1);
                const affordable = hud.cash >= spec.price;
                const keyIdx = teamGrenades.indexOf(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isFfa || !canBuyPhase || maxed || !teamAllowed}
                    onMouseEnter={() => setHoveredWeaponId(id)}
                    onFocus={() => setHoveredWeaponId(id)}
                    onClick={() => handlePurchase(id, spec.name)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      isFfa
                        ? 'bg-[#0b0e14]/50 border-white/5 opacity-40 cursor-not-allowed'
                        : count > 0
                          ? 'bg-amber-500/10 border-amber-400/50'
                          : !teamAllowed
                            ? 'bg-[#0b0e14]/60 border-white/5 opacity-45 cursor-not-allowed'
                            : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span className={isFfa ? 'text-slate-500' : ''}>
                        {!isFfa && activeCategory === 'utility' && keyIdx >= 0 && (
                          <span className="font-tactical-mono text-amber-400 mr-1.5">
                            [{keyIdx + 1}]
                          </span>
                        )}
                        {spec.name}
                        {!isFfa && count > 0 ? ` (${count})` : ''}
                      </span>
                      <span
                        className={`tabular-nums text-xs ${
                          isFfa
                            ? 'text-rose-400 font-bold'
                            : !teamAllowed
                              ? 'text-slate-500'
                              : maxed
                                ? 'text-amber-300'
                                : affordable
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                        }`}
                      >
                        {isFfa
                          ? 'DISABLED'
                          : !teamAllowed
                            ? spec.team === 'attackers'
                              ? 'ATK ONLY'
                              : 'DEF ONLY'
                            : maxed
                              ? 'MAX'
                              : `$${spec.price}`}
                      </span>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${isFfa ? 'text-slate-600' : 'text-slate-400'}`}>
                      {isFfa ? 'Utility disabled in Free-For-All' : spec.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 4: Knives ($0 Free) */}
          <div onMouseEnter={() => setActiveCategory('knives')}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Slot 3 · Knives ($0 Free) {activeCategory === 'knives' ? '· [1-3]' : ''}
            </h3>
            <div className="space-y-1.5">
              {KNIFE_IDS.map((id, idx) => {
                const spec = WEAPONS[id];
                const equipped = hud.knifeId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canBuyPhase || equipped}
                    onMouseEnter={() => setHoveredWeaponId(id)}
                    onFocus={() => setHoveredWeaponId(id)}
                    onClick={() => handlePurchase(id, spec.name)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      equipped
                        ? 'bg-amber-500/15 border-amber-400/70'
                        : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>
                        {activeCategory === 'knives' && (
                          <span className="font-tactical-mono text-amber-400 mr-1.5">[{idx + 1}]</span>
                        )}
                        {spec.name}
                      </span>
                      <span className="tabular-nums text-xs text-emerald-400">
                        {equipped ? 'EQUIPPED' : '$0 FREE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Kill Reward +$1,500 · Press F to inspect
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{spec.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hovered Weapon Stat Comparison Strip */}
        <div className="mt-4 p-3.5 rounded bg-[#0b0e14] border border-white/10 grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
          <div className="md:col-span-1">
            <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
              Ballistic Profile
            </div>
            <div className="text-base font-bold text-white leading-tight mt-0.5">
              {hoveredSpec.name}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {hoveredSpec.price === 0 ? 'Free Slot' : `$${hoveredSpec.price.toLocaleString()}`} · +$
              {hoveredSpec.killReward} Kill
            </div>
          </div>
          <StatBar
            label="Damage"
            valueLabel={`${hoveredSpec.damage}`}
            pct={dmgPct}
            accentClass="bg-rose-500"
          />
          <StatBar
            label="Fire Rate"
            valueLabel={`${hoveredSpec.fireRateRpm} RPM`}
            pct={rofPct}
            accentClass="bg-amber-400"
          />
          <StatBar
            label="Armor Pen"
            valueLabel={`${Math.round(penPct)}%`}
            pct={penPct}
            accentClass="bg-sky-400"
          />
          <StatBar
            label="Mobility"
            valueLabel={`${hoveredSpec.moveSpeed.toFixed(1)} m/s`}
            pct={mobPct}
            accentClass="bg-emerald-400"
          />
        </div>

        {/* Footer Feedback */}
        <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">
            Loadout: {hud.primaryId ? WEAPONS[hud.primaryId].name : 'No Primary'} ·{' '}
            {hud.secondaryId ? WEAPONS[hud.secondaryId].name : 'No Pistol'} ·{' '}
            {WEAPONS[hud.knifeId].name} · Armor {hud.armor}
            {hud.hasHelmet ? ' + Helmet' : ''}
            {hud.hasDefuseKit ? ' · Defuse Kit' : ''}
          </span>
          {feedback && (
            <span className={feedback.ok ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {feedback.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
