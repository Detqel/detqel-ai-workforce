import {
  INSTRUCTION_TABS,
  INSTRUCTION_CHARACTER_LIMIT,
  INSTRUCTION_ENHANCE_DELAY_MS,
  INSTRUCTION_ENHANCEMENT_TEXT,
  INSTRUCTION_ENHANCEMENT_SUFFIX,
  type InstructionTabKey,
} from "@/constants/settingsConstants";
import React, { useState } from "react";
import {
  ChevronDown,
  Sparkles,
  LayoutTemplate,
  Check,
  Wand2,
} from "lucide-react";
import type { VyraInstructions, VyraTemplate } from "@/lib/api";

interface PersonalityInstructionsSectionProps {
  instructions: VyraInstructions;
  onInstructionsChange: (instructions: VyraInstructions) => void;
  templates: VyraTemplate[];
  onApplyTemplate: (template: VyraTemplate) => void;
  onEditWithAi?: (tab: keyof VyraInstructions, currentText: string) => void;
}

export const PersonalityInstructionsSection: React.FC<PersonalityInstructionsSectionProps> = ({
  instructions,
  onInstructionsChange,
  templates,
  onApplyTemplate,
  onEditWithAi,
}) => {
  const [activeTab, setActiveTab] = useState<InstructionTabKey>(INSTRUCTION_TABS[0].key);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState<boolean>(false);
  const [isAiEnhancing, setIsAiEnhancing] = useState<boolean>(false);

  const activeContent = instructions[activeTab] || "";
  const charLimit = INSTRUCTION_CHARACTER_LIMIT;
  const currentChars = activeContent.length;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length <= charLimit) {
      onInstructionsChange({
        ...instructions,
        [activeTab]: val,
      });
    }
  };

  const handleAiEnhance = async () => {
    setIsAiEnhancing(true);
    // Simulate intelligent prompt polish
    setTimeout(() => {
      let polished = activeContent;
      if (activeTab === "core") {
        polished = INSTRUCTION_ENHANCEMENT_TEXT.core;
      } else if (activeTab === "behaviour") {
        polished = INSTRUCTION_ENHANCEMENT_TEXT.behaviour;
      } else {
        polished = `${activeContent.trim()}\n\n${INSTRUCTION_ENHANCEMENT_SUFFIX}`;
      }
      onInstructionsChange({
        ...instructions,
        [activeTab]: polished,
      });
      setIsAiEnhancing(false);
      onEditWithAi?.(activeTab, polished);
    }, INSTRUCTION_ENHANCE_DELAY_MS);
  };

  return (
    <div
      className={`w-full p-5 sm:p-6 rounded-3xl bg-white/95 dark:bg-[#0c1222]/90 border border-slate-200/90 dark:border-[#1c273e] shadow-sm dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 relative ${
        templateDropdownOpen ? "z-30" : "z-10"
      }`}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between pb-4 sm:pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center font-bold text-xs bg-purple-100 dark:bg-[#1e1335] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/70 dark:border-[#7c3aed]/40 shadow-xs">
            02
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
              Personality &amp; Instructions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define how VYRA behaves, thinks and responds.
            </p>
          </div>
        </div>

        {/* Template Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setTemplateDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-[#141d31] dark:hover:bg-[#1b2640] border border-slate-200 dark:border-[#22304d] text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-[#8a2be2] dark:text-[#c084fc]" />
            <span>Use a template</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                templateDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {templateDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setTemplateDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-64 p-1.5 rounded-2xl bg-white dark:bg-[#11182c] border border-slate-200 dark:border-[#22304c] shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-[#1e2a42]">
                  Personality Templates
                </div>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      onApplyTemplate(tpl);
                      setTemplateDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-purple-50/80 dark:hover:bg-[#8a2be2]/15 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex flex-col group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold group-hover:text-[#8a2be2] dark:group-hover:text-[#c084fc]">
                        {tpl.name}
                      </span>
                    </div>
                    {tpl.description && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {tpl.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area: Left Tab Navigation & Right Editor Pane */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 pt-1">
        {/* Left Column: Vertical Tab List (4 cols) */}
        <div className="md:col-span-4 lg:col-span-3.5 flex flex-col space-y-1">
          {INSTRUCTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer text-left ${
                  isActive
                    ? "bg-purple-50/90 dark:bg-[#1a1534] text-[#8a2be2] dark:text-[#c084fc] border-l-3 border-[#8a2be2] dark:border-[#a855f7] shadow-2xs font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-[#131b2e]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive
                      ? "text-[#8a2be2] dark:text-[#c084fc]"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Column: Editor Pane (8 cols) */}
        <div className="md:col-span-8 lg:col-span-8.5 flex flex-col rounded-2xl bg-slate-50 dark:bg-[#0a0f1d] border border-slate-200/90 dark:border-[#1e2a42] overflow-hidden shadow-2xs">
          {/* Editor Header Bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200/80 dark:border-[#1a253b] bg-slate-100/50 dark:bg-[#0d1424]">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              System Prompt
            </span>

            <button
              type="button"
              onClick={handleAiEnhance}
              disabled={isAiEnhancing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#8a2be2] dark:text-[#c084fc] hover:bg-purple-50 dark:hover:bg-[#8a2be2]/15 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAiEnhancing ? "animate-spin" : ""}`} />
              <span>{isAiEnhancing ? "Enhancing..." : "Edit with AI"}</span>
            </button>
          </div>

          {/* Prompt Textarea */}
          <div className="relative p-3">
            <textarea
              rows={5}
              value={activeContent}
              onChange={handleTextChange}
              placeholder="Enter instructions for VYRA..."
              className="w-full bg-transparent text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 font-normal outline-hidden resize-none border-none p-0 focus:ring-0"
            />

            {/* Character counter */}
            <div className="flex justify-end pt-2">
              <span className="text-[10.5px] text-slate-400 dark:text-slate-500 font-mono">
                {currentChars} / {charLimit}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
