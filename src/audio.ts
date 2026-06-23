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

  // --- Sniper Shot: sharp transient + low boom ---
  playSniper(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;

    if (this.fireBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = this.fireBuffer;
      source.connect(this.gain);
      source.start(now);
      return;
    }

    // Sharp transient (noise burst)
    const noiseLen = 0.08;
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 3);
    }
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = noiseBuffer;

    const noiseFilt = ctx.createBiquadFilter();
    noiseFilt.type = 'bandpass';
    noiseFilt.frequency.value = 3000;
    noiseFilt.Q.value = 0.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + noiseLen);

    noiseNode.connect(noiseFilt).connect(noiseGain).connect(this.gain);
    noiseNode.start(now);
    noiseNode.stop(now + noiseLen);

    // Low boom
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(oscGain).connect(this.gain);
    osc.start(now);
    osc.stop(now + 0.4);

    // Crack / echo tail
    const echoLen = 0.5;
    const echoBuffer = ctx.createBuffer(1, ctx.sampleRate * echoLen, ctx.sampleRate);
    const echoData = echoBuffer.getChannelData(0);
    for (let i = 0; i < echoData.length; i++) {
      echoData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / echoData.length, 5) * 0.3;
    }
    const echoNode = ctx.createBufferSource();
    echoNode.buffer = echoBuffer;
    const echoFilt = ctx.createBiquadFilter();
    echoFilt.type = 'lowpass';
    echoFilt.frequency.value = 800;
    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(0.4, now + 0.05);
    echoGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    echoNode.connect(echoFilt).connect(echoGain).connect(this.gain);
    echoNode.start(now + 0.05);
    echoNode.stop(now + 0.55);
  }

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
