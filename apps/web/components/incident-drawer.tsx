'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Avatar from '@/components/avatar';
import { ApiError } from '@/lib/api';
import { getIncident, updateIncident } from '@/lib/ops-service';
import type { Incident, IncidentStatus } from '@/lib/ops-types';
import type { Me } from '@/lib/types';

const STATUS_LABEL: Record<IncidentStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
};

export function IncidentStatusPill({ status }: { status: IncidentStatus }) {
  const tone: Record<IncidentStatus, string> = {
    OPEN: 'bg-danger/15 text-danger',
    ACKNOWLEDGED: 'bg-accent/10 text-accent',
    ASSIGNED: 'bg-accent/10 text-accent',
    IN_PROGRESS: 'bg-accent/15 text-accent',
    RESOLVED: 'bg-[#7A6CC8]/15 text-[#7A6CC8]',
    VERIFIED: 'bg-ok/15 text-ok',
    CLOSED: 'bg-raised text-faint',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: 'P1' | 'P2' | 'P3' }) {
  const tone =
    priority === 'P1' ? 'bg-danger/15 text-danger' : priority === 'P2' ? 'bg-accent/15 text-accent' : 'bg-raised text-soft';
  return <span className={`rounded-sm px-1 py-0.5 font-mono text-[10px] font-bold ${tone}`}>{priority}</span>;
}

export function slaState(i: Pick<Incident, 'resolutionDeadline' | 'status'>) {
  if (!i.resolutionDeadline || ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(i.status)) return null;
  const ms = new Date(i.resolutionDeadline).getTime() - Date.now();
  if (ms < 0) return { overdue: true, label: 'SLA breached' };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return {
    overdue: false,
    label: h > 48 ? `${Math.floor(h / 24)}d left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`,
    tight: h < 4,
  };
}

function availableActions(incident: Incident, me: Me) {
  const isReporter = incident.reporter.id === me.id;
  const isOwner = incident.owner?.id === me.id;
  const isEscalation = incident.escalation?.id === me.id;
  const isManager = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(me.role);
  const worker = isOwner || isReporter || isManager || isEscalation;
  const verifier = (isReporter || isEscalation || isManager) && !isOwner;

  const out: { to: IncidentStatus; label: string; primary?: boolean; danger?: boolean }[] = [];
  const add = (to: IncidentStatus, label: string, extra: object = {}) => out.push({ to, label, ...extra });

  switch (incident.status) {
    case 'OPEN':
      if (worker) add('ACKNOWLEDGED', 'Acknowledge', { primary: true });
      break;
    case 'ACKNOWLEDGED':
    case 'ASSIGNED':
      if (worker) add('IN_PROGRESS', 'Start work', { primary: true });
      break;
    case 'IN_PROGRESS':
      if (worker) add('RESOLVED', 'Mark resolved', { primary: true });
      break;
    case 'RESOLVED':
      if (verifier) add('VERIFIED', 'Verify resolution', { primary: true });
      if (worker) add('IN_PROGRESS', 'Reopen');
      break;
    case 'VERIFIED':
      if (verifier) add('CLOSED', 'Close incident', { primary: true });
      break;
    case 'CLOSED':
      break;
  }
  if (!['VERIFIED', 'CLOSED'].includes(incident.status) && (isReporter || isManager) && !isOwner) {
    add('CLOSED', 'Close without resolution', { danger: true });
  }
  return out;
}

export default function IncidentDrawer({
  incidentId,
  me,
  onClose,
  onOpenChat,
}: {
  incidentId: string;
  me: Me;
  onClose: () => void;
  onOpenChat?: (conversationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: incident } = useQuery<Incident>({
    queryKey: ['incidents', 'detail', incidentId],
    queryFn: () => getIncident(incidentId),
  });

  async function move(to: IncidentStatus) {
    setBusy(true);
    setError(null);
    try {
      await updateIncident(incidentId, { status: to });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the incident.');
    } finally {
      setBusy(false);
    }
  }

  const sla = incident ? slaState(incident) : null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Incident</h2>
          <button onClick={onClose} aria-label="Close" className="text-soft hover:text-ink">✕</button>
        </header>

        {!incident ? (
          <p className="p-4 text-sm text-faint">Loading…</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-semibold leading-snug">
                <PriorityDot priority={incident.priority} />
                {incident.typeLabel}
              </h3>
              <IncidentStatusPill status={incident.status} />
            </div>

            {sla && (
              <p
                className={`mt-2 rounded-md px-3 py-1.5 text-xs font-medium ${
                  sla.overdue
                    ? 'bg-danger/10 text-danger'
                    : sla.tight
                      ? 'bg-accent/10 text-accent'
                      : 'bg-raised text-soft'
                }`}
              >
                {sla.overdue ? '⏰ ' : ''}
                {sla.label}
                {incident.resolutionDeadline &&
                  ` · deadline ${new Date(incident.resolutionDeadline).toLocaleString()}`}
              </p>
            )}

            <p className="mt-3 whitespace-pre-wrap text-sm">{incident.description}</p>

            <dl className="mt-4 space-y-2.5 text-sm">
              {incident.sku && <Row label="SKU">{incident.sku}</Row>}
              {incident.imei && <Row label="IMEI / Serial"><span className="font-mono text-xs">{incident.imei}</span></Row>}
              {incident.erpRef && <Row label="ERP ref"><span className="font-mono text-xs">{incident.erpRef}</span></Row>}
              <Row label="Owner">
                {incident.owner ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar userId={incident.owner.id} name={incident.owner.name} avatarKey={incident.owner.avatarKey} size="xs" />
                    {incident.owner.name}
                  </span>
                ) : (
                  <span className="text-faint">Unassigned</span>
                )}
              </Row>
              <Row label="Reported by">{incident.reporter.name}</Row>
              <Row label="Escalation">{incident.escalation?.name ?? <span className="text-faint">None</span>}</Row>
            </dl>

            <p className="mt-3 rounded-md bg-raised px-3 py-1.5 text-[11px] text-soft">
              The owner cannot verify or close their own resolution.
            </p>

            {incident.conversationId && onOpenChat && (
              <button
                onClick={() => onOpenChat(incident.conversationId!)}
                className="mt-3 text-xs text-accent underline"
              >
                Open conversation
              </button>
            )}

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {availableActions(incident, me).map((a) => (
                <button
                  key={a.to + a.label}
                  onClick={() => move(a.to)}
                  disabled={busy}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                    a.primary
                      ? 'bg-accent text-accent-ink'
                      : a.danger
                        ? 'border border-danger/40 text-danger'
                        : 'border border-line text-soft hover:text-ink'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {incident.activity && incident.activity.length > 0 && (
              <div className="mt-6 border-t border-line pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Activity</p>
                <ul className="mt-2 space-y-1.5">
                  {incident.activity.map((a, i) => (
                    <li key={i} className="text-xs text-soft">
                      <span className="font-medium">{a.actorName}</span> {a.action}
                      {a.detail ? `: ${a.detail}` : ''}
                      <span className="text-faint"> · {new Date(a.at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
