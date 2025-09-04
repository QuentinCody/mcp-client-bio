import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isServerLocked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("mcp:locked") === "1";
}

export function getPresetServers(): Array<{ name: string; type: string; url: string }> {
  if (typeof window === "undefined") return [];
  try {
    const servers = localStorage.getItem("mcp-servers");
    return servers ? JSON.parse(servers) : [];
  } catch {
    return [];
  }
}
