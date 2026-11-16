import { CROSSHAIR_COLOR_PRESETS, DEFAULT_CROSSHAIR } from '../game/crosshair';
import type { CrosshairConfig, CrosshairShape } from '../game/types';

interface CrosshairCustomizerProps {
  config: CrosshairConfig;
  onChange: (next: CrosshairConfig) => void;
  onClose?: () => void;
}

export function CrosshairPreviewSvg({
  config,
  spreadPx = 0,
  viewportCenter = false,
}: {
  config: CrosshairConfig;
  spreadPx?: number;
  viewportCenter?: boolean;
}) {
  const effectiveGap = config.dynamic ? config.gap + spreadPx : config.gap;
  const strokeOutline = config.outline > 0 ? config.outline * 2 : 0;
  const halfBox = 72;

  return (
    <svg
      width={halfBox * 2}
      height={halfBox * 2}
      viewBox={`${-halfBox} ${-halfBox} ${halfBox * 2} ${halfBox * 2}`}
      aria-hidden="true"
      className={viewportCenter ? 'pointer-events-none select-none overflow-visible' : 'overflow-visible'}
      style={{ opacity: config.opacity }}
    >
      {config.shape === 'circle' && (
        <>
          {strokeOutline > 0 && (
            <circle
              cx={0}
              cy={0}
              r={Math.max(4, effectiveGap + config.size * 0.6)}
              fill="none"
              stroke="#000000"
              strokeWidth={config.thickness + strokeOutline}
            />
          )}
          <circle
            cx={0}
            cy={0}
            r={Math.max(4, effectiveGap + config.size * 0.6)}
            fill="none"
            stroke={config.color}
            strokeWidth={config.thickness}
          />
          <circle cx={0} cy={0} r={Math.max(1.2, config.thickness * 0.7)} fill={config.color} />
        </>
      )}

      {config.shape === 'dot' && (
        <>
          {strokeOutline > 0 && (
            <circle
              cx={0}
              cy={0}
              r={Math.max(1.8, config.thickness + config.size * 0.16) + config.outline}
              fill="#000000"
            />
          )}
          <circle
            cx={0}
            cy={0}
            r={Math.max(1.8, config.thickness + config.size * 0.16)}
            fill={config.color}
          />
        </>
      )}

      {(config.shape === 'classic' || config.shape === 't_shape') && (
        <>
          {/* Outline pass */}
          {strokeOutline > 0 && (
            <g stroke="#000000" strokeWidth={config.thickness + strokeOutline} strokeLinecap="butt">
              {config.shape === 'classic' && (
                <line x1={0} y1={-(effectiveGap + config.size)} x2={0} y2={-effectiveGap} />
              )}
              <line x1={0} y1={effectiveGap} x2={0} y2={effectiveGap + config.size} />
              <line x1={-(effectiveGap + config.size)} y1={0} x2={-effectiveGap} y2={0} />
              <line x1={effectiveGap} y1={0} x2={effectiveGap + config.size} y2={0} />
            </g>
          )}
          {/* Foreground pass */}
          <g stroke={config.color} strokeWidth={config.thickness} strokeLinecap="butt">
            {config.shape === 'classic' && (
              <line x1={0} y1={-(effectiveGap + config.size)} x2={0} y2={-effectiveGap} />
            )}
            <line x1={0} y1={effectiveGap} x2={0} y2={effectiveGap + config.size} />
            <line x1={-(effectiveGap + config.size)} y1={0} x2={-effectiveGap} y2={0} />
            <line x1={effectiveGap} y1={0} x2={effectiveGap + config.size} y2={0} />
          </g>
        </>
      )}
    </svg>
  );
}

