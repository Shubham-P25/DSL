"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { listJobs, deleteJob, Job, ApiError } from "@/lib/api";
import { 
  Search, 
  Trash2, 
  Video, 
  Clock, 
  Calendar, 
  PlusCircle, 
  Loader2, 
  AlertCircle, 
  ExternalLink,
  CheckCircle2,
  XCircle,
  FileText,
  ScanText,
  Sparkles,
  Copy,
  Check,
  X
} from "lucide-react";

export default function LibraryPage() {
  const { getToken } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "captions" | "ocr">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewOcrJob, setPreviewOcrJob] = useState<Job | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await listJobs(getToken);
        setJobs(data);
      } catch (err: any) {
        setError(err instanceof ApiError ? err : new ApiError("LOAD_FAILED", "Failed to load library items."));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  const handleDelete = async (jobId: string, title?: string) => {
    if (!window.confirm(`Delete "${title || "this item"}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(jobId);
    try {
      await deleteJob(getToken, jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (previewOcrJob?.id === jobId) setPreviewOcrJob(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete item.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const videoJobsCount = jobs.filter((j) => j.source_kind !== "image_ocr").length;
  const ocrJobsCount = jobs.filter((j) => j.source_kind === "image_ocr").length;

  const filteredJobs = jobs.filter((j) => {
    const isOcr = j.source_kind === "image_ocr";
    if (activeTab === "captions" && isOcr) return false;
    if (activeTab === "ocr" && !isOcr) return false;

    const query = search.toLowerCase();
    const title = (j.title || j.file_name || "").toLowerCase();
    const platform = (j.platform || j.source_kind || "").toLowerCase();
    const docType = (j.options?.document_type || "").toLowerCase();
    const textPreview = (j.options?.full_text || "").toLowerCase();

    return title.includes(query) || platform.includes(query) || docType.includes(query) || textPreview.includes(query);
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Content Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            Access past video captions, review transcripts, and inspect extracted image text.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <Link
            href="/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-brand-600 hover:bg-brand-700 shadow-sm shadow-brand-500/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Video Caption</span>
          </Link>
          <Link
            href="/ocr"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all cursor-pointer"
          >
            <ScanText className="w-4 h-4" />
            <span>New Image OCR</span>
          </Link>
        </div>
      </div>

      {/* FILTER TABS & SEARCH BOX */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* TABS */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Items ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("captions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "captions" ? "bg-white text-brand-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video Captions ({videoJobsCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ocr")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "ocr" ? "bg-white text-indigo-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ScanText className="w-3.5 h-3.5" />
            <span>Image OCR ({ocrJobsCount})</span>
          </button>
        </div>

        {/* SEARCH BOX */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles, platforms, or text..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-xs"
          />
        </div>
      </div>

      {/* CONTENT GRID */}
      {loading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-medium">Loading library items...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-600 max-w-md mx-auto space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <h3 className="font-bold text-sm">{error.message}</h3>
          {error.hint && <p className="text-xs text-slate-500">{error.hint}</p>}
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center space-y-4 max-w-xl mx-auto shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
            {activeTab === "ocr" ? <ScanText className="w-6 h-6 stroke-1 text-indigo-500" /> : <Video className="w-6 h-6 stroke-1" />}
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 text-base">
              {search ? "No matching items found" : "Your library is empty"}
            </h3>
            <p className="text-xs text-slate-500">
              {search
                ? "Try searching for another keyword or clear the search input."
                : activeTab === "ocr"
                ? "Extract text from images in the OCR Studio to archive documents here."
                : "Process any video URL or image file to build your content archive."}
            </p>
          </div>
          {!search && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link
                href="/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-brand-600 hover:bg-brand-700 shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Start Video Caption
              </Link>
              <Link
                href="/ocr"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 shadow-xs"
              >
                <ScanText className="w-3.5 h-3.5" /> Extract Image Text
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredJobs.map((job) => {
              const isOcr = job.source_kind === "image_ocr";

              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col group"
                >
                  {/* CARD HEADER / THUMBNAIL */}
                  {isOcr ? (
                    <div
                      onClick={() => setPreviewOcrJob(job)}
                      className="block relative pt-[45%] bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 overflow-hidden cursor-pointer"
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <ScanText className="w-8 h-8 text-indigo-400 group-hover:scale-110 transition-transform mb-1" />
                        <span className="text-[11px] font-bold text-indigo-200">
                          {job.options?.document_type || "Extracted Image Document"}
                        </span>
                      </div>

                      <div className="absolute top-3 left-3">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-indigo-500/80 text-white backdrop-blur-xs flex items-center gap-1">
                          <ScanText className="w-3 h-3" /> Image OCR
                        </span>
                      </div>

                      {job.options?.word_count && (
                        <div className="absolute bottom-3 right-3">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-900/90 text-indigo-300">
                            {job.options.word_count} words
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link href={`/jobs/${job.id}`} className="block relative pt-[52%] bg-slate-900 overflow-hidden">
                      {job.thumbnail_url ? (
                        <img
                          src={job.thumbnail_url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                          <Video className="w-8 h-8 stroke-1" />
                        </div>
                      )}

                      <div className="absolute top-3 left-3">
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-slate-900/80 text-white backdrop-blur-xs">
                          {job.platform || job.source_kind}
                        </span>
                      </div>

                      {job.duration_s && (
                        <div className="absolute bottom-3 right-3">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-900/90 text-white">
                            {Math.floor(job.duration_s / 60)}:
                            {String(Math.floor(job.duration_s % 60)).padStart(2, "0")}
                          </span>
                        </div>
                      )}
                    </Link>
                  )}

                  {/* DETAILS */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      {isOcr ? (
                        <button
                          type="button"
                          onClick={() => setPreviewOcrJob(job)}
                          className="font-bold text-sm text-slate-900 hover:text-indigo-600 line-clamp-2 transition-colors text-left"
                        >
                          {job.title || job.file_name || "Extracted Image Document"}
                        </button>
                      ) : (
                        <Link
                          href={`/jobs/${job.id}`}
                          className="font-bold text-sm text-slate-900 hover:text-brand-600 line-clamp-2 transition-colors"
                        >
                          {job.title || job.file_name || "Untitled Video"}
                        </Link>
                      )}

                      {/* SNIPPET FOR OCR */}
                      {isOcr && job.options?.full_text && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 font-mono bg-slate-50 p-2 rounded-lg border border-slate-100">
                          &ldquo;{job.options.full_text.slice(0, 100)}...&rdquo;
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        {isOcr ? (
                          <span className="text-indigo-600 font-semibold">
                            {Math.round((job.options?.confidence_score || 0.95) * 100)}% Conf.
                          </span>
                        ) : (
                          <span>{job.method || "whisper"}</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        {job.status === "done" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Done
                          </span>
                        ) : job.status === "running" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                            <XCircle className="w-3.5 h-3.5" /> Error
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isOcr ? (
                          <button
                            type="button"
                            onClick={() => setPreviewOcrJob(job)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                          >
                            View Text
                          </button>
                        ) : (
                          <Link
                            href={`/jobs/${job.id}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Open
                          </Link>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDelete(job.id, job.title)}
                          disabled={deletingId === job.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Item"
                        >
                          {deletingId === job.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* OCR PREVIEW MODAL */}
      <AnimatePresence>
        {previewOcrJob && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <ScanText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{previewOcrJob.title}</h3>
                    <p className="text-[11px] text-slate-500">
                      {previewOcrJob.options?.document_type || "Extracted Document"} • {previewOcrJob.options?.word_count || 0} words
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOcrJob(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                    Extracted Text Content
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(previewOcrJob.options?.full_text || "")}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied!" : "Copy Text"}</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto select-all">
                  {previewOcrJob.options?.full_text || "No text available."}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <Link
                  href="/ocr"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <span>Open OCR Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => setPreviewOcrJob(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 text-slate-800 hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

