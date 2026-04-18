import type { Block, JournalEntry } from '../types';

export function normalizeBlocks(entry: Pick<JournalEntry, 'blocks' | 'media' | 'text'>): Block[] {
  const arr = Array.isArray(entry.blocks) ? entry.blocks : [];
  if (arr.length > 0) return arr;
  const synthesized: Block[] = [];
  if (entry.text) synthesized.push({ type: 'text', content: entry.text });
  if (entry.media.length > 0) {
    synthesized.push({ type: 'images', media_ids: entry.media.map(m => m.id) });
  }
  return synthesized;
}