export function CrosshairCustomizer({ config, onChange, onClose }: CrosshairCustomizerProps) {
  const update = (patch: Partial<CrosshairConfig>) => {
    onChange({ ...config, ...patch });
  };

  return (
    <div className="space-y-3 text-slate-100">
      {/* Live Preview Box */}
      <div className="relative h-32 rounded border border-white/15 overflow-hidden flex items-center justify-center bg-[#2b3440]">
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              'linear-gradient(135deg, #d7be95 0%, #c6a574 52%, #475569 52%, #1e293b 100%)',
          }}
        />
        <div className="relative z-10 flex items-center justify-center">
          <CrosshairPreviewSvg config={config} spreadPx={config.dynamic ? 4 : 0} />
        </div>
        <span className="absolute bottom-1.5 right-2 text-[10px] font-tactical-mono uppercase text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
          Live Preview
        </span>
      </div>

      {/* Shape Selector */}
      <div>
        <span className="block text-xs font-medium text-slate-300 mb-1">Reticle Shape</span>
        <div className="grid grid-cols-4 gap-1 bg-[#0b0e14] p-1 rounded border border-white/15">
          {(
            [
              { id: 'classic', label: 'Classic' },
              { id: 't_shape', label: 'T-Shape' },
              { id: 'circle', label: 'Circle' },
              { id: 'dot', label: 'Dot Only' },
            ] as Array<{ id: CrosshairShape; label: string }>
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ shape: s.id })}
              className={`py-1.5 text-[11px] font-semibold rounded transition-colors ${
                config.shape === s.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <div>
          <div className="flex justify-between text-[11px] mb-0.5">
            <label htmlFor="ch-size" className="text-slate-300">Size</label>
            <span className="font-tactical-mono text-amber-300">{config.size}px</span>
          </div>
          <input
            id="ch-size"
            type="range"
            min={2}
            max={24}
            value={config.size}
            onChange={(e) => update({ size: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[11px] mb-0.5">
            <label htmlFor="ch-thick" className="text-slate-300">Thickness</label>
            <span className="font-tactical-mono text-amber-300">{config.thickness}px</span>
          </div>
          <input
            id="ch-thick"
            type="range"
            min={1}
            max={6}
            value={config.thickness}
            onChange={(e) => update({ thickness: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[11px] mb-0.5">
            <label htmlFor="ch-gap" className="text-slate-300">Center Gap</label>
            <span className="font-tactical-mono text-amber-300">{config.gap}px</span>
          </div>
          <input
            id="ch-gap"
            type="range"
            min={0}
            max={18}
            value={config.gap}
            onChange={(e) => update({ gap: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-[11px] mb-0.5">
            <label htmlFor="ch-outline" className="text-slate-300">Outline</label>
            <span className="font-tactical-mono text-amber-300">{config.outline}px</span>
          </div>
          <input
            id="ch-outline"
            type="range"
            min={0}
            max={3}
            value={config.outline}
            onChange={(e) => update({ outline: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>

        <div className="col-span-2">
          <div className="flex justify-between text-[11px] mb-0.5">
            <label htmlFor="ch-opacity" className="text-slate-300">Opacity</label>
            <span className="font-tactical-mono text-amber-300">{Math.round(config.opacity * 100)}%</span>
          </div>
          <input
            id="ch-opacity"
            type="range"
            min={0.2}
            max={1.0}
            step={0.05}
            value={config.opacity}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Color Swatches + Custom Hex */}
      <div>
        <span className="block text-xs font-medium text-slate-300 mb-1.5">Reticle Color</span>
        <div className="flex flex-wrap items-center gap-2">
          {CROSSHAIR_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              type="button"
              aria-label={`Color ${preset.label}`}
              onClick={() => update({ color: preset.hex })}
              className={`w-7 h-7 rounded border-2 transition-transform ${
                config.color.toLowerCase() === preset.hex.toLowerCase()
                  ? 'border-white scale-110'
                  : 'border-white/20 hover:scale-105'
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          ))}
          <label className="flex items-center gap-1.5 ml-auto text-[11px] text-slate-300">
            <span>Custom</span>
            <input
              type="color"
              aria-label="Custom crosshair hex color"
              value={config.color}
              onChange={(e) => update({ color: e.target.value })}
              className="w-8 h-7 rounded bg-transparent border border-white/20 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Dynamic Spread Toggle + Reset */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => update({ dynamic: !config.dynamic })}
          className={`px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
            config.dynamic
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
              : 'bg-[#0b0e14] text-slate-300 border-white/15'
          }`}
        >
          {config.dynamic ? 'Spread: Dynamic' : 'Spread: Static'}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_CROSSHAIR })}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15"
          >
            Reset Default
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
