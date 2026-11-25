import {
  BarChart3,
  ClipboardCheck,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Lightbulb,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  BrainActionIconKey,
  BrainCapabilityIconKey,
  BrainTelemetryIconKey,
  BrainTelemetryTone,
} from "@/constants/brainConstants";

export const TELEMETRY_ICON_MAP: Record<BrainTelemetryIconKey, LucideIcon> = {
  database: Database,
  layers: Layers,
  network: Network,
  shield: ShieldCheck,
};

export const TELEMETRY_TONE_BADGE_CLASS: Record<BrainTelemetryTone, string> = {
  blue: "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/60",
  emerald:
    "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60",
  primary: "bg-primary-muted text-primary border-primary-border",
  amber:
    "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/60",
};

export const CAPABILITY_ICON_MAP: Record<BrainCapabilityIconKey, LucideIcon> = {
  "trending-up": TrendingUp,
  flask: FlaskConical,
  sliders: SlidersHorizontal,
  search: Search,
  lightbulb: Lightbulb,
  zap: Zap,
  network: Network,
  layers: Layers,
};

export const ACTION_ICON_MAP: Record<BrainActionIconKey, LucideIcon> = {
  branch: GitBranch,
  clipboard: ClipboardCheck,
  chart: BarChart3,
  sparkles: Sparkles,
  zap: Zap,
};
