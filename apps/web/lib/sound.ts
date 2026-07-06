'use client';

// Notification sounds, synthesized with the Web Audio API — no audio files to
// host, no licensing, tiny and instant. Browsers only allow audio after the
// user has interacted with the page, so we lazily create the context on the
// first gesture (any click/keypress — signing in counts).

let ctx: AudioContext | null = null;
let armed = false;

export function armSoundOnFirstGesture() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const arm = () => {
    try {
      ctx = ctx ?? new AudioContext();
      ctx.resume().catch(() => undefined);
    } catch {
      /* audio unsupported */
    }
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm);
  window.addEventListener('keydown', arm);
}

const KEY = 'iwm-sound-enabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY) !== 'off';
}

export function setSoundEnabled(on: boolean) {
  window.localStorage.setItem(KEY, on ? 'on' : 'off');
}

function tone(at: number, freq: number, dur: number, gainPeak: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(gainPeak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function play(notes: [number, number][], gainPeak = 0.14) {
  if (!isSoundEnabled() || !ctx || ctx.state !== 'running') return;
  let t = ctx.currentTime + 0.01;
  for (const [freq, dur] of notes) {
    tone(t, freq, dur, gainPeak);
    t += dur * 0.7;
  }
}

// Soft two-note chime for a new message elsewhere.
export function playMessageChime() {
  play([
    [740, 0.12],
    [988, 0.16],
  ]);
}

// Brighter three-note rise for @mentions — cuts through without being harsh.
export function playMentionChime() {
  play(
    [
      [784, 0.1],
      [988, 0.1],
      [1319, 0.2],
    ],
    0.18,
  );
}
