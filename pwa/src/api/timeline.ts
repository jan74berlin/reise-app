import type { TimelinePreviewResponse, TimelineImportResult } from '../types';

const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.jan-toenhardt.de';

function uploadXhr<T>(path: string, fd: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    const token = localStorage.getItem('jwt');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 0; // backend may take long for big files

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.upload.addEventListener('load', () => {
      // Upload complete — backend now processing
      if (onProgress) onProgress(100);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Antwort vom Server war kein gültiges JSON')); }
      } else {
        let msg = xhr.statusText || `HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).error ?? msg; } catch {}
        reject(new Error(msg));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler beim Upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload abgebrochen')));

    xhr.send(fd);
  });
}

export async function previewTimeline(
  tripId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<TimelinePreviewResponse> {
  const fd = new FormData();
  fd.append('file', file);
  return uploadXhr(`/api/v1/trips/${tripId}/timeline/preview`, fd, onProgress);
}

export async function importTimeline(
  tripId: string,
  file: File,
  daysToProcess: string[],
  overwrite: Record<string, boolean>,
  autoCreate: boolean,
  onProgress?: (pct: number) => void,
): Promise<TimelineImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('days_to_process', JSON.stringify(daysToProcess));
  fd.append('overwrite', JSON.stringify(overwrite));
  fd.append('auto_create', autoCreate ? 'true' : 'false');
  return uploadXhr(`/api/v1/trips/${tripId}/timeline/import`, fd, onProgress);
}
