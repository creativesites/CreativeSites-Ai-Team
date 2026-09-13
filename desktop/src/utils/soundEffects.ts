/**
 * MyaOS Sound Effects & Notification Utility
 * 
 * Uses Web Audio API to synthesize executive-grade audio cues directly in browser/WebKit
 * with ZERO external audio file dependencies. Guaranteed to work offline, with zero latency.
 */

// Singleton AudioContext with lazy initialization on first user interaction
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn('Web Audio API not supported:', e);
    return null;
  }
}

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('myaos_sound_muted') === 'true';
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('myaos_sound_muted', muted ? 'true' : 'false');
}

export function toggleSoundMuted(): boolean {
  const current = isSoundMuted();
  setSoundMuted(!current);
  return !current;
}

/**
 * Clean executive twin-tone harmonic chime (C5 -> A5)
 * Used when an agent finishes an execution turn.
 */
export function playExecutiveChime(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Tone 1: 523.25 Hz (C5)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, now);
  gain1.gain.setValueAtTime(0.18, now);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.55);

  // Tone 2: 880 Hz (A5) - delayed by 110ms
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880.0, now + 0.11);
  gain2.gain.setValueAtTime(0.0001, now);
  gain2.gain.setValueAtTime(0.22, now + 0.11);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.11);
  osc2.stop(now + 0.85);
}

/**
 * Tri-tone verification fanfare (C5 -> E5 -> G5)
 * Used when independent verification passes.
 */
export function playSuccessChime(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, time: 0.0, duration: 0.4 },  // C5
    { freq: 659.25, time: 0.1, duration: 0.4 },  // E5
    { freq: 783.99, time: 0.22, duration: 0.65 }, // G5
  ];

  notes.forEach(({ freq, time, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.setValueAtTime(0.16, now + time);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + time);
    osc.stop(now + time + duration);
  });
}

/**
 * Attention Alert Ping
 * Used when human sign-off or decision is required.
 */
export function playAttentionAlert(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

/**
 * Native macOS Desktop Notification
 */
export async function sendDesktopNotification(
  title: string,
  body?: string,
  icon: string = '/app-icon.png'
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body || 'MyaOS Autonomous Agent Fleet update',
        icon,
        silent: false,
      });
    }
  } catch (e) {
    console.warn('Failed to send desktop notification:', e);
  }
}
