"use client";
import Link from "next/link";
import { Activity, BookOpen, Sparkles, LayoutDashboard, HeartPulse, FileText } from "lucide-react";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export default function Navbar() {
  return (
    <header className="border-b border-card-line bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link className="flex items-center gap-2 group" href="/">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <span className="font-bold text-xl tracking-tight text-ink">
            Signal<span className="text-brand-600">Path</span>
          </span>
        </Link>

        <nav className="flex items-center gap-5 sm:gap-6">
          <Link className="text-sm font-medium text-ink-2 hover:text-brand-600 transition-colors flex items-center gap-1.5" href="/dashboard">
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </Link>
          <Link className="text-sm font-medium text-ink-2 hover:text-brand-600 transition-colors flex items-center gap-1.5" href="/new">
            <Activity className="w-4 h-4" /> Studio
          </Link>
          <Link className="text-sm font-medium text-ink-2 hover:text-brand-600 transition-colors flex items-center gap-1.5" href="/ocr">
            <FileText className="w-4 h-4" /> Image OCR
          </Link>
          <Link className="text-sm font-medium text-ink-2 hover:text-brand-600 transition-colors flex items-center gap-1.5" href="/library">
            <BookOpen className="w-4 h-4" /> Library
          </Link>
          <Link className="text-sm font-medium text-ink-2 hover:text-brand-600 transition-colors flex items-center gap-1.5" href="/status">
            <HeartPulse className="w-4 h-4" /> Status
          </Link>

          <div className="pl-2 border-l border-card-line flex items-center">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all duration-150">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </nav>
      </div>
    </header>
  );
}
