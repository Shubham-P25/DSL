import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Navbar from "./components/Navbar";

export const metadata: Metadata = {
  title: "SignalPath — Intelligent Caption Trust & Translation",
  description: "Next-gen ASR trust scoring, RAG repair, and zero-hallucination translation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-canvas min-h-screen text-slate-800 antialiased selection:bg-brand-500 selection:text-white">
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
