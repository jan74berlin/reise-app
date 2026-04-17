import { apiFetch, ApiError } from '../api/client';

global.fetch = jest.fn();

beforeEach(() => jest.resetAllMocks());

test('apiFetch sends Authorization header when token provided', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: 1 }),
  });
  await apiFetch('/health', { token: 'tok123' });
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain('/health');
  expect((opts as RequestInit).headers).toMatchObject({
    Authorization: 'Bearer tok123',
  });
});

test('apiFetch throws ApiError on non-ok response', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'Invalid credentials' }),
  });
  await expect(apiFetch('/auth/login', {})).rejects.toThrow(ApiError);
});

test('ApiError has status and message', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Not found' }),
  });
  try {
    await apiFetch('/trips/x', {});
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(404);
    expect((e as ApiError).message).toBe('Not found');
  }
});
