import type { Block, JournalEntry } from '../types';

export function normalizeBlocks(entry: Pick<JournalEntry, 'blocks' | 'media' | 'text'>): Block[] {
  // Explicit array (even empty) is the user's source of truth — never synthesize over it.
  if (Array.isArray(entry.blocks)) return entry.blocks;
  // Legacy fallback: blocks is {} or null/undefined. Synthesize from media + text so
  // pre-blocks entries stay visible on first edit.
  const synthesized: Block[] = [];
  if (entry.text) synthesized.push({ type: 'text', content: entry.text });
  if (entry.media.length > 0) {
    synthesized.push({ type: 'images', media_ids: entry.media.map(m => m.id) });
  }
  return synthesized;
}
