"use client";

import { motion } from "framer-motion";
import { usePrefersReducedMotion, TORQUE_EASE } from "@/lib/motion";

interface SplitTitleProps {
  text: string;
  className?: string;
  highlightText?: string;
}

export default function SplitTitle({ text, className = "", highlightText }: SplitTitleProps) {
  const prefersReduced = usePrefersReducedMotion();

  if (prefersReduced) {
    return (
      <h1 className={className}>
        {text} {highlightText && <span className="text-primary">{highlightText}</span>}
      </h1>
    );
  }

  const letters = Array.from(text);

  return (
    <h1 className={`${className} inline-flex flex-wrap items-baseline`}>
      {letters.map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.45,
            delay: index * 0.022,
            ease: TORQUE_EASE,
          }}
          className="inline-block whitespace-pre"
        >
          {char}
        </motion.span>
      ))}
      {highlightText && (
        <span className="text-primary inline-flex ml-2">
          {Array.from(highlightText).map((char, index) => (
            <motion.span
              key={`h-${index}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: (letters.length + index) * 0.022,
                ease: TORQUE_EASE,
              }}
              className="inline-block whitespace-pre"
            >
              {char}
            </motion.span>
          ))}
        </span>
      )}
    </h1>
  );
}
