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
import { useMagnetic } from "@/lib/motion";

export default function CaptionStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";

  const { getToken } = useAuth();
  const magneticSubmitRef = useMagnetic(8);

  const [activeTab, setActiveTab] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState(initialUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState("en"); // Default English as requested
  const [targetLang, setTargetLang] = useState<string>("en");
  const [correct, setCorrect] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // The 4 supported languages
  const CORE_LANGUAGES = [
    { code: "en", label: "English", sub: "English", flag: "🇬🇧" },
    { code: "hi", label: "Hindi", sub: "हिन्दी", flag: "🇮🇳" },
    { code: "de", label: "German", sub: "Deutsch", flag: "🇩🇪" },
    { code: "nl", label: "Dutch", sub: "Nederlands", flag: "🇳🇱" },
  ];

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
    setError(null);
    setSubmitting(true);

    try {
      if (activeTab === "link") {
        if (!url.trim()) throw new ApiError("URL_EMPTY", "Please paste a video URL.");
        const res = await createJob(getToken, url.trim(), sourceLang, correct, targetLang);
        router.push(`/jobs/${res.job_id}`);
      } else {
        if (!selectedFile) throw new ApiError("FILE_EMPTY", "Please select a file to upload.");
        const res = await uploadJob(getToken, selectedFile, sourceLang, correct, targetLang);
        router.push(`/jobs/${res.job_id}`);
      }
    } catch (err: any) {
      console.error("[CaptionStudio] Error submitting job:", err);
      setError(err instanceof ApiError ? err : new ApiError("SUBMIT_FAILED", err?.message || "Failed to start captioning."));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">Caption Studio</h1>
        <p className="text-xs text-ink-2 mt-1">
          Generate word-timed captions, inspect continuous trust confidence, and localize across 4 core languages.
        </p>
      </div>

      {/* ERROR BANNER WITH FALLBACK */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl bg-rose/10 border border-rose/30 text-ink space-y-3"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm text-rose">{error.message}</h4>
              {error.hint && <p className="text-xs text-ink-2">{error.hint}</p>}
            </div>
          </div>

          {(error.code === "AUTH_REQUIRED" || error.code === "INGEST_FAILED") && (
            <div className="pt-2 flex flex-wrap items-center gap-3 border-t border-rose/20">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("upload");
                  setError(null);
                }}
                className="btn-pill-44 px-4 text-xs font-bold text-white bg-rose hover:bg-rose/90 cursor-pointer"
              >
                Upload the video instead
              </button>
              <Link
                href="/status"
                className="text-xs font-semibold text-rose hover:underline flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" /> View site status
              </Link>
            </div>
          )}
        </motion.div>
      )}

      {/* MAIN CARD */}
      <div className="card-torque overflow-hidden shadow-card">
        {/* TABS */}
        <div className="flex border-b border-card-line bg-card/60 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "link"
                ? "bg-primary text-white shadow-xs"
                : "text-ink-2 hover:text-ink hover:bg-card-line/40"
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Public Video Link</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === "upload"
                ? "bg-primary text-white shadow-xs"
                : "text-ink-2 hover:text-ink hover:bg-card-line/40"
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload File</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* TAB 1: LINK INPUT */}
          {activeTab === "link" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-2">
                  Video URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-3 rounded-xl border border-card-line bg-paper text-ink text-sm placeholder:text-ink-3 focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              {/* DEMO VIDEO CHIPS */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">
                  Or test with an instant demo link:
                </span>
                <div className="flex flex-wrap gap-2">
                  {demoVideos.map((demo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setUrl(demo.url)}
                      className="px-3 py-1.5 rounded-pill bg-paper border border-card-line text-[11px] font-medium text-ink-2 hover:text-ink hover:border-primary/50 transition-all text-left flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>{demo.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD DROPZONE */}
          {activeTab === "upload" && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : selectedFile
                    ? "border-teal bg-teal/5"
                    : "border-card-line hover:border-primary/50 hover:bg-card-line/20"
                }`}
              >
                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-teal/15 text-teal mx-auto flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">{selectedFile.name}</p>
                      <p className="text-xs text-ink-3">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to transcribe
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-xs text-rose hover:underline pt-1"
                    >
                      Change file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-card-line text-ink-2 mx-auto flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">
                        Drop video or audio file here, or click to browse
                      </p>
                      <p className="text-xs text-ink-3 mt-1">
                        MP4, MOV, MKV, MP3, WAV, M4A up to 500 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OPTIONS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-card-line">
            {/* SPEECH SOURCE LANGUAGE (DEFAULT ENGLISH) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-primary" />
                <span>Source Speech Language</span>
              </label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-card-line text-ink text-sm bg-paper font-medium focus:outline-hidden focus:border-primary"
              >
                <option value="en">English (Default)</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="de">German (Deutsch)</option>
                <option value="nl">Dutch (Nederlands)</option>
              </select>
              <p className="text-[11px] text-ink-3">
                All videos get captioned in <strong>English</strong> by default.
              </p>
            </div>

            {/* AI GLOSSARY CORRECTION */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-amber" />
                  <span>AI Error Correction</span>
                </span>
                <span className="text-[10px] text-teal font-mono bg-teal/10 px-2 py-0.5 rounded-pill">Active</span>
              </label>
              <div
                onClick={() => setCorrect(!correct)}
                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  correct ? "border-primary/40 bg-primary/5" : "border-card-line bg-paper"
                }`}
              >
                <div className="text-xs">
                  <div className="font-bold text-ink">Auto-correct captions</div>
                  <div className="text-ink-3 text-[11px]">Local fuzzy + glossary repair</div>
                </div>
                <div
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                    correct ? "bg-primary" : "bg-card-line"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      correct ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DESIRED CAPTION LANGUAGE - THE 4 TYPES */}
          <div className="space-y-2.5 pt-4 border-t border-card-line">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Primary Caption Output Language</span>
              </span>
              <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-pill font-mono">
                4 Core Languages
              </span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {CORE_LANGUAGES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setTargetLang(item.code)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                    targetLang === item.code
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs"
                      : "border-card-line bg-card hover:bg-card-line/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{item.flag}</span>
                    {targetLang === item.code && (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="mt-2 font-bold text-xs text-ink">{item.label}</div>
                  <div className="text-[11px] text-ink-3">{item.sub}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-3">
              Captions will be generated in English, and you can translate on-demand into Hindi, German, and Dutch in the viewer.
            </p>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="pt-2">
            <button
              ref={magneticSubmitRef as any}
              type="submit"
              disabled={submitting}
              className="btn-pill-44 w-full bg-primary hover:bg-primary-hover text-white text-sm font-bold shadow-md shadow-primary/25 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting to Pipeline...</span>
                </>
              ) : (
                <>
                  <span>Start Caption Processing</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
