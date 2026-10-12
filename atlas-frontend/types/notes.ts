export interface NoteDoc {
  _id: string;
  title: string;
  content: string;
  user_id: string;
  region?: string;
  created_at: string;
  updated_at: string;
  category?: string;
  hasAttachment?: boolean;
  collection?: string[];
}
