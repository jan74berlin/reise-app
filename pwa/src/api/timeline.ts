import { apiFetch } from './client';
import type { TimelinePreviewResponse, TimelineImportResult } from '../types';

export async function previewTimeline(tripId: string, file: File): Promise<TimelinePreviewResponse> {
  const fd = new FormData();
  fd.append('file', file);
  return apiFetch(`/api/v1/trips/${tripId}/timeline/preview`, { method: 'POST', body: fd });
}

export async function importTimeline(
  tripId: string,
  file: File,
  daysToProcess: string[],
  overwrite: Record<string, boolean>,
  autoCreate: boolean,
): Promise<TimelineImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('days_to_process', JSON.stringify(daysToProcess));
  fd.append('overwrite', JSON.stringify(overwrite));
  fd.append('auto_create', autoCreate ? 'true' : 'false');
  return apiFetch(`/api/v1/trips/${tripId}/timeline/import`, { method: 'POST', body: fd });
}
