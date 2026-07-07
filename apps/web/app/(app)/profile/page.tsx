'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import Avatar from '@/components/avatar';
import { api, ApiError } from '@/lib/api';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';
import { isSoundEnabled, playMessageChime, setSoundEnabled } from '@/lib/sound';
import type { Me } from '@/lib/types';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const [sound, setSound] = useState(true);
  const [push, setPush] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    setSound(isSoundEnabled());
    getPushState().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush());
    } finally {
      setPushBusy(false);
    }
  }

  // Seed the editable fields once me loads.
  if (me && displayName === '' && me.profile?.displayName) {
    setDisplayName(me.profile.displayName);
    setTitle(me.profile.title ?? '');
  }

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, or WEBP).');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/me/avatar', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.message ?? 'Upload failed');
      }
      // Refresh everything showing the avatar.
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the photo.');
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    setSaved(false);
    setError(null);
    try {
      await api.patch('/me', { displayName: displayName.trim(), title: title.trim() });
      await queryClient.invalidateQueries();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    }
  }

  return (
    <div className="mx-auto h-full max-w-lg overflow-y-auto px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-sm text-soft">
        Your photo and name appear next to your messages and in the directory.
      </p>

      <div className="mt-6 flex items-center gap-4">
        <div className="relative">
          <Avatar
            userId={me?.id}
            name={me?.profile?.displayName ?? me?.username ?? '?'}
            avatarKey={me?.profile?.avatarKey}
            size="lg"
          />
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[10px] text-white">
              …
            </span>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) uploadAvatar(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-raised disabled:opacity-50"
          >
            {me?.profile?.avatarKey ? 'Change photo' : 'Upload photo'}
          </button>
          <p className="mt-1 text-xs text-faint">JPG, PNG, or WEBP · up to 8 MB</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-soft">Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-soft">Title / role</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Warehouse Supervisor"
            className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && <p className="text-sm text-ok">Saved.</p>}

        <button
          onClick={saveProfile}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          Save changes
        </button>
      </div>

      <div className="mt-8 border-t border-line pt-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Notification sound</span>
            <span className="block text-xs text-faint">
              Chime for new messages and mentions on this device
            </span>
          </span>
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => {
              const on = e.target.checked;
              setSound(on);
              setSoundEnabled(on);
              if (on) playMessageChime();
            }}
            className="h-4 w-4 accent-[#E86F1E]"
          />
        </label>
      </div>

      {push !== 'unsupported' && push !== 'server-off' && (
        <div className="mt-4 border-t border-line pt-4">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Push notifications</span>
              <span className="block text-xs text-faint">
                {push === 'denied'
                  ? 'Blocked in browser settings — allow notifications for this site to enable'
                  : 'Get notified on this device even when the app is closed'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={push === 'on'}
              disabled={pushBusy || push === 'denied'}
              onChange={togglePush}
              className="h-4 w-4 accent-[#E86F1E]"
            />
          </label>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs text-faint">
          Signed in as {me?.email} · {me?.role?.replace('_', ' ').toLowerCase()}
        </p>
      </div>
    </div>
  );
}
