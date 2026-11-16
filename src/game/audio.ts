import type { WeaponId } from './types';

export type FootstepSurface = 'stone' | 'wood' | 'metal';

export type VoicelineEvent =
  | 'round_start'
  | 'bomb_planted'
  | 'bomb_defused'
  | 'round_end_attackers'
  | 'round_end_defenders'
  | 'match_end_attackers'
  | 'match_end_defenders';

const VOICELINE_FALLBACK_TEXT: Record<VoicelineEvent, string> = {
  round_start: 'Round start. Lock and load, move out.',
  bomb_planted: 'Warning. The bomb has been planted.',
  bomb_defused: 'The bomb has been defused.',
  round_end_attackers: 'Attackers win the round.',
  round_end_defenders: 'Defenders win the round.',
  match_end_attackers: 'Match complete. Attackers are victorious.',
  match_end_defenders: 'Match complete. Defenders are victorious.',
};

class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  private listenerX = 0;
  private listenerY = 1.6;
  private listenerZ = 0;
  private listenerYaw = 0;

  private voicelineBuffers = new Map<VoicelineEvent, AudioBuffer>();
  private voicelineFetches = new Map<VoicelineEvent, Promise<AudioBuffer | null>>();
  private ttsBackendAvailable: boolean | null = null;
  private voicelineQueue: VoicelineEvent[] = [];
  private playingVoiceline = false;
  private activeVoicelineSource: AudioBufferSourceNode | null = null;
  private preloaded = false;

  public setListenerPose(x: number, y: number, z: number, yaw: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.listenerZ = z;
    this.listenerYaw = yaw;
  }

  private getSpatialAttenAndPan(
    worldPos?: { x: number; y: number; z: number },
    rolloff = 0.055
  ): { atten: number; pan: number } {
    if (!worldPos) return { atten: 1, pan: 0 };
    const dx = worldPos.x - this.listenerX;
    const dy = worldPos.y - this.listenerY;
    const dz = worldPos.z - this.listenerZ;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.35) return { atten: 1, pan: 0 };
    const atten = Math.max(0.04, 1 / (1 + dist * rolloff));
    // Camera right vector: (-cos(yaw), sin(yaw))? Wait: look = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
    const rightX = Math.cos(this.listenerYaw);
    const rightZ = -Math.sin(this.listenerYaw);
    const pan = Math.max(-0.95, Math.min(0.95, (dx * rightX + dz * rightZ) / dist));
    return { atten, pan };
  }

  private connectDestination(
    ctx: AudioContext,
    node: AudioNode,
    pan = 0
  ): void {
    if (typeof ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.02) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner).connect(ctx.destination);
    } else {
      node.connect(ctx.destination);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 1.5;
      const buf = this.ctx.createBuffer(1, length, sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.voicelineQueue = [];
      try {
        this.activeVoicelineSource?.stop();
      } catch {
        // ignore already stopped
      }
      this.activeVoicelineSource = null;
      this.playingVoiceline = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }

  private playRadioSquelch(open = true): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(open ? 1240 : 920, now);
    osc.frequency.exponentialRampToValueAtTime(open ? 1680 : 640, now + 0.045);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  private async fetchVoicelineBuffer(event: VoicelineEvent): Promise<AudioBuffer | null> {
    if (this.muted || typeof window === 'undefined') return null;
    const cached = this.voicelineBuffers.get(event);
    if (cached) return cached;
    if (this.ttsBackendAvailable === false) return null;

    const inflight = this.voicelineFetches.get(event);
    if (inflight) return inflight;

    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(`/api/voiceline?event=${encodeURIComponent(event)}`);
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('audio/')) {
          if (contentType.includes('application/json')) {
            const payload = (await res.json()) as { available?: boolean };
            if (payload.available === false) {
              this.ttsBackendAvailable = false;
            }
          }
          return null;
        }
        const arrayBuf = await res.arrayBuffer();
        const ctx = this.ensureContext();
        if (!ctx) return null;
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        this.ttsBackendAvailable = true;
        this.voicelineBuffers.set(event, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.voicelineFetches.delete(event);
      }
    })();

    this.voicelineFetches.set(event, task);
    return task;
  }

  public preloadVoicelines(): void {
    if (this.preloaded || this.muted || typeof window === 'undefined') return;
    this.preloaded = true;
    const events: VoicelineEvent[] = [
      'round_start',
      'bomb_planted',
      'bomb_defused',
      'round_end_attackers',
      'round_end_defenders',
    ];
    void (async () => {
      const first = await this.fetchVoicelineBuffer(events[0]);
      if (!first) return;
      for (let i = 1; i < events.length; i++) {
        if (this.muted || this.ttsBackendAvailable === false) break;
        await this.fetchVoicelineBuffer(events[i]);
      }
    })();
  }

  public playVoiceline(event: VoicelineEvent): void {
    if (this.muted || typeof window === 'undefined') return;
    if (this.voicelineQueue[this.voicelineQueue.length - 1] === event) return;
    this.voicelineQueue.push(event);
    if (!this.playingVoiceline) {
      void this.drainVoicelineQueue();
    }
  }

  private async drainVoicelineQueue(): Promise<void> {
    if (this.playingVoiceline) return;
    this.playingVoiceline = true;

    try {
      while (this.voicelineQueue.length > 0 && !this.muted) {
        const event = this.voicelineQueue.shift()!;
        const audioBuf = await this.fetchVoicelineBuffer(event);
        if (this.muted) break;

        if (audioBuf) {
          await this.playAudioBufferWithRadioFilter(audioBuf);
        } else {
          await this.playSpeechFallback(VOICELINE_FALLBACK_TEXT[event]);
        }
      }
    } finally {
      this.playingVoiceline = false;
    }
  }

  private playAudioBufferWithRadioFilter(buffer: AudioBuffer): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.playRadioSquelch(true);

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 260;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 4400;

      const gain = ctx.createGain();
      gain.gain.value = 0.85;

      src.connect(highpass).connect(lowpass).connect(gain).connect(ctx.destination);
      this.activeVoicelineSource = src;

      const done = () => {
        if (this.activeVoicelineSource === src) {
          this.activeVoicelineSource = null;
        }
        this.playRadioSquelch(false);
        resolve();
      };

      src.onended = done;
      try {
        src.start(ctx.currentTime + 0.04);
      } catch {
        done();
      }
    });
  }

  private playSpeechFallback(text: string): Promise<void> {
    if (this.muted || typeof window === 'undefined') return Promise.resolve();
    this.playRadioSquelch(true);

    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.playRadioSquelch(false);
        resolve();
      };

      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.05;
        utter.pitch = 0.85;
        utter.volume = 0.85;
        utter.onend = finish;
        utter.onerror = finish;
        window.speechSynthesis.speak(utter);
        window.setTimeout(finish, 3400);
      } catch {
        finish();
      }
    });
  }

  public playGunshot(
    weaponId: WeaponId,
    silenced = false,
    distanceMeters = 0,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const spatial = worldPos
      ? this.getSpatialAttenAndPan(worldPos, 0.045)
      : { atten: Math.max(0.05, 1 / (1 + distanceMeters * 0.045)), pan: 0 };
    const atten = spatial.atten;
    const now = ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (silenced && (weaponId === 'usps' || weaponId === 'm4a1s')) {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 * pitchJitter, now);
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(0.24 * atten, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      src.connect(filter).connect(gain);
      this.connectDestination(ctx, gain, spatial.pan);
      src.start(now);
      src.stop(now + 0.08);
      return;
    }

    if (weaponId === 'awp') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400 * pitchJitter, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + 0.34);
      gain.gain.setValueAtTime(0.55 * atten, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      src.connect(filter).connect(gain);
      this.connectDestination(ctx, gain, spatial.pan);
      src.start(now);
      src.stop(now + 0.4);

      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160 * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.25);
      og.gain.setValueAtTime(0.45 * atten, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(og);
      this.connectDestination(ctx, og, spatial.pan);
      osc.start(now);
      osc.stop(now + 0.28);
      return;
    }

    const isHeavy = weaponId === 'ak47' || weaponId === 'deagle';
    const isSmg = weaponId === 'mac10' || weaponId === 'mp7';

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime((isHeavy ? 2600 : isSmg ? 3200 : 2800) * pitchJitter, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + (isHeavy ? 0.16 : 0.11));

    gain.gain.setValueAtTime((isHeavy ? 0.44 : 0.34) * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.18 : 0.12));

    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 0.2);

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((isHeavy ? 185 : 230) * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.08);
    og.gain.setValueAtTime((isHeavy ? 0.32 : 0.2) * atten, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(og);
    this.connectDestination(ctx, og, spatial.pan);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playKnifeSlash(heavy = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 900 : 1400, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.14);
    filter.Q.value = 2.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.16);
  }

  public playReload(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.28, 0.72].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 1 ? 520 : 880, now + offset);
      osc.frequency.exponentialRampToValueAtTime(220, now + offset + 0.035);
      gain.gain.setValueAtTime(0.08, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.045);
    });
  }

  public playBoltAction(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clicks: Array<[number, number, number]> = [
      [0, 1280, 520],
      [0.14, 960, 410],
      [0.42, 1140, 480],
    ];
    for (const [offset, fStart, fEnd] of clicks) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(fStart, now + offset);
      osc.frequency.exponentialRampToValueAtTime(fEnd, now + offset + 0.035);
      gain.gain.setValueAtTime(0.09, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.045);
    }
  }

  public playHeadshotDink(distanceMeters = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const atten = Math.max(0.15, 1 / (1 + distanceMeters * 0.03));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1950, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);
    gain.gain.setValueAtTime(0.28 * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playKillConfirm(headshot = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = headshot ? [980, 1480] : [740, 1100];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      gain.gain.setValueAtTime(0.11, now + i * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.13);
    });
  }

  public playFootstep(
    surface: FootstepSurface = 'stone',
    speedRatio = 1,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = this.getSpatialAttenAndPan(worldPos, 0.085);
    const volScale = Math.max(0.55, Math.min(1.45, speedRatio)) * spatial.atten;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';

    if (surface === 'metal') {
      filter.frequency.value = 1120 + Math.random() * 240;
      filter.Q.value = 4.2;
      const clang = ctx.createOscillator();
      const cg = ctx.createGain();
      clang.type = 'triangle';
      clang.frequency.setValueAtTime(760 + Math.random() * 90, now);
      clang.frequency.exponentialRampToValueAtTime(340, now + 0.075);
      cg.gain.setValueAtTime(0.045 * volScale, now);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      clang.connect(cg);
      this.connectDestination(ctx, cg, spatial.pan);
      clang.start(now);
      clang.stop(now + 0.085);
    } else if (surface === 'wood') {
      filter.frequency.value = 380 + Math.random() * 90;
      filter.Q.value = 2.4;
      const thump = ctx.createOscillator();
      const tg = ctx.createGain();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(165 + Math.random() * 30, now);
      thump.frequency.exponentialRampToValueAtTime(68, now + 0.065);
      tg.gain.setValueAtTime(0.06 * volScale, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      thump.connect(tg);
      this.connectDestination(ctx, tg, spatial.pan);
      thump.start(now);
      thump.stop(now + 0.075);
    } else {
      // stone / sandstone / concrete grit
      filter.frequency.value = 620 + Math.random() * 180;
      filter.Q.value = 1.5;
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.072 * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 0.075);
  }

  public playJump(worldPos?: { x: number; y: number; z: number }): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = this.getSpatialAttenAndPan(worldPos, 0.08);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(980, now + 0.09);
    filter.Q.value = 1.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.085 * spatial.atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 0.11);
  }

  public playLanding(
    fallSpeed: number,
    surface: FootstepSurface = 'stone',
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = this.getSpatialAttenAndPan(worldPos, 0.07);
    const intensity = Math.max(0.35, Math.min(1.6, Math.abs(fallSpeed) / 9));

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(surface === 'metal' ? 190 : surface === 'wood' ? 145 : 115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    og.gain.setValueAtTime(0.14 * intensity * spatial.atten, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(og);
    this.connectDestination(ctx, og, spatial.pan);
    osc.start(now);
    osc.stop(now + 0.125);

    this.playFootstep(surface, intensity, worldPos);
  }

  public playWallImpact(
    material: FootstepSurface,
    worldPos: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = this.getSpatialAttenAndPan(worldPos, 0.06);
    if (spatial.atten <= 0.045) return;

    if (material === 'metal') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1650 + Math.random() * 550, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);
      gain.gain.setValueAtTime(0.11 * spatial.atten, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      this.connectDestination(ctx, gain, spatial.pan);
      osc.start(now);
      osc.stop(now + 0.1);
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = material === 'wood' ? 460 + Math.random() * 140 : 1220 + Math.random() * 280;
    filter.Q.value = material === 'wood' ? 2.2 : 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.095 * spatial.atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 0.06);
  }

  public playGrenadeBounce(
    distanceMeters = 0,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const spatial = worldPos
      ? this.getSpatialAttenAndPan(worldPos, 0.06)
      : { atten: Math.max(0.08, 1 / (1 + distanceMeters * 0.06)), pan: 0 };
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980 + Math.random() * 180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.14 * spatial.atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playExplosion(
    distanceMeters = 0,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = worldPos
      ? this.getSpatialAttenAndPan(worldPos, 0.04)
      : { atten: Math.max(0.1, 1 / (1 + distanceMeters * 0.04)), pan: 0 };

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.65);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.62 * spatial.atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 0.72);
  }

  public playC4Detonation(
    distanceMeters = 0,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = worldPos
      ? this.getSpatialAttenAndPan(worldPos, 0.025)
      : { atten: Math.max(0.18, 1 / (1 + distanceMeters * 0.025)), pan: 0 };
    const atten = Math.max(0.22, spatial.atten);

    // Massive sub-bass shockwave boom
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(92, now);
    subOsc.frequency.exponentialRampToValueAtTime(24, now + 1.25);
    subGain.gain.setValueAtTime(0.75 * atten, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
    subOsc.connect(subGain);
    this.connectDestination(ctx, subGain, spatial.pan * 0.5);
    subOsc.start(now);
    subOsc.stop(now + 1.5);

    // Long filtered debris blast rumble
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(65, now + 1.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.72 * atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 1.48);
  }

  public playFlashbangRing(intensity: number): void {
    const ctx = this.ensureContext();
    if (!ctx || intensity <= 0.1) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3450, now);
    gain.gain.setValueAtTime(0.18 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2 * intensity);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 2.25 * intensity);
  }

  public playSmokeHiss(
    distanceMeters = 0,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const spatial = worldPos
      ? this.getSpatialAttenAndPan(worldPos, 0.05)
      : { atten: Math.max(0.1, 1 / (1 + distanceMeters * 0.05)), pan: 0 };
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 * spatial.atten, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    src.connect(filter).connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    src.start(now);
    src.stop(now + 0.56);
  }

  public playBombBeep(
    urgent = false,
    worldPos?: { x: number; y: number; z: number }
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const spatial = worldPos
      ? this.getSpatialAttenAndPan(worldPos, 0.035)
      : { atten: 1, pan: 0 };
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(urgent ? 2250 : 1850, now);
    gain.gain.setValueAtTime(0.08 * Math.max(0.25, spatial.atten), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain);
    this.connectDestination(ctx, gain, spatial.pan);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playUiTick(pitch = 680): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playRoundCue(won: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = won ? [440, 554.37, 659.25] : [349.23, 311.13, 261.63];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.11, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.26);
    });
  }
}

export const soundEngine = new TacticalAudioEngine();
