'use client';

// Notification sounds, synthesized with the Web Audio API — no audio files to
// host, no licensing, tiny and instant. Browsers only allow audio after the
// user has interacted with the page, so we lazily create the context on the
// first gesture (any click/keypress — signing in counts).

let ctx: AudioContext | null = null;
let armed = false;

function ensureContext() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function armSoundOnFirstGesture() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  // Try immediately — browsers allow this without a gesture once the site
  // has earned media engagement (returning users), so sounds work from the
  // first message after a reload.
  ensureContext()?.resume().catch(() => undefined);
  const arm = () => {
    ensureContext()?.resume().catch(() => undefined);
  };
  // Keep listening (not once): tabs re-suspend the context after long idle
  // periods, and any later interaction should revive it.
  window.addEventListener('pointerdown', arm);
  window.addEventListener('keydown', arm);
  window.addEventListener('touchstart', arm, { passive: true });
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
  if (!isSoundEnabled()) return;
  const c = ensureContext();
  if (!c) return;
  const schedule = () => {
    let t = c.currentTime + 0.01;
    for (const [freq, dur] of notes) {
      tone(t, freq, dur, gainPeak);
      t += dur * 0.7;
    }
  };
  if (c.state === 'running') {
    schedule();
  } else {
    // Suspended (fresh load or long-idle tab): try to resume, then play.
    // If the browser still refuses (no interaction yet), fail silently.
    c.resume().then(schedule).catch(() => undefined);
  }
}

// Two-note chime for a new message elsewhere — assertive, Messenger-league.
export function playMessageChime() {
  play(
    [
      [740, 0.14],
      [988, 0.2],
    ],
    0.35,
  );
  navigator.vibrate?.(120);
}

// Brighter three-note rise for @mentions — cuts through without being harsh.
export function playMentionChime() {
  play(
    [
      [784, 0.12],
      [988, 0.12],
      [1319, 0.26],
    ],
    0.5,
  );
  navigator.vibrate?.([150, 70, 150]);
}
