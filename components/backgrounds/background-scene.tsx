"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface BackgroundSceneProps {
  className?: string;
}

const GRID_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.12) 1px, transparent 1px)",
  backgroundSize: "80px 80px",
};

export function BackgroundScene({ className }: BackgroundSceneProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,theme(colors.primary/20),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,theme(colors.primary/30),transparent_60%)]" />
      <div
        className="absolute inset-0 opacity-60 mix-blend-screen"
        style={GRID_STYLE}
      />
      <div className="absolute -top-32 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl sm:h-[40rem] sm:w-[40rem]" />
      <div className="absolute bottom-0 left-[-10%] h-[28rem] w-[28rem] rounded-full bg-secondary/25 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.35),transparent_65%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(59,130,246,0.08),rgba(244,114,182,0.06)_40%,rgba(59,130,246,0.12)_70%)] opacity-60" />
    </div>
  );
}
