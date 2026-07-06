'use client';

import { useState } from 'react';

// Shows a user's profile photo, falling back to initials on a neutral chip.
// avatarKey presence signals the user has uploaded a photo; the actual bytes
// come from the authenticated /api/users/:id/avatar endpoint.
export default function Avatar({
  userId,
  name,
  avatarKey,
  size = 'md',
}: {
  userId?: string | null;
  name: string;
  avatarKey?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const dims = {
    xs: 'h-6 w-6 text-[9px]',
    sm: 'h-8 w-8 text-[11px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-20 w-20 text-xl',
  }[size];

  const showPhoto = avatarKey && userId && !failed;

  return (
    <span
      className={`${dims} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised font-semibold uppercase text-soft`}
      aria-hidden
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/users/${userId}/avatar?v=${encodeURIComponent(avatarKey)}`}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
