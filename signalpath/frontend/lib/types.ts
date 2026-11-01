export type JobStatus = "queued" | "running" | "done" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  source_url?: string;
  title?: string;
  status: JobStatus | string;
  stage: string;
  progress: number;
  warnings?: string[];
  error_message?: string;
}

export interface JobSnapshot { job: Job; segments: Segment[]; summary?: Summary | null }

export interface Segment {
  id?: number;
  start: number;
  end: number;
  text: string;
  final_text?: string | null;
  trust_score?: number | null;
  trust_bucket: string;
  correction?: string | null;
  translations?: Record<string, { text?: string; trust?: number }>;
}

export interface Summary {
  tldr: string;
  key_points: Array<{ text: string; timestamp?: number }>;
  chapters: Array<{ title: string; start: number; end: number }>;
  keywords: string[];
  grounding_score?: number | null;
}
