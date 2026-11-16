import type { CrosshairConfig, CrosshairShape } from './types';

export const CROSSHAIR_STORAGE_KEY = 'sandline_crosshair_v1';

export const CROSSHAIR_COLOR_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'Green', hex: '#4ade80' },
  { label: 'Cyan', hex: '#22d3ee' },
  { label: 'Yellow', hex: '#facc15' },
  { label: 'White', hex: '#f8fafc' },
  { label: 'Red', hex: '#f87171' },
  { label: 'Magenta', hex: '#e879f9' },
];

export const DEFAULT_CROSSHAIR: CrosshairConfig = {
  shape: 'classic',
  size: 9,
  thickness: 2,
  gap: 3,
  outline: 1,
  opacity: 0.95,
  color: '#4ade80',
  dynamic: true,
};

const VALID_SHAPES = new Set<CrosshairShape>(['classic', 't_shape', 'circle', 'dot']);

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return fallback;
}

export function sanitizeCrosshairConfig(input: unknown): CrosshairConfig {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_CROSSHAIR };
  }
  const obj = input as Record<string, unknown>;
  const shape = VALID_SHAPES.has(obj.shape as CrosshairShape)
    ? (obj.shape as CrosshairShape)
    : DEFAULT_CROSSHAIR.shape;

  return {
    shape,
    size: Math.round(clampNum(obj.size, 2, 24, DEFAULT_CROSSHAIR.size)),
    thickness: Math.round(clampNum(obj.thickness, 1, 6, DEFAULT_CROSSHAIR.thickness)),
    gap: Math.round(clampNum(obj.gap, 0, 18, DEFAULT_CROSSHAIR.gap)),
    outline: Math.round(clampNum(obj.outline, 0, 3, DEFAULT_CROSSHAIR.outline)),
    opacity: Math.round(clampNum(obj.opacity, 0.2, 1.0, DEFAULT_CROSSHAIR.opacity) * 20) / 20,
    color: sanitizeHexColor(obj.color, DEFAULT_CROSSHAIR.color),
    dynamic: typeof obj.dynamic === 'boolean' ? obj.dynamic : DEFAULT_CROSSHAIR.dynamic,
  };
}

export function parseCrosshairJson(raw: string | null | undefined): CrosshairConfig {
  if (!raw || typeof raw !== 'string') return { ...DEFAULT_CROSSHAIR };
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeCrosshairConfig(parsed);
  } catch {
    return { ...DEFAULT_CROSSHAIR };
  }
}

export function loadCrosshairConfig(): CrosshairConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CROSSHAIR };
  try {
    return parseCrosshairJson(window.localStorage.getItem(CROSSHAIR_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_CROSSHAIR };
  }
}

export function saveCrosshairConfig(config: CrosshairConfig): CrosshairConfig {
  const sanitized = sanitizeCrosshairConfig(config);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CROSSHAIR_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // ignore storage quota errors
    }
  }
  return sanitized;
}
