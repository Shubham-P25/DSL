"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { 
  Search, 
  Activity, 
  BookOpen, 
  LayoutDashboard, 
  FileText, 
  HeartPulse, 
  Sparkles,
  ExternalLink,
  X
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  if (!open) return null;

  const navigateTo = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/50 backdrop-blur-xs transition-opacity">
      <div 
        className="fixed inset-0" 
        onClick={() => onOpenChange(false)} 
        aria-hidden="true" 
      />
      <div className="relative w-full max-w-xl card-torque overflow-hidden shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150">
        <Command className="w-full bg-card">
          <div className="flex items-center px-4 border-b border-card-line">
            <Search className="w-4 h-4 text-ink-3 mr-2 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Type a command or search pages... (ESC to close)"
              className="w-full py-4 text-sm bg-transparent text-ink placeholder:text-ink-3 focus:outline-hidden"
            />
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-lg text-ink-3 hover:text-ink hover:bg-card-line/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
            <Command.Empty className="py-6 text-center text-xs text-ink-3">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation" className="text-[11px] font-bold text-ink-3 px-2 py-1 uppercase tracking-wider">
              <Command.Item
                onSelect={() => navigateTo("/dashboard")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-ink hover:bg-card-line/60 cursor-pointer transition-colors"
              >
                <LayoutDashboard className="w-4 h-4 text-primary" />
                <span>SignalPath Dashboard</span>
              </Command.Item>
              <Command.Item
                onSelect={() => navigateTo("/new")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-ink hover:bg-card-line/60 cursor-pointer transition-colors"
              >
                <Activity className="w-4 h-4 text-orange" />
                <span>Caption Studio</span>
              </Command.Item>
              <Command.Item
                onSelect={() => navigateTo("/ocr")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-ink hover:bg-card-line/60 cursor-pointer transition-colors"
              >
                <FileText className="w-4 h-4 text-sky" />
                <span>Document OCR Studio</span>
              </Command.Item>
              <Command.Item
                onSelect={() => navigateTo("/library")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-ink hover:bg-card-line/60 cursor-pointer transition-colors"
              >
                <BookOpen className="w-4 h-4 text-violet" />
                <span>Job Library</span>
              </Command.Item>
              <Command.Item
                onSelect={() => navigateTo("/status")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-ink hover:bg-card-line/60 cursor-pointer transition-colors"
              >
                <HeartPulse className="w-4 h-4 text-teal" />
                <span>System Health & Status</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-card-line bg-card/60 flex items-center justify-between text-[11px] text-ink-3">
            <span>Navigation: ↑ ↓ Enter</span>
            <span>ESC to close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

