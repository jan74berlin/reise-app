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
    order: string[];
    tripSlug: string;
    publishSeq: number;
  };
}

export interface OverviewPageEntry {
  key: string;
  value: {
    title: string;
    paragraphs: string[];
    images: string[];
    isTripOverview: true;
    start_date: string | null;
    end_date: string | null;
  };
}

export function buildTagPageEntry(trip: Trip, entry: JournalEntry): TagPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');
  if (entry.publish_seq == null) throw new Error('entry.publish_seq required');

  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  const paragraphs: string[] = [];
  const images: string[] = [];
  const order: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.content) {
      order.push(`p${paragraphs.length}`);
      paragraphs.push(b.content);
    } else if (b.type === 'images' && b.media_ids) {
      for (const mid of b.media_ids) {
        const m = entry.media.find((x) => x.id === mid);
        if (m) {
          order.push(`i${images.length}`);
          images.push(m.url);
        }
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
      order,
      tripSlug: trip.slug,
      publishSeq: entry.publish_seq,
    },
  };
}

export function buildOverviewPageEntry(trip: Trip, _published: JournalEntry[]): OverviewPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');

  const paragraphs = trip.description ? [trip.description] : [];

  return {
    key: trip.slug,
    value: {
      title: trip.title,
      paragraphs,
      images: [],
      isTripOverview: true,
      start_date: trip.start_date ?? null,
      end_date: trip.end_date ?? null,
    },
  };
}
