import { describe, it, expect } from 'vitest';
import { buildTagPageEntry, buildOverviewPageEntry } from './template';

const sampleTrip = {
  id: 't1', title: 'Baltikum 2026', slug: 'baltikum-2026',
  description: 'Wohnmobiltour 6.–27. Juni 2026',
  start_date: '2026-06-06', end_date: '2026-06-27',
};
const sampleEntry = {
  id: 'e1', trip_id: 't1', date: '2026-06-10', publish_seq: 1,
  blocks: [
    { type: 'text', content: 'Erster Tag in Polen.' },
    { type: 'images', media_ids: ['m1', 'm2'] },
    { type: 'text', content: 'Wetter super!' },
  ],
  media: [
    { id: 'm1', url: 'https://xn--tnhardt-90a.de/_entwuerfe/t1/abc.jpg', filename: 'a.jpg' },
    { id: 'm2', url: 'https://xn--tnhardt-90a.de/_entwuerfe/t1/def.jpg', filename: 'b.jpg' },
  ],
};

describe('buildTagPageEntry', () => {
  it('produces PAGES-shaped JSON entry', () => {
    const result = buildTagPageEntry(sampleTrip as any, sampleEntry as any);
    expect(result.key).toBe('baltikum-2026/tag-1');
    expect(result.value.title).toBe('Tag 1');
    expect(result.value.date).toBe('2026-06-10');
    expect(result.value.tripSlug).toBe('baltikum-2026');
    expect(result.value.publishSeq).toBe(1);
    expect(result.value.paragraphs).toEqual(['Erster Tag in Polen.', 'Wetter super!']);
    expect(result.value.images).toEqual([
      'https://xn--tnhardt-90a.de/_entwuerfe/t1/abc.jpg',
      'https://xn--tnhardt-90a.de/_entwuerfe/t1/def.jpg',
    ]);
  });

  it('orders paragraphs and images by block order', () => {
    const entry = {
      ...sampleEntry,
      blocks: [
        { type: 'images', media_ids: ['m1'] },
        { type: 'text', content: 'Erst Foto, dann Text.' },
      ],
    };
    const result = buildTagPageEntry(sampleTrip as any, entry as any);
    expect(result.value.images).toEqual(['https://xn--tnhardt-90a.de/_entwuerfe/t1/abc.jpg']);
    expect(result.value.paragraphs).toEqual(['Erst Foto, dann Text.']);
  });
});

describe('buildOverviewPageEntry', () => {
  it('produces overview JSON entry', () => {
    const publishedEntries = [
      { ...sampleEntry, publish_seq: 1, date: '2026-06-10' },
      { ...sampleEntry, id: 'e2', publish_seq: 2, date: '2026-06-11', blocks: [{ type: 'text', content: 'Zweiter Tag.' }], media: [] },
    ];
    const result = buildOverviewPageEntry(sampleTrip as any, publishedEntries as any);
    expect(result.key).toBe('baltikum-2026');
    expect(result.value.title).toBe('Baltikum 2026');
    expect(result.value.description).toBe('Wohnmobiltour 6.–27. Juni 2026');
    expect(result.value.start_date).toBe('2026-06-06');
    expect(result.value.isTripOverview).toBe(true);
    expect(result.value.days).toHaveLength(2);
    expect(result.value.days[0]).toMatchObject({ seq: 1, date: '2026-06-10', preview_text: 'Erster Tag in Polen.' });
    expect(result.value.days[1]).toMatchObject({ seq: 2, date: '2026-06-11' });
  });
});
