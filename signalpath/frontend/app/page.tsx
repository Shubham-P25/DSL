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
  Languages, 
  CheckCircle2,
  Film,
  Radio,
  FileText
} from "lucide-react";
import SplitTitle from "./components/SplitTitle";
import { useMagnetic, useAnimatedCounter } from "@/lib/motion";

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const magneticSubmitRef = useMagnetic(8);

  const statJobs = useAnimatedCounter(1420);
  const statTrust = useAnimatedCounter(96);
  const statLangs = useAnimatedCounter(4);
  const statLatency = useAnimatedCounter(18);

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
    { name: "YouTube", icon: Youtube, color: "text-red-500 bg-red-500/10" },
    { name: "Instagram", icon: Video, color: "text-rose bg-rose/10" },
    { name: "Facebook", icon: Video, color: "text-sky bg-sky/10" },
    { name: "X / Twitter", icon: Twitter, color: "text-ink bg-card-line" },
    { name: "TikTok", icon: Film, color: "text-ink bg-card-line" },
    { name: "Direct Upload", icon: Upload, color: "text-primary bg-primary/10" },
  ];

  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8 max-w-6xl mx-auto">
      {/* HERO SECTION */}
      <section className="text-center max-w-4xl mx-auto space-y-6 sm:space-y-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill text-xs font-bold pill-tint-high shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-teal" />
          <span>Operator-Grade ASR Trust Scoring & 4-Language Translation</span>
        </div>

        <div className="space-y-3">
          <SplitTitle
            text="Captions you can trust,"
            highlightText="from any link."
            className="text-4xl sm:text-6xl font-extrabold tracking-tight text-ink leading-[1.12] justify-center"
          />
          <p className="text-base sm:text-lg text-ink-2 max-w-2xl mx-auto leading-relaxed pt-2">
            Paste any video URL or drop an audio file. Videos get captioned with <strong>English</strong> speech timestamps, with on-demand zero-hallucination translation into <strong>Hindi, German, and Dutch</strong>.
          </p>
        </div>

        {/* URL PASTE CARD */}
        <form onSubmit={handleGetStarted} className="max-w-2xl mx-auto">
          <div className="card-torque p-2 sm:p-2.5 flex flex-col sm:flex-row gap-2 shadow-card">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube, Reels, TikTok, or direct video URL..."
              className="flex-1 px-4 py-3 rounded-xl text-sm sm:text-base text-ink placeholder:text-ink-3 bg-transparent focus:outline-hidden"
            />
            <button
              ref={magneticSubmitRef as any}
              type="submit"
              className="btn-pill-44 px-6 text-sm sm:text-base text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/25 flex items-center justify-center gap-2 cursor-pointer font-bold"
            >
              <span>{isSignedIn ? "Generate Captions" : "Get Started Free"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2.5 text-xs text-ink-3">
            In-memory 16 kHz PyAV extraction • Zero full-video retention • Instant demo processing
          </p>
        </form>

        {/* TORQUE SAMPLE CAPTION CARD WITH TRUST TINT */}
        <div className="pt-2 max-w-3xl mx-auto">
          <div className="card-torque p-6 space-y-4 shadow-card">
            <div className="flex items-center justify-between text-xs text-ink-3 border-b border-card-line pb-3">
              <span className="font-mono-numbers font-semibold">00:04.12 → 00:08.50</span>
              <div className="flex items-center gap-2 font-bold">
                <span className="pill-tint-high px-2 py-0.5 rounded-pill text-[10px]">High Trust &ge;0.75</span>
                <span className="pill-tint-mid px-2 py-0.5 rounded-pill text-[10px]">Mid Trust &ge;0.50</span>
                <span className="pill-tint-low px-2 py-0.5 rounded-pill text-[10px]">Low Trust &lt;0.50</span>
              </div>
            </div>

            <div className="text-lg sm:text-xl font-medium leading-relaxed text-left">
              <span className="text-teal font-semibold">Here</span>{" "}
              <span className="text-teal font-semibold">we</span>{" "}
              <span className="text-teal font-semibold">are</span>{" "}
              <span className="text-teal font-semibold">in</span>{" "}
              <span className="text-teal font-semibold">front</span>{" "}
              <span className="text-teal font-semibold">of</span>{" "}
              <span className="text-teal font-semibold">the</span>{" "}
              <span className="text-teal font-semibold">elephants.</span>{" "}
              <span className="text-amber font-semibold bg-amber/10 px-1 rounded-sm" title="Acoustic score 0.68">They</span>{" "}
              <span className="text-teal font-semibold">have</span>{" "}
              <span className="text-teal font-semibold">really</span>{" "}
              <span className="text-rose font-semibold bg-rose/10 px-1 rounded-sm underline decoration-rose decoration-wavy" title="Flag: low_prob & compression">trunks</span>{" "}
              <span className="text-teal font-semibold">that</span>{" "}
              <span className="text-teal font-semibold">are</span>{" "}
              <span className="text-teal font-semibold">cool.</span>
            </div>

            <div className="text-[11px] text-ink-3 pt-2 flex items-center justify-between">
              <span>Word-level verification engine: acoustic probability, duration z-score, repetition penalty.</span>
              <span className="font-mono-numbers text-teal font-bold">96.4% Segment Acc</span>
            </div>
          </div>
        </div>
      </section>

      {/* STAT STRIP WITH TABULAR NUMBERS */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-5xl mx-auto">
        <div className="card-torque p-5 text-center space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-ink">{statJobs}+</div>
          <div className="text-xs text-ink-3 font-semibold uppercase tracking-wider">Videos Transcribed</div>
        </div>
        <div className="card-torque p-5 text-center space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-teal">{statTrust}%</div>
          <div className="text-xs text-ink-3 font-semibold uppercase tracking-wider">Average Trust Score</div>
        </div>
        <div className="card-torque p-5 text-center space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-primary">{statLangs}</div>
          <div className="text-xs text-ink-3 font-semibold uppercase tracking-wider">Core Languages</div>
        </div>
        <div className="card-torque p-5 text-center space-y-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-ink">{statLatency}ms</div>
          <div className="text-xs text-ink-3 font-semibold uppercase tracking-wider">Browser Conversion</div>
        </div>
      </section>

      {/* SUPPORTED PLATFORMS */}
      <section className="space-y-4 text-center max-w-5xl mx-auto">
        <p className="text-xs uppercase tracking-widest font-bold text-ink-3">
          Ingest directly from creator platforms
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {platforms.map((p, idx) => {
            const Icon = p.icon;
            return (
              <div 
                key={idx}
                className="card-torque flex items-center gap-2.5 px-4 py-2 hover:border-card-line/80 transition-all"
              >
                <div className={`p-1.5 rounded-lg ${p.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-ink">{p.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* THE 4 SUPPORTED LANGUAGES STRIP */}
      <section className="card-torque p-6 sm:p-8 space-y-6 max-w-5xl mx-auto">
        <div className="space-y-1 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
            <Languages className="w-4 h-4" />
            <span>Consolidated 4-Language Matrix</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink">
            Captioned in English, translated into 3 core languages
          </h2>
          <p className="text-xs text-ink-2">
            Zero transliteration hallucination. Each sentence is localized semantically.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-card border border-card-line space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xl">🇬🇧</span>
              <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-pill font-mono">Source / Primary</span>
            </div>
            <div className="font-bold text-sm text-ink">English</div>
            <div className="text-xs text-ink-3">Native Latin Speech</div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-card-line space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xl">🇮🇳</span>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-pill font-mono">Target</span>
            </div>
            <div className="font-bold text-sm text-ink font-['Noto_Sans_Devanagari']">हिन्दी (Hindi)</div>
            <div className="text-xs text-ink-3">Devanagari Localized</div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-card-line space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xl">🇩🇪</span>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-pill font-mono">Target</span>
            </div>
            <div className="font-bold text-sm text-ink">Deutsch (German)</div>
            <div className="text-xs text-ink-3">Natural German Grammar</div>
          </div>

          <div className="p-4 rounded-xl bg-card border border-card-line space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xl">🇳🇱</span>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-pill font-mono">Target</span>
            </div>
            <div className="font-bold text-sm text-ink">Nederlands (Dutch)</div>
            <div className="text-xs text-ink-3">Idiomatic Localization</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (3 BAY CARDS) */}
      <section className="space-y-6 max-w-5xl mx-auto">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-ink">Operator Pipeline</h2>
          <p className="text-ink-2 text-xs">Three resilient stages from raw media to editor-ready subtitles</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card-torque p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
              1
            </div>
            <h3 className="font-bold text-base text-ink">In-Memory Audio Ingest</h3>
            <p className="text-xs text-ink-2 leading-relaxed">
              PyAV decodes any video directly into 16 kHz float32 mono in-memory. No system ffmpeg binary required; zero disk leak of full video streams.
            </p>
          </div>

          <div className="card-torque p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal/10 text-teal flex items-center justify-center font-bold text-base">
              2
            </div>
            <h3 className="font-bold text-base text-ink">Verification & Cross-Check</h3>
            <p className="text-xs text-ink-2 leading-relaxed">
              5-signal continuous trust scorer flags low-confidence phrases. Cross-checks with secondary ASR and audits jargon against domain glossaries.
            </p>
          </div>

          <div className="card-torque p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber/10 text-amber flex items-center justify-center font-bold text-base">
              3
            </div>
            <h3 className="font-bold text-base text-ink">Lazy Translation & NLE Export</h3>
            <p className="text-xs text-ink-2 leading-relaxed">
              On-demand translation into Hindi, German, and Dutch with SQLite cue caching. Export standard 2-line wrapped SRT/VTT with optional UTF-8 BOM.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="pt-8 border-t border-card-line flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink">SignalPath</span>
          <span>© 2026 • Torque Operator System</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/live" className="hover:text-primary transition-colors flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-primary" /> Live Mic Captioner
          </Link>
          <Link href="/status" className="hover:text-primary transition-colors">System Status</Link>
          <Link href="/library" className="hover:text-primary transition-colors">Library</Link>
          <Link href="/new" className="hover:text-primary transition-colors">Studio</Link>
        </div>
      </footer>
    </div>
  );
}
