import { describe, it, expect } from 'vitest';
import { slugify, ensureUniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Baltikum 2026')).toBe('baltikum-2026');
  });
  it('handles umlauts', () => {
    expect(slugify('Österreich Südtirol')).toBe('oesterreich-suedtirol');
  });
  it('removes special chars', () => {
    expect(slugify('Urlaub 2024!@#')).toBe('urlaub-2024');
  });
  it('collapses multiple hyphens', () => {
    expect(slugify('A  -  B')).toBe('a-b');
  });
  it('trims leading/trailing hyphens', () => {
    expect(slugify('-foo-')).toBe('foo');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns base slug if not taken', async () => {
    const existing = new Set<string>();
    expect(await ensureUniqueSlug('baltikum-2026', existing)).toBe('baltikum-2026');
  });
  it('appends -2 on first collision', async () => {
    const existing = new Set(['baltikum-2026']);
    expect(await ensureUniqueSlug('baltikum-2026', existing)).toBe('baltikum-2026-2');
  });
  it('appends -3 on second collision', async () => {
    const existing = new Set(['baltikum-2026', 'baltikum-2026-2']);
    expect(await ensureUniqueSlug('baltikum-2026', existing)).toBe('baltikum-2026-3');
  });
});
