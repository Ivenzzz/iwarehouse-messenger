'use client';

import { useEffect, useState } from 'react';
import { formatBytes } from '@/lib/api';
import type { MessageAttachment } from '@/lib/types';

export default function AttachmentList({
  attachments,
  mine,
}: {
  attachments: MessageAttachment[];
  mine: boolean;
}) {
  const [lightbox, setLightbox] = useState<MessageAttachment | null>(null);
  return (
    <div className="mt-1 space-y-2">
      {attachments.map((a) => (
        <Attachment key={a.id} attachment={a} mine={mine} onOpen={() => setLightbox(a)} />
      ))}
      {lightbox && <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function Attachment({
  attachment,
  mine,
  onOpen,
}: {
  attachment: MessageAttachment;
  mine: boolean;
  onOpen: () => void;
}) {
  const raw = `/api/files/${attachment.id}/raw`;
  const download = `/api/files/${attachment.id}/download`;

  if (attachment.mimeType.startsWith('image/')) {
    return (
      <button onClick={onOpen} className="block">
        {/* Responsive thumbnail — not forced to full chat width. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={raw}
          alt={attachment.originalName}
          className="max-h-56 max-w-[260px] rounded-md border border-line object-cover"
          loading="lazy"
        />
      </button>
    );
  }

  if (attachment.mimeType.startsWith('video/')) {
    return (
      <video
        src={raw}
        controls
        preload="metadata"
        className="max-h-56 max-w-[280px] rounded-md border border-line"
      />
    );
  }

  if (attachment.mimeType.startsWith('audio/')) {
    return (
      <div>
        <audio src={raw} controls preload="metadata" className="w-60 max-w-full" />
        <p className={`mt-0.5 text-[11px] ${mine ? 'text-canvas/70' : 'text-faint'}`}>
          {attachment.originalName}
        </p>
      </div>
    );
  }

  const isZip = attachment.mimeType.includes('zip');
  const ext = attachment.originalName.split('.').pop()?.slice(0, 4) ?? 'file';
  return (
    <div
      className={`flex max-w-[300px] items-center gap-3 rounded-md border px-3 py-2 ${
        mine ? 'border-canvas/25' : 'border-line bg-canvas'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[9px] font-bold uppercase ${
          mine ? 'bg-canvas/20 text-canvas' : 'bg-raised text-soft'
        }`}
      >
        {ext}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${mine ? 'text-canvas' : ''}`} title={attachment.originalName}>
          {attachment.originalName}
        </span>
        <span className={`block text-[11px] ${mine ? 'text-canvas/70' : 'text-faint'}`}>
          {formatBytes(attachment.sizeBytes)}
          {isZip ? ' · ZIP' : ''}
        </span>
      </span>
      <a
        href={download}
        onClick={(e) => {
          if (
            isZip &&
            !confirm('ZIP archives can contain anything. Only open files you expect. Download?')
          ) {
            e.preventDefault();
          }
        }}
        title="Download"
        aria-label={`Download ${attachment.originalName}`}
        className={`shrink-0 rounded-md p-1.5 ${
          mine ? 'text-canvas hover:bg-canvas/20' : 'text-soft hover:bg-raised hover:text-ink'
        }`}
      >
        <DownloadGlyph />
      </a>
    </div>
  );
}

function Lightbox({
  attachment,
  onClose,
}: {
  attachment: MessageAttachment;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const raw = `/api/files/${attachment.id}/raw`;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm">{attachment.originalName}</span>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href={`/api/files/${attachment.id}/download`}
            className="rounded-md border border-white/30 px-3 py-1 text-xs hover:bg-white/10"
          >
            Download
          </a>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none">
            ✕
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={raw}
          alt={attachment.originalName}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

function DownloadGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
    </svg>
  );
}
