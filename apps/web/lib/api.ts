// Minimal fetch client. Cookies carry auth; on a 401 we try one silent refresh.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 401 && !retried && path !== '/auth/refresh') {
    const refreshed = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) return request<T>(path, init, true);
    await forceLogin();
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// Session is dead (expired/revoked): clear the stale cookies server-side so
// nothing traps the user, then land on the login page with a friendly note.
let redirecting = false;
export async function forceLogin() {
  if (typeof window === 'undefined' || redirecting) return;
  if (window.location.pathname.startsWith('/login')) return;
  redirecting = true;
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(
    () => undefined,
  );
  window.location.href = '/login?expired=1';
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface UploadedInfo {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

// XHR so we can report upload progress; fetch cannot.
export function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
): { promise: Promise<UploadedInfo>; cancel: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadedInfo>((resolve, reject) => {
    xhr.open('POST', '/api/uploads');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          message = JSON.parse(xhr.responseText)?.message ?? message;
        } catch {}
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed — check your connection'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload canceled'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, cancel: () => xhr.abort() };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
