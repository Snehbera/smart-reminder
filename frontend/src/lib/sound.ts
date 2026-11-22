/**
 * Sound notification engine for Smart Reminders
 * Uses Web Audio API for zero-latency, cross-platform synthesized chimes,
 * with fallback to notification.wav.
 */

export type SoundType = 'chime' | 'bell' | 'digital' | 'marimba' | 'urgent' | 'none';

export interface SoundOption {
  id: SoundType;
  label: string;
  description: string;
}

export const SOUND_OPTIONS: SoundOption[] = [
  { id: 'chime', label: 'Classic Chime', description: 'Smooth dual-tone acoustic chime' },
  { id: 'bell', label: 'Crystal Bell', description: 'Bright, resonant high bell' },
  { id: 'digital', label: 'Digital Pulse', description: 'Snappy electronic double alert' },
  { id: 'marimba', label: 'Warm Marimba', description: 'Soft wooden percussive melody' },
  { id: 'urgent', label: 'Urgent Wake', description: 'Three-stage wake-up alert' },
  { id: 'none', label: 'Muted (Silent)', description: 'Visual notifications only' },
];

const STORAGE_SOUND_KEY = 'sr_sound_name';
const STORAGE_ENABLED_KEY = 'sr_sound_enabled';
const STORAGE_VOLUME_KEY = 'sr_sound_volume';

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended' && unlocked) {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Prime and unlock the AudioContext on the first user interaction so subsequent
 * push notifications or background alerts can play audio without browser gesture blocks.
 */
export function initAudioUnlock() {
  if (typeof window === 'undefined' || unlocked) return;

  const unlock = () => {
    unlocked = true;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    // Remove listeners once unlocked
    window.removeEventListener('click', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('click', unlock, true);
  window.addEventListener('touchstart', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function getSoundPreference(): SoundType {
  if (typeof localStorage === 'undefined') return 'chime';
  const val = localStorage.getItem(STORAGE_SOUND_KEY);
  if (val && SOUND_OPTIONS.some((o) => o.id === val)) {
    return val as SoundType;
  }
  return 'chime';
}

export function setSoundPreference(sound: SoundType) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_SOUND_KEY, sound);
  }
}

export function isSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(STORAGE_ENABLED_KEY) !== 'false';
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_ENABLED_KEY, enabled ? 'true' : 'false');
  }
}

export function getSoundVolume(): number {
  if (typeof localStorage === 'undefined') return 0.8;
  const val = localStorage.getItem(STORAGE_VOLUME_KEY);
  if (val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 1) return num;
  }
  return 0.8;
}

export function setSoundVolume(volume: number) {
  if (typeof localStorage !== 'undefined') {
    const clamped = Math.max(0, Math.min(1, volume));
    localStorage.setItem(STORAGE_VOLUME_KEY, clamped.toString());
  }
}

/**
 * Synthesizes a tone with an envelope on the given AudioContext
 */
function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Play a specific sound using Web Audio API synthesis or fallback audio file
 */
export async function playNotificationSound(forcedSound?: SoundType, forcedVolume?: number): Promise<void> {
  const enabled = isSoundEnabled();
  if (!enabled && !forcedSound) return;

  const sound = forcedSound || getSoundPreference();
  if (sound === 'none') return;

  const volume = forcedVolume !== undefined ? forcedVolume : getSoundVolume();
  if (volume <= 0) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) {
      playFallbackAudio(volume);
      return;
    }

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const t = ctx.currentTime;
    const g = volume;

    switch (sound) {
      case 'bell': {
        // Bright crystal bell with 2 harmonics
        playTone(ctx, 783.99, t, 1.2, 0.45 * g, 'sine'); // G5
        playTone(ctx, 1567.98, t + 0.01, 0.8, 0.2 * g, 'triangle'); // G6
        playTone(ctx, 2351.97, t + 0.02, 0.4, 0.08 * g, 'sine'); // D7
        break;
      }

      case 'digital': {
        // Crisp two-step electronic ping
        playTone(ctx, 659.25, t, 0.12, 0.35 * g, 'square'); // E5
        playTone(ctx, 1318.51, t + 0.12, 0.25, 0.4 * g, 'sine'); // E6
        break;
      }

      case 'marimba': {
        // Warm wooden tone with fast attack
        playTone(ctx, 523.25, t, 0.4, 0.5 * g, 'triangle'); // C5
        playTone(ctx, 659.25, t + 0.09, 0.45, 0.45 * g, 'triangle'); // E5
        playTone(ctx, 1046.5, t + 0.18, 0.6, 0.4 * g, 'sine'); // C6
        break;
      }

      case 'urgent': {
        // Rising urgent 3-note alert
        playTone(ctx, 587.33, t, 0.12, 0.4 * g, 'sine'); // D5
        playTone(ctx, 739.99, t + 0.12, 0.12, 0.45 * g, 'sine'); // F#5
        playTone(ctx, 880.0, t + 0.24, 0.4, 0.5 * g, 'sine'); // A5
        playTone(ctx, 880.0, t + 0.45, 0.4, 0.5 * g, 'sine'); // Second A5 ping
        break;
      }

      case 'chime':
      default: {
        // Classic pleasant two-tone chime
        playTone(ctx, 587.33, t, 0.5, 0.45 * g, 'sine'); // D5
        playTone(ctx, 1174.66, t, 0.3, 0.15 * g, 'sine'); // D6 harmonic
        playTone(ctx, 880.0, t + 0.12, 0.7, 0.5 * g, 'sine'); // A5
        playTone(ctx, 1760.0, t + 0.12, 0.4, 0.15 * g, 'sine'); // A6 harmonic
        break;
      }
    }
  } catch (err) {
    console.warn('Web Audio synthesis failed, trying audio element fallback', err);
    playFallbackAudio(volume);
  }
}

function playFallbackAudio(volume: number) {
  try {
    const audio = new Audio('/notification.wav');
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => {});
  } catch (_) {
    // Audio playback blocked or unsupported
  }
}
