/**
 * Web Audio API synthesizer for responsive, latency-free camera sound effects.
 * Bypasses network requests and ensures instant playback.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (err) {
    console.warn('Web Audio API is not supported in this environment', err);
    return null;
  }
}

/**
 * Play a high-pitched digital beep sound for countdown steps.
 */
export function playCountdownBeep(freq = 880, duration = 0.08) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Fade out smoothly to avoid audio pops
    gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.warn('Playback of countdown beep failed', err);
  }
}

/**
 * Play a custom synthesized camera shutter sound mimicking a mechanical click.
 */
export function playShutterSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Phase 1: High frequency click (transient click)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1500, now);
    clickOsc.frequency.exponentialRampToValueAtTime(150, now + 0.04);
    
    clickGain.gain.setValueAtTime(0.15, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    
    clickOsc.start(now);
    clickOsc.stop(now + 0.04);

    // Phase 2: Bandpass white noise burst for mechanical curtain effect
    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * 0.12; // 120ms burst
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2.0 - 1.0;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(3.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.12);
  } catch (err) {
    console.warn('Playback of shutter sound failed', err);
  }
}
