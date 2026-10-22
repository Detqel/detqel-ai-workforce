import type { ComponentType } from "react";
import { Box, FileText, ShieldAlert, ShieldCheck, Sliders, Target, UserCheck, Zap } from "lucide-react";
import type { AgentTrait, VyraInstructions } from "@/lib/api";

export type InstructionTabKey = keyof VyraInstructions;

export const INSTRUCTION_TABS: Array<{ key: InstructionTabKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "core", label: "Core Instructions", icon: FileText },
  { key: "behaviour", label: "Behaviour", icon: UserCheck },
  { key: "knowledge", label: "Knowledge", icon: Box },
  { key: "boundaries", label: "Boundaries", icon: ShieldAlert },
  { key: "responseStyle", label: "Response Style", icon: Sliders },
];

export const INSTRUCTION_CHARACTER_LIMIT = 4000;
export const INSTRUCTION_ENHANCE_DELAY_MS = 600;
export const SETTINGS_SAVE_SUCCESS_DURATION_MS = 2500;

export const AGENT_BANNER_TRAITS: AgentTrait[] = [
  { title: "Adaptable", description: "Across tasks and domains", icon: "zap" },
  { title: "Reliable", description: "Follows your guidelines", icon: "shield-check" },
  { title: "Goal-Oriented", description: "Built to get things done", icon: "target" },
];

export const AGENT_BANNER_QUOTE = "Your intelligent AI agent for deeper insights, smarter decisions, and seamless execution.";

export const PREVIEW_MODES = { chat: "chat", structured: "structured" } as const;
export const AI_PROVIDER_ICON_KEYS = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  groq: "groq",
  deepseek: "deepseek",
  custom: "custom",
} as const;

export const AI_PROVIDER_ICON_COLORS = { anthropic: "#D97757", grok: "#F55036" } as const;

export const AGENT_TRAIT_ICON_COMPONENTS = new Map([
  ["zap", Zap],
  ["lightning", Zap],
  ["shield-check", ShieldCheck],
  ["shield", ShieldCheck],
  ["target", Target],
  ["goal", Target],
]);
export const AGENT_TRAIT_DEFAULT_ICON = Target;

export const INSTRUCTION_ENHANCEMENT_TEXT = {
  core: `You are VYRA, an autonomous AI agent engineered for enterprise workflows.\nUnderstand user intent with high contextual awareness, proactively clarify ambiguities,\nand leverage connected tools to deliver structured, deterministic, and verifiable outcomes.`,
  behaviour: `Maintain an executive, authoritative yet supportive tone.\nValidate system state before dispatching operations, provide concise diffs, and ensure zero unhandled edge cases.`,
};

export const INSTRUCTION_ENHANCEMENT_SUFFIX = "[Optimized by VYRA AI: Enhanced for low-latency reasoning and strict boundary safety.]";

export const LEGACY_PROVIDER_KEY_STATUS = "Valid key · Connected successfully";
