'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Avatar from '@/components/avatar';
import IncidentDrawer, {
  IncidentStatusPill,
  PriorityDot,
  slaState,
} from '@/components/incident-drawer';
import RaiseIncidentModal from '@/components/raise-incident-modal';
import { api } from '@/lib/api';
import { listIncidents } from '@/lib/ops-service';
import type { Incident } from '@/lib/ops-types';
import type { Me } from '@/lib/types';
import { getSocket } from '@/lib/socket';

export default function IncidentsPage() {
  const router = useRouter();
  const [includeClosed, setIncludeClosed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);

  const { data: me } = useQuery<Me>({ queryKey: ['me'], queryFn: () => api.get('/me') });
  const { data, isLoading, refetch } = useQuery<Incident[]>({
    queryKey: ['incidents', includeClosed],
    queryFn: () => listIncidents(includeClosed),
  });

  useEffect(() => {
    const socket = getSocket();
    const onIncident = () => refetch();
    socket.on('incident.updated', onIncident);
    return () => {
      socket.off('incident.updated', onIncident);
    };
  }, [refetch]);

  const breached = (data ?? []).filter((i) => slaState(i)?.overdue);
  const rest = (data ?? []).filter((i) => !slaState(i)?.overdue);
  const isManager = me && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(me.role);

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Incidents</h1>
          <p className="mt-0.5 text-xs text-faint">
            {isManager ? 'All incidents (manager view)' : 'Incidents involving you'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-soft">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#E86F1E]"
            />
            Show closed
          </label>
          <button
            onClick={() => setRaising(true)}
            className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white"
          >
            Raise incident
          </button>
        </div>
      </div>

      {isLoading && <p className="mt-6 text-sm text-faint">Loading…</p>}

      {data && data.length === 0 && (
        <div className="mt-6 rounded-md border border-dashed border-line px-4 py-12 text-center">
          <p className="text-sm font-medium">No incidents</p>
          <p className="mt-1 text-xs text-faint">
            Raise one here, from a chat header, or the composer + menu. Structured reports with
            owners and deadlines beat "guys we have a problem" messages.
          </p>
        </div>
      )}

      {breached.length > 0 && (
        <>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-danger">
            SLA breached
          </p>
          <div className="mt-1.5 space-y-1.5">
            {breached.map((i) => (
              <IncidentRow key={i.id} incident={i} onOpen={() => setOpenId(i.id)} />
            ))}
          </div>
        </>
      )}
      {rest.length > 0 && (
        <>
          {breached.length > 0 && (
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              On track
            </p>
          )}
          <div className="mt-1.5 space-y-1.5">
            {rest.map((i) => (
              <IncidentRow key={i.id} incident={i} onOpen={() => setOpenId(i.id)} />
            ))}
          </div>
        </>
      )}

      {raising && (
        <RaiseIncidentModal onClose={() => setRaising(false)} onCreated={(id) => setOpenId(id)} />
      )}
      {openId && me && (
        <IncidentDrawer
          incidentId={openId}
          me={me}
          onClose={() => setOpenId(null)}
          onOpenChat={(cid) => router.push(`/chats?c=${cid}`)}
        />
      )}
    </div>
  );
}

function IncidentRow({ incident, onOpen }: { incident: Incident; onOpen: () => void }) {
  const sla = slaState(incident);
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-raised ${
        sla?.overdue ? 'border-danger/40' : 'border-line bg-surface'
      }`}
    >
      <PriorityDot priority={incident.priority} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{incident.typeLabel}</span>
        <span className="mt-0.5 block truncate text-xs text-faint">
          {incident.description.slice(0, 80)}
          {incident.owner ? ` · owner ${incident.owner.name}` : ' · unassigned'}
          {sla && (
            <span className={sla.overdue ? 'font-semibold text-danger' : sla.tight ? 'font-semibold text-accent' : ''}>
              {' · '}
              {sla.label}
            </span>
          )}
        </span>
      </span>
      {incident.owner && (
        <Avatar
          userId={incident.owner.id}
          name={incident.owner.name}
          avatarKey={incident.owner.avatarKey}
          size="sm"
        />
      )}
      <IncidentStatusPill status={incident.status} />
    </button>
  );
}
