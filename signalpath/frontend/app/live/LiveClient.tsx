"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { 
  Mic, 
  MicOff, 
  Trash2, 
  Copy, 
  Download, 
  Sparkles, 
  Radio, 
  ShieldCheck, 
  AlertTriangle, 
  Check, 
  FileDown, 
  ExternalLink,
  ChevronLeft
} from "lucide-react";
import { loadLexicon, isLexiconReady, hasLexiconFailed } from "@/lib/hinglish/lexicon";
import { toHinglish, convertHindiSentence, HinglishWord } from "@/lib/hinglish/index";
import { TORQUE_EASE } from "@/lib/motion";

// Error Boundary Fallback Component
class LiveErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[LiveClient] Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink">
          <div className="card-torque p-8 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose/10 text-rose mx-auto flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-xs text-ink-2">
              The live captioning session encountered an unexpected UI error.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-pill-44 bg-primary text-white text-xs font-bold w-full"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type TabType = "live" | "hindi" | "words";

export default function LiveClientWrapper() {
  return (
    <LiveErrorBoundary>
      <LiveClient />
    </LiveErrorBoundary>
  );
}

function LiveClient() {
  const [activeTab, setActiveTab] = useState<TabType>("live");
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "reconnecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recognition state
  const [committedHindi, setCommittedHindi] = useState<string[]>([]);
  const [interimHindi, setInterimHindi] = useState<string>("");
  const [committedHinglish, setCommittedHinglish] = useState<HinglishWord[]>([]);
  const [interimHinglish, setInterimHinglish] = useState<HinglishWord[]>([]);

  // Dictionary status
  const [dictReady, setDictReady] = useState(false);
  const [copied, setCopied] = useState(false);

  // Audio level meter
  const [audioLevel, setAudioLevel] = useState(0);

  // References
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rAfMeterRef = useRef<number | null>(null);

  // 1. Mount effect: check browser recognition support & load offline dictionary
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    // Asynchronously load the dictionary
    loadLexicon().then((ready) => {
      setDictReady(ready);
    });

    return () => {
      stopEverything();
    };
  }, []);

  // 2. Audio Level Meter using AnalyserNode
  const startAudioMeter = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rAfMeterRef.current = requestAnimationFrame(updateMeter);
      };

      rAfMeterRef.current = requestAnimationFrame(updateMeter);
    } catch (err) {
      console.warn("[LiveClient] Audio meter unavailable (mic in use or denied):", err);
    }
  };

  const stopAudioMeter = () => {
    if (rAfMeterRef.current) {
      cancelAnimationFrame(rAfMeterRef.current);
      rAfMeterRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  // 3. Speech Recognition Engine
  const startListening = () => {
    if (!isSupported) return;
    shouldListenRef.current = true;
    setErrorMessage(null);
    reconnectAttemptRef.current = 0;
    initRecognition();
    startAudioMeter();
  };

  const stopListening = () => {
    shouldListenRef.current = false;
    clearTimeout(reconnectTimeoutRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    stopAudioMeter();
    setIsListening(false);
    setStatus("idle");
  };

  const stopEverything = () => {
    shouldListenRef.current = false;
    clearTimeout(reconnectTimeoutRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    stopAudioMeter();
    setIsListening(false);
  };

  const initRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "hi-IN";
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      setStatus("listening");
      reconnectAttemptRef.current = 0;
    };

    rec.onresult = (event: any) => {
      const t0 = performance.now();
      let currentFinal = "";
      let currentInterim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          currentFinal += item[0].transcript + " ";
        } else {
          currentInterim += item[0].transcript;
        }
      }

      // If final segments arrived, convert and append to committed list
      if (currentFinal.trim()) {
        const newCommittedWords = convertHindiSentence(currentFinal.trim());
        setCommittedHindi((prev) => [...prev, currentFinal.trim()]);
        setCommittedHinglish((prev) => [...prev, ...newCommittedWords]);
      }

      // Handle in-progress interim text
      setInterimHindi(currentInterim);
      if (currentInterim.trim()) {
        const interimWords = convertHindiSentence(currentInterim.trim());
        setInterimHinglish(interimWords);
      } else {
        setInterimHinglish([]);
      }

      const elapsed = performance.now() - t0;
      if (elapsed > 30) {
        console.log(`[LiveClient] Sentence conversion took ${elapsed.toFixed(2)} ms`);
      }

      // Auto-scroll logic if user hasn't scrolled up
      if (!userScrolledUpRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    };

    rec.onerror = (event: any) => {
      const error = event.error;
      console.warn("[LiveClient] Recognition error:", error);

      if (error === "not-allowed" || error === "audio-capture") {
        shouldListenRef.current = false;
        setStatus("error");
        setErrorMessage(
          error === "not-allowed"
            ? "Microphone access was denied. Please allow microphone permissions in browser settings."
            : "No microphone detected on your device. Please plug in a mic."
        );
        stopAudioMeter();
        return;
      }

      if (error === "network") {
        setStatus("reconnecting");
      }
    };

    rec.onend = () => {
      setIsListening(false);
      // Auto-restart with backoff unless user manually clicked stop
      if (shouldListenRef.current) {
        setStatus("reconnecting");
        const backoffs = [300, 600, 1200];
        const delay = backoffs[Math.min(reconnectAttemptRef.current, backoffs.length - 1)];
        reconnectAttemptRef.current += 1;

        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (shouldListenRef.current) {
            try {
              rec.start();
            } catch (e) {
              initRecognition();
            }
          }
        }, delay);
      } else {
        setStatus("idle");
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.warn("[LiveClient] Error starting speech recognition:", e);
    }
  };

  const handleClear = () => {
    setCommittedHindi([]);
    setInterimHindi("");
    setCommittedHinglish([]);
    setInterimHinglish([]);
  };

  const handleCopy = () => {
    const text = committedHinglish.map((w) => w.hinglish).join(" ");
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const text = committedHinglish.map((w) => w.hinglish).join(" ");
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `live-hinglish-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMisses = () => {
    const rulesWords = committedHinglish.filter((w) => w.tier === "rule");
    const counts: Record<string, { hinglish: string; count: number }> = {};
    for (const w of rulesWords) {
      if (!counts[w.hindi]) {
        counts[w.hindi] = { hinglish: w.hinglish, count: 0 };
      }
      counts[w.hindi].count++;
    }
    const blob = new Blob([JSON.stringify(counts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hinglish-misses-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dictCount = committedHinglish.filter((w) => w.tier === "dict" || w.tier === "passthrough").length;
  const ruleCount = committedHinglish.filter((w) => w.tier === "rule").length;

  return (
    <div className="min-h-screen bg-paper text-ink p-4 sm:p-8 flex flex-col justify-between selection:bg-primary selection:text-white">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-card-line pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="p-1.5 rounded-full hover:bg-card-line/50 text-ink-3 hover:text-ink transition-colors"
                title="Back to Dashboard"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Live Hindi → <span className="text-primary">Hinglish</span>
              </h1>
            </div>
            <p className="text-xs text-ink-2 pl-8">
              Speak Hindi into your microphone and view live Latin-script Hinglish text. Zero backend latency.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="pill-tint-mid px-3 py-1 rounded-pill text-xs font-bold font-mono">
              हिन्दी → Hinglish
            </span>
            <span
              className={`px-3 py-1 rounded-pill text-xs font-semibold border ${
                dictReady
                  ? "bg-teal/10 text-teal border-teal/20"
                  : "bg-amber/10 text-amber border-amber/20"
              }`}
            >
              {dictReady ? "Dictionary Active" : "Rules Engine Ready"}
            </span>
          </div>
        </div>

        {/* BROWSER SUPPORT WARNING */}
        {isSupported === false && (
          <div className="card-torque p-6 bg-rose/5 border-rose/30 space-y-2">
            <div className="flex items-center gap-2 text-rose font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Browser Speech API Not Supported</span>
            </div>
            <p className="text-xs text-ink-2">
              Live Hindi speech recognition requires Google Chrome or Microsoft Edge on Desktop or Android.
              Please switch to a supported browser to use this standalone live captioner.
            </p>
          </div>
        )}

        {/* ERROR BANNER */}
        {errorMessage && (
          <div className="card-torque p-4 bg-rose/10 border-rose/30 flex items-center justify-between gap-4">
            <div className="text-xs text-rose font-semibold">{errorMessage}</div>
            <button
              onClick={() => {
                setErrorMessage(null);
                startListening();
              }}
              className="px-3 py-1 rounded-pill bg-rose text-white text-xs font-bold cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {/* MAIN TABS CARD */}
        <div className="card-torque overflow-hidden shadow-card flex flex-col min-h-[420px]">
          {/* TABS HEADER */}
          <div className="flex border-b border-card-line bg-card/60 p-1.5 gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("live")}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "live"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-2 hover:text-ink hover:bg-card-line/40"
              }`}
            >
              1. Live Hinglish
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("hindi")}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "hindi"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-2 hover:text-ink hover:bg-card-line/40"
              }`}
            >
              2. Raw Hindi (Devanagari)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("words")}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "words"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-2 hover:text-ink hover:bg-card-line/40"
              }`}
            >
              3. Words Inspector ({committedHinglish.length})
            </button>
          </div>

          {/* TAB 1: LIVE HINGLISH VIEW */}
          {activeTab === "live" && (
            <div
              ref={scrollContainerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 50;
                userScrolledUpRef.current = !atBottom;
              }}
              className="flex-1 p-6 overflow-y-auto max-h-[380px] space-y-4"
            >
              {committedHinglish.length === 0 && interimHinglish.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-ink-3 space-y-2">
                  <Radio className="w-8 h-8 opacity-40 animate-pulse text-primary" />
                  <p className="text-sm font-medium">Click the microphone button below and begin speaking Hindi.</p>
                  <p className="text-xs text-ink-3">Example: "नमस्ते दोस्त, आप कैसे हैं? आज क्या प्लान है?"</p>
                </div>
              ) : (
                <div className="text-xl sm:text-2xl leading-relaxed flex flex-wrap gap-2 items-baseline">
                  {/* Finalized words with trust tier colors */}
                  {committedHinglish.map((w, idx) => (
                    <span
                      key={`final-${idx}`}
                      title={`${w.hindi} (tier: ${w.tier})`}
                      className={`px-1.5 py-0.5 rounded-md transition-colors ${
                        w.trust === "high"
                          ? "text-ink font-semibold"
                          : w.trust === "mid"
                          ? "text-amber font-semibold bg-amber/10"
                          : "text-rose font-semibold bg-rose/10 underline decoration-rose decoration-wavy"
                      }`}
                    >
                      {w.hinglish}
                    </span>
                  ))}

                  {/* In-progress interim words in lighter tone */}
                  {interimHinglish.map((w, idx) => (
                    <span
                      key={`interim-${idx}`}
                      className="text-ink-3 italic font-normal px-1 opacity-70 animate-pulse"
                    >
                      {w.hinglish}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: RAW HINDI DEVANAGARI */}
          {activeTab === "hindi" && (
            <div className="flex-1 p-6 overflow-y-auto max-h-[380px] space-y-4 font-['Noto_Sans_Devanagari']">
              {committedHindi.length === 0 && !interimHindi ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 text-ink-3">
                  <p className="text-sm font-medium">यहाँ पहचानी गई देवनागरी लिपि दिखाई देगी।</p>
                </div>
              ) : (
                <div className="text-xl sm:text-2xl leading-relaxed text-ink space-y-2">
                  {committedHindi.map((chunk, idx) => (
                    <span key={idx} className="mr-2">
                      {chunk}
                    </span>
                  ))}
                  {interimHindi && (
                    <span className="text-ink-3 italic opacity-70 animate-pulse">
                      {interimHindi}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WORDS INSPECTOR */}
          {activeTab === "words" && (
            <div className="flex-1 p-6 overflow-y-auto max-h-[380px] space-y-4">
              <div className="flex items-center justify-between text-xs pb-3 border-b border-card-line">
                <div className="flex items-center gap-4">
                  <span className="text-teal font-bold">Dictionary Hits: {dictCount}</span>
                  <span className="text-amber font-bold">Rules Fallback: {ruleCount}</span>
                </div>
                {ruleCount > 0 && (
                  <button
                    onClick={handleExportMisses}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-card border border-card-line text-ink text-xs font-bold hover:bg-card-line/50 transition-colors cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-primary" />
                    <span>Export Misses ({ruleCount})</span>
                  </button>
                )}
              </div>

              {committedHinglish.length === 0 ? (
                <p className="text-center py-12 text-xs text-ink-3">No words captured yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {committedHinglish.map((w, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-card-line bg-card flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-ink">{w.hinglish}</div>
                        <div className="text-[11px] text-ink-3 font-['Noto_Sans_Devanagari']">{w.hindi}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-pill font-mono text-[10px] font-bold ${
                          w.trust === "high"
                            ? "bg-teal/15 text-teal"
                            : w.trust === "mid"
                            ? "bg-amber/15 text-amber"
                            : "bg-rose/15 text-rose"
                        }`}
                      >
                        {w.tier}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONTROLS BAR (ALWAYS VISIBLE) */}
          <div className="border-t border-card-line bg-card p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* MIC BUTTON & STATUS */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                  isListening
                    ? "bg-rose text-white animate-pulse shadow-rose/30"
                    : "bg-primary text-white hover:bg-primary-hover shadow-primary/30"
                }`}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                {isListening && (
                  <span className="absolute -inset-1 rounded-full border-2 border-rose animate-ping pointer-events-none" />
                )}
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      status === "listening"
                        ? "bg-teal animate-pulse"
                        : status === "reconnecting"
                        ? "bg-amber animate-pulse"
                        : status === "error"
                        ? "bg-rose"
                        : "bg-ink-3"
                    }`}
                  />
                  <span className="text-xs font-bold capitalize text-ink">
                    {status === "listening"
                      ? "Listening (hi-IN)..."
                      : status === "reconnecting"
                      ? "Reconnecting..."
                      : status === "error"
                      ? "Mic Error"
                      : "Ready"}
                  </span>
                </div>

                {/* AUDIO LEVEL BAR */}
                {isListening && (
                  <div className="w-32 h-1.5 bg-card-line rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-teal transition-all duration-75"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleCopy}
                disabled={committedHinglish.length === 0}
                className="btn-pill-44 px-3.5 bg-paper border border-card-line text-xs font-semibold text-ink hover:border-ink-3/50 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={committedHinglish.length === 0}
                className="btn-pill-44 px-3.5 bg-paper border border-card-line text-xs font-semibold text-ink hover:border-ink-3/50 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .txt</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                disabled={committedHinglish.length === 0 && !interimHindi}
                className="btn-pill-44 px-3 bg-paper border border-card-line text-xs font-semibold text-ink-3 hover:text-rose hover:border-rose/40 disabled:opacity-40 transition-all cursor-pointer"
                title="Clear transcript"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
