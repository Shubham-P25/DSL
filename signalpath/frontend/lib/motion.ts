/**
 * Motion utilities and hooks for the Torque Operator-Panel design system.
 * Adheres to Design.md Section 1.3.
 */
import { useEffect, useState, useRef } from "react";

export const TORQUE_EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Checks if the user prefers reduced motion.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  return prefersReduced;
}

/**
 * Animated counter hook that smoothly animates from start to target value.
 */
export function useAnimatedCounter(targetValue: number, durationMs: number = 800): number {
  const [displayValue, setDisplayValue] = useState(0);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReduced) {
      setDisplayValue(targetValue);
      return;
    }

    let startTimestamp: number | null = null;
    const initial = displayValue;
    let rAfId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / durationMs, 1);
      // Ease out cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(initial + (targetValue - initial) * easedProgress);
      setDisplayValue(current);

      if (progress < 1) {
        rAfId = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetValue);
      }
    };

    rAfId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rAfId);
  }, [targetValue, durationMs, prefersReduced]);

  return displayValue;
}

/**
 * Magnetic button hook: translates the element slightly toward the cursor on hover.
 */
export function useMagnetic(distance: number = 6) {
  const ref = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced) return;

    // Disabled on touch devices
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const handleMouseMove = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = (mouseEvent.clientX - centerX) / (rect.width / 2);
      const deltaY = (mouseEvent.clientY - centerY) / (rect.height / 2);

      el.style.transform = `translate(${deltaX * distance}px, ${deltaY * distance}px)`;
      el.style.transition = "transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1)";
    };

    const handleMouseLeave = () => {
      el.style.transform = "translate(0px, 0px)";
      el.style.transition = "transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)";
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [distance, prefersReduced]);

  return ref;
}
