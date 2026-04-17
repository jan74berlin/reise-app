import { describe, it, expect, vi } from 'vitest';
import { resizeImage } from '../utils/resizeImage';

describe('resizeImage', () => {
  it('returns a File with JPEG mime type and correct dimensions', async () => {
    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob([''], { type: 'image/jpeg' }))),
      width: 0,
      height: 0,
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(mockCanvas),
    });

    const mockImg: { onload: null | (() => void); src: string; naturalWidth: number; naturalHeight: number } = {
      onload: null,
      src: '',
      naturalWidth: 2000,
      naturalHeight: 1500,
    };
    vi.stubGlobal('Image', vi.fn().mockImplementation(function (this: unknown) {
      setTimeout(() => mockImg.onload?.(), 0);
      return mockImg;
    }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test') });

    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const result = await resizeImage(file, 1280);
    expect(result.type).toBe('image/jpeg');
    expect(mockCanvas.width).toBe(1280);
    expect(mockCanvas.height).toBe(960); // 1500 * (1280/2000)
  });

  it('does not upscale images smaller than maxWidth', async () => {
    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob([''], { type: 'image/jpeg' }))),
      width: 0,
      height: 0,
    };
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(mockCanvas) });

    const mockImg: { onload: null | (() => void); src: string; naturalWidth: number; naturalHeight: number } = {
      onload: null, src: '', naturalWidth: 800, naturalHeight: 600,
    };
    vi.stubGlobal('Image', vi.fn().mockImplementation(function (this: unknown) {
      setTimeout(() => mockImg.onload?.(), 0);
      return mockImg;
    }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test') });

    const file = new File([''], 'small.jpg', { type: 'image/jpeg' });
    const result = await resizeImage(file, 1280);
    expect(result.type).toBe('image/jpeg');
    expect(mockCanvas.width).toBe(800); // not upscaled
    expect(mockCanvas.height).toBe(600);
  });
});
