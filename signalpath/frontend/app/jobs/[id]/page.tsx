"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { 
  getJob, 
  editSegment, 
  downloadExport, 
  Job, 
  Segment, 
  ApiError 
} from "@/lib/api";
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Sparkles, 
  ArrowLeft, 
  Filter, 
  Upload, 
  Edit3, 
  Check, 
  X, 
  AlertTriangle,
  FileText,
  Video,
  Clock,
  RotateCcw
} from "lucide-react";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  // Export options
  const [useBom, setUseBom] = useState(false);
  const [markLowTrust, setMarkLowTrust] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Multilingual & Dual View options
  const [selectedLang, setSelectedLang] = useState<"en" | "hi" | "mr" | "ta">("en");
  const [exportLang, setExportLang] = useState<"en" | "hi" | "mr" | "ta">("en");
  const [viewMode, setViewMode] = useState<"single" | "sideBySide">("single");

  const languages = [
    { code: "en", name: "English", native: "English", flag: "🇬🇧" },
    { code: "hi", name: "Hindi", native: "हिंदी", flag: "🇮🇳" },
    { code: "mr", name: "Marathi", native: "मराठी", flag: "🚩" },
    { code: "ta", name: "Tamil", native: "தமிழ்", flag: "🏛️" },
  ];

  const targetLangCode = (job?.target_langs && job.target_langs[0]) || "en";
  const sourceLangCode = (job?.source_lang && job.source_lang !== "auto") ? job.source_lang : "";
  const availableLanguages = languages;

  // Filter & editing
  const [filterLowTrustOnly, setFilterLowTrustOnly] = useState(false);
  const [editingSegId, setEditingSegId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [revealedOriginals, setRevealedOriginals] = useState<Record<number, boolean>>({});

  const isTerminal = job?.status === "done" || job?.status === "error" || job?.status === "cancelled";

  // Polling every 1500 ms
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let mounted = true;

    async function fetchStatus() {
      if (!id) return;
      try {
        const data = await getJob(getToken, id);
        if (!mounted) return;
        setJob(data.job);
        setSegments(data.segments);
        setLoading(false);

        if (data.job?.target_langs && data.job.target_langs[0]) {
          const tLang = data.job.target_langs[0] as any;
          if (["en", "hi", "mr", "ta"].includes(tLang)) {
            setSelectedLang((prev) => (prev === "en" ? tLang : prev));
            setExportLang((prev) => (prev === "en" ? tLang : prev));
          }
        }

        if (data.job.status !== "done" && data.job.status !== "error" && data.job.status !== "cancelled") {
          timer = setTimeout(fetchStatus, 1500);
        }
      } catch (err: any) {
        if (!mounted) return;
        setError(err instanceof ApiError ? err : new ApiError("LOAD_ERROR", "Could not fetch job status."));
        setLoading(false);
      }
    }

    fetchStatus();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, getToken]);

  const handleExport = async (format: "srt" | "vtt" | "txt") => {
    if (!job) return;
    setExporting(format);
    try {
      await downloadExport(getToken, job.id, format, {
        bom: useBom,
        markLowTrust: markLowTrust,
        lang: exportLang,
      });
    } catch (err: any) {
      alert(err.message || "Failed to download export file.");
    } finally {
      setExporting(null);
    }
  };

  const handleStartEdit = (seg: Segment) => {
    setEditingSegId(seg.id);
    setEditText(seg.final_text || seg.text);
  };

  const handleSaveEdit = async (segId: number) => {
    if (!job) return;
    setSavingEdit(true);
    try {
      const updated = await editSegment(getToken, job.id, segId, editText);
      setSegments((prev) => prev.map((s) => (s.id === segId ? { ...s, ...updated } : s)));
      setEditingSegId(null);
    } catch (err: any) {
      alert(err.message || "Failed to save caption edit.");
    } finally {
      setSavingEdit(false);
    }
  };

  const formatTimestamp = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  };

  const stages = [
    { key: "fetching_audio", label: "Fetching Audio" },
    { key: "transcribing", label: "Transcribing" },
    { key: "correcting", label: "Correcting" },
    { key: "done", label: "Complete" },
  ];

  const getStageIndex = (stage: string) => {
    switch (stage) {
      case "fetching_audio": return 0;
      case "transcribing": return 1;
      case "correcting": return 2;
      case "done": return 3;
      default: return 0;
    }
  };

  const displayedSegments = filterLowTrustOnly
    ? segments.filter((s) => s.trust_bucket !== "green")
    : segments;

  if (loading && !job) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">Connecting to job worker...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{error.message}</h2>
        {error.hint && <p className="text-sm text-slate-600">{error.hint}</p>}
        <Link
          href="/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Studio
        </Link>
      </div>
    );
  }

  if (!job) return null;

  const currentStageIdx = getStageIndex(job.stage);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-semibold text-brand-600 uppercase tracking-wider">
              {job.platform || job.source_kind}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate max-w-2xl">
            {job.title || job.file_name || "Caption Processing"}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/new"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
          >
            New Job
          </Link>
          <Link
            href="/library"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
          >
            Library
          </Link>
        </div>
      </div>

      {/* PLATFORM CAPTIONS WARNING BANNER */}
      {job.method === "platform_captions" && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs sm:text-sm">
              Audio was restricted by the site, so the platform&apos;s existing subtitles were extracted.
            </p>
          </div>
          <Link
            href="/new"
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-xs shrink-0 self-start sm:self-auto"
          >
            Upload file for full AI captioning
          </Link>
        </div>
      )}

      {/* PROCESSING STATE: STEPPER & LIVE ROWS */}
      {job.status === "running" || job.status === "queued" ? (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-8">
          {/* STEPPER */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              <span>Pipeline Stage: {job.stage.replace("_", " ")}</span>
              <span className="text-brand-600">{Math.round(job.progress)}%</span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-600 to-cyan-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(job.progress, 5)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            <div className="grid grid-cols-4 gap-2 pt-2">
              {stages.map((stg, i) => {
                const isPassed = currentStageIdx > i;
                const isCurrent = currentStageIdx === i;
                return (
                  <div key={stg.key} className="text-center space-y-1">
                    <div
                      className={`w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        isPassed
                          ? "bg-emerald-500 text-white"
                          : isCurrent
                          ? "bg-brand-600 text-white ring-4 ring-brand-100"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {isPassed ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <div
                      className={`text-[11px] font-semibold truncate ${
                        isCurrent ? "text-brand-600" : isPassed ? "text-slate-800" : "text-slate-400"
                      }`}
                    >
                      {stg.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LIVE PROGRESS ROWS */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Live Transcript ({segments.length} segments detected)
            </h3>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
              {segments.map((seg, idx) => (
                <motion.div
                  key={seg.id || idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between gap-4"
                >
                  <span className="font-mono text-slate-400 shrink-0">
                    {formatTimestamp(seg.start)}
                  </span>
                  <span className="text-slate-700 flex-1 truncate font-medium">
                    {seg.final_text || seg.text}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      seg.trust_bucket === "green"
                        ? "bg-emerald-100 text-emerald-700"
                        : seg.trust_bucket === "yellow"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {Math.round((seg.trust_score || 0.8) * 100)}%
                  </span>
                </motion.div>
              ))}
              {segments.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Streaming audio chunks to faster-whisper model...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : job.status === "error" ? (
        /* ERROR STATE */
        <div className="bg-white rounded-2xl p-8 border border-rose-200 shadow-xs text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">
              {job.error_message || "Captioning Encountered an Error"}
            </h3>
            {job.error_hint && <p className="text-xs text-slate-500">{job.error_hint}</p>}
          </div>

          <div className="pt-3 flex items-center justify-center gap-3">
            <Link
              href="/new"
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-brand-600 hover:bg-brand-700 shadow-xs flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try Again
            </Link>
            <Link
              href="/status"
              className="px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Check Status
            </Link>
          </div>
        </div>
      ) : (
        /* COMPLETED RESULTS: 2-COLUMN VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: MEDIA PLAYER & EXPORT PANEL */}
          <div className="lg:col-span-5 space-y-6 sticky top-24">
            {/* VIDEO PLAYER / PREVIEW */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {job.source_url && job.source_url.includes("youtube.com") && job.source_url.match(/(?:v=|youtu\.be\/)([\w-]{11})/) ? (
                <div className="relative pt-[56.25%] bg-slate-900">
                  <iframe
                    src={`https://www.youtube.com/embed/${job.source_url.match(/(?:v=|youtu\.be\/)([\w-]{11})/)![1]}`}
                    title={job.title || "Video"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              ) : job.thumbnail_url ? (
                <img
                  src={job.thumbnail_url}
                  alt=""
                  className="w-full h-48 sm:h-56 object-cover bg-slate-900"
                />
              ) : (
                <div className="w-full h-48 bg-slate-900 text-slate-500 flex flex-col items-center justify-center gap-2">
                  <Video className="w-8 h-8 stroke-1 text-slate-400" />
                  <span className="text-xs">Audio track processed</span>
                </div>
              )}

              <div className="p-4 space-y-2">
                <div className="font-bold text-sm text-slate-900 truncate">
                  {job.title || job.file_name || "Video Source"}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Method: {job.method || "whisper"}</span>
                  {job.duration_s && (
                    <span>
                      {Math.floor(job.duration_s / 60)}:
                      {String(Math.floor(job.duration_s % 60)).padStart(2, "0")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* EXPORT SETTINGS & BUTTONS */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">Export Captions</h3>
                <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">
                  Editor-Ready
                </span>
              </div>

              {/* LANGUAGE PICKER FOR EXPORT */}
              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Export Language</span>
                  <span className="text-brand-600 font-semibold">{languages.find(l => l.code === exportLang)?.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {availableLanguages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setExportLang(l.code as any)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all border text-left flex items-center gap-2 cursor-pointer ${
                        exportLang === l.code
                          ? "border-brand-500 bg-brand-50/70 text-brand-700 shadow-2xs ring-1 ring-brand-500/20"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-base">{l.flag}</span>
                      <span className="truncate">{l.native}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* OPTIONS TOGGLES */}
              <div className="space-y-2.5 pt-1 border-t border-slate-100 text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={useBom}
                    onChange={(e) => setUseBom(e.target.checked)}
                    className="rounded-sm border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  <span>Include UTF-8 BOM (Premiere / Vegas Pro)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={markLowTrust}
                    onChange={(e) => setMarkLowTrust(e.target.checked)}
                    className="rounded-sm border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  <span>Mark low-trust lines with [?] in export</span>
                </label>
              </div>

              {/* BUTTONS */}
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleExport("srt")}
                  disabled={exporting !== null}
                  className="py-2.5 px-3 rounded-xl bg-brand-600 text-white font-bold text-xs hover:bg-brand-700 shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting === "srt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>SRT</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("vtt")}
                  disabled={exporting !== null}
                  className="py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs hover:bg-slate-50 shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting === "vtt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>VTT</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("txt")}
                  disabled={exporting !== null}
                  className="py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-xs hover:bg-slate-50 shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting === "txt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>TXT</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: CAPTION LIST */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* HEADER & MULTI-LANGUAGE SWITCHER */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                <span className="font-bold text-sm text-slate-900">
                  {displayedSegments.length} Captions
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Language Switcher: English and Selected Language + Dual View */}
                <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
                  {availableLanguages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setSelectedLang(l.code as any);
                        if (viewMode === "sideBySide") setViewMode("single");
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedLang === l.code && viewMode === "single"
                          ? "bg-white text-brand-600 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span>{l.flag} {l.native}</span>
                    </button>
                  ))}
                  {availableLanguages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setViewMode(viewMode === "single" ? "sideBySide" : "single")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        viewMode === "sideBySide"
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:text-slate-900"
                      }`}
                    >
                      Dual View
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setFilterLowTrustOnly(!filterLowTrustOnly)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    filterLowTrustOnly
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>Low-trust</span>
                </button>
              </div>
            </div>

            {/* ROWS */}
            <div className="divide-y divide-slate-100 max-h-[75vh] overflow-y-auto">
              {displayedSegments.map((seg) => {
                const isEditing = editingSegId === seg.id;
                const isCorrected = Boolean(seg.correction);
                const showOriginal = revealedOriginals[seg.id];

                const sourceLang = (job?.source_lang && job.source_lang !== "auto" ? job.source_lang : "en").toLowerCase();
                const nativeSpokenText = seg.translations?.[sourceLang]?.text || seg.text;
                const currentText = seg.translations?.[selectedLang]?.text || (selectedLang === sourceLang ? nativeSpokenText : (seg.final_text || seg.text));

                return (
                  <div
                    key={seg.id}
                    className="p-4 hover:bg-slate-50/60 transition-colors space-y-2 group"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 font-mono text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(seg.start)} — {formatTimestamp(seg.end)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedLang !== "en" && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                            {languages.find((l) => l.code === selectedLang)?.native}
                          </span>
                        )}

                        {seg.human_edited && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            Edited
                          </span>
                        )}

                        {isCorrected && (
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedOriginals((prev) => ({
                                ...prev,
                                [seg.id]: !prev[seg.id],
                              }))
                            }
                            className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                          >
                            Corrected {showOriginal ? "▲" : "▼"}
                          </button>
                        )}

                        {seg.correction_status === "verified_by_gemini" && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                            ✨ Verified
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            seg.trust_bucket === "green"
                              ? "bg-emerald-100 text-emerald-800"
                              : seg.trust_bucket === "yellow"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {Math.round((seg.trust_score || 0.8) * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* TEXT / EDITING */}
                    {isEditing ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(seg.id);
                            if (e.key === "Escape") setEditingSegId(null);
                          }}
                          autoFocus
                          className="flex-1 px-3 py-1.5 rounded-lg border border-brand-500 text-sm text-slate-900 focus:outline-hidden ring-2 ring-brand-500/20"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(seg.id)}
                          disabled={savingEdit}
                          className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSegId(null)}
                          className="p-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : viewMode === "sideBySide" ? (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm">
                            {languages.find((l) => l.code === sourceLang)?.native || "Original"}
                          </span>
                          <span>{nativeSpokenText}</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 bg-indigo-50/70 border border-indigo-100/90 p-2.5 rounded-xl flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded-sm mr-2">
                              {languages.find((l) => l.code === selectedLang)?.native || selectedLang}
                            </span>
                            <span>{currentText}</span>
                          </div>
                          <Edit3
                            onClick={() => handleStartEdit(seg)}
                            className="w-3.5 h-3.5 text-slate-400 hover:text-brand-600 cursor-pointer shrink-0 mt-0.5"
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleStartEdit(seg)}
                        className="text-sm font-medium text-slate-800 cursor-pointer hover:text-brand-600 transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <span>{currentText}</span>
                          {selectedLang !== "en" && currentText && (
                            <div className="text-[11px] text-indigo-600 font-medium">
                              {languages.find((l) => l.code === selectedLang)?.native} Caption
                            </div>
                          )}
                        </div>
                        <Edit3 className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                      </div>
                    )}

                    {/* REVEALED ORIGINAL ACCORDION */}
                    {showOriginal && (
                      <div className="p-2 rounded-lg bg-slate-100 text-slate-600 text-xs italic space-y-1">
                        <span className="font-semibold text-slate-500 not-italic">Original Whisper:</span>{" "}
                        {seg.text}
                      </div>
                    )}
                  </div>
                );
              })}

              {displayedSegments.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">
                  {filterLowTrustOnly
                    ? "No low-trust segments found! All captions passed with high confidence."
                    : "No segments available."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
