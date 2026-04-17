import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ssh2-sftp-client before importing strato
vi.mock('ssh2-sftp-client', () => {
  const MockClient = vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  }));
  return { default: MockClient };
});

import { uploadToStrato, deleteFromStrato } from './strato';
import SftpClient from 'ssh2-sftp-client';

describe('uploadToStrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRATO_SFTP_HOST = 'test.host';
    process.env.STRATO_SFTP_USER = 'testuser';
    process.env.STRATO_SFTP_PASSWORD = 'testpass';
    process.env.STRATO_BASE_URL = 'https://example.com';
  });

  it('returns filePath and url with correct structure', async () => {
    const result = await uploadToStrato(
      'trip-123',
      'photo.jpg',
      Buffer.from('fake-image'),
      'image/jpeg'
    );

    expect(result.filePath).toMatch(/^\/_entwuerfe\/trip-123\/[a-f0-9-]+\.jpg$/);
    expect(result.url).toMatch(/^https:\/\/example\.com\/_entwuerfe\/trip-123\/[a-f0-9-]+\.jpg$/);
  });

  it('connects, mkdirs, puts, and ends the connection', async () => {
    await uploadToStrato('trip-123', 'photo.jpg', Buffer.from('data'), 'image/jpeg');

    const MockClient = vi.mocked(SftpClient);
    const instance = MockClient.mock.results[0].value;
    expect(instance.connect).toHaveBeenCalledWith({
      host: 'test.host',
      username: 'testuser',
      password: 'testpass',
    });
    expect(instance.mkdir).toHaveBeenCalledWith('/_entwuerfe/trip-123', true);
    expect(instance.put).toHaveBeenCalledOnce();
    expect(instance.end).toHaveBeenCalledOnce();
  });

  it('calls end even if put throws', async () => {
    const MockClient = vi.mocked(SftpClient);
    MockClient.mockImplementationOnce(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockRejectedValue(new Error('SFTP error')),
      delete: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
    }) as any);

    await expect(
      uploadToStrato('trip-123', 'photo.jpg', Buffer.from('data'), 'image/jpeg')
    ).rejects.toThrow('SFTP error');

    const instance = MockClient.mock.results[0].value;
    expect(instance.end).toHaveBeenCalledOnce();
  });
});

describe('deleteFromStrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRATO_SFTP_HOST = 'test.host';
    process.env.STRATO_SFTP_USER = 'testuser';
    process.env.STRATO_SFTP_PASSWORD = 'testpass';
  });

  it('calls delete with the given filePath', async () => {
    await deleteFromStrato('/_entwuerfe/trip-123/abc.jpg');

    const MockClient = vi.mocked(SftpClient);
    const instance = MockClient.mock.results[0].value;
    expect(instance.delete).toHaveBeenCalledWith('/_entwuerfe/trip-123/abc.jpg', true);
    expect(instance.end).toHaveBeenCalledOnce();
  });

  it('calls end even if delete throws', async () => {
    const MockClient = vi.mocked(SftpClient);
    MockClient.mockImplementationOnce(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockRejectedValue(new Error('delete error')),
      end: vi.fn().mockResolvedValue(undefined),
    }) as any);

    await expect(deleteFromStrato('/_entwuerfe/trip-123/abc.jpg')).resolves.toBeUndefined();
    const instance = MockClient.mock.results[0].value;
    expect(instance.end).toHaveBeenCalledOnce();
  });
});
