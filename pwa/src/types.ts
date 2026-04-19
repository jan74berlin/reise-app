export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'member';
  family_id: string;
}

export interface Trip {
  id: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  slug?: string | null;
  route_overview_url?: string | null;
  route_overview_updated_at?: string | null;
}

export interface Media {
  id: string;
  journal_entry_id: string;
  file_path: string;
  url: string;
  filename: string;
}

export type Block =
  | { type: 'text'; content: string }
  | { type: 'images'; media_ids: string[] };

export interface JournalEntry {
  id: string;
  trip_id: string;
  night_id?: string;
  user_id: string;
  text?: string;
  blocks?: Block[];
  date?: string;
  is_published?: boolean;
  publish_seq?: number | null;
  first_published_at?: string | null;
  created_at: string;
  updated_at: string;
  media: Media[];
  route_image_url?: string | null;
  route_meta?: {
    distance_km: number;
    walking_km?: number;
    duration_minutes: number;
    modes: string[];
    segment_count?: number;
    source: string;
    imported_at: string;
  } | null;
}

export interface TimelinePreviewDay {
  date: string;
  distance_km: number;
  walking_km: number;
  duration_minutes: number;
  modes: string[];
  has_motorized: boolean;
  segment_count: number;
  has_existing_route_image: boolean;
}

export interface TimelinePreviewResponse {
  trip_id: string;
  trip_start: string;
  trip_end: string;
  days: TimelinePreviewDay[];
  skipped_outside_range: string[];
}

export interface TimelineImportResult {
  processed: { date: string; journal_entry_id: string; route_image_url: string; created: boolean; meta: any }[];
  skipped: { date: string; reason: string }[];
  errors: { date?: string; error?: string; overview?: string }[];
  overview_url: string | null;
}
