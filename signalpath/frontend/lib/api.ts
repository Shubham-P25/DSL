export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(public code: string, message: string, public hint?: string, public retryable?: boolean) {
    super(message);
  }
}
export type GetToken = () => Promise<string | null>;

export interface Job {
  id: string; title?: string; file_name?: string; platform?: string; source_url?: string; source_kind: string; thumbnail_url?: string;
  duration_s?: number; status: "queued" | "running" | "done" | "error" | "cancelled"; stage: string; progress: number;
  method?: string; warnings?: string[]; error_code?: string; error_message?: string; error_hint?: string;
  created_at: string; source_lang?: string; target_langs?: string[]; options?: Record<string, any>;
  translations_ready?: string[];
}

export interface Word {
  t: string;
  s: number;
  e: number;
  p?: number | null;
  acc?: number | null;
  f?: string[];
  alt?: string | null;
  text?: string;
}

export interface Segment {
  id: number; idx: number; start: number; end: number; text: string; final_text?: string | null;
  correction?: string | null; correction_status?: string; trust_score?: number | null;
  trust_bucket: "green" | "yellow" | "red"; human_edited?: boolean;
  acc?: number | null;
  words?: Word[];
  translations?: Record<string, { text: string; lang?: string; engine?: string; verified?: boolean }>;
}

async function request<T>(path: string, getToken: GetToken, init: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  try {
    if (typeof getToken === "function") {
      token = await Promise.race([
        getToken().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
      ]);
    }
  } catch {
    token = null;
  }
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  console.log(`[SignalPath API] -> ${init.method || "GET"} ${API_BASE}${path}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch (err) {
    console.error(`[SignalPath API] Network Error on ${path}:`, err);
    throw new ApiError("NETWORK", "Cannot reach the backend.", "Is it running on port 8000?");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const e = data?.error;
    console.error(`[SignalPath API] Error ${res.status} on ${path}:`, data);
    throw new ApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? "Request failed.", e?.hint, e?.retryable);
  }
  const result = await res.json();
  console.log(`[SignalPath API] <- Response from ${path}:`, result);
  return result as T;
}

export const createJob = (g: GetToken, url: string, sourceLang = "en", correct = true, targetLang = "en") =>
  request<{ job_id: string; cached: boolean }>("/jobs", g, {
    method: "POST",
    body: JSON.stringify({ url, source_lang: sourceLang, correct, target_lang: targetLang })
  });

export const uploadJob = (g: GetToken, file: File, sourceLang = "en", correct = true, targetLang = "en") => {
  const form = new FormData();
  form.append("file", file);
  form.append("source_lang", sourceLang);
  form.append("target_lang", targetLang);
  form.append("correct", String(correct));
  return request<{ job_id: string; cached: boolean }>("/jobs/upload", g, { method: "POST", body: form });
};

export const listJobs = (g: GetToken) => request<Job[]>("/jobs", g);
export const getJob = (g: GetToken, id: string) => request<{ job: Job; segments: Segment[] }>(`/jobs/${id}`, g);
export const editSegment = (g: GetToken, id: string, segId: number, text: string) =>
  request<Segment>(`/jobs/${id}/segments/${segId}`, g, { method: "PATCH", body: JSON.stringify({ text }) });
export const deleteJob = (g: GetToken, id: string) => request<{ deleted: boolean }>(`/jobs/${id}`, g, { method: "DELETE" });
export const getHealth = (g: GetToken) => request<Record<string, string | boolean>>("/system/health", g);

export const requestTranslation = (g: GetToken, id: string, lang: string) =>
  request<{ status: string; job_id: string; lang: string }>(`/jobs/${id}/translate`, g, {
    method: "POST",
    body: JSON.stringify({ lang }),
  });

export const getLanguages = (g: GetToken) =>
  request<Array<{ code: string; name: string; native: string; font: string; tokenize: string }>>("/languages", g);

export interface OcrResult {
  success: boolean;
  document_type: string;
  detected_language: string;
  confidence_score: number;
  word_count: number;
  line_count: number;
  image_dimensions: { width: number; height: number };
  raw_text: string;
  structured_key_values: Array<{ key: string; value: string }>;
  formatted_markdown: string;
  line_items: Array<{ id: number; text: string; confidence: number; box?: any }>;
  processing_time_ms: number;
}

export const extractImageText = (g: GetToken, file?: File, imageUrl?: string) => {
  const form = new FormData();
  if (file) form.append("file", file);
  if (imageUrl) form.append("image_url", imageUrl);
  return request<OcrResult>("/ocr/extract", g, { method: "POST", body: form });
};

// Downloads need the auth header, so fetch as blob instead of using a plain <a href>.
export async function downloadExport(g: GetToken, id: string, format: "srt" | "vtt" | "txt", opts: { bom?: boolean; markLowTrust?: boolean; lang?: string } = {}) {
  let token: string | null = null;
  try {
    if (typeof g === "function") {
      token = await Promise.race([
        g().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
      ]);
    }
  } catch {
    token = null;
  }
  const qs = new URLSearchParams({ format, bom: String(!!opts.bom), mark_low_trust: String(!!opts.markLowTrust), lang: opts.lang || "en" });
  const res = await fetch(`${API_BASE}/jobs/${id}/export?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError("EXPORT_FAILED", "Could not export captions.");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const langSuffix = opts.lang && opts.lang !== "en" ? `_${opts.lang}` : "";
  a.download = `captions${langSuffix}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
