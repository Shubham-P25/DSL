"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import { 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Wand2, 
  FileCheck2, 
  Youtube, 
  Twitter, 
  Video, 
  Upload, 
  Layers, 
  Clock, 
  ChevronRight,
  CheckCircle2,
  Film
} from "lucide-react";

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const handleGetStarted = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      router.push("/sign-up");
    } else {
      if (url.trim()) {
        router.push(`/new?url=${encodeURIComponent(url.trim())}`);
      } else {
        router.push("/new");
      }
    }
  };

  const platforms = [
    { name: "YouTube", icon: Youtube, color: "text-red-600 bg-red-50" },
    { name: "Instagram", icon: Video, color: "text-pink-600 bg-pink-50" },
    { name: "Facebook", icon: Video, color: "text-blue-600 bg-blue-50" },
    { name: "X / Twitter", icon: Twitter, color: "text-slate-800 bg-slate-100" },
    { name: "TikTok", icon: Film, color: "text-neutral-900 bg-neutral-100" },
    { name: "Vimeo", icon: Video, color: "text-sky-600 bg-sky-50" },
    { name: "Upload Any File", icon: Upload, color: "text-indigo-600 bg-indigo-50" },
  ];

  return (
    <div className="space-y-24 py-8">
      {/* HERO SECTION */}
      <section className="text-center max-w-4xl mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Next-Generation Video Captioning & Trust Scoring</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]"
        >
          Captions you can trust, <br />
          <span className="bg-gradient-to-r from-brand-600 via-violet-600 to-cyan-600 bg-clip-text text-transparent">
            from any link.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed"
        >
          Paste any public video URL or upload your own file. Get word-timed AI captions with confidence scores, automatic glossary corrections, and editor-ready SRT/VTT exports.
        </motion.p>

        {/* INPUT BOX */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          onSubmit={handleGetStarted}
          className="max-w-2xl mx-auto"
        >
          <div className="p-2 sm:p-2.5 bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube, Vimeo, TikTok, X, or mp4 URL..."
              className="flex-1 px-4 py-3 rounded-xl text-sm sm:text-base text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              type="submit"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm sm:text-base text-white bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-700 hover:to-violet-700 shadow-md shadow-brand-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-95 cursor-pointer"
            >
              <span>{isSignedIn ? "Generate Captions" : "Get Started Free"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            No credit card required. Free instant demo processing.
          </p>
        </motion.form>

        {/* INLINE SVG ILLUSTRATION */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="pt-6 max-w-3xl mx-auto"
        >
          <div className="relative rounded-2xl bg-white p-6 shadow-2xl shadow-indigo-100 border border-slate-200/80 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/40 via-transparent to-transparent pointer-events-none" />
            <svg viewBox="0 0 800 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
              <rect x="20" y="20" width="760" height="200" rx="16" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
              <rect x="50" y="45" width="280" height="150" rx="12" fill="#0F172A" />
              {/* Play symbol */}
              <circle cx="190" cy="120" r="28" fill="#4F46E5" fillOpacity="0.8" />
              <polygon points="183,108 203,120 183,132" fill="#FFFFFF" />
              {/* Audio waveform visualization */}
              <rect x="360" y="55" width="380" height="35" rx="8" fill="#EEF2FF" />
              <path d="M 380 72 Q 400 60 420 72 T 460 72 T 500 72 T 540 72 T 580 72 T 620 72 T 660 72 T 700 72" stroke="#6366F1" strokeWidth="3" fill="none" />
              {/* Caption Line 1 */}
              <rect x="360" y="105" width="380" height="42" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
              <circle cx="380" cy="126" r="6" fill="#10B981" />
              <text x="396" y="130" fill="#0F172A" fontSize="13" fontWeight="600" fontFamily="sans-serif">
                "Here we are in front of the elephants..."
              </text>
              <rect x="670" y="116" width="55" height="20" rx="6" fill="#D1FAE5" />
              <text x="682" y="130" fill="#047857" fontSize="11" fontWeight="700" fontFamily="sans-serif">98% High</text>
              {/* Caption Line 2 with correction */}
              <rect x="360" y="155" width="380" height="42" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
              <circle cx="380" cy="176" r="6" fill="#F59E0B" />
              <text x="396" y="180" fill="#0F172A" fontSize="13" fontWeight="600" fontFamily="sans-serif">
                "They have really long trunks."
              </text>
              <rect x="660" y="166" width="65" height="20" rx="6" fill="#EFF6FF" />
              <text x="668" y="180" fill="#2563EB" fontSize="11" fontWeight="700" fontFamily="sans-serif">Corrected</text>
            </svg>
          </div>
        </motion.div>
      </section>

      {/* SUPPORTED PLATFORMS */}
      <section className="space-y-6 text-center max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
          Works with every major creator platform
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
          {platforms.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div 
                key={idx}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all"
              >
                <div className={`p-1.5 rounded-lg ${p.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm font-semibold text-slate-700">{p.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS (3 STEPS) */}
      <section className="space-y-12 max-w-5xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">How SignalPath Works</h2>
          <p className="text-slate-500 text-sm sm:text-base">Three simple steps from any raw video to perfectly synchronized subtitles</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs relative space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-brand-600 flex items-center justify-center font-bold text-lg">
              1
            </div>
            <h3 className="font-bold text-lg text-slate-900">Paste Link or Upload</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Feed any video URL or drop an audio/video file. We safely extract 16 kHz audio into a clean temporary buffer with zero storage of full videos.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs relative space-y-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center font-bold text-lg">
              2
            </div>
            <h3 className="font-bold text-lg text-slate-900">AI Trust Scoring & Fixes</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              faster-whisper transcribes word timestamps while our ML trust scorer flags low-confidence phrases. Gemini repairs technical jargon and homophones.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs relative space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-lg">
              3
            </div>
            <h3 className="font-bold text-lg text-slate-900">Export SRT / VTT / TXT</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Export balanced, 2-line wrapped subtitles with optional UTF-8 BOM encoding for Premiere Pro, DaVinci Resolve, CapCut, and Final Cut.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURE CARDS */}
      <section className="space-y-12 max-w-5xl mx-auto">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Built for Precision Editors</h2>
          <p className="text-slate-500 text-sm sm:text-base">Features that eliminate caption hallucinations and tedious manual sync</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900">Multi-Feature Trust Scores</h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              Segments are color-coded in green, yellow, or red based on Whisper log-probabilities, word duration balance, and repetition penalties.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-brand-700 flex items-center justify-center">
              <Wand2 className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900">Contextual Auto-Correction</h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              Gemini LLM analyses flagged segments against seed glossaries to fix misheard technical terms, names, and industry-specific vocabulary.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-slate-900">Editor-Ready Standards</h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              Strict 42-character line limits, no mid-word cuts, word-timed split cues, and UTF-8 BOM toggles for seamless NLE timeline imports.
            </p>
          </div>
        </div>
      </section>

      {/* NEW CAPABILITIES: MULTI-LANGUAGE & IMAGE OCR */}
      <section className="space-y-8 max-w-5xl mx-auto">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-100 text-violet-800">
            <Sparkles className="w-3.5 h-3.5" />
            <span>New Multimodal Superpowers</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Multilingual Captions & Image Text Studio</h2>
          <p className="text-slate-500 text-sm sm:text-base">Break language barriers and extract text from visual documents instantly</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* MULTI-LANGUAGE CARD */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white relative overflow-hidden space-y-5 shadow-xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 uppercase tracking-wider">
                <span>🌐 Semantic Translation</span>
              </div>
              <h3 className="text-2xl font-extrabold text-white">4 Synchronized Caption Languages</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Choose any video (English, Hindi, Marathi, Tamil, or global speech) and get accurate subtitles in <strong>English (🇬🇧), Hindi (हिंदी - 🇮🇳), Marathi (मराठी - 🚩), and Tamil (தமிழ் - 🏛️)</strong>.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 space-y-2 text-xs">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Meaning-Matching Translation (Zero Transliteration)
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-200">
                <div className="p-2 rounded-xl bg-black/20">🇬🇧 Feed me</div>
                <div className="p-2 rounded-xl bg-black/20">🇮🇳 मुझे खाना खिलाओ</div>
                <div className="p-2 rounded-xl bg-black/20">🚩 मला खायला द्या</div>
                <div className="p-2 rounded-xl bg-black/20">🏛️ எனக்கு உணவளியுங்கள்</div>
              </div>
            </div>

            <Link
              href="/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-500 hover:bg-indigo-600 text-white transition-all shadow-md"
            >
              <span>Try Multilingual Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* IMAGE OCR CARD */}
          <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white relative overflow-hidden space-y-5 shadow-xl">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300 uppercase tracking-wider">
                <span>📷 Neural Vision OCR</span>
              </div>
              <h3 className="text-2xl font-extrabold text-white">Image Text Extraction Studio</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Drop any invoice, receipt, street sign, or document image. Our neural vision engine extracts every text element and organizes it into beautiful structured cards, key-value tables, and clean Markdown.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 space-y-2 text-xs">
              <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Intelligent Structuring & Bounding Metrics
              </div>
              <div className="flex items-center justify-between text-slate-300 text-[11px] pt-1">
                <span>• Invoices & Receipts</span>
                <span>• Key-Value Extraction</span>
                <span>• Export MD/JSON/TXT</span>
              </div>
            </div>

            <Link
              href="/ocr"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-cyan-600 hover:bg-cyan-700 text-white transition-all shadow-md"
            >
              <span>Launch Image Text Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="pt-12 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-sm">SignalPath</span>
          <span>© 2026. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/status" className="hover:text-brand-600 transition-colors">System Status</Link>
          <Link href="/library" className="hover:text-brand-600 transition-colors">Video Library</Link>
          <Link href="/new" className="hover:text-brand-600 transition-colors">Caption Studio</Link>
        </div>
      </footer>
    </div>
  );
}
