// Service layer for the operations modules. Components call these functions,
// never fetch() directly — so swapping mock data for the real API when the
// Tasks (Ops Phase 2) and Incidents (Ops Phase 3) backends land is a change
// in this one file.
//
// STATUS:
//   listMyTasks       → MOCK (empty; backend lands in Ops Phase 2)
//   listOpenIncidents → MOCK (empty; backend lands in Ops Phase 3)
//   Everything under lib/api.ts (auth, chat, files, search, …) → LIVE

import type { Incident, Task } from '@/lib/ops-types';

export async function listMyTasks(): Promise<Task[]> {
  // TODO(Ops Phase 2): return api.get('/tasks?assignee=me')
  return [];
}

export async function listOpenIncidents(): Promise<Incident[]> {
  // TODO(Ops Phase 3): return api.get('/incidents?status=open')
  return [];
}
