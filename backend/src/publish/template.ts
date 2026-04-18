interface Trip {
  id: string;
  title: string;
  slug: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface Media {
  id: string;
  url: string;
  filename?: string;
}

interface Block {
  type: 'text' | 'images';
  content?: string;
  media_ids?: string[];
}

interface JournalEntry {
  id: string;
  trip_id: string;
  date: string | null;
  publish_seq: number | null;
  blocks: Block[] | null;
  media: Media[];
}

export interface TagPageEntry {
  key: string;
  value: {
    title: string;
    date: string | null;
    paragraphs: string[];
    images: string[];
    tripSlug: string;
    publishSeq: number;
  };
}

export interface OverviewPageEntry {
  key: string;
  value: {
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    isTripOverview: true;
    days: Array<{
      seq: number;
      date: string | null;
      title: string;
      thumbnail: string | null;
      preview_text: string;
    }>;
  };
}

export function buildTagPageEntry(trip: Trip, entry: JournalEntry): TagPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');
  if (entry.publish_seq == null) throw new Error('entry.publish_seq required');

  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  const paragraphs: string[] = [];
  const images: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.content) {
      paragraphs.push(b.content);
    } else if (b.type === 'images' && b.media_ids) {
      for (const mid of b.media_ids) {
        const m = entry.media.find((x) => x.id === mid);
        if (m) images.push(m.url);
      }
    }
  }

  return {
    key: `${trip.slug}/tag-${entry.publish_seq}`,
    value: {
      title: `Tag ${entry.publish_seq}`,
      date: entry.date,
      paragraphs,
      images,
      tripSlug: trip.slug,
      publishSeq: entry.publish_seq,
    },
  };
}

export function buildOverviewPageEntry(trip: Trip, published: JournalEntry[]): OverviewPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');

  const sorted = [...published].sort((a, b) => {
    const da = a.date ?? '';
    const db = b.date ?? '';
    return da.localeCompare(db);
  });

  const days = sorted.map((e) => {
    const blocks = Array.isArray(e.blocks) ? e.blocks : [];
    const firstText = blocks.find((b) => b.type === 'text' && b.content);
    const firstImgBlock = blocks.find((b) => b.type === 'images' && b.media_ids && b.media_ids.length > 0);
    const firstImg = firstImgBlock ? e.media.find((m) => m.id === firstImgBlock.media_ids![0]) : null;
    const preview = firstText?.content ?? '';
    return {
      seq: e.publish_seq!,
      date: e.date,
      title: `Tag ${e.publish_seq}`,
      thumbnail: firstImg?.url ?? null,
      preview_text: preview.slice(0, 160),
    };
  });

  return {
    key: trip.slug,
    value: {
      title: trip.title,
      description: trip.description ?? null,
      start_date: trip.start_date ?? null,
      end_date: trip.end_date ?? null,
      isTripOverview: true,
      days,
    },
  };
}
