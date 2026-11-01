"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { 
  Sparkles, 
  LayoutDashboard, 
  Activity, 
  FileText, 
  BookOpen, 
  HeartPulse, 
  Search, 
  Sun, 
  Moon, 
  Command as CommandIcon,
  Radio
} from "lucide-react";
import CommandPalette from "./CommandPalette";
import { TORQUE_EASE } from "@/lib/motion";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/new", label: "Studio", icon: Activity },
  { href: "/ocr", label: "Image OCR", icon: FileText },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/status", label: "Status", icon: HeartPulse },
];

export default function TorqueShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // If we are on /live page, render standalone without the operator shell (as required by Design.md Section 1.6 & 2.1)
  const isLiveStandalone = pathname?.startsWith("/live");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sp-theme") as "light" | "dark" | null;
      if (saved) {
        setTheme(saved);
        if (saved === "dark") {
          document.documentElement.setAttribute("data-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
      }
    } catch (e) {
      // localStorage may fail in restricted iframes
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("sp-theme", next);
      if (next === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } catch (e) {}
  };

  if (isLiveStandalone) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper text-ink selection:bg-primary selection:text-white">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-white shrink-0 border-r border-white/5 p-4 justify-between sticky top-0 h-screen z-40">
        <div className="space-y-6">
          {/* LOGO */}
          <Link href="/" className="flex items-center gap-3 px-3 py-2 group">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-md shadow-primary/30 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight leading-none text-white">
                Signal<span className="text-pill">Path</span>
              </div>
              <div className="text-[10px] text-ink-3 tracking-widest uppercase mt-0.5 font-bold">
                Operator Shell
              </div>
            </div>
          </Link>

          {/* NAV WITH SLIDING ORANGE PILL */}
          <nav className="space-y-1 relative">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-pill text-sm font-semibold transition-colors duration-200 z-10 ${
                    isActive ? "text-sidebar font-bold" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavPill"
                      transition={{ duration: 0.35, ease: TORQUE_EASE }}
                      className="absolute inset-0 bg-pill rounded-pill z-[-1] shadow-md shadow-pill/20"
                    />
                  )}
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-sidebar" : "text-gray-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* BOTTOM SIDEBAR FOOTER */}
        <div className="pt-4 border-t border-white/10 space-y-3">
          <Link
            href="/live"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-pill animate-pulse" />
              <span className="font-medium">Live Mic Captions</span>
            </div>
            <span className="text-[10px] text-pill font-mono bg-pill/10 px-1.5 py-0.5 rounded-sm">0ms</span>
          </Link>

          <div className="px-3 text-[11px] text-gray-500 font-mono">
            v2.1 • 4 Langs En/Hi/De/Nl
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-8">
        {/* TOP BAR */}
        <header className="h-16 border-b border-card-line bg-card/70 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* SEARCH BUTTON (CMD+K) */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-pill bg-paper border border-card-line text-ink-3 hover:text-ink hover:border-ink-3/40 transition-all text-xs w-full max-w-xs cursor-pointer shadow-xs"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search pages or jobs...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] bg-card border border-card-line px-1.5 py-0.5 rounded-sm text-ink-2">
              <CommandIcon className="w-3 h-3" />K
            </kbd>
          </button>

          {/* CONTROLS */}
          <div className="flex items-center gap-3">
            {/* THEME TOGGLE */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className="w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:text-ink bg-paper border border-card-line hover:border-ink-3/40 transition-colors cursor-pointer"
            >
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-pill" />}
            </button>

            {/* CLERK USER */}
            <div className="flex items-center pl-2 border-l border-card-line">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="btn-pill-44 px-4 text-xs font-bold text-white bg-primary hover:bg-primary-hover shadow-xs cursor-pointer">
                    Sign In
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
          {children}
        </main>
      </div>

      {/* MOBILE FLOATING BOTTOM DOCK (Design.md 1.4) */}
      <nav className="md:hidden fixed bottom-3 left-4 right-4 z-40 bg-sidebar/95 backdrop-blur-lg border border-white/10 rounded-pill p-1.5 flex items-center justify-around shadow-2xl">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative p-2.5 rounded-full flex items-center justify-center transition-colors ${
                isActive ? "text-sidebar font-bold" : "text-gray-400 hover:text-white"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="mobileNavPill"
                  transition={{ duration: 0.35, ease: TORQUE_EASE }}
                  className="absolute inset-0 bg-pill rounded-full z-[-1]"
                />
              )}
              <Icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>

      {/* ⌘K COMMAND PALETTE MODAL */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
