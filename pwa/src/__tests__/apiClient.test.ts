import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sends Authorization header when token in localStorage', async () => {
    localStorage.setItem('jwt', 'test-token');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/v1/health');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/health'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
  });

  it('throws ApiError on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    ));
    await expect(apiFetch('/api/v1/missing')).rejects.toThrow('Not found');
  });
});
