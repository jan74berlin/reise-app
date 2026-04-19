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
    expect(result.value.order).toEqual(['p0', 'i0', 'i1', 'p1']);
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
    expect(result.value.order).toEqual(['i0', 'p0']);
  });
});

describe('buildOverviewPageEntry', () => {
  it('produces overview JSON entry in legacy PAGES shape', () => {
    const publishedEntries = [
      { ...sampleEntry, publish_seq: 1, date: '2026-06-10' },
      { ...sampleEntry, id: 'e2', publish_seq: 2, date: '2026-06-11', blocks: [{ type: 'text', content: 'Zweiter Tag.' }], media: [] },
    ];
    const result = buildOverviewPageEntry(sampleTrip as any, publishedEntries as any);
    expect(result.key).toBe('baltikum-2026');
    expect(result.value.title).toBe('Baltikum 2026');
    expect(result.value.paragraphs).toEqual(['Wohnmobiltour 6.–27. Juni 2026']);
    expect(result.value.images).toEqual([]);
    expect(result.value.start_date).toBe('2026-06-06');
    expect(result.value.end_date).toBe('2026-06-27');
    expect(result.value.isTripOverview).toBe(true);
  });

  it('produces empty paragraphs when no description', () => {
    const result = buildOverviewPageEntry({ ...sampleTrip, description: null } as any, []);
    expect(result.value.paragraphs).toEqual([]);
  });
});

describe('buildTagPageEntry with route_image_url', () => {
  it('prepends routeMap as i0 when entry has route_image_url', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x' };
    const entry = {
      id: 'e1', trip_id: 't1', date: '2025-07-19', publish_seq: 1,
      blocks: [
        { type: 'text', content: 'Erster Text' },
        { type: 'images', media_ids: ['m1'] },
      ],
      media: [{ id: 'm1', url: 'https://example.com/photo.jpg' }],
      route_image_url: 'https://example.com/route.png',
    };
    const { value } = buildTagPageEntry(trip as any, entry as any);
    expect(value.images[0]).toBe('https://example.com/route.png');
    expect(value.order[0]).toBe('i0');
    expect(value.images).toContain('https://example.com/photo.jpg');
  });

  it('does not add routeMap when route_image_url is null', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x' };
    const entry = {
      id: 'e1', trip_id: 't1', date: '2025-07-19', publish_seq: 1,
      blocks: [{ type: 'images', media_ids: ['m1'] }],
      media: [{ id: 'm1', url: 'https://example.com/photo.jpg' }],
      route_image_url: null,
    };
    const { value } = buildTagPageEntry(trip as any, entry as any);
    expect(value.images[0]).toBe('https://example.com/photo.jpg');
  });
});

describe('buildOverviewPageEntry with route_overview_url', () => {
  it('sets routeGif from trip.route_overview_url', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x', route_overview_url: 'https://example.com/overview.png' };
    const { value } = buildOverviewPageEntry(trip as any, []);
    expect((value as any).routeGif).toBe('https://example.com/overview.png');
  });

  it('omits routeGif when no overview', () => {
    const trip = { id: 't1', title: 'T', slug: 'urlaub-x' };
    const { value } = buildOverviewPageEntry(trip as any, []);
    expect((value as any).routeGif).toBeUndefined();
  });
});
