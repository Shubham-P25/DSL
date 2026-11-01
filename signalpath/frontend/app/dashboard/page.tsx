"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
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
  Radio,
  Layers
} from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import { useAnimatedCounter } from "@/lib/motion";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const [quickUrl, setQuickUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

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

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createJob(getToken, quickUrl.trim());
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
    <div className="space-y-6">
      {/* GREETING & ACTIONS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Operator Dashboard {user?.firstName ? `, ${user.firstName}` : ""}
          </h1>
          <p className="text-xs text-ink-2 mt-1">
            Real-time pipeline monitoring, verification metrics, and multi-language exports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/live"
            className="btn-pill-44 px-4 text-xs font-bold bg-card border border-card-line text-ink hover:border-primary/50 flex items-center gap-1.5 transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-primary animate-pulse" />
            <span>Live Mic Mode</span>
          </Link>
          <Link
            href="/new"
            className="btn-pill-44 px-4 text-xs font-bold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Video Job</span>
          </Link>
        </div>
      </div>

      {/* STAT STRIP WITH TABULAR NUMBERS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-torque p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Total Videos</div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-ink mt-1">
            {animatedVideos}
          </div>
          <div className="text-[11px] text-ink-3 mt-1 font-medium">{doneJobs.length} completed</div>
        </div>

        <div className="card-torque p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Duration Processed</div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-teal mt-1">
            {animatedMinutes} <span className="text-xs font-normal text-ink-3">min</span>
          </div>
          <div className="text-[11px] text-ink-3 mt-1 font-medium">16 kHz PyAV audio buffer</div>
        </div>

        <div className="card-torque p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Core Languages</div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-primary mt-1">
            4
          </div>
          <div className="text-[11px] text-ink-3 mt-1 font-medium">English, Hindi, German, Dutch</div>
        </div>

        <div className="card-torque p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Active Pipeline</div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono-numbers text-amber mt-1">
            {runningJobs.length}
          </div>
          <div className="text-[11px] text-ink-3 mt-1 font-medium">Jobs currently running</div>
        </div>
      </div>

      {/* QUICK PASTE BOX */}
      <div className="card-torque p-6 bg-card border border-card-line shadow-card space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Sparkles className="w-4 h-4" />
          <span>Quick Ingest</span>
        </div>
        <h2 className="text-lg font-bold text-ink">Paste a video link to transcribe</h2>
        <form onSubmit={handleQuickSubmit} className="pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-card-line bg-paper text-ink placeholder:text-ink-3 text-sm focus:outline-hidden focus:border-primary"
            />
            <button
              type="submit"
              disabled={submitting || !quickUrl.trim()}
              className="btn-pill-44 px-5 text-xs font-bold bg-primary hover:bg-primary-hover text-white shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <span>Transcribe</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
          {submitError && (
            <p className="mt-2 text-xs text-rose flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {submitError.message}
            </p>
          )}
        </form>
      </div>

      {/* RECENT JOBS CARDS */}
      <div className="card-torque overflow-hidden shadow-card">
        <div className="px-6 py-4 border-b border-card-line flex items-center justify-between">
          <h3 className="font-bold text-ink text-sm uppercase tracking-wider">Recent Jobs</h3>
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
            <p className="text-sm font-medium">No caption jobs yet.</p>
            <Link
              href="/new"
              className="btn-pill-44 px-4 text-xs font-bold bg-primary text-white inline-flex items-center gap-1.5"
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
