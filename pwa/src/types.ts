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
}
