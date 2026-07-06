'use client';

import { useEffect, useRef, useState } from 'react';
import type { Me } from '@/lib/types';

// Live in-app camera with an evidence stamp burned into the photo:
// date/time, GPS coordinates (when permitted), branch, and the employee's
// name. Built for delivery proof, stock-variance evidence, and audit shots.
//
// Browser rules (not ours): the live camera and geolocation only work in a
// SECURE CONTEXT — https:// or http://localhost. On plain http over the LAN
// this component reports `available: false` and callers fall back to the
// native file/capture input.

export interface CaptureMeta {
  capturedAt: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
}

export function cameraAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export default function StampedCamera({
  me,
  onCapture,
  onClose,
}: {
  me: Me;
  onCapture: (file: File, meta: CaptureMeta) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeolocationPosition | null>(null);
  const [geoState, setGeoState] = useState<'asking' | 'ok' | 'denied'>('asking');
  const [preview, setPreview] = useState<{ blob: Blob; url: string; meta: CaptureMeta } | null>(
    null,
  );

  // Start camera + location together.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => setError('Camera unavailable or permission denied.'));

    const watch = navigator.geolocation?.watchPosition(
      (pos) => {
        setGeo(pos);
        setGeoState('ok');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 },
    );

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
      if (preview) URL.revokeObjectURL(preview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stampLines(meta: CaptureMeta): string[] {
    const dt = new Date(meta.capturedAt);
    const lines = [
      dt.toLocaleDateString() + '  ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      meta.lat !== undefined && meta.lng !== undefined
        ? `GPS ${meta.lat.toFixed(6)}, ${meta.lng.toFixed(6)}  (±${Math.round(meta.accuracyM ?? 0)}m)`
        : 'Location unavailable',
      [me.profile?.displayName ?? me.username, me.branch?.code, me.department?.code]
        .filter(Boolean)
        .join(' · '),
      'iWarehouse Messenger',
    ];
    return lines;
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const meta: CaptureMeta = {
      capturedAt: new Date().toISOString(),
      lat: geo?.coords.latitude,
      lng: geo?.coords.longitude,
      accuracyM: geo?.coords.accuracy,
    };

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    // Burn the stamp: dark strip bottom-left, readable at any photo size.
    const lines = stampLines(meta);
    const fontSize = Math.max(14, Math.round(canvas.width / 46));
    const pad = Math.round(fontSize * 0.6);
    const lineH = Math.round(fontSize * 1.35);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const boxH = lines.length * lineH + pad * 2;
    const boxW = widest + pad * 2;
    const y0 = canvas.height - boxH - pad;

    ctx.fillStyle = 'rgba(15, 16, 18, 0.72)';
    ctx.fillRect(pad, y0, boxW, boxH);
    ctx.fillStyle = '#F5F5F3';
    lines.forEach((line, i) => {
      if (i === 1 && !line.startsWith('GPS')) ctx.fillStyle = '#F0A36A';
      ctx.fillText(line, pad * 2, y0 + pad + lineH * (i + 1) - lineH * 0.28);
      ctx.fillStyle = '#F5F5F3';
    });
    // Accent tick, brand-consistent.
    ctx.fillStyle = '#E86F1E';
    ctx.fillRect(pad, y0, 4, boxH);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreview({ blob, url: URL.createObjectURL(blob), meta });
      },
      'image/jpeg',
      0.9,
    );
  }

  function usePhoto() {
    if (!preview) return;
    const stamp = new Date(preview.meta.capturedAt)
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const file = new File([preview.blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' });
    onCapture(file, preview.meta);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">
          {preview ? 'Review photo' : 'Take stamped photo'}
        </span>
        <button onClick={onClose} aria-label="Close camera" className="text-xl leading-none">
          ✕
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {error ? (
          <p className="max-w-xs px-6 text-center text-sm text-white/80">{error}</p>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt="Captured" className="max-h-full max-w-full object-contain" />
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />
        )}

        {!preview && !error && (
          <span
            className={`absolute left-3 top-3 rounded-md px-2 py-1 font-mono text-[11px] ${
              geoState === 'ok'
                ? 'bg-black/60 text-emerald-300'
                : geoState === 'asking'
                  ? 'bg-black/60 text-white/70'
                  : 'bg-black/60 text-amber-300'
            }`}
          >
            {geoState === 'ok'
              ? `GPS ±${Math.round(geo?.coords.accuracy ?? 0)}m`
              : geoState === 'asking'
                ? 'Getting location…'
                : 'No location — photo will say so'}
          </span>
        )}
      </div>

      <footer className="flex items-center justify-center gap-6 px-4 py-5">
        {preview ? (
          <>
            <button
              onClick={() => {
                URL.revokeObjectURL(preview.url);
                setPreview(null);
              }}
              className="rounded-md border border-white/40 px-5 py-2 text-sm text-white"
            >
              Retake
            </button>
            <button
              onClick={usePhoto}
              className="rounded-md bg-accent px-6 py-2 text-sm font-semibold text-accent-ink"
            >
              Use photo
            </button>
          </>
        ) : (
          !error && (
            <button
              onClick={capture}
              aria-label="Capture photo"
              className="h-16 w-16 rounded-full border-4 border-white/80 bg-white/20 active:bg-white/50"
            />
          )
        )}
      </footer>
    </div>
  );
}
