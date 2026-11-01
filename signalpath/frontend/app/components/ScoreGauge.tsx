"use client";

import { motion } from "framer-motion";
import { TORQUE_EASE, usePrefersReducedMotion } from "@/lib/motion";

interface ScoreGaugeProps {
  score: number; // 0 to 1 or 0 to 100
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
}

export default function ScoreGauge({
  score,
  size = 56,
  strokeWidth = 5,
  label,
  color,
}: ScoreGaugeProps) {
  const prefersReduced = usePrefersReducedMotion();

  // Normalize score to percentage 0-100
  const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  // Determine trust color if not supplied
  const strokeColor =
    color ||
    (pct >= 75
      ? "var(--trust-high)"
      : pct >= 50
      ? "var(--trust-mid)"
      : "var(--trust-low)");

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-card-line fill-none"
        />
        {/* Animated fill circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: prefersReduced ? strokeDashoffset : strokeDashoffset }}
          transition={{ duration: 0.9, ease: TORQUE_EASE }}
          strokeLinecap="round"
          className="fill-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono-numbers font-bold text-xs text-ink leading-none">
          {pct}%
        </span>
        {label && <span className="text-[9px] text-ink-3 uppercase tracking-tighter mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

