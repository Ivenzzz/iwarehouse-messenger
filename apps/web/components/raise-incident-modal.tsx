'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { createIncident } from '@/lib/ops-service';
import type { IncidentType } from '@/lib/ops-types';
import type { DirectoryUser } from '@/lib/types';

export const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: 'STOCK_VARIANCE', label: 'Stock Variance' },
  { value: 'MISSING_UNIT', label: 'Missing Unit' },
  { value: 'WRONG_IMEI', label: 'Wrong IMEI / Serial' },
  { value: 'DELIVERY_DELAY', label: 'Delivery Delay' },
  { value: 'DELIVERY_DAMAGE', label: 'Delivery Damage' },
  { value: 'CASH_DISCREPANCY', label: 'Cash Discrepancy' },
  { value: 'FINANCING_DOC_MISSING', label: 'Financing Document Missing' },
  { value: 'CUSTOMER_COMPLAINT', label: 'Customer Complaint' },
  { value: 'RMA_DELAY', label: 'RMA Delay' },
  { value: 'DAMAGED_UNIT', label: 'Damaged Unit' },
  { value: 'SYSTEM_OUTAGE', label: 'System Outage' },
  { value: 'SECURITY_CONCERN', label: 'Security Concern' },
  { value: 'OTHER', label: 'Other' },
];

export default function RaiseIncidentModal({
  conversationId,
  sourceMessage,
  onClose,
  onCreated,
}: {
  conversationId?: string;
  sourceMessage?: { id: string; content: string };
  onClose: () => void;
  onCreated?: (incidentId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<IncidentType>('STOCK_VARIANCE');
  const [priority, setPriority] = useState<'P1' | 'P2' | 'P3'>('P2');
  const [description, setDescription] = useState(sourceMessage?.content.slice(0, 500) ?? '');
  const [sku, setSku] = useState('');
  const [imei, setImei] = useState('');
  const [erpRef, setErpRef] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [escalationId, setEscalationId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: users } = useQuery<{ items: DirectoryUser[] }>({
    queryKey: ['users-all'],
    queryFn: () => api.get('/users?limit=100'),
  });
  const people = users?.items ?? [];

  async function submit() {
    if (description.trim().length < 5) {
      setError('Describe the incident (at least a sentence).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const incident = await createIncident({
        type,
        priority,
        description: description.trim(),
        sku: sku.trim() || undefined,
        imei: imei.trim() || undefined,
        erpRef: erpRef.trim() || undefined,
        ownerId: ownerId || undefined,
        escalationId: escalationId || undefined,
        resolutionDeadline: deadline ? new Date(deadline).toISOString() : undefined,
        conversationId,
        sourceMessageId: sourceMessage?.id,
      });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (conversationId) queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      onCreated?.(incident.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not raise the incident.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Raise incident</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-soft">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as IncidentType)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-soft">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm"
              >
                <option value="P1">P1 — Critical</option>
                <option value="P2">P2 — High</option>
                <option value="P3">P3 — Normal</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-soft">What happened?</span>
            <textarea
              autoFocus={!sourceMessage}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Expected 8 units of iPhone 15 128GB Black, counted 7. Variance -1."
              className="mt-1 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-soft">SKU (optional)</span>
              <input value={sku} onChange={(e) => setSku(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-soft">IMEI / Serial (optional)</span>
              <input value={imei} onChange={(e) => setImei(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-soft">ERP reference (transfer / GRN / invoice / RMA, optional)</span>
            <input value={erpRef} onChange={(e) => setErpRef(e.target.value)} placeholder="e.g. TR-2026-00844"
              className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-soft">Assigned owner</span>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm">
                <option value="">Unassigned</option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>{u.profile?.displayName ?? u.username}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-soft">Escalation contact</span>
              <select value={escalationId} onChange={(e) => setEscalationId(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-2 text-sm">
                <option value="">None</option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>{u.profile?.displayName ?? u.username}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-soft">Resolution deadline</span>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-sm" />
          </label>

          <p className="rounded-md bg-raised px-3 py-2 text-[11px] text-soft">
            Note: the owner cannot verify or close their own resolution — the reporter, escalation
            contact, or a manager confirms it. Photo evidence: post photos in the conversation
            (camera button) — they stay linked to this incident's chat.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-danger px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Raising…' : 'Raise incident'}
          </button>
        </footer>
      </div>
    </div>
  );
}
