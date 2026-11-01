"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { extractImageText, OcrResult, ApiError } from "@/lib/api";
import {
  FileText,
  Upload,
  Link2,
  Sparkles,
  Loader2,
  Check,
  Copy,
  Download,
  AlertCircle,
  Eye,
  FileSpreadsheet,
  Cpu,
  Layers,
  ArrowRight,
  RefreshCw,
  Clock,
  Globe,
  Tag,
  CheckCircle2,
  X,
  FileCode,
  ListOrdered
} from "lucide-react";
import ScoreGauge from "../components/ScoreGauge";
import { useMagnetic } from "@/lib/motion";

export default function OcrStudioPage() {
  const { getToken } = useAuth();
  const magneticExtractRef = useMagnetic(6);

  const [activeInputTab, setActiveInputTab] = useState<"upload" | "url">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const [activeViewTab, setActiveViewTab] = useState<"structured" | "lines" | "markdown" | "raw">("structured");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clipboard paste listener (Ctrl+V) for rapid screenshot OCR
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setActiveInputTab("upload");
            setError(null);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Presets for instant one-click testing
  const samplePresets = [
    {
      title: "Invoice",
      desc: "Billing headers, items & amounts",
      action: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 650;
        canvas.height = 320;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 650, 320);
          ctx.fillStyle = "#0f172a";
          ctx.font = "bold 22px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText("INVOICE #INV-2026-904", 40, 50);
          ctx.font = "16px 'Plus Jakarta Sans', sans-serif";
          ctx.fillStyle = "#334155";
          ctx.fillText("Customer: John Doe", 40, 100);
          ctx.fillText("Date: October 14, 2026", 40, 135);
          ctx.fillStyle = "#047857";
          ctx.font = "bold 18px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText("Amount Due: $450.00", 40, 180);
          ctx.fillText("Status: PAID IN FULL", 40, 220);
          ctx.font = "italic 15px 'Plus Jakarta Sans', sans-serif";
          ctx.fillStyle = "#64748b";
          ctx.fillText("Notes: Thank you for your continued partnership!", 40, 270);

          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], "sample_invoice.png", { type: "image/png" });
              setSelectedFile(file);
              setPreviewUrl(URL.createObjectURL(blob));
              setActiveInputTab("upload");
            }
          });
        }
      },
    },
    {
      title: "Receipt",
      desc: "Supermarket items, tax & total breakdown",
      action: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 340;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 500, 340);
          ctx.fillStyle = "#1e293b";
          ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText("SUPERMART EXPRESS", 120, 45);
          ctx.font = "14px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText("Store #4812 • Terminal 03", 140, 75);
          ctx.fillText("---------------------------------------------", 40, 95);
          ctx.fillText("Organic Almond Milk 1L      $4.99", 40, 125);
          ctx.fillText("Sourdough Artisan Bread     $5.50", 40, 155);
          ctx.fillText("Cold Brew Concentrate      $8.99", 40, 185);
          ctx.fillText("---------------------------------------------", 40, 215);
          ctx.font = "bold 16px 'Plus Jakarta Sans', sans-serif";
          ctx.fillText("Subtotal: $19.48", 40, 245);
          ctx.fillText("Tax (8.25%): $1.61", 40, 275);
          ctx.fillStyle = "#0d9488";
          ctx.fillText("TOTAL CHARGED: $21.09", 40, 305);

          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], "sample_receipt.png", { type: "image/png" });
              setSelectedFile(file);
              setPreviewUrl(URL.createObjectURL(blob));
              setActiveInputTab("upload");
            }
          });
        }
      },
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
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleExtract = async () => {
    setError(null);
    if (activeInputTab === "upload" && !selectedFile) {
      setError(new ApiError("FILE_REQUIRED", "Please upload or drop an image first."));
      return;
    }
    if (activeInputTab === "url" && !imageUrl.trim()) {
      setError(new ApiError("URL_REQUIRED", "Please enter an image URL."));
      return;
    }

    setExtracting(true);
    setResult(null);

    try {
      const data = await extractImageText(
        getToken,
        activeInputTab === "upload" ? selectedFile! : undefined,
        activeInputTab === "url" ? imageUrl.trim() : undefined
      );
      setResult(data);
    } catch (err: any) {
      console.error("[OcrStudio] Extraction error:", err);
      setError(err instanceof ApiError ? err : new ApiError("EXTRACT_FAILED", err?.message || "Text extraction failed."));
    } finally {
      setExtracting(false);
    }
  };

  const copyToClipboard = (text: string, key?: string) => {
    navigator.clipboard.writeText(text);
    if (key) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-4">
      {/* HEADER SECTION (Item 7: removed 'AI Vision & Neural OCR') */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-card-line pb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
            Document Text Studio
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-1">
            Extract text elements, parse structured key-values, and inspect per-line confidence from documents and receipts.
          </p>
        </div>

        {/* DEMO PRESETS */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-ink-3 uppercase tracking-wider">Quick Presets:</span>
          {samplePresets.map((preset, idx) => (
            <button
              key={idx}
              onClick={preset.action}
              className="px-3.5 py-1.5 rounded-pill bg-card border border-card-line text-xs font-semibold text-ink hover:border-primary/50 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>{preset.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-rose/10 border border-rose/30 text-ink flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-sm text-rose">{error.message}</div>
            {error.hint && <div className="text-xs text-ink-2">{error.hint}</div>}
          </div>
        </motion.div>
      )}

      {/* TWO-COLUMN PROFESSIONAL STUDIO WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: PROFESSIONAL DOCUMENT INGEST */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card-torque overflow-hidden shadow-card">
            {/* INPUT MODE TABS */}
            <div className="flex border-b border-card-line bg-card/60 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveInputTab("upload")}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeInputTab === "upload"
                    ? "bg-primary text-white shadow-xs"
                    : "text-ink-2 hover:text-ink hover:bg-card-line/40"
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Upload Document</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveInputTab("url")}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  activeInputTab === "url"
                    ? "bg-primary text-white shadow-xs"
                    : "text-ink-2 hover:text-ink hover:bg-card-line/40"
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>Remote URL</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* TAB 1: UPLOAD & DROPZONE */}
              {activeInputTab === "upload" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {previewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-card-line bg-paper group">
                      <img
                        src={previewUrl}
                        alt="Document Preview"
                        className="w-full max-h-64 object-contain mx-auto"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setPreviewUrl(null);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                        isDragging
                          ? "border-primary bg-primary/5"
                          : "border-card-line hover:border-primary/50 hover:bg-card-line/20"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-card-line text-ink-2 mx-auto flex items-center justify-center">
                          <Upload className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-ink">
                            Drop document image here, or click to browse
                          </p>
                          <p className="text-xs text-ink-3 mt-1">
                            PNG, JPG, WEBP, BMP • You can also press <kbd className="font-mono text-[10px] bg-paper px-1 py-0.5 rounded-sm border border-card-line">Ctrl+V</kbd> anywhere to paste
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: REMOTE IMAGE URL */}
              {activeInputTab === "url" && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                    Direct Image URL
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      if (e.target.value.startsWith("http")) {
                        setPreviewUrl(e.target.value);
                      }
                    }}
                    placeholder="https://example.com/receipt.jpg"
                    className="w-full px-4 py-3 rounded-xl border border-card-line bg-paper text-ink text-sm placeholder:text-ink-3 focus:outline-hidden focus:border-primary"
                  />
                  {previewUrl && (
                    <div className="rounded-xl overflow-hidden border border-card-line bg-paper p-2">
                      <img
                        src={previewUrl}
                        alt="URL Preview"
                        className="w-full max-h-48 object-contain mx-auto"
                        onError={() => setPreviewUrl(null)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* EXTRACT ACTION BUTTON */}
              <div className="pt-2">
                <button
                  ref={magneticExtractRef as any}
                  type="button"
                  onClick={handleExtract}
                  disabled={extracting || (!selectedFile && !imageUrl)}
                  className="btn-pill-44 w-full bg-primary hover:bg-primary-hover text-white text-sm font-bold shadow-md shadow-primary/25 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Extracting Structured Text...</span>
                    </>
                  ) : (
                    <>
                      <span>Extract & Structure Text</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PROFESSIONAL EXTRACTION INSPECTOR */}
        <div className="lg:col-span-7 space-y-4">
          <div className="card-torque overflow-hidden shadow-card min-h-[460px] flex flex-col">
            {/* EXTRACTION RESULTS HEADER & TABS */}
            <div className="flex border-b border-card-line bg-card/60 p-1.5 gap-1.5 items-center justify-between">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveViewTab("structured")}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeViewTab === "structured"
                      ? "bg-primary text-white shadow-xs"
                      : "text-ink-2 hover:text-ink hover:bg-card-line/40"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Key-Values</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab("lines")}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeViewTab === "lines"
                      ? "bg-primary text-white shadow-xs"
                      : "text-ink-2 hover:text-ink hover:bg-card-line/40"
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>Line Confidence</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab("markdown")}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeViewTab === "markdown"
                      ? "bg-primary text-white shadow-xs"
                      : "text-ink-2 hover:text-ink hover:bg-card-line/40"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Markdown</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab("raw")}
                  className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeViewTab === "raw"
                      ? "bg-primary text-white shadow-xs"
                      : "text-ink-2 hover:text-ink hover:bg-card-line/40"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>

              {result && (
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.formatted_markdown)}
                    className="p-1.5 rounded-lg text-ink-3 hover:text-ink hover:bg-card-line/50 transition-colors"
                    title="Copy Markdown"
                  >
                    {copiedAll ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFile(result.formatted_markdown, "extracted_document.md", "text/markdown")}
                    className="p-1.5 rounded-lg text-ink-3 hover:text-ink hover:bg-card-line/50 transition-colors"
                    title="Download Markdown"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* RESULTS CONTENT */}
            <div className="flex-1 p-6">
              {!result && !extracting && (
                <div className="h-full flex flex-col items-center justify-center text-center py-20 text-ink-3 space-y-3">
                  <FileText className="w-12 h-12 stroke-1 text-ink-3/40" />
                  <p className="text-sm font-medium">Upload or drop a document on the left to extract text.</p>
                  <p className="text-xs text-ink-3 max-w-sm">
                    Invoices, receipts, labels, and forms are automatically structured into key-values with confidence analysis.
                  </p>
                </div>
              )}

              {extracting && (
                <div className="h-full flex flex-col items-center justify-center text-center py-20 space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-ink">Analyzing Image Content...</p>
                    <p className="text-xs text-ink-3">Running text detection and key-value structuring</p>
                  </div>
                </div>
              )}

              {result && (
                <div className="space-y-6">
                  {/* SUMMARY METRIC STRIP */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 border-b border-card-line">
                    <div className="p-3 rounded-xl bg-card border border-card-line">
                      <div className="text-[10px] text-ink-3 uppercase font-bold">Document Type</div>
                      <div className="font-bold text-sm text-ink capitalize mt-0.5">{result.document_type || "General"}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-card border border-card-line">
                      <div className="text-[10px] text-ink-3 uppercase font-bold">Confidence Score</div>
                      <div className="font-bold text-sm text-teal font-mono-numbers mt-0.5">
                        {Math.round(result.confidence_score * 100)}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-card border border-card-line">
                      <div className="text-[10px] text-ink-3 uppercase font-bold">Lines Found</div>
                      <div className="font-bold text-sm text-ink font-mono-numbers mt-0.5">{result.line_count}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-card border border-card-line">
                      <div className="text-[10px] text-ink-3 uppercase font-bold">Processing Time</div>
                      <div className="font-bold text-sm text-ink font-mono-numbers mt-0.5">{result.processing_time_ms} ms</div>
                    </div>
                  </div>

                  {/* VIEW 1: STRUCTURED KEY-VALUES */}
                  {activeViewTab === "structured" && (
                    <div className="space-y-3">
                      {result.structured_key_values && result.structured_key_values.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {result.structured_key_values.map((kv, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-xl bg-card border border-card-line flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="text-[10px] font-bold text-ink-3 uppercase">{kv.key}</div>
                                <div className="font-bold text-ink text-sm truncate">{kv.value}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(kv.value, `kv-${idx}`)}
                                className="p-1.5 rounded-lg hover:bg-card-line/50 text-ink-3 hover:text-ink shrink-0"
                              >
                                {copiedKey === `kv-${idx}` ? (
                                  <Check className="w-3.5 h-3.5 text-teal" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-3 py-6 text-center">No explicit key-values found in this document.</p>
                      )}
                    </div>
                  )}

                  {/* VIEW 2: LINE-BY-LINE CONFIDENCE */}
                  {activeViewTab === "lines" && (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {result.line_items && result.line_items.map((line, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-card border border-card-line flex items-center justify-between text-xs gap-3"
                        >
                          <span className="font-mono-numbers text-ink-3 text-[11px] w-6 shrink-0">#{line.id}</span>
                          <span className="font-medium text-ink flex-1">{line.text}</span>
                          <span
                            className={`font-mono-numbers text-[10px] font-bold px-2 py-0.5 rounded-pill ${
                              line.confidence >= 0.8
                                ? "bg-teal/15 text-teal"
                                : line.confidence >= 0.6
                                ? "bg-amber/15 text-amber"
                                : "bg-rose/15 text-rose"
                            }`}
                          >
                            {Math.round(line.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* VIEW 3: FORMATTED MARKDOWN */}
                  {activeViewTab === "markdown" && (
                    <div className="p-4 rounded-xl bg-paper border border-card-line text-xs font-mono text-ink leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {result.formatted_markdown}
                    </div>
                  )}

                  {/* VIEW 4: RAW JSON */}
                  {activeViewTab === "raw" && (
                    <pre className="p-4 rounded-xl bg-paper border border-card-line text-[11px] font-mono text-ink max-h-96 overflow-y-auto">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
