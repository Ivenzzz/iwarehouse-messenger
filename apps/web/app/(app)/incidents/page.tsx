'use client';

import { useQuery } from '@tanstack/react-query';
import { listOpenIncidents } from '@/lib/ops-service';
import type { Incident } from '@/lib/ops-types';

export default function IncidentsPage() {
  const { data, isLoading } = useQuery<Incident[]>({
    queryKey: ['open-incidents'],
    queryFn: listOpenIncidents,
  });

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Incidents</h1>
      <p className="mt-1 text-sm text-soft">
        Structured reports for stock variances, missing units, delivery problems, cash
        discrepancies, and other urgent operational issues — with owners, deadlines, and
        SLA tracking.
      </p>

      {isLoading && <p className="mt-6 text-sm text-faint">Loading…</p>}

      {data && data.length === 0 && (
        <div className="mt-6 rounded-md border border-dashed border-line px-4 py-12 text-center">
          <p className="text-2xl">🚨</p>
          <p className="mt-2 text-sm font-medium">No incidents open</p>
          <p className="mt-1 text-xs text-faint">
            Incident reporting arrives in an upcoming update. Raised incidents will appear
            here and as structured cards inside their conversations.
          </p>
        </div>
      )}
    </div>
  );
}
