'use client';

import { useEffect, useRef, useState } from 'react';

// Voice features for the composer.
// 1) VoiceRecorderBar — record a voice note (MediaRecorder → webm/opus file,
//    sent through the normal upload pipeline; plays in the existing audio
//    player). Needs a secure context (https / localhost), same rule as the
//    camera.
// 2) useDictation — live voice-to-text into the message box via the
//    browser's Web Speech API (Chrome/Edge; English + Filipino). Hidden
//    where unsupported.

export function voiceRecordingAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function dictationAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return '';
}

export function VoiceRecorderBar({
  onSend,
  onCancel,
}: {
  onSend: (file: File, durationMs: number) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; url: string; durationMs: number } | null>(
    null,
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startRef = useRef(0);
  const sendOnStopRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const mime = pickMime();
        const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        recorderRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const type = rec.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          const durationMs = Date.now() - startRef.current;
          stream?.getTracks().forEach((t) => t.stop());
          if (durationMs < 700) {
            onCancel(); // too short to be a message
            return;
          }
          if (sendOnStopRef.current) {
            // Messenger-style: Send tapped while recording → send immediately.
            const ext = type.includes('mp4') ? 'm4a' : 'webm';
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            onSend(new File([blob], `voice-${stamp}.${ext}`, { type }), durationMs);
            return;
          }
          setPreview({ blob, url: URL.createObjectURL(blob), durationMs });
        };
        startRef.current = Date.now();
        rec.start(250);
        timer = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
      })
      .catch(() => setError('Microphone unavailable or permission denied.'));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  function fmt(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function sendPreview() {
    if (!preview) return;
    const ext = preview.blob.type.includes('mp4') ? 'm4a' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = new File([preview.blob], `voice-${stamp}.${ext}`, { type: preview.blob.type });
    onSend(file, preview.durationMs);
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2">
        <p className="flex-1 text-xs text-danger">{error}</p>
        <button onClick={onCancel} className="text-xs text-soft underline">Close</button>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2">
        <audio src={preview.url} controls preload="metadata" className="h-9 min-w-0 flex-1" />
        <span className="font-mono text-xs text-soft">{fmt(preview.durationMs)}</span>
        <button onClick={onCancel} className="rounded-md border border-line px-3 py-1.5 text-xs">
          Discard
        </button>
        <button
          onClick={sendPreview}
          className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink"
        >
          Send voice note
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-danger/40 bg-canvas px-3 py-2">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
      </span>
      <span className="flex-1 text-sm">
        Recording… <span className="font-mono text-xs text-soft">{fmt(elapsed)}</span>
      </span>
      <button
        onClick={onCancel}
        aria-label="Cancel recording"
        title="Cancel"
        className="rounded-md border border-line px-3 py-1.5 text-xs"
      >
        ✕
      </button>
      <button
        onClick={() => recorderRef.current?.stop()}
        aria-label="Stop and review"
        title="Stop and review before sending"
        className="rounded-md border border-danger/50 px-3 py-1.5 text-xs font-semibold text-danger"
      >
        ■
      </button>
      <button
        onClick={() => {
          sendOnStopRef.current = true;
          recorderRef.current?.stop();
        }}
        aria-label="Send voice note now"
        title="Send now"
        className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink"
      >
        Send ➤
      </button>
    </div>
  );
}

// ── dictation ────────────────────────────────────────────────────────────────

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<'en-US' | 'fil-PH'>('en-US');
  const recRef = useRef<any>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem('iwm-dictation-lang');
    if (saved === 'fil-PH') setLang('fil-PH');
    return () => recRef.current?.stop?.();
  }, []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) onText(text + ' ');
        }
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function switchLang() {
    const next = lang === 'en-US' ? 'fil-PH' : 'en-US';
    setLang(next);
    window.localStorage.setItem('iwm-dictation-lang', next);
    if (listening) {
      recRef.current?.stop();
      setListening(false);
    }
  }

  return { listening, lang, toggle, switchLang };
}
