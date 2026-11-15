import { useState } from 'react';
import { ECONOMY_CONSTANTS } from '../game/rules';
import type { BuyableGearId, HudSnapshot, WeaponId } from '../game/types';
import { KNIFE_IDS, WEAPONS } from '../game/weapons';

interface BuyMenuProps {
  hud: HudSnapshot;
  onBuy: (itemId: BuyableGearId) => { ok: boolean; reason?: string };
  onClose: () => void;
}

const PRIMARY_ORDER: WeaponId[] = ['mac10', 'mp7', 'ak47', 'm4a1s', 'awp'];
const SECONDARY_ORDER: WeaponId[] = ['usps', 'glock18', 'fiveseven', 'tec9', 'deagle'];
const GRENADE_ORDER: WeaponId[] = ['flashbang', 'he', 'smoke', 'molotov', 'incendiary'];

export function BuyMenu({ hud, onBuy, onClose }: BuyMenuProps) {
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const handlePurchase = (id: BuyableGearId, label: string) => {
    const res = onBuy(id);
    if (res.ok) {
      setFeedback({ text: `Equipped ${label}`, ok: true });
    } else {
      setFeedback({ text: res.reason || 'Purchase unavailable', ok: false });
    }
  };

  const canBuyPhase = hud.canBuy && hud.localAlive;
  const kevlarCost = hud.armor >= 100 ? null : ECONOMY_CONSTANTS.KEVLAR_PRICE;
  const helmetCost =
    hud.armor >= 100 && hud.hasHelmet
      ? null
      : hud.armor >= 100
        ? ECONOMY_CONSTANTS.HELMET_UPGRADE_PRICE
        : ECONOMY_CONSTANTS.KEVLAR_HELMET_PRICE;

  const filterTeam = (ids: WeaponId[]) =>
    ids.filter((id) => {
      const spec = WEAPONS[id];
      return spec.team === 'both' || spec.team === hud.localTeam;
    });

  return (
    <div
      data-ui-interactive="true"
      role="dialog"
      aria-label="Buy Menu"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60"
    >
      <div className="w-full max-w-5xl bg-[#11151d]/98 border border-white/15 rounded-lg p-5 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold uppercase tracking-wider text-white">
              Tactical Armory
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                hud.localTeam === 'attackers'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              }`}
            >
              {hud.localTeam === 'attackers' ? 'Attackers' : 'Defenders'}
            </span>
            {!canBuyPhase && (
              <span className="text-xs font-semibold text-rose-400">
                Buy phase closed or outside spawn zone
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
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
              Close [B]
            </button>
          </div>
        </div>

        {/* Categorized Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: Pistols & Armor */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Armor & Gear
              </h3>
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={!canBuyPhase || kevlarCost === null}
                  onClick={() => handlePurchase('kevlar', 'Kevlar Vest')}
                  className="w-full text-left p-2.5 rounded border border-white/10 bg-[#0b0e14] hover:border-amber-400/60 disabled:opacity-50 transition-colors"
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Kevlar Vest</span>
                    <span
                      className={`tabular-nums ${
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
                  className="w-full text-left p-2.5 rounded border border-white/10 bg-[#0b0e14] hover:border-amber-400/60 disabled:opacity-50 transition-colors"
                >
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Kevlar + Helmet</span>
                    <span
                      className={`tabular-nums ${
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

                {hud.localTeam === 'defenders' && (
                  <button
                    type="button"
                    disabled={!canBuyPhase || hud.hasDefuseKit}
                    onClick={() => handlePurchase('defuse_kit', 'Defuse Kit')}
                    className="w-full text-left p-2.5 rounded border border-white/10 bg-[#0b0e14] hover:border-amber-400/60 disabled:opacity-50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Defuse Kit</span>
                      <span
                        className={`tabular-nums ${
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

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Slot 2 · Pistols
              </h3>
              <div className="space-y-1.5">
                {filterTeam(SECONDARY_ORDER).map((id) => {
                  const spec = WEAPONS[id];
                  const owned = hud.secondaryId === id;
                  const affordable = hud.cash >= spec.price;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!canBuyPhase || owned}
                      onClick={() => handlePurchase(id, spec.name)}
                      className={`w-full text-left p-2 rounded border transition-colors ${
                        owned
                          ? 'bg-amber-500/15 border-amber-400/60'
                          : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{spec.name}</span>
                        <span
                          className={`tabular-nums ${
                            owned
                              ? 'text-amber-300'
                              : affordable
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {owned ? 'OWNED' : `$${spec.price}`}
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
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Slot 1 · SMGs, Rifles & Sniper
            </h3>
            <div className="space-y-1.5">
              {filterTeam(PRIMARY_ORDER).map((id) => {
                const spec = WEAPONS[id];
                const owned = hud.primaryId === id;
                const affordable = hud.cash >= spec.price;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canBuyPhase || owned}
                    onClick={() => handlePurchase(id, spec.name)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      owned
                        ? 'bg-amber-500/15 border-amber-400/60'
                        : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>{spec.name}</span>
                      <span
                        className={`tabular-nums text-xs ${
                          owned
                            ? 'text-amber-300'
                            : affordable
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {owned ? 'OWNED' : `$${spec.price.toLocaleString()}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {spec.category.toUpperCase()} · DMG {spec.damage} · Kill +$
                      {spec.killReward}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{spec.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 3: Grenades (Slot 4) */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Slot 4 · Utility Grenades ({hud.grenades.length}/4)
            </h3>
            <div className="space-y-1.5">
              {filterTeam(GRENADE_ORDER).map((id) => {
                const spec = WEAPONS[id];
                const count = hud.grenades.filter((g) => g === id).length;
                const maxed =
                  hud.grenades.length >= 4 ||
                  (id === 'flashbang' ? count >= 2 : count >= 1);
                const affordable = hud.cash >= spec.price;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canBuyPhase || maxed}
                    onClick={() => handlePurchase(id, spec.name)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      count > 0
                        ? 'bg-amber-500/10 border-amber-400/40'
                        : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>
                        {spec.name}
                        {count > 0 ? ` (${count})` : ''}
                      </span>
                      <span
                        className={`tabular-nums text-xs ${
                          maxed
                            ? 'text-amber-300'
                            : affordable
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {maxed ? 'MAX' : `$${spec.price}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{spec.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column 4: Knives ($0 Free) */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Slot 3 · Knives ($0 Free)
            </h3>
            <div className="space-y-1.5">
              {KNIFE_IDS.map((id) => {
                const spec = WEAPONS[id];
                const equipped = hud.knifeId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canBuyPhase || equipped}
                    onClick={() => handlePurchase(id, spec.name)}
                    className={`w-full text-left p-2.5 rounded border transition-colors ${
                      equipped
                        ? 'bg-amber-500/15 border-amber-400/60'
                        : 'bg-[#0b0e14] border-white/10 hover:border-amber-400/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>{spec.name}</span>
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

        {/* Footer Feedback */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
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
