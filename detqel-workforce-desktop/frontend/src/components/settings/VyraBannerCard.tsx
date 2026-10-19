import React from "react";
import Image from "next/image";
import { Zap, ShieldCheck, Target } from "lucide-react";
import type { AgentTrait } from "@/lib/api";

interface VyraBannerCardProps {
  quote?: string;
  traits?: AgentTrait[];
}

const DEFAULT_FALLBACK_TRAITS: AgentTrait[] = [
  { title: "Adaptable", description: "Across tasks and domains", icon: "zap" },
  { title: "Reliable", description: "Follows your guidelines", icon: "shield-check" },
  { title: "Goal-Oriented", description: "Built to get things done", icon: "target" },
];

export const VyraBannerCard: React.FC<VyraBannerCardProps> = ({
  quote,
  traits,
}) => {
  const activeTraits = traits && traits.length > 0 ? traits : DEFAULT_FALLBACK_TRAITS;
  const activeQuote =
    quote && quote.trim().length > 0
      ? quote
      : "Your intelligent AI agent for deeper insights, smarter decisions, and seamless execution.";

  const renderTraitIcon = (iconName: string) => {
    switch (iconName.toLowerCase()) {
      case "zap":
      case "lightning":
        return <Zap className="w-4.5 h-4.5 text-[#8a2be2] dark:text-[#c084fc]" />;
      case "shield-check":
      case "shield":
        return <ShieldCheck className="w-4.5 h-4.5 text-[#8a2be2] dark:text-[#c084fc]" />;
      case "target":
      case "goal":
      default:
        return <Target className="w-4.5 h-4.5 text-[#8a2be2] dark:text-[#c084fc]" />;
    }
  };

  return (
    <div className="w-full lg:w-[430px] xl:w-[470px] 2xl:w-[490px] shrink-0 flex flex-col items-center justify-between p-5 sm:p-6 rounded-3xl bg-white/95 dark:bg-[#0b101d]/90 border border-slate-200/90 dark:border-[#1c263d] shadow-sm dark:shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl relative overflow-hidden transition-all duration-300">
      {/* Background ambient radial glowing gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-gradient-to-b from-[#8a2be2]/15 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-52 h-52 bg-gradient-to-tl from-[#8a2be2]/10 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Cybernetic AI Banner & Ring */}
      <div className="w-full flex flex-col items-center justify-center relative z-10 pt-1 pb-3">
        <div className="relative w-[280px] sm:w-[320px] xl:w-[350px] aspect-square flex items-center justify-center">
          {/* Ambient circular glow behind the avatar */}
          <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-[#8a2be2]/25 via-indigo-500/15 to-transparent blur-xl pointer-events-none animate-pulse duration-1000" />
          
          <Image
            src="/images/detqel-vyra-settings-banner-left.png"
            alt="VYRA Agent"
            width={350}
            height={350}
            priority
            className="w-full h-full object-contain select-none drop-shadow-[0_10px_25px_rgba(138,43,226,0.3)] transition-transform duration-500 hover:scale-[1.02]"
          />
        </div>
      </div>

      {/* Quote card */}
      <div className="w-full mt-2 mb-5 p-4 rounded-2xl bg-slate-50/90 dark:bg-[#111728]/80 border border-slate-200/80 dark:border-[#1e2a44] text-center relative z-10 backdrop-blur-md shadow-xs">
        <p className="text-xs sm:text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
          &ldquo;{activeQuote}&rdquo;
        </p>
      </div>

      {/* 3 Bottom trait badges */}
      <div className="w-full grid grid-cols-3 gap-2 sm:gap-2.5 relative z-10">
        {activeTraits.map((trait, idx) => (
          <div
            key={idx}
            className="flex flex-col items-center text-center p-2.5 sm:p-3 rounded-2xl bg-slate-50/70 dark:bg-[#111829]/75 border border-slate-200/80 dark:border-[#1d273f] hover:border-[#8a2be2]/40 dark:hover:border-[#c084fc]/40 transition-all duration-200 group"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-100/80 dark:bg-[#8a2be2]/15 border border-purple-200/60 dark:border-[#8a2be2]/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-200 shadow-xs">
              {renderTraitIcon(trait.icon)}
            </div>
            <h4 className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight whitespace-nowrap">
              {trait.title}
            </h4>
            <p className="text-[9.5px] sm:text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {trait.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
