// Service layer for the operations modules. Tasks are LIVE as of Ops Phase 2.
// Incidents are LIVE as of Ops Phase 3.
import { api } from '@/lib/api';
import type { Incident, Task } from '@/lib/ops-types';

export function listMyTasks(includeClosed = false): Promise<Task[]> {
  return api.get(`/tasks?filter=assigned${includeClosed ? '&includeClosed=1' : ''}`);
}

export function listCreatedTasks(includeClosed = false): Promise<Task[]> {
  return api.get(`/tasks?filter=created${includeClosed ? '&includeClosed=1' : ''}`);
}

export function listConversationTasks(conversationId: string): Promise<Task[]> {
  return api.get(`/tasks?conversationId=${conversationId}`);
}

export function getTask(id: string): Promise<Task> {
  return api.get(`/tasks/${id}`);
}

export function createTask(input: Record<string, unknown>): Promise<Task> {
  return api.post('/tasks', input);
}

export function updateTask(id: string, input: Record<string, unknown>): Promise<Task> {
  return api.patch(`/tasks/${id}`, input);
}

export function listIncidents(includeClosed = false): Promise<Incident[]> {
  return api.get(`/incidents${includeClosed ? '?includeClosed=1' : ''}`);
}

export function listConversationIncidents(conversationId: string): Promise<Incident[]> {
  return api.get(`/incidents?conversationId=${conversationId}`);
}

export function getIncident(id: string): Promise<Incident> {
  return api.get(`/incidents/${id}`);
}

export function createIncident(input: Record<string, unknown>): Promise<Incident> {
  return api.post('/incidents', input);
}

export function updateIncident(id: string, input: Record<string, unknown>): Promise<Incident> {
  return api.patch(`/incidents/${id}`, input);
}
