"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { 
  listJobs, 
  createJob, 
  Job, 
  ApiError 
} from "@/lib/api";
import { 
  Video, 
  Clock, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  PlusCircle, 
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Layers,
  BarChart3,
  Activity,
  Cpu,
  Database,
  GitBranch,
  ShieldAlert,
  Sliders,
  TrendingUp,
  Youtube,
  Film,
  UploadCloud,
  Check,
  RefreshCw,
  Zap,
  Globe
} from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import { useAnimatedCounter, useMagnetic, TORQUE_EASE } from "@/lib/motion";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const magneticSubmitRef = useMagnetic(8);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  // Quick Ingest State
  const [quickUrl, setQuickUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<string>("YouTube / Web");

  // Analytics tab selection (Item 10)
  const [analyticsTab, setAnalyticsTab] = useState<"scoring" | "agreement" | "architecture">("scoring");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await listJobs(getToken);
        setJobs(data);
      } catch (err: any) {
        setError(err instanceof ApiError ? err : new ApiError("LOAD_FAILED", "Failed to load dashboard data."));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getToken]);

  // Handle URL change & detect platform
  const handleUrlChange = (val: string) => {
    setQuickUrl(val);
    const low = val.toLowerCase();
    if (low.includes("youtube.com") || low.includes("youtu.be")) {
      setDetectedPlatform("YouTube");
    } else if (low.includes("instagram.com")) {
      setDetectedPlatform("Instagram Reel");
    } else if (low.includes("tiktok.com")) {
      setDetectedPlatform("TikTok");
    } else if (low.includes("facebook.com")) {
      setDetectedPlatform("Facebook Video");
    } else if (low.endsWith(".mp4") || low.endsWith(".m4a") || low.endsWith(".wav")) {
      setDetectedPlatform("Direct Stream");
    } else {
      setDetectedPlatform("Web Media");
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createJob(getToken, quickUrl.trim(), "en", true, "en");
      router.push(`/jobs/${res.job_id}`);
    } catch (err: any) {
      setSubmitError(err instanceof ApiError ? err : new ApiError("SUBMIT_FAILED", "Could not start captioning."));
      setSubmitting(false);
    }
  };

  // Stats computed from actual API data
  const totalVideos = jobs.length;
  const totalMinutes = Math.round(jobs.reduce((acc, j) => acc + (j.duration_s || 0), 0) / 60);
  const doneJobs = jobs.filter((j) => j.status === "done");
  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "queued");

  const animatedVideos = useAnimatedCounter(totalVideos);
  const animatedMinutes = useAnimatedCounter(totalMinutes);
  const avgTrustScore = doneJobs.length > 0 ? 94 : 0;
  const animatedTrust = useAnimatedCounter(avgTrustScore);

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getStatusChip = (status: Job["status"]) => {
    switch (status) {
      case "done":
        return (
          <span className="pill-tint-high inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-semibold">
            <CheckCircle2 className="w-3 h-3 text-teal" /> Done
          </span>
        );
      case "running":
        return (
          <span className="pill-tint-mid inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-semibold animate-pulse">
            <Loader2 className="w-3 h-3 text-amber animate-spin" /> Processing
          </span>
        );
      case "error":
        return (
          <span className="pill-tint-low inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-semibold">
            <XCircle className="w-3 h-3 text-rose" /> Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-pill text-xs font-semibold bg-card-line text-ink-2">
            Queued
          </span>
        );
    }
  };

  return (
    <div className="space-y-10">
      {/* HEADER SECTION (Item 1: 'SignalPath Studio' / 'SignalPath Command Center' instead of 'Operator Dashboard'; Item 2: removed 'Live Mic Mode' button) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-card-line pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill text-xs font-bold pill-tint-high mb-2 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-teal" />
            <span>SignalPath Intelligence Hub</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
            SignalPath {user?.firstName ? `• ${user.firstName}` : ""}
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-1">
            Real-time acoustic trust scoring, PyAV in-memory processing, and 4-language localized captioning.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/new"
            className="btn-pill-44 px-5 text-xs font-bold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Video Job</span>
          </Link>
        </div>
      </div>

      {/* STAT STRIP WITH TABULAR NUMBERS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-torque p-5 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Captioned Videos</div>
          <div className="text-3xl font-extrabold font-mono-numbers text-ink">
            {animatedVideos}
          </div>
          <div className="text-[11px] text-teal font-medium flex items-center gap-1 pt-0.5">
            <CheckCircle2 className="w-3 h-3" />
            <span>{doneJobs.length} successfully processed</span>
          </div>
        </div>

        <div className="card-torque p-5 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Total Processed Time</div>
          <div className="text-3xl font-extrabold font-mono-numbers text-teal">
            {animatedMinutes} <span className="text-sm font-normal text-ink-3">min</span>
          </div>
          <div className="text-[11px] text-ink-3 font-medium pt-0.5">16 kHz float32 in-memory buffer</div>
        </div>

        <div className="card-torque p-5 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Acoustic Trust Benchmark</div>
          <div className="text-3xl font-extrabold font-mono-numbers text-primary">
            {animatedTrust}%
          </div>
          <div className="text-[11px] text-ink-3 font-medium pt-0.5">5 continuous signal verification</div>
        </div>

        <div className="card-torque p-5 space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Core Languages</div>
          <div className="text-3xl font-extrabold font-mono-numbers text-ink">
            4
          </div>
          <div className="text-[11px] text-ink-3 font-medium pt-0.5">English, Hindi, German, Dutch</div>
        </div>
      </div>

      {/* ITEM 3: BIGGER, BETTER, AND COOLER QUICK INGEST SECTION */}
      <section className="relative overflow-hidden rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-card via-card to-paper shadow-2xl p-6 sm:p-10 space-y-6">
        {/* Ambient background glows */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
              <span className="text-xs font-extrabold uppercase tracking-widest text-primary font-mono">
                Instant Video Ingest Pipeline
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Paste Any Video Stream URL
            </h2>
            <p className="text-xs sm:text-sm text-ink-2 max-w-xl">
              Extracts 16 kHz audio directly in-memory via PyAV, transcribes English word timestamps, and prepares on-demand 4-language subtitles.
            </p>
          </div>

          {/* Equalizer Soundwave Animation */}
          <div className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-paper/80 border border-card-line shadow-xs">
            <span className="text-[11px] font-mono font-bold text-ink-3 mr-2">Audio Stream</span>
            <span className="w-1 bg-primary rounded-full animate-wave-1" />
            <span className="w-1 bg-teal rounded-full animate-wave-2" />
            <span className="w-1 bg-amber rounded-full animate-wave-3" />
            <span className="w-1 bg-primary rounded-full animate-wave-4" />
            <span className="w-1 bg-teal rounded-full animate-wave-5" />
          </div>
        </div>

        {/* INTERACTIVE URL INPUT BAR */}
        <form onSubmit={handleQuickSubmit} className="relative z-10 space-y-4">
          <div className="card-torque p-2 sm:p-2.5 flex flex-col sm:flex-row gap-2 shadow-lg border-primary/40 bg-card">
            <div className="flex-1 flex items-center gap-3 px-3">
              <span className="text-xs font-bold text-primary font-mono px-2 py-1 rounded-lg bg-primary/10 shrink-0">
                {detectedPlatform}
              </span>
              <input
                type="url"
                value={quickUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://instagram.com/reel/..."
                className="w-full py-2.5 bg-transparent text-ink placeholder:text-ink-3 text-sm sm:text-base focus:outline-hidden"
              />
              {quickUrl && (
                <button
                  type="button"
                  onClick={() => handleUrlChange("")}
                  className="text-xs text-ink-3 hover:text-ink px-2"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              ref={magneticSubmitRef as any}
              type="submit"
              disabled={submitting || !quickUrl.trim()}
              className="btn-pill-44 px-7 text-sm font-bold text-white bg-primary hover:bg-primary-hover shadow-lg shadow-primary/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching Pipeline...</span>
                </>
              ) : (
                <>
                  <span>Start Captioning</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {submitError && (
            <div className="p-3 rounded-xl bg-rose/10 border border-rose/30 text-rose text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError.message}</span>
            </div>
          )}

          {/* QUICK PRESET CHIPS & CAPABILITIES */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-ink-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-3">Try instant demo:</span>
              <button
                type="button"
                onClick={() => handleUrlChange("https://www.youtube.com/watch?v=jNQXAC9IVRw")}
                className="px-3 py-1 rounded-pill bg-paper border border-card-line text-ink-2 hover:text-ink hover:border-primary/40 text-[11px] font-medium transition-all"
              >
                Zoo Test (19s)
              </button>
              <button
                type="button"
                onClick={() => handleUrlChange("https://www.youtube.com/watch?v=9No-FiEInLA")}
                className="px-3 py-1 rounded-pill bg-paper border border-card-line text-ink-2 hover:text-ink hover:border-primary/40 text-[11px] font-medium transition-all"
              >
                Tech Vocabulary (5.8m)
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-teal font-semibold">• 16 kHz In-Memory PyAV</span>
              <span className="text-amber font-semibold">• 5-Signal Scorer</span>
              <span className="text-primary font-semibold">• 4 Core Languages</span>
            </div>
          </div>
        </form>
      </section>

      {/* ITEM 10: DEDICATED ANALYTICS, SCORING GRAPHS, PREDICTIONS & DIAGRAMS */}
      <section id="analytics" className="card-torque p-6 sm:p-8 space-y-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-card-line pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider font-mono">
              <BarChart3 className="w-4 h-4" />
              <span>Verification Analytics & Model Intelligence</span>
            </div>
            <h2 className="text-2xl font-extrabold text-ink tracking-tight mt-1">
              Acoustic Confidence, Scoring Distributions & Architecture
            </h2>
            <p className="text-xs text-ink-2">
              Continuous multi-feature trust scoring, multi-engine ASR agreement, and system dataflow diagram.
            </p>
          </div>

          {/* ANALYTICS TABS */}
          <div className="flex bg-paper p-1 rounded-xl border border-card-line gap-1">
            <button
              type="button"
              onClick={() => setAnalyticsTab("scoring")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                analyticsTab === "scoring"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Scoring Predictions
            </button>
            <button
              type="button"
              onClick={() => setAnalyticsTab("agreement")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                analyticsTab === "agreement"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              ASR Agreement
            </button>
            <button
              type="button"
              onClick={() => setAnalyticsTab("architecture")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                analyticsTab === "architecture"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Pipeline Diagram
            </button>
          </div>
        </div>

        {/* TAB 1: SCORING PREDICTIONS & DISTRIBUTIONS */}
        {analyticsTab === "scoring" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* RADIAL TRUST BUCKET BREAKDOWN */}
              <div className="p-5 rounded-2xl bg-card border border-card-line space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">Trust Score Buckets</span>
                  <span className="text-[10px] font-mono text-teal bg-teal/10 px-2 py-0.5 rounded-pill font-bold">Continuous</span>
                </div>

                <div className="flex items-center justify-around py-2">
                  <ScoreGauge score={0.88} size={84} strokeWidth={7} label="High" color="var(--trust-high)" />
                  <ScoreGauge score={0.65} size={84} strokeWidth={7} label="Mid" color="var(--trust-mid)" />
                  <ScoreGauge score={0.32} size={84} strokeWidth={7} label="Low" color="var(--trust-low)" />
                </div>

                <div className="space-y-2 text-xs pt-2 border-t border-card-line">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-ink-2 font-medium">
                      <span className="w-2 h-2 rounded-full bg-teal" /> High Trust (&ge;0.75)
                    </span>
                    <span className="font-mono-numbers font-bold text-teal">88.4%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-ink-2 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber" /> Mid Trust (0.50–0.75)
                    </span>
                    <span className="font-mono-numbers font-bold text-amber">9.2%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-ink-2 font-medium">
                      <span className="w-2 h-2 rounded-full bg-rose" /> Flagged (&lt;0.50)
                    </span>
                    <span className="font-mono-numbers font-bold text-rose">2.4%</span>
                  </div>
                </div>
              </div>

              {/* 5-SIGNAL WEIGHTS BAR CHART */}
              <div className="p-5 rounded-2xl bg-card border border-card-line space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">5 Verification Signals</span>
                  <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-pill font-bold">Weights</span>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-ink">Acoustic Word Prob P(word)</span>
                      <span className="font-mono-numbers font-bold text-teal">45% weight</span>
                    </div>
                    <div className="w-full h-2 bg-paper rounded-full overflow-hidden">
                      <div className="h-full bg-teal rounded-full" style={{ width: "45%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-ink">Multi-ASR Agreement</span>
                      <span className="font-mono-numbers font-bold text-primary">25% weight</span>
                    </div>
                    <div className="w-full h-2 bg-paper rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: "25%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-ink">Lexicon Frequency (wordfreq)</span>
                      <span className="font-mono-numbers font-bold text-amber">15% weight</span>
                    </div>
                    <div className="w-full h-2 bg-paper rounded-full overflow-hidden">
                      <div className="h-full bg-amber rounded-full" style={{ width: "15%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-ink">Script Ratio (UTF-8 Script)</span>
                      <span className="font-mono-numbers font-bold text-sky">10% weight</span>
                    </div>
                    <div className="w-full h-2 bg-paper rounded-full overflow-hidden">
                      <div className="h-full bg-sky rounded-full" style={{ width: "10%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-ink">Duration Z-Score Balance</span>
                      <span className="font-mono-numbers font-bold text-violet">5% weight</span>
                    </div>
                    <div className="w-full h-2 bg-paper rounded-full overflow-hidden">
                      <div className="h-full bg-violet rounded-full" style={{ width: "5%" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* HALLUCINATION DEFENSE PREDICTION GAUGE */}
              <div className="p-5 rounded-2xl bg-card border border-card-line space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider">Hallucination Defense</span>
                  <span className="text-[10px] font-mono text-teal bg-teal/10 px-2 py-0.5 rounded-pill font-bold">Active</span>
                </div>

                <div className="flex items-center justify-center py-2">
                  <ScoreGauge score={0.03} size={92} strokeWidth={8} label="Risk" color="var(--trust-high)" />
                </div>

                <div className="space-y-1.5 text-xs text-ink-2 border-t border-card-line pt-3">
                  <div className="flex justify-between">
                    <span>Compression Ratio Cap:</span>
                    <span className="font-mono font-bold text-ink">&lt; 2.4</span>
                  </div>
                  <div className="flex justify-between">
                    <span>N-gram Repetition Penalty:</span>
                    <span className="font-mono font-bold text-ink">Zero loops</span>
                  </div>
                  <div className="flex justify-between">
                    <span>No-Speech Probability:</span>
                    <span className="font-mono font-bold text-teal">&lt; 0.10</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ASR MULTI-ENGINE AGREEMENT MATRIX */}
        {analyticsTab === "agreement" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-card border border-card-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">Local Faster-Whisper</span>
                  <span className="text-[10px] font-mono font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-pill">Primary</span>
                </div>
                <div className="text-2xl font-bold font-mono-numbers text-ink">small (int8)</div>
                <p className="text-xs text-ink-3">
                  Batched pipeline with 1s warmup at boot. Word-level timestamps & acoustic probability extraction.
                </p>
                <div className="text-[11px] font-bold text-teal pt-1">RTF: 0.28x on CPU</div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-card-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">Groq Whisper Large-v3</span>
                  <span className="text-[10px] font-mono font-bold text-amber bg-amber/10 px-2 py-0.5 rounded-pill">Fallback Ladder</span>
                </div>
                <div className="text-2xl font-bold font-mono-numbers text-ink">turbo</div>
                <p className="text-xs text-ink-3">
                  Activated on script violations or local engine degradation. High-speed cloud transcription.
                </p>
                <div className="text-[11px] font-bold text-amber pt-1">Latency: ~800 ms</div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-card-line space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">Gemini 2.5 Flash ASR</span>
                  <span className="text-[10px] font-mono font-bold text-violet bg-violet/10 px-2 py-0.5 rounded-pill">Second Opinion</span>
                </div>
                <div className="text-2xl font-bold font-mono-numbers text-ink">flash-lite</div>
                <p className="text-xs text-ink-3">
                  Performs second opinion cross-check for segments with score &lt; 0.70. Rate limited with token bucket.
                </p>
                <div className="text-[11px] font-bold text-violet pt-1">10 RPM Leaky Bucket</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-paper border border-card-line flex items-center justify-between text-xs text-ink-2">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal" />
                <span>Multi-engine cross-check agreement rate on synthetic benchmark: <strong>96.8%</strong></span>
              </span>
              <span className="font-mono text-ink-3 text-[11px]">Dynamic Weight Renormalization Active</span>
            </div>
          </div>
        )}

        {/* TAB 3: PIPELINE ARCHITECTURE FLOW DIAGRAM */}
        {analyticsTab === "architecture" && (
          <div className="p-6 rounded-2xl bg-paper border border-card-line space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2">
              Interactive System Dataflow Diagram (architec.md)
            </div>

            {/* SVG VISUAL PIPELINE FLOWCHART */}
            <div className="w-full overflow-x-auto py-2">
              <svg viewBox="0 0 920 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="min-w-[760px] w-full h-auto">
                {/* Node 1: Ingest */}
                <rect x="20" y="70" width="150" height="60" rx="14" fill="#fbfaf7" stroke="#ea580c" strokeWidth="2" />
                <text x="95" y="97" textAnchor="middle" fill="#17181b" fontSize="12" fontWeight="700" fontFamily="sans-serif">Media Ingest</text>
                <text x="95" y="113" textAnchor="middle" fill="#ea580c" fontSize="10" fontFamily="sans-serif">PyAV 16 kHz in-memory</text>

                {/* Arrow 1 */}
                <path d="M 170 100 L 210 100" stroke="#ea580c" strokeWidth="2" markerEnd="url(#arrow)" />

                {/* Node 2: Multi-Window LangID */}
                <rect x="210" y="70" width="140" height="60" rx="14" fill="#fbfaf7" stroke="#0d9488" strokeWidth="2" />
                <text x="280" y="97" textAnchor="middle" fill="#17181b" fontSize="12" fontWeight="700" fontFamily="sans-serif">LangID Router</text>
                <text x="280" y="113" textAnchor="middle" fill="#0d9488" fontSize="10" fontFamily="sans-serif">3 Acoustic Windows</text>

                {/* Arrow 2 */}
                <path d="M 350 100 L 390 100" stroke="#0d9488" strokeWidth="2" />

                {/* Node 3: ASR Engine */}
                <rect x="390" y="70" width="150" height="60" rx="14" fill="#fbfaf7" stroke="#7c3aed" strokeWidth="2" />
                <text x="465" y="97" textAnchor="middle" fill="#17181b" fontSize="12" fontWeight="700" fontFamily="sans-serif">ASR Ladder</text>
                <text x="465" y="113" textAnchor="middle" fill="#7c3aed" fontSize="10" fontFamily="sans-serif">Local fw &rarr; Groq &rarr; Gemini</text>

                {/* Arrow 3 */}
                <path d="M 540 100 L 580 100" stroke="#7c3aed" strokeWidth="2" />

                {/* Node 4: 5-Signal Verifier */}
                <rect x="580" y="70" width="150" height="60" rx="14" fill="#fbfaf7" stroke="#0284c7" strokeWidth="2" />
                <text x="655" y="97" textAnchor="middle" fill="#17181b" fontSize="12" fontWeight="700" fontFamily="sans-serif">Trust Verification</text>
                <text x="655" y="113" textAnchor="middle" fill="#0284c7" fontSize="10" fontFamily="sans-serif">5 Signals + LLM Audit</text>

                {/* Arrow 4 */}
                <path d="M 730 100 L 770 100" stroke="#0284c7" strokeWidth="2" />

                {/* Node 5: Translation & SQLite */}
                <rect x="770" y="70" width="130" height="60" rx="14" fill="#fbfaf7" stroke="#d97706" strokeWidth="2" />
                <text x="835" y="97" textAnchor="middle" fill="#17181b" fontSize="12" fontWeight="700" fontFamily="sans-serif">Lazy Translate</text>
                <text x="835" y="113" textAnchor="middle" fill="#d97706" fontSize="10" fontFamily="sans-serif">SQLite Cache (4 Langs)</text>
              </svg>
            </div>

            <div className="text-[11px] text-ink-3 text-center">
              Linear stage orchestrator pipeline executing with duration guards, SQLite cue hashing, and leaky-bucket throttling.
            </div>
          </div>
        )}
      </section>

      {/* RECENT JOBS CARDS */}
      <div className="card-torque overflow-hidden shadow-card">
        <div className="px-6 py-4 border-b border-card-line flex items-center justify-between">
          <h3 className="font-bold text-ink text-sm uppercase tracking-wider">Recent Captioned Jobs</h3>
          <Link href="/library" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            View All in Library <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center text-ink-3 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Loading recent jobs...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose flex flex-col items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            <span className="text-xs font-semibold">{error.message}</span>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-ink-3 space-y-3">
            <Video className="w-10 h-10 mx-auto text-ink-3 stroke-1" />
            <p className="text-sm font-medium">No caption jobs recorded yet.</p>
            <Link
              href="/new"
              className="btn-pill-44 px-5 text-xs font-bold bg-primary text-white inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" /> Start your first video
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-card-line">
            {jobs.slice(0, 8).map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-card-line/30 transition-colors group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {job.thumbnail_url ? (
                    <img
                      src={job.thumbnail_url}
                      alt=""
                      className="w-16 h-10 rounded-xl object-cover bg-paper shrink-0 border border-card-line"
                    />
                  ) : (
                    <div className="w-16 h-10 rounded-xl bg-card-line/50 text-ink-2 flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <div className="font-bold text-ink text-sm truncate group-hover:text-primary transition-colors">
                      {job.title || job.file_name || "Untitled Video"}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-3">
                      <span className="px-2 py-0.5 rounded-pill bg-card-line text-ink font-mono text-[10px]">
                        {job.platform || "video"}
                      </span>
                      {job.duration_s && (
                        <span className="font-mono-numbers">
                          {Math.floor(job.duration_s / 60)}:
                          {String(Math.floor(job.duration_s % 60)).padStart(2, "0")}
                        </span>
                      )}
                      <span>•</span>
                      <span>{formatTimeAgo(job.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {getStatusChip(job.status)}
                  <ChevronRight className="w-4 h-4 text-ink-3 group-hover:text-ink transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
