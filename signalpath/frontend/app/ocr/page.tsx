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
  SlidersHorizontal,
} from "lucide-react";

export default function OcrStudioPage() {
  const { getToken } = useAuth();

  const [activeInputTab, setActiveInputTab] = useState<"upload" | "url">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const [activeViewTab, setActiveViewTab] = useState<"structured" | "markdown" | "lines" | "raw">("structured");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sample presets for quick testing
  const samplePresets = [
    {
      title: "Sample Invoice",
      type: "Invoice",
      desc: "Billing headers, invoice number & amounts",
      action: async () => {
        // Create canvas with sample invoice
        const canvas = document.createElement("canvas");
        canvas.width = 650;
        canvas.height = 320;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 650, 320);
          ctx.fillStyle = "#0f172a";
          ctx.font = "bold 22px Inter, sans-serif";
          ctx.fillText("INVOICE #INV-2026-904", 40, 50);
          ctx.font = "16px Inter, sans-serif";
          ctx.fillStyle = "#334155";
          ctx.fillText("Customer: John Doe", 40, 100);
          ctx.fillText("Date: October 14, 2026", 40, 135);
          ctx.fillStyle = "#047857";
          ctx.font = "bold 18px Inter, sans-serif";
          ctx.fillText("Amount Due: $450.00", 40, 180);
          ctx.fillText("Status: PAID IN FULL", 40, 220);
          ctx.font = "italic 15px Inter, sans-serif";
          ctx.fillStyle = "#64748b";
          ctx.fillText("Notes: Thank you for your continued partnership!", 40, 270);

          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], "sample_invoice.png", { type: "image/png" });
              setSelectedFile(file);
              setPreviewUrl(URL.createObjectURL(blob));
            }
          });
        }
      },
    },
    {
      title: "Store Receipt",
      type: "Receipt",
      desc: "Supermarket items, tax & total breakdown",
      action: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 500;
        canvas.height = 340;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 500, 340);
          ctx.fillStyle = "#0f172a";
          ctx.font = "bold 20px monospace";
          ctx.fillText("METRO GROCERY MART", 120, 40);
          ctx.font = "14px monospace";
          ctx.fillText("Cashier: Sarah M. | Reg #04", 40, 80);
          ctx.fillText("---------------------------------", 40, 100);
          ctx.fillText("Fresh Organic Apples    $4.99", 40, 130);
          ctx.fillText("Almond Milk 1L          $3.49", 40, 160);
          ctx.fillText("Artisan Sourdough       $5.20", 40, 190);
          ctx.fillText("---------------------------------", 40, 220);
          ctx.fillText("Subtotal:              $13.68", 40, 250);
          ctx.fillText("Tax (8%):               $1.09", 40, 275);
          ctx.font = "bold 16px monospace";
          ctx.fillText("TOTAL:                 $14.77", 40, 310);

          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], "store_receipt.png", { type: "image/png" });
              setSelectedFile(file);
              setPreviewUrl(URL.createObjectURL(blob));
            }
          });
        }
      },
    },
    {
      title: "Business Card",
      type: "Card",
      desc: "Contact details, email & phone",
      action: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 580;
        canvas.height = 280;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(0, 0, 580, 280);
          ctx.strokeStyle = "#cbd5e1";
          ctx.strokeRect(10, 10, 560, 260);
          ctx.fillStyle = "#1e293b";
          ctx.font = "bold 22px Inter, sans-serif";
          ctx.fillText("Alex Morgan", 50, 60);
          ctx.font = "15px Inter, sans-serif";
          ctx.fillStyle = "#6366f1";
          ctx.fillText("Chief Technology Officer", 50, 90);
          ctx.fillStyle = "#475569";
          ctx.fillText("Email: alex.morgan@signalpath.ai", 50, 140);
          ctx.fillText("Phone: +1 (555) 389-2044", 50, 175);
          ctx.fillText("Web: www.signalpath.ai", 50, 210);
          ctx.fillText("Office: San Francisco, CA", 50, 245);

          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], "business_card.png", { type: "image/png" });
              setSelectedFile(file);
              setPreviewUrl(URL.createObjectURL(blob));
            }
          });
        }
      },
    },
  ];

  // Clipboard paste support
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
      if (file.type.startsWith("image/")) {
        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setError(null);
      } else {
        setError(new ApiError("INVALID_FILE", "Please drop an image file (PNG, JPG, WEBP)."));
      }
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
      setError(new ApiError("NO_IMAGE", "Please upload an image or choose a sample preset."));
      return;
    }
    if (activeInputTab === "url" && !imageUrl.trim()) {
      setError(new ApiError("NO_URL", "Please enter a valid image URL."));
      return;
    }

    setExtracting(true);
    try {
      const res = await extractImageText(
        getToken,
        activeInputTab === "upload" ? (selectedFile as File) : undefined,
        activeInputTab === "url" ? imageUrl.trim() : undefined
      );
      setResult(res);
      setActiveViewTab("structured");
    } catch (err: any) {
      setError(err instanceof ApiError ? err : new ApiError("OCR_ERROR", err?.message || "Failed to extract text."));
    } finally {
      setExtracting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyAllText = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.raw_text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
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
    <div className="max-w-6xl mx-auto space-y-8 py-6">
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>AI Vision & Neural OCR</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Image Text Studio</h1>
          <p className="text-sm text-slate-500 mt-1">
            Extract every text element with confidence scoring, document classification, and structured formatting.
          </p>
        </div>

        {/* SAMPLE PRESETS */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Try Demo:</span>
          {samplePresets.map((preset, idx) => (
            <button
              key={idx}
              onClick={preset.action}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
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
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-sm text-rose-900">{error.message}</div>
            {error.hint && <div className="text-xs text-rose-700">{error.hint}</div>}
          </div>
        </motion.div>
      )}

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: INPUT & PREVIEW */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* TABS */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveInputTab("upload")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeInputTab === "upload"
                    ? "bg-white text-brand-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload / Drop Image</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveInputTab("url")}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  activeInputTab === "url"
                    ? "bg-white text-brand-600 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Image URL</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {activeInputTab === "upload" ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-brand-500 bg-brand-50/40"
                      : selectedFile
                      ? "border-emerald-300 bg-emerald-50/20"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {previewUrl ? (
                    <div className="space-y-3">
                      <div className="relative aspect-video max-h-48 w-full rounded-xl overflow-hidden bg-slate-950/5 flex items-center justify-center border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="max-h-48 w-auto object-contain rounded-lg"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                        <span className="font-semibold truncate max-w-[200px]">
                          {selectedFile?.name || "Image Preview"}
                        </span>
                        <span className="text-brand-600 hover:underline">Change image</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 py-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">
                        Drop image here or click to browse
                      </div>
                      <div className="text-xs text-slate-400">
                        Supports PNG, JPG, WEBP, BMP • Paste with Ctrl+V
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Direct Image URL
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setPreviewUrl(e.target.value);
                    }}
                    placeholder="https://example.com/document.png"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  {previewUrl && (
                    <div className="aspect-video max-h-44 w-full rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-44 w-auto object-contain"
                        onError={() => setPreviewUrl(null)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* EXTRACT ACTION BUTTON */}
              <button
                type="button"
                onClick={handleExtract}
                disabled={extracting || (!selectedFile && !imageUrl)}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {extracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Neural OCR Extracting Text...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extract & Format Image Text</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* TIPS CARD */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs text-slate-600">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-brand-600" />
              <span>Features & Capability</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-500">
              <li>High-accuracy local neural OCR running with zero latency.</li>
              <li>Auto-detects Invoices, Receipts, Signboards, Business Cards.</li>
              <li>Extracts structured Key-Value pairs with amount & date parsing.</li>
              <li>Supports multi-lingual scripts including English, Hindi & Tamil.</li>
            </ul>
          </div>
        </div>

        {/* RIGHT COLUMN: RICH EXTRACTED OUTPUT */}
        <div className="lg:col-span-7 space-y-6">
          {result ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100 overflow-hidden space-y-6"
            >
              {/* TOP STATS BAR */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-t-2xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                      Extraction Completed
                    </div>
                    <div className="text-lg font-extrabold flex items-center gap-2">
                      <span>{result.document_type}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                        {result.confidence_score}% Confidence
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-300">
                  <div className="flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{result.detected_language}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>{result.line_count} lines ({result.word_count} words)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{result.processing_time_ms} ms</span>
                  </div>
                </div>
              </div>

              {/* VIEW TABS & EXPORT ACTIONS */}
              <div className="px-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveViewTab("structured")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeViewTab === "structured"
                        ? "bg-white text-brand-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Structured Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveViewTab("markdown")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeViewTab === "markdown"
                        ? "bg-white text-brand-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Formatted Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveViewTab("lines")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeViewTab === "lines"
                        ? "bg-white text-brand-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Line Items ({result.line_items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveViewTab("raw")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeViewTab === "raw"
                        ? "bg-white text-brand-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Raw Text
                  </button>
                </div>

                {/* EXPORT BUTTONS */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyAllText}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAll ? "Copied All!" : "Copy Text"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFile(result.formatted_markdown, "extracted_text.md", "text/markdown")}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export MD</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadFile(JSON.stringify(result, null, 2), "extracted_data.json", "application/json")}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>

              {/* TAB CONTENT PANELS */}
              <div className="p-5 pt-0">
                {activeViewTab === "structured" && (
                  <div className="space-y-6">
                    {/* KEY VALUE PAIRS */}
                    {result.structured_key_values && result.structured_key_values.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600" />
                          <span>Detected Fields & Key-Value Pairs</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {result.structured_key_values.map((kv, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-all flex items-center justify-between group"
                            >
                              <div className="space-y-0.5 overflow-hidden pr-2">
                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                                  {kv.key}
                                </div>
                                <div className="text-sm font-bold text-slate-900 truncate">
                                  {kv.value}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(kv.value, `kv-${idx}`)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                                title="Copy Value"
                              >
                                {copiedKey === `kv-${idx}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/60 text-xs text-amber-800">
                        No distinct key-value pairs detected. Switch to <strong>Line Items</strong> or <strong>Formatted Markdown</strong> tab to inspect the text blocks.
                      </div>
                    )}

                    {/* CONTENT PREVIEW CARDS */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Extracted Text Blocks</span>
                      </h4>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {result.line_items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-xl bg-white border border-slate-200/70 hover:border-brand-300 transition-all flex items-center justify-between group shadow-2xs"
                          >
                            <span className="text-sm font-medium text-slate-800">
                              {item.text}
                            </span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold">
                              {item.confidence}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeViewTab === "markdown" && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 space-y-2 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                    {result.formatted_markdown}
                  </div>
                )}

                {activeViewTab === "lines" && (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {result.line_items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 font-bold flex items-center justify-center font-mono">
                            {item.id}
                          </span>
                          <span className="font-semibold text-slate-800 text-sm">{item.text}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                              item.confidence >= 90
                                ? "bg-emerald-100 text-emerald-800"
                                : item.confidence >= 70
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {item.confidence}%
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.text, `line-${item.id}`)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {copiedKey === `line-${item.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeViewTab === "raw" && (
                  <div className="space-y-3">
                    <textarea
                      readOnly
                      value={result.raw_text}
                      rows={12}
                      className="w-full p-4 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs focus:outline-hidden border border-slate-800 leading-relaxed resize-none"
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* EMPTY PLACEHOLDER */
            <div className="h-full min-h-[420px] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
                <FileText className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-bold text-slate-800 text-base">
                  No Extracted Text Yet
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Upload an image on the left or click any demo preset above to see structured text extraction, confidence metrics, and tables.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
