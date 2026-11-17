/**
 * Tactile Web Audio API synthesizer tuned for kid-friendly marimba, woodblock,
 * paper-whoosh, and playful pop sound effects without external audio assets.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('wordpop_muted');
        this.muted = saved === 'true';
      } catch {
        this.muted = false;
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('wordpop_muted', String(muted));
      } catch {
        // Ignore storage errors
      }
    }
    if (!muted) {
      this.playTabClick();
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') {
      return null;
    }
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();

        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
        compressor.knee.setValueAtTime(18, this.ctx.currentTime);
        compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
        compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
        compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.65, this.ctx.currentTime);

        this.masterGain.connect(compressor);
        compressor.connect(this.ctx.destination);
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** Warm marimba-like note with subtle overtone */
  private playMarimbaNote(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration = 0.24,
    volume = 0.22
  ): void {
    if (!this.masterGain) return;

    const osc = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2, startTime);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.18, startTime);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    overtone.start(startTime);
    osc.stop(startTime + duration + 0.02);
    overtone.stop(startTime + duration + 0.02);
  }

  /** Crisp paper whoosh + soft cardstock flip */
  public playFlip(toBack: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    // 1. Filtered airy whoosh
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(1.8, now);
    filter.frequency.setValueAtTime(toBack ? 650 : 1200, now);
    filter.frequency.exponentialRampToValueAtTime(
      toBack ? 1850 : 750,
      now + 0.14
    );

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.16, now + 0.035);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.17);

    // 2. Soft pitched wood-snap accent
    this.playMarimbaNote(ctx, toBack ? 587.33 : 493.88, now + 0.03, 0.12, 0.14);
  }

  /** Swiping or stepping to next/previous card */
  public playSwipe(direction: 'next' | 'prev'): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    // Soft slide whoosh
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.12);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.14);

    if (direction === 'next') {
      this.playMarimbaNote(ctx, 523.25, now, 0.14, 0.14); // C5
      this.playMarimbaNote(ctx, 659.25, now + 0.045, 0.18, 0.16); // E5
    } else {
      this.playMarimbaNote(ctx, 659.25, now, 0.14, 0.14); // E5
      this.playMarimbaNote(ctx, 523.25, now + 0.045, 0.18, 0.16); // C5
    }
  }

  /** Playful rubbery pop/boing when poking the emoji */
  public playEmojiBoing(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.075);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.18);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  /** Crisp wooden block click for category tabs and mode switches */
  public playTabClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playMarimbaNote(ctx, 783.99, now, 0.09, 0.14); // G5
  }

  /** Joyful ascending sparkle arpeggio when starring a word or winning a quiz */
  public playStarSuccess(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      this.playMarimbaNote(ctx, freq, now + i * 0.055, 0.32, 0.18);
    });
  }

  /** Soft descending note when unstarring */
  public playUnstar(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playMarimbaNote(ctx, 587.33, now, 0.12, 0.12);
    this.playMarimbaNote(ctx, 440.0, now + 0.05, 0.16, 0.11);
  }

  /** Cascading cardstock riffle for deck shuffle */
  public playShuffle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [392, 440, 523.25, 587.33, 659.25, 783.99];
    freqs.forEach((f, idx) => {
      this.playMarimbaNote(ctx, f, now + idx * 0.036, 0.09, 0.12);
    });
  }

  /** Gentle low woodblock thud for incorrect quiz guess (friendly, non-harsh) */
  public playGentleOops(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playMarimbaNote(ctx, 246.94, now, 0.16, 0.16); // B3
    this.playMarimbaNote(ctx, 220.0, now + 0.07, 0.2, 0.14); // A3
  }

  /** Playful ascending pentatonic marimba note when tapping spelling letters */
  public playLetterNote(index: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
    const freq = scale[index % scale.length];
    this.playMarimbaNote(ctx, freq, ctx.currentTime, 0.18, 0.15);
  }

  /** Celebratory 5-note fanfare when mastering a full category or hitting a quiz streak */
  public playMilestoneFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 880.0, 1046.5];
    notes.forEach((freq, i) => {
      this.playMarimbaNote(
        ctx,
        freq,
        now + i * 0.065,
        i === notes.length - 1 ? 0.45 : 0.24,
        0.2
      );
    });
  }
}

export const soundEngine = new SoundEngine();
