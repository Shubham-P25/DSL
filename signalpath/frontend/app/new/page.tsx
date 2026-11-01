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
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  Info,
  Layers,
  FileAudio,
  Radio,
  Video
} from "lucide-react";
import { useMagnetic, TORQUE_EASE } from "@/lib/motion";

export default function CaptionStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";

  const { getToken } = useAuth();
  const magneticSubmitRef = useMagnetic(8);

  const [activeTab, setActiveTab] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState(initialUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetLang, setTargetLang] = useState<string>("en");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // The 4 supported languages
  const CORE_LANGUAGES = [
    { code: "en", label: "English", sub: "English (Default)", flag: "🇬🇧" },
    { code: "hi", label: "Hindi", sub: "हिन्दी", flag: "🇮🇳" },
    { code: "de", label: "German", sub: "Deutsch", flag: "🇩🇪" },
    { code: "nl", label: "Dutch", sub: "Nederlands", flag: "🇳🇱" },
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
        if (!url.trim()) throw new ApiError("URL_EMPTY", "Please enter or paste a valid video URL.");
        // Always captions in English with verification
        const res = await createJob(getToken, url.trim(), "en", true, targetLang);
        router.push(`/jobs/${res.job_id}`);
      } else {
        if (!selectedFile) throw new ApiError("FILE_EMPTY", "Please select a video or audio file to upload.");
        const res = await uploadJob(getToken, selectedFile, "en", true, targetLang);
        router.push(`/jobs/${res.job_id}`);
      }
    } catch (err: any) {
      console.error("[CaptionStudio] Error submitting job:", err);
      setError(err instanceof ApiError ? err : new ApiError("SUBMIT_FAILED", err?.message || "Failed to start captioning."));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* HEADER */}
      <div className="space-y-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
          Caption Studio
        </h1>
        <p className="text-xs sm:text-sm text-ink-2">
          Submit media for word-timed English transcription and instant 4-language localization.
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
                Upload the video file instead
              </button>
              <Link
                href="/status"
                className="text-xs font-semibold text-rose hover:underline flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" /> View system status
              </Link>
            </div>
          )}
        </motion.div>
      )}

      {/* INTERACTIVE SEGMENTED MODE CARDS (Item 5: make them big, interactive, and attractive) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* TAB CARD 1: PUBLIC LINK */}
        <div
          onClick={() => setActiveTab("link")}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3 ${
            activeTab === "link"
              ? "border-primary bg-card shadow-lg ring-2 ring-primary/20"
              : "border-card-line bg-card/60 hover:border-card-line/80 hover:bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                activeTab === "link" ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-card-line text-ink-2"
              }`}
            >
              <Link2 className="w-6 h-6" />
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase tracking-wider font-mono ${
                activeTab === "link" ? "bg-primary/10 text-primary border border-primary/20" : "text-ink-3"
              }`}
            >
              Stream Ingest
            </span>
          </div>

          <div>
            <div className="font-bold text-base text-ink">Public Video Link</div>
            <div className="text-xs text-ink-3 mt-0.5">
              Paste YouTube, Instagram Reel, Facebook, or direct .mp4 URL
            </div>
          </div>

          <div className="text-[11px] font-medium text-teal flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Zero file upload time • 16 kHz PyAV audio buffer</span>
          </div>
        </div>

        {/* TAB CARD 2: UPLOAD FILE */}
        <div
          onClick={() => setActiveTab("upload")}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between space-y-3 ${
            activeTab === "upload"
              ? "border-primary bg-card shadow-lg ring-2 ring-primary/20"
              : "border-card-line bg-card/60 hover:border-card-line/80 hover:bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                activeTab === "upload" ? "bg-primary text-white shadow-md shadow-primary/30" : "bg-card-line text-ink-2"
              }`}
            >
              <Upload className="w-6 h-6" />
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase tracking-wider font-mono ${
                activeTab === "upload" ? "bg-primary/10 text-primary border border-primary/20" : "text-ink-3"
              }`}
            >
              Direct Upload
            </span>
          </div>

          <div>
            <div className="font-bold text-base text-ink">Upload Local File</div>
            <div className="text-xs text-ink-3 mt-0.5">
              Drag & drop any video or audio file from your device
            </div>
          </div>

          <div className="text-[11px] font-medium text-teal flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Supports MP4, MOV, MKV, MP3, WAV up to 500 MB</span>
          </div>
        </div>
      </div>

      {/* INPUT FORM CONTAINER */}
      <form onSubmit={handleSubmit} className="card-torque p-6 sm:p-8 space-y-6 shadow-card">
        {/* TAB 1 CONTENT: LINK INPUT */}
        {activeTab === "link" && (
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink">
              Video Stream Address
            </label>
            <div className="relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://instagram.com/reel/..."
                className="w-full px-4 py-3.5 rounded-xl border border-card-line bg-paper text-ink text-sm placeholder:text-ink-3 focus:outline-hidden focus:border-primary shadow-xs"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3 hover:text-ink px-2 py-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 2 CONTENT: UPLOAD DROPZONE */}
        {activeTab === "upload" && (
          <div className="space-y-3">
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
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : selectedFile
                  ? "border-teal bg-teal/5"
                  : "border-card-line hover:border-primary/50 hover:bg-card-line/20"
              }`}
            >
              {selectedFile ? (
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-full bg-teal/15 text-teal mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-ink">{selectedFile.name}</p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for ingestion
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-xs text-rose hover:underline"
                  >
                    Select another file
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-full bg-card-line text-ink-2 mx-auto flex items-center justify-center">
                    <Upload className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm sm:text-base font-bold text-ink">
                      Drag & drop your video or audio file here
                    </p>
                    <p className="text-xs text-ink-3 mt-1">
                      Or click to browse from your computer (MP4, MKV, WAV, MP3)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TARGET CAPTION LANGUAGE (4 CORE TYPES) */}
        <div className="space-y-3 pt-4 border-t border-card-line">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Primary Caption Output Language</span>
            </label>
            <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-pill font-mono">
              4 Languages Ready
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CORE_LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setTargetLang(item.code)}
                className={`p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer relative ${
                  targetLang === item.code
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-xs"
                    : "border-card-line bg-card hover:bg-card-line/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{item.flag}</span>
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
            Your video will be captioned in English with timestamps and trust scores. You can toggle Hindi, German, and Dutch translations on demand.
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
                <span>Launching Ingestion & Transcription Pipeline...</span>
              </>
            ) : (
              <>
                <span>Generate Captions Now</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
