import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import TorqueShell from "./components/TorqueShell";

export const metadata: Metadata = {
  title: "SignalPath — Intelligent Caption Trust & Translation",
  description: "Next-gen ASR trust scoring, word-level verification, and zero-hallucination translation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="antialiased min-h-screen">
          <TorqueShell>{children}</TorqueShell>
        </body>
      </html>
    </ClerkProvider>
  );
}
