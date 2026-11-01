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
  requestTranslation,
  getLanguages,
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
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [exportLang, setExportLang] = useState<string>("en");
  const [viewMode, setViewMode] = useState<"single" | "sideBySide">("single");
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);

  const [languagesList, setLanguagesList] = useState<Array<{ code: string; name: string; native: string; flag: string }>>([
    { code: "en", name: "English", native: "English", flag: "🇬🇧" },
    { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
    { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
    { code: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  ]);

  const targetLangCode = (job?.target_langs && job.target_langs[0]) || "en";
  const sourceLangCode = (job?.source_lang && job.source_lang !== "auto") ? job.source_lang : "en";
  const availableLanguages = languagesList;

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
          const tLang = data.job.target_langs[0] as string;
          setSelectedLang((prev) => (prev === "en" ? tLang : prev));
          setExportLang((prev) => (prev === "en" ? tLang : prev));
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
    getLanguages(getToken)
      .then((langs) => {
        if (mounted && langs && langs.length > 0) {
          setLanguagesList(langs.map((l) => ({
            code: l.code,
            name: l.name,
            native: l.native,
            flag: l.code === "en" ? "🇬🇧" : l.code === "hi" ? "🇮🇳" : l.code === "de" ? "🇩🇪" : l.code === "nl" ? "🇳🇱" : "🌐",
          })));
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, getToken]);

  const handleSelectLang = async (langCode: string) => {
    setSelectedLang(langCode);
    setExportLang(langCode);
    if (viewMode === "sideBySide") setViewMode("single");

    const isSource = langCode === (job?.source_lang || "en");
    if (isSource) {
      setTranslatingLang(null);
      return;
    }

    // If translations already present in client segment state, switch instantly
    const hasTranslationInSegments = segments.some((s) => s.translations?.[langCode]?.text);
    if (hasTranslationInSegments) {
      setTranslatingLang(null);
      return;
    }

    if (id && job?.status === "done") {
      setTranslatingLang(langCode);
      try {
        await requestTranslation(getToken, id, langCode);
      } catch (err) {
        console.warn("Could not request translation:", err);
      }

      // Fast polling loop: check every 350ms until translation is ready
      let attempts = 0;
      const pollTimer = setInterval(async () => {
        attempts++;
        try {
          const data = await getJob(getToken, id);
          const ready =
            data.job?.translations_ready?.includes(langCode) ||
            data.segments.some((s) => s.translations?.[langCode]?.text);
          if (ready || attempts > 20) {
            clearInterval(pollTimer);
            setJob(data.job);
            setSegments(data.segments);
            setTranslatingLang(null);
          }
        } catch {
          if (attempts > 12) {
            clearInterval(pollTimer);
            setTranslatingLang(null);
          }
        }
      }, 350);
    }
  };

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

  // Coalesce fragmented or single-word segments into natural sentences
  const coalesceDisplaySegments = (segs: Segment[]): Segment[] => {
    if (!segs || segs.length === 0) return [];
    const wordsTotal = segs.reduce(
      (acc, s) => acc + (s.final_text || s.text || "").trim().split(/\s+/).filter(Boolean).length,
      0
    );
    const avgWords = wordsTotal / segs.length;
    if (avgWords > 3) {
      return segs; // Already natural sentences
    }

    const out: Segment[] = [];
    let curr = { ...segs[0] };
    let currTexts = [(curr.final_text || curr.text || "").trim()];
    let currWords = [...(curr.words || [])];

    for (let i = 1; i < segs.length; i++) {
      const nextSeg = segs[i];
      const nextText = (nextSeg.final_text || nextSeg.text || "").trim();
      const candText = [...currTexts, nextText].join(" ");
      const wCount = candText.split(/\s+/).filter(Boolean).length;
      const dur = nextSeg.end - curr.start;
      const gap = nextSeg.start - curr.end;
      const endsSentence = Boolean(currTexts[currTexts.length - 1].match(/[.!?।]$/));

      if (endsSentence || gap > 1.2 || wCount > 10 || dur > 4.5) {
        out.push({
          ...curr,
          final_text: currTexts.join(" "),
          text: currTexts.join(" "),
          words: currWords,
        });
        curr = { ...nextSeg };
        currTexts = [nextText];
        currWords = [...(nextSeg.words || [])];
      } else {
        curr.end = Math.max(curr.end, nextSeg.end);
        currTexts.push(nextText);
        if (nextSeg.words) currWords.push(...nextSeg.words);
        if (nextSeg.translations) {
          curr.translations = curr.translations || {};
          for (const [l, tObj] of Object.entries(nextSeg.translations)) {
            if (!curr.translations[l]) {
              curr.translations[l] = { ...tObj };
            } else {
              curr.translations[l] = {
                ...curr.translations[l],
                text: `${curr.translations[l].text} ${tObj.text}`,
              };
            }
          }
        }
      }
    }

    if (currTexts.length > 0) {
      out.push({
        ...curr,
        final_text: currTexts.join(" "),
        text: currTexts.join(" "),
        words: currWords,
      });
    }

    return out;
  };

  const rawSegments = filterLowTrustOnly
    ? segments.filter((s) => s.trust_bucket !== "green")
    : segments;
  const displayedSegments = coalesceDisplaySegments(rawSegments);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-card-line">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-xs font-semibold text-ink-3 hover:text-ink flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </Link>
            <span className="text-ink-3/40">•</span>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider font-mono">
              {job.platform || job.source_kind}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink truncate max-w-2xl">
            {job.title || job.file_name || "Caption Processing"}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/new"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-card border border-card-line text-ink hover:bg-paper transition-all shadow-xs"
          >
            New Job
          </Link>
          <Link
            href="/library"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-card border border-card-line text-ink hover:bg-paper transition-all shadow-xs"
          >
            Library
          </Link>
        </div>
      </div>

      {/* PLATFORM CAPTIONS WARNING BANNER */}
      {job.method === "platform_captions" && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-xs sm:text-sm text-ink">
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
        <div className="card-torque p-6 sm:p-8 space-y-8 shadow-card">
          {/* STEPPER */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink-3">
              <span>Pipeline Stage: {job.stage.replace("_", " ")}</span>
              <span className="text-primary font-mono">{Math.round(job.progress)}%</span>
            </div>

            <div className="w-full bg-card-line/30 rounded-full h-2.5 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full"
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
                          ? "bg-primary text-white ring-4 ring-primary/20"
                          : "bg-card-line/40 text-ink-3"
                      }`}
                    >
                      {isPassed ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <div
                      className={`text-[11px] font-semibold truncate ${
                        isCurrent ? "text-primary" : isPassed ? "text-ink" : "text-ink-3"
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
          <div className="pt-4 border-t border-card-line space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">
              Live Transcript ({segments.length} segments detected)
            </h3>
            <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
              {segments.map((seg, idx) => (
                <motion.div
                  key={seg.id || idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-xl bg-paper border border-card-line text-xs flex items-center justify-between gap-4"
                >
                  <span className="font-mono text-ink-3 shrink-0">
                    {formatTimestamp(seg.start)}
                  </span>
                  <span className="text-ink flex-1 truncate font-medium">
                    {seg.final_text || seg.text}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      seg.trust_bucket === "green"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : seg.trust_bucket === "yellow"
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {Math.round((seg.trust_score || 0.8) * 100)}%
                  </span>
                </motion.div>
              ))}
              {segments.length === 0 && (
                <div className="py-8 text-center text-ink-3 text-xs">
                  Streaming audio chunks to faster-whisper model...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : job.status === "error" ? (
        /* ERROR STATE */
        <div className="card-torque p-8 border border-rose/30 shadow-card text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-rose/15 text-rose flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-ink">
              {job.error_message || "Captioning Encountered an Error"}
            </h3>
            {job.error_hint && <p className="text-xs text-ink-3">{job.error_hint}</p>}
          </div>

          <div className="pt-3 flex items-center justify-center gap-3">
            <Link
              href="/new"
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-primary hover:bg-primary/90 shadow-xs flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try Again
            </Link>
            <Link
              href="/status"
              className="px-4 py-2.5 rounded-xl font-semibold text-xs text-ink bg-paper border border-card-line hover:bg-card-line/40 transition-colors"
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
            <div className="card-torque overflow-hidden shadow-card">
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
                <div className="w-full h-48 bg-card text-ink-3 flex flex-col items-center justify-center gap-2">
                  <Video className="w-8 h-8 stroke-1 text-ink-3" />
                  <span className="text-xs">Audio track processed</span>
                </div>
              )}

              <div className="p-4 space-y-2">
                <div className="font-bold text-sm text-ink truncate">
                  {job.title || job.file_name || "Video Source"}
                </div>
                <div className="flex items-center justify-between text-xs text-ink-3">
                  <span>Method: {job.method || "whisper"}</span>
                  {job.duration_s && (
                    <span className="font-mono">
                      {Math.floor(job.duration_s / 60)}:
                      {String(Math.floor(job.duration_s % 60)).padStart(2, "0")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* EXPORT SETTINGS & BUTTONS */}
            <div className="card-torque p-6 space-y-5 shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-ink">Export Captions</h3>
                <span className="text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-pill">
                  Editor-Ready
                </span>
              </div>

              {/* LANGUAGE PICKER FOR EXPORT */}
              <div className="space-y-1.5 pt-1 border-t border-card-line">
                <div className="text-[11px] font-bold text-ink-3 uppercase tracking-wider flex items-center justify-between">
                  <span>Export Language</span>
                  <span className="text-primary font-semibold">{availableLanguages.find(l => l.code === exportLang)?.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {availableLanguages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setExportLang(l.code as any)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all border text-left flex items-center gap-2 cursor-pointer ${
                        exportLang === l.code
                          ? "border-primary bg-primary/10 text-primary shadow-2xs ring-1 ring-primary/20"
                          : "border-card-line bg-card text-ink-2 hover:bg-paper"
                      }`}
                    >
                      <span className="text-base">{l.flag}</span>
                      <span className="truncate">{l.native}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* OPTIONS TOGGLES */}
              <div className="space-y-2.5 pt-1 border-t border-card-line text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer text-ink-2">
                  <input
                    type="checkbox"
                    checked={useBom}
                    onChange={(e) => setUseBom(e.target.checked)}
                    className="rounded-sm border-card-line text-primary focus:ring-primary w-4 h-4 bg-paper"
                  />
                  <span>Include UTF-8 BOM (Premiere / Vegas Pro)</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer text-ink-2">
                  <input
                    type="checkbox"
                    checked={markLowTrust}
                    onChange={(e) => setMarkLowTrust(e.target.checked)}
                    className="rounded-sm border-card-line text-primary focus:ring-primary w-4 h-4 bg-paper"
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
                  className="py-2.5 px-3 rounded-xl bg-primary text-white font-bold text-xs hover:bg-primary/90 shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting === "srt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>SRT</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("vtt")}
                  disabled={exporting !== null}
                  className="py-2.5 px-3 rounded-xl bg-card border border-card-line text-ink font-bold text-xs hover:bg-paper shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting === "vtt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>VTT</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport("txt")}
                  disabled={exporting !== null}
                  className="py-2.5 px-3 rounded-xl bg-card border border-card-line text-ink font-bold text-xs hover:bg-paper shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting === "txt" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>TXT</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: CAPTION LIST */}
          <div className="lg:col-span-7 card-torque shadow-card overflow-hidden">
            {/* HEADER & MULTI-LANGUAGE SWITCHER */}
            <div className="p-4 sm:p-5 border-b border-card-line flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="font-bold text-sm text-ink">
                  {displayedSegments.length} Captions
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Language Switcher */}
                <div className="flex items-center gap-1 bg-paper border border-card-line p-1 rounded-xl flex-wrap">
                  {availableLanguages.slice(0, 6).map((l) => {
                    const isReady = job?.translations_ready?.includes(l.code) || l.code === (job?.source_lang || "en");
                    const isTranslating = translatingLang === l.code && !isReady;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => handleSelectLang(l.code)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          selectedLang === l.code && viewMode === "single"
                            ? "bg-primary text-white shadow-xs"
                            : "text-ink-2 hover:text-ink hover:bg-card-line/30"
                        }`}
                      >
                        <span>{l.flag} {l.native}</span>
                        {isTranslating && <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />}
                        {!isReady && l.code !== (job?.source_lang || "en") && !isTranslating && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Click for instant translation" />
                        )}
                      </button>
                    );
                  })}
                  {availableLanguages.length > 6 && (
                    <select
                      value={selectedLang}
                      onChange={(e) => handleSelectLang(e.target.value)}
                      className="px-2 py-1 rounded-lg text-xs font-bold bg-paper border border-card-line text-ink focus:outline-hidden"
                    >
                      {availableLanguages.slice(6).map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag} {l.native} ({l.name})
                        </option>
                      ))}
                    </select>
                  )}
                  {availableLanguages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setViewMode(viewMode === "single" ? "sideBySide" : "single")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        viewMode === "sideBySide"
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-paper text-ink-2 border-card-line hover:text-ink"
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
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                      : "bg-paper text-ink-2 border border-card-line hover:bg-card-line/30"
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>Low-trust</span>
                </button>
              </div>
            </div>

            {/* ROWS */}
            <div className="divide-y divide-card-line max-h-[75vh] overflow-y-auto bg-card">
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
                    className="p-4 hover:bg-card-line/20 transition-colors space-y-2 group"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 font-mono text-ink-3">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(seg.start)} — {formatTimestamp(seg.end)}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedLang !== "en" && (
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">
                            {availableLanguages.find((l) => l.code === selectedLang)?.native}
                          </span>
                        )}

                        {seg.human_edited && (
                          <span className="px-2 py-0.5 rounded-md bg-paper border border-card-line text-ink-2 text-[10px] font-semibold">
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
                            className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors cursor-pointer"
                          >
                            Corrected {showOriginal ? "▲" : "▼"}
                          </button>
                        )}

                        {seg.correction_status === "verified_by_gemini" && (
                          <span className="px-2 py-0.5 rounded-md bg-teal/15 border border-teal/30 text-teal text-[10px] font-bold">
                            ✨ Verified
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            seg.trust_bucket === "green"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                              : seg.trust_bucket === "yellow"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
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
                          className="flex-1 px-3 py-1.5 rounded-lg border border-primary text-sm text-ink bg-paper focus:outline-hidden ring-2 ring-primary/20"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(seg.id)}
                          disabled={savingEdit}
                          className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSegId(null)}
                          className="p-2 rounded-lg bg-paper border border-card-line text-ink hover:bg-card-line/30 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : viewMode === "sideBySide" ? (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="text-xs text-ink-3 font-medium flex items-center gap-1.5">
                          <span className="text-[10px] uppercase font-bold text-ink-3 bg-paper border border-card-line px-1.5 py-0.5 rounded-sm">
                            {availableLanguages.find((l) => l.code === sourceLang)?.native || "Original"}
                          </span>
                          <span>{nativeSpokenText}</span>
                        </div>
                        <div className="text-sm font-semibold text-ink bg-primary/5 border border-primary/20 p-2.5 rounded-xl flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm mr-2">
                              {availableLanguages.find((l) => l.code === selectedLang)?.native || selectedLang}
                            </span>
                            <span>{currentText}</span>
                          </div>
                          <Edit3
                            onClick={() => handleStartEdit(seg)}
                            className="w-3.5 h-3.5 text-ink-3 hover:text-primary cursor-pointer shrink-0 mt-0.5"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-ink space-y-1.5">
                        {seg.words && seg.words.length > 0 && (selectedLang === sourceLang || !seg.translations?.[selectedLang]?.text) ? (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {seg.words.map((w, wIdx) => {
                              const wordText = w.t || w.text || "";
                              const wordAcc = w.acc ?? w.p ?? 0.85;
                              const isRed = wordAcc < 0.55;
                              const isYellow = wordAcc >= 0.55 && wordAcc < 0.80;
                              const flagsList = w.f || [];
                              const hasAlt = Boolean(w.alt);

                              return (
                                <span
                                  key={wIdx}
                                  className={`relative group/word inline-flex items-center px-1.5 py-0.5 rounded text-xs transition-all cursor-pointer ${
                                    isRed
                                      ? "bg-rose-500/15 text-rose border-b-2 border-rose font-bold"
                                      : isYellow
                                      ? "bg-amber-500/15 text-amber-500 border-b-2 border-amber-500 font-medium"
                                      : "text-ink hover:bg-card-line/40"
                                  }`}
                                  onClick={() => {
                                    if (hasAlt) {
                                      setEditingSegId(seg.id);
                                      setEditText(seg.text.replace(wordText, w.alt!));
                                    } else {
                                      handleStartEdit(seg);
                                    }
                                  }}
                                >
                                  <span>{wordText}</span>
                                  {/* Interactive accuracy tooltip */}
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/word:flex flex-col items-center z-30 pointer-events-none">
                                    <span className="bg-paper border border-card-line text-ink text-[10px] py-1 px-2.5 rounded-md shadow-xl whitespace-nowrap space-y-0.5">
                                      <span className="font-bold flex items-center gap-1.5">
                                        <span>{Math.round(wordAcc * 100)}% accuracy</span>
                                        {hasAlt && <span className="text-amber-400">Suggestion: {w.alt}</span>}
                                      </span>
                                      {flagsList.length > 0 && (
                                        <span className="text-ink-3 block text-[9px]">{flagsList.join(" • ")}</span>
                                      )}
                                    </span>
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            onClick={() => handleStartEdit(seg)}
                            className="cursor-pointer hover:text-primary transition-colors flex items-start justify-between gap-3"
                          >
                            <span>{currentText}</span>
                            <Edit3 className="w-3.5 h-3.5 text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                          </div>
                        )}
                        {selectedLang !== sourceLang && currentText && (
                          <div className="text-[11px] text-primary font-medium">
                            {availableLanguages.find((l) => l.code === selectedLang)?.native || selectedLang} Caption
                          </div>
                        )}
                      </div>
                    )}

                    {/* REVEALED ORIGINAL ACCORDION */}
                    {showOriginal && (
                      <div className="p-2.5 rounded-lg bg-paper border border-card-line text-ink-2 text-xs italic space-y-1">
                        <span className="font-semibold text-ink-3 not-italic">Original Whisper:</span>{" "}
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
