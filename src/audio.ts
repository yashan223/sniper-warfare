// ============================================================
// AUDIO SYSTEM — Procedural sounds via Web Audio API
// ============================================================

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private heartbeatInterval: number | null = null;
  private fireBuffer: AudioBuffer | null = null;

  init(): void {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.6;
    this.masterGain.connect(this.ctx.destination);

    // Preload custom gun fire sound asynchronously
    this.loadSound('/gun-sound/fire.mp3').then(buffer => {
      this.fireBuffer = buffer;
      console.log('fire.mp3 loaded and decoded successfully');
    }).catch(err => {
      console.warn('Failed to load/decode fire.mp3, falling back to procedural sounds:', err);
    });
  }

  private async loadSound(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      return await this.ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.error(`Error loading sound from ${url}:`, err);
      return null;
    }
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) this.init();
    return this.ctx!;
  }

  private get gain(): GainNode {
    return this.masterGain!;
  }

  // --- Sniper Shot: sharp transient + low boom with reverb & compression ---
  playSniper(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // ── Shared output chain: Compressor → Master Gain ─────────────────
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.0003;
    compressor.release.value = 0.25;
    compressor.connect(this.gain);

    if (this.fireBuffer) {
      // ── File-based path ───────────────────────────────────────────────
      const source = ctx.createBufferSource();
      source.buffer = this.fireBuffer;

      // High-pass to clean up mud below 80 Hz
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 80;

      // Peaking EQ: boost crack at 3 kHz for presence
      const crack = ctx.createBiquadFilter();
      crack.type = 'peaking';
      crack.frequency.value = 3000;
      crack.gain.value = 6;
      crack.Q.value = 1.2;

      // Dry gain
      const dryGain = ctx.createGain();
      dryGain.gain.value = 1.1;

      source.connect(hp).connect(crack).connect(dryGain).connect(compressor);
      source.start(now);

      // Short convolver reverb tail (synthetic IR)
      this.createReverb(ctx, compressor, now, 0.6, 0.35);
      source.connect(this.createReverbSend(ctx, compressor, 0.6, 0.35));

      return;
    }

    // ── Procedural path ────────────────────────────────────────────────

    // 1. Muzzle blast — sharp broadband noise burst with peaking EQ
    const blastLen = 0.06;
    const blastBuf = ctx.createBuffer(1, ctx.sampleRate * blastLen, ctx.sampleRate);
    const blastData = blastBuf.getChannelData(0);
    for (let i = 0; i < blastData.length; i++) {
      blastData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / blastData.length, 2.5);
    }
    const blast = ctx.createBufferSource();
    blast.buffer = blastBuf;

    const blastHP = ctx.createBiquadFilter();
    blastHP.type = 'highpass';
    blastHP.frequency.value = 200;

    const blastPeak = ctx.createBiquadFilter();
    blastPeak.type = 'peaking';
    blastPeak.frequency.value = 2800;
    blastPeak.gain.value = 8;
    blastPeak.Q.value = 0.9;

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(1.4, now);
    blastGain.gain.exponentialRampToValueAtTime(0.01, now + blastLen);

    blast.connect(blastHP).connect(blastPeak).connect(blastGain).connect(compressor);
    blast.start(now);
    blast.stop(now + blastLen + 0.01);

    // 2. Sub-bass thump (body of the shot)
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(28, now + 0.28);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(1.0, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    thump.connect(thumpGain).connect(compressor);
    thump.start(now);
    thump.stop(now + 0.35);

    // 3. Mid crack — bandpass filtered noise
    const crackLen = 0.04;
    const crackBuf = ctx.createBuffer(1, ctx.sampleRate * crackLen, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackData.length; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / crackData.length, 4);
    }
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackFilt = ctx.createBiquadFilter();
    crackFilt.type = 'bandpass';
    crackFilt.frequency.value = 4500;
    crackFilt.Q.value = 1.2;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.9, now);
    crackGain.gain.exponentialRampToValueAtTime(0.01, now + crackLen);
    crackSrc.connect(crackFilt).connect(crackGain).connect(compressor);
    crackSrc.start(now);
    crackSrc.stop(now + crackLen + 0.01);

    // 4. Echo tail #1 — close wall reflection (50ms)
    this.scheduleEcho(ctx, compressor, now + 0.05, 600, 0.55, 0.3);

    // 5. Echo tail #2 — distant reverb (120ms, quieter)
    this.scheduleEcho(ctx, compressor, now + 0.12, 350, 0.8, 0.18);
  }

  /** Schedules a low-pass filtered noise burst echo at a given time */
  private scheduleEcho(
    ctx: AudioContext, dest: AudioNode,
    startTime: number, lpFreq: number, dur: number, vol: number
  ): void {
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4) * 0.4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lpFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    src.connect(filt).connect(g).connect(dest);
    src.start(startTime);
    src.stop(startTime + dur + 0.01);
  }

  /** Creates a synthetic convolver reverb send and returns the send gain node */
  private createReverbSend(
    ctx: AudioContext, dest: AudioNode, irDuration: number, wetGain: number
  ): GainNode {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * irDuration);
    const ir = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < length; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = ir;
    const send = ctx.createGain();
    send.gain.value = wetGain;
    send.connect(convolver).connect(dest);
    return send;
  }

  /** Unused — kept for compatibility */
  private createReverb(_ctx: AudioContext, _dest: AudioNode, _now: number, _dur: number, _wet: number): void {}

  // --- Bolt action: metallic click sequence ---
  playBoltAction(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const clicks = [
      { time: 0.15, freq: 4000, dur: 0.03 },
      { time: 0.3, freq: 3000, dur: 0.04 },
      { time: 0.55, freq: 3500, dur: 0.03 },
      { time: 0.7, freq: 4500, dur: 0.02 },
    ];

    clicks.forEach(({ time, freq, dur }) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = freq;
      filt.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, now + time);
      g.gain.exponentialRampToValueAtTime(0.01, now + time + dur);
      src.connect(filt).connect(g).connect(this.gain);
      src.start(now + time);
      src.stop(now + time + dur + 0.01);
    });
  }

  // --- Footstep: filtered noise burst ---
  playFootstep(speed: number = 1): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const dur = 0.06;

    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 600 + speed * 200;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15 * Math.min(speed, 1.5), now);
    g.gain.exponentialRampToValueAtTime(0.01, now + dur);

    src.connect(filt).connect(g).connect(this.gain);
    src.start(now);
    src.stop(now + dur + 0.01);
  }

  // --- Hit marker: classic short ding ---
  playHitMarker(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1800;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(g).connect(this.gain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // --- Kill confirm: double ding ---
  playKillConfirm(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    [0, 0.07].forEach((offset) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = offset === 0 ? 1800 : 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, now + offset);
      g.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.1);
      osc.connect(g).connect(this.gain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.12);
    });
  }

  // --- Bullet impact: thud ---
  playImpact(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const dur = 0.05;

    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + dur);
    src.connect(filt).connect(g).connect(this.gain);
    src.start(now);
    src.stop(now + dur + 0.01);
  }

  // --- Reload: series of clicks + magazine snap ---
  playReload(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    // Mag out
    this.playClickAt(now + 0.2, 2000, 0.05, 0.2);
    // Fumble
    this.playClickAt(now + 0.8, 1500, 0.03, 0.1);
    // Mag in
    this.playClickAt(now + 1.8, 3000, 0.06, 0.3);
    // Chamber
    this.playClickAt(now + 2.4, 4000, 0.04, 0.25);
  }

  private playClickAt(time: number, freq: number, dur: number, vol: number): void {
    const ctx = this.ensureCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + dur);
    src.connect(filt).connect(g).connect(this.gain);
    src.start(time);
    src.stop(time + dur + 0.01);
  }

  // --- Ambient wind loop ---
  startAmbient(): void {
    const ctx = this.ensureCtx();

    const bufLen = 2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.03;
    }

    this.ambientSource = ctx.createBufferSource();
    this.ambientSource.buffer = buf;
    this.ambientSource.loop = true;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 300;

    const g = ctx.createGain();
    g.gain.value = 0.15;

    this.ambientSource.connect(filt).connect(g).connect(this.gain);
    this.ambientSource.start();
  }

  // --- Heartbeat for low health ---
  startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = window.setInterval(() => {
      const ctx = this.ensureCtx();
      const now = ctx.currentTime;
      [0, 0.15].forEach((offset) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 50;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.2, now + offset);
        g.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.1);
        osc.connect(g).connect(this.gain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      });
    }, 800);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // --- Enemy gunshot (distant) ---
  playEnemyShot(distance: number = 30): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const vol = Math.max(0.05, 0.4 - distance * 0.005);

    const dur = 0.06;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1500;
    filt.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + dur);
    src.connect(filt).connect(g).connect(this.gain);
    src.start(now);
    src.stop(now + dur + 0.01);
  }

  // --- Player hit / damage ---
  playDamage(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 500;
    osc.connect(filt).connect(g).connect(this.gain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // --- Empty click ---
  playEmpty(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
    osc.connect(g).connect(this.gain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  destroy(): void {
    this.stopHeartbeat();
    this.ambientSource?.stop();
    this.ctx?.close();
  }
}
