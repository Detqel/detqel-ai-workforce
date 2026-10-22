import { AI_PROVIDER_ICON_COLORS, AI_PROVIDER_ICON_KEYS } from "@/constants/settingsConstants";
import React from "react";
import {
  OpenaiIcon as DevOpenaiIcon,
  AnthropicIcon as DevAnthropicIcon,
  GrokIcon as DevGrokIcon,
} from "@dev.icons/react/mono";
import {
  GoogleIcon as DevGoogleIcon,
  Deepseek as DevDeepseekColorIcon,
} from "@dev.icons/react";

export interface ProviderIconProps {
  className?: string;
  size?: number | string;
  isSelected?: boolean;
}

export const OpenAIIcon: React.FC<ProviderIconProps> = ({
  className = "w-6 h-6",
  size,
  isSelected,
}) => {
  const hasTextColor = className.includes("text-");
  const fallbackColor = isSelected
    ? "text-[#8a2be2] dark:text-[#FFA500]"
    : "text-slate-800 dark:text-slate-200";

  return (
    <DevOpenaiIcon
      size={size}
      className={`${className} ${!hasTextColor ? fallbackColor : ""}`}
    />
  );
};

export const AnthropicIcon: React.FC<ProviderIconProps> = ({
  className = "w-6 h-6",
  size,
}) => {
  return (
    <DevAnthropicIcon
      size={size}
      className={className}
      style={{ color: AI_PROVIDER_ICON_COLORS.anthropic }}
    />
  );
};

export const GoogleIcon: React.FC<ProviderIconProps> = ({
  className = "w-6 h-6",
  size,
}) => {
  return <DevGoogleIcon size={size} className={className} />;
};

export const GrokIcon: React.FC<ProviderIconProps> = ({
  className = "w-6 h-6",
  size,
}) => {
  return (
    <DevGrokIcon
      size={size}
      className={className}
      style={{ color: AI_PROVIDER_ICON_COLORS.grok }}
    />
  );
};

export const DeepSeekIcon: React.FC<ProviderIconProps> = ({
  className = "w-6 h-6",
  size,
}) => {
  return <DevDeepseekColorIcon size={size} className={className} />;
};

export const CustomIcon: React.FC<ProviderIconProps> = ({
  className = "w-6 h-6",
  size,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="4" r="2" fill="currentColor" />
    <circle cx="20" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="20" r="2" fill="currentColor" />
    <circle cx="4" cy="12" r="2" fill="currentColor" />
    <path
      d="M12 6v3M18 12h-3M12 18v-3M6 12h3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const renderProviderIcon = (
  iconKey: string,
  className = "w-6 h-6",
  isSelected?: boolean
) => {
  switch (iconKey.toLowerCase()) {
    case AI_PROVIDER_ICON_KEYS.openai:
      return <OpenAIIcon className={className} isSelected={isSelected} />;
    case AI_PROVIDER_ICON_KEYS.anthropic:
      return <AnthropicIcon className={className} isSelected={isSelected} />;
    case AI_PROVIDER_ICON_KEYS.google:
      return <GoogleIcon className={className} isSelected={isSelected} />;
    case AI_PROVIDER_ICON_KEYS.groq:
      return <GrokIcon className={className} isSelected={isSelected} />;
    case AI_PROVIDER_ICON_KEYS.deepseek:
      return <DeepSeekIcon className={className} isSelected={isSelected} />;
    case AI_PROVIDER_ICON_KEYS.custom:
    default:
      return <CustomIcon className={className} isSelected={isSelected} />;
  }
};

