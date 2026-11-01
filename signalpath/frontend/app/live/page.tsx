import type { Metadata } from "next";
import LiveClient from "./LiveClient";

export const metadata: Metadata = {
  title: "Live Hindi → Hinglish Captions — SignalPath",
  description: "Real-time speech-to-text Hindi captions transliterated to conversational Hinglish, 100% in browser.",
};

export default function LivePage() {
  return <LiveClient />;
}
