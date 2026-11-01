"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { getHealth } from "@/lib/api";
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ShieldAlert, 
  Terminal, 
  Wifi, 
  FileKey, 
  Sparkles,
  ArrowLeft
} from "lucide-react";

export default function StatusPage() {
  const { getToken } = useAuth();
  const [health, setHealth] = useState<Record<string, string | boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getHealth(getToken);
      setHealth(data);
    } catch (err: any) {
      setError(err.message || "Failed to contact backend API.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [getToken]);

  const checks = [
    {
      name: "FastAPI Backend",
      ok: health?.ok === true,
      val: health?.ok ? "Online (port 8000)" : "Offline",
      desc: "FastAPI with SQLModel / SQLite",
    },
    {
      name: "yt-dlp Engine",
      ok: Boolean(health?.yt_dlp),
      val: health?.yt_dlp ? `v${health.yt_dlp}` : "Not installed",
      desc: "Audio & platform extractor",
    },
    {
      name: "FFmpeg Binary",
      ok: health?.ffmpeg === true,
      val: health?.ffmpeg ? (health?.ffmpeg_binary || "Available") : "Missing",
      desc: "16 kHz mono WAV resampler (PyAV + FFmpeg)",
    },
    {
      name: "JavaScript Runtime",
      ok: health?.js_runtime === true,
      val: health?.js_runtime ? "Available (node/deno)" : "Missing",
      desc: "Required for YouTube player extraction",
    },
    {
      name: "YouTube Cookies",
      ok: health?.cookies === "file" || health?.cookies === "browser",
      val: health?.cookies ? String(health.cookies).toUpperCase() : "NONE",
      desc: "cookies.txt file or browser session",
    },
    {
      name: "Gemini AI Key",
      ok: health?.gemini === true,
      val: health?.gemini ? "Configured" : "Unset",
      desc: "Contextual glossary correction",
    },
    {
      name: "Whisper Model",
      ok: Boolean(health?.whisper_model),
      val: String(health?.whisper_model || "base"),
      desc: "Pre-cached local speech model",
    },
    {
      name: "Authentication Mode",
      ok: true,
      val: health?.auth_required ? "Clerk Required" : "Anonymous / Demo-Safe",
      desc: "JWT verification via Clerk JWKS",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-4 border-b border-card-line">
        <div>
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">System Status</h1>
          <p className="text-sm text-ink-2 mt-1">
            Real-time diagnostics for audio extraction, Whisper model, and API services.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl text-xs font-bold text-ink bg-card border border-card-line hover:bg-paper shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* HEALTH STATUS CARD */}
      <div className="card-torque shadow-card overflow-hidden divide-y divide-card-line">
        {checks.map((c, i) => (
          <div key={i} className="p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {c.ok ? (
                <div className="w-8 h-8 rounded-xl bg-teal/15 text-teal flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-rose/15 text-rose flex items-center justify-center shrink-0">
                  <XCircle className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="font-bold text-sm text-ink">{c.name}</div>
                <div className="text-xs text-ink-3">{c.desc}</div>
              </div>
            </div>

            <div className="text-right">
              <div
                className={`text-xs font-bold px-2.5 py-1 rounded-md inline-block ${
                  c.ok
                    ? "bg-teal/10 text-teal border border-teal/20"
                    : "bg-rose/10 text-rose border border-rose/20"
                }`}
              >
                {c.val}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* YOUTUBE SIGN-IN RUNBOOK */}
      <div className="card-torque p-6 sm:p-7 space-y-4 shadow-card">
        <div className="flex items-center gap-2 text-primary font-bold text-base">
          <Terminal className="w-5 h-5 text-primary" />
          <span>YouTube says &quot;Sign in to confirm you&apos;re not a bot&quot;? Do this:</span>
        </div>

        <ol className="list-decimal list-inside space-y-2 text-xs sm:text-sm text-ink-2 leading-relaxed font-medium">
          <li>
            <strong className="text-ink">Update extractor:</strong> Run{" "}
            <code className="px-1.5 py-0.5 rounded-md bg-paper border border-card-line font-mono text-primary text-xs">
              pip install -U &quot;yt-dlp[default]&quot;
            </code>{" "}
            inside the backend venv.
          </li>
          <li>
            <strong className="text-ink">Export fresh cookies:</strong> Open a private window, sign into YouTube with a throwaway account, visit{" "}
            <code className="px-1.5 py-0.5 rounded-md bg-paper border border-card-line font-mono text-primary text-xs">
              youtube.com/robots.txt
            </code>
            , export cookies with <em>Get cookies.txt LOCALLY</em>, and save as{" "}
            <code className="px-1.5 py-0.5 rounded-md bg-paper border border-card-line font-mono text-primary text-xs">
              backend/cookies.txt
            </code>
            .
          </li>
          <li>
            <strong className="text-ink">Network matters:</strong> College Wi-Fi, cloud IPs, and VPNs are flagged often. Use your phone&apos;s mobile hotspot for stage demos.
          </li>
          <li>
            <strong className="text-ink">Use pre-cached demo URLs:</strong> Videos run tonight with the precache script load in &lt;1 second with zero network risk.
          </li>
          <li>
            <strong className="text-ink">Last resort:</strong> The Upload tab is always available as a local audio/video fallback.
          </li>
        </ol>
      </div>
    </div>
  );
}
