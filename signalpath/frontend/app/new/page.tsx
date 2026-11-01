"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { createJob, uploadJob, ApiError } from "@/lib/api";
import { 
  Link2, 
  Upload, 
  Languages, 
  Wand2, 
  Sparkles, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  FileVideo, 
  ArrowRight,
  ShieldAlert,
  Info
} from "lucide-react";

export default function CaptionStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";

  const { getToken } = useAuth();

  const [activeTab, setActiveTab] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState(initialUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState<string>("en");
  const [correct, setCorrect] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const demoVideos = [
    {
      title: "Me at the zoo",
      url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      desc: "Short 19s test, instant Whisper base transcribing",
    },
    {
      title: "Google interns' first week",
      url: "https://www.youtube.com/watch?v=9No-FiEInLA",
      desc: "5.8m high-quality speech with tech terminology",
    },
    {
      title: "Welcome to the Internet",
      url: "https://www.youtube.com/watch?v=k1BneeJTDcU",
      desc: "4.6m speech track with rich vocabulary",
    },
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[CaptionStudio] Submitting form...", { activeTab, url, sourceLang, targetLang, correct });
    setError(null);
    setSubmitting(true);

    try {
      if (activeTab === "link") {
        if (!url.trim()) throw new ApiError("URL_EMPTY", "Please paste a video URL.");
        console.log("[CaptionStudio] Calling createJob with URL:", url.trim(), "targetLang:", targetLang);
        const res = await createJob(getToken, url.trim(), sourceLang, correct, targetLang);
        console.log("[CaptionStudio] Job created successfully:", res);
        router.push(`/jobs/${res.job_id}`);
      } else {
        if (!selectedFile) throw new ApiError("FILE_EMPTY", "Please select a file to upload.");
        console.log("[CaptionStudio] Calling uploadJob with file:", selectedFile.name, "targetLang:", targetLang);
        const res = await uploadJob(getToken, selectedFile, sourceLang, correct, targetLang);
        console.log("[CaptionStudio] Upload job created successfully:", res);
        router.push(`/jobs/${res.job_id}`);
      }
    } catch (err: any) {
      console.error("[CaptionStudio] Error submitting job:", err);
      setError(err instanceof ApiError ? err : new ApiError("SUBMIT_FAILED", err?.message || "Failed to start captioning."));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Caption Studio</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create word-timed captions, inspect speech confidence, and export NLE-ready subtitles.
        </p>
      </div>

      {/* ERROR BANNER WITH FALLBACK */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-3"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-rose-900">{error.message}</h4>
              {error.hint && <p className="text-xs text-rose-700">{error.hint}</p>}
            </div>
          </div>

          {(error.code === "AUTH_REQUIRED" || error.code === "INGEST_FAILED") && (
            <div className="pt-2 flex flex-wrap items-center gap-3 border-t border-rose-200/80">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("upload");
                  setError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all cursor-pointer"
              >
                Upload the video instead
              </button>
              <Link
                href="/status"
                className="text-xs font-semibold text-rose-800 hover:underline flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" /> View site status & cookie runbook
              </Link>
            </div>
          )}
        </motion.div>
      )}

      {/* MAIN CARD */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* TABS */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex-1 py-4 text-center font-bold text-sm flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "link"
                ? "border-brand-600 text-brand-600 bg-brand-50/20"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Paste Link</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex-1 py-4 text-center font-bold text-sm flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === "upload"
                ? "border-brand-600 text-brand-600 bg-brand-50/20"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload File</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {activeTab === "link" ? (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Video URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or .mp4 link"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              <p className="text-xs text-slate-400">
                Supports YouTube, Vimeo, TikTok, X/Twitter, Instagram, Facebook, and direct media URLs.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Drop Audio or Video File
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-brand-500 bg-brand-50/40"
                    : selectedFile
                    ? "border-emerald-300 bg-emerald-50/30"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="space-y-2">
                    <FileVideo className="w-10 h-10 text-emerald-600 mx-auto" />
                    <div className="font-bold text-slate-800 text-sm">{selectedFile.name}</div>
                    <div className="text-xs text-slate-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Click to change
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 text-slate-300 mx-auto" />
                    <div className="font-semibold text-slate-700 text-sm">
                      Click to choose or drag & drop media file
                    </div>
                    <div className="text-xs text-slate-400">
                      MP4, MKV, MOV, WebM, MP3, WAV, M4A up to 500 MB
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OPTIONS */}
          <div className="pt-4 border-t border-slate-100 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* VIDEO SPOKEN LANGUAGE */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-slate-500" />
                    <span>Video Spoken Language</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Input Audio</span>
                </label>
                <select
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 bg-white font-medium"
                >
                  <option value="auto">Auto-detect Spoken Language (Any Video)</option>
                  <option value="en">English (🇬🇧)</option>
                  <option value="hi">Hindi (हिंदी - 🇮🇳)</option>
                  <option value="mr">Marathi (मराठी - 🚩)</option>
                  <option value="ta">Tamil (தமிழ் - 🏛️)</option>
                  <option value="es">Spanish (Español - 🇪🇸)</option>
                  <option value="fr">French (Français - 🇫🇷)</option>
                  <option value="de">German (Deutsch - 🇩🇪)</option>
                  <option value="ja">Japanese (日本語 - 🇯🇵)</option>
                </select>
                <p className="text-[11px] text-slate-400">
                  Leave on <strong>Auto-detect</strong> for any video, or specify if known.
                </p>
              </div>

              {/* AI GLOSSARY CORRECTION */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>AI Error Correction</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Optional</span>
                </label>
                <div
                  onClick={() => setCorrect(!correct)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    correct ? "border-brand-200 bg-brand-50/30" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="text-xs">
                    <div className="font-bold text-slate-800">Auto-correct captions</div>
                    <div className="text-slate-500 text-[11px]">Local fuzzy + glossary repair</div>
                  </div>
                  <div
                    className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                      correct ? "bg-brand-600" : "bg-slate-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        correct ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Fixes misheard domain words and technical names against glossary.
                </p>
              </div>
            </div>

            {/* DESIRED CAPTION LANGUAGE - EXACTLY THE 4 LANGUAGES */}
            <div className="space-y-2.5 pt-3 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                  <span>Desired Caption Language</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Quota Optimized
                </span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {[
                  { code: "en", label: "English", sub: "English", flag: "🇬🇧" },
                  { code: "hi", label: "Hindi", sub: "हिंदी", flag: "🇮🇳" },
                  { code: "mr", label: "Marathi", sub: "मराठी", flag: "🚩" },
                  { code: "pa", label: "Punjabi", sub: "ਪੰਜਾਬੀ", flag: "ੴ" },
                  { code: "ta", label: "Tamil", sub: "தமிழ்", flag: "🏛️" },
                  { code: "kn", label: "Kannada", sub: "ಕನ್ನಡ", flag: "🌸" },
                  { code: "ru", label: "Russian", sub: "Русский", flag: "🇷🇺" },
                  { code: "de", label: "German", sub: "Deutsch", flag: "🇩🇪" },
                  { code: "ja", label: "Japanese", sub: "日本語", flag: "🇯🇵" },
                  { code: "zh", label: "Chinese", sub: "中文", flag: "🇨🇳" },
                ].map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setTargetLang(item.code)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                      targetLang === item.code
                        ? "border-brand-600 bg-brand-50/70 ring-2 ring-brand-500/20 shadow-xs"
                        : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xl">{item.flag}</span>
                      {targetLang === item.code && (
                        <CheckCircle2 className="w-4 h-4 text-brand-600" />
                      )}
                    </div>
                    <div className="mt-1.5 font-bold text-xs text-slate-900">{item.label}</div>
                    <div className="text-[11px] text-slate-500 font-medium">{item.sub}</div>
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-slate-500">
                Captions will be generated and confidence-scored in <strong>{targetLang.toUpperCase()}</strong>. Additional languages can be added later on-demand with lazy caching!
              </p>
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Initializing Speech Engine...</span>
              </>
            ) : (
              <>
                <span>Launch Caption Engine</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* TRY A DEMO VIDEO ROW */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-brand-500" />
          <span>Try a pre-cached demo video (instant results)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {demoVideos.map((d, i) => (
            <div
              key={i}
              onClick={() => {
                setUrl(d.url);
                setActiveTab("link");
              }}
              className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer space-y-1 group"
            >
              <div className="font-bold text-xs text-slate-900 group-hover:text-brand-600 transition-colors">
                {d.title}
              </div>
              <div className="text-[11px] text-slate-500 leading-tight">{d.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
