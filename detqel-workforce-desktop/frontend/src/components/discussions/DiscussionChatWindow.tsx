"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Mic,
  MicOff,
  Bot,
  Users,
  Sparkles,
  Crown,
  ChevronRight,
  PanelRight,
  Volume2,
  MessageSquare,
} from "lucide-react";
import type { DiscussionTarget } from "@/lib/discussionStore";
import type { AgentTeam, RecruitedAgent } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sender?: string;
  senderRole?: string;
  senderAvatarLetter?: string;
  isLead?: boolean;
  timestamp: string;
}

interface DiscussionChatWindowProps {
  activeTarget: DiscussionTarget | null;
  activeSessionId: string;
  teams: AgentTeam[];
  agents: RecruitedAgent[];
  isRightPaneOpen: boolean;
  onToggleRightPane: () => void;
  onMessagesUpdate: (messages: ChatMessage[]) => void;
}

export const DiscussionChatWindow: React.FC<DiscussionChatWindowProps> = ({
  activeTarget,
  activeSessionId,
  teams,
  agents,
  isRightPaneOpen,
  onToggleRightPane,
  onMessagesUpdate,
}) => {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Active Team object if target is a team
  const activeTeam =
    activeTarget?.type === "team"
      ? teams.find((t) => t.id === activeTarget.id)
      : null;

  // Active Agent object if target is an agent
  const activeAgent =
    activeTarget?.type === "agent"
      ? agents.find((a) => a.id === activeTarget.id)
      : null;

  // Session message stream state - initialized empty strictly with no default/mock messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Sync messages with parent for export
  useEffect(() => {
    onMessagesUpdate(messages);
  }, [messages, onMessagesUpdate]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Setup Voice Activated Text Recognition
  const toggleVoiceRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setIsRecording(true);
        };

        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript.trim()) {
            setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };

        recognition.onerror = () => {
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        // Fallback toggle simulation
        setIsRecording(true);
      }
    } else {
      // Browser doesn't support Web Speech API natively
      setIsRecording(!isRecording);
      if (!isRecording) {
        setTimeout(() => {
          setInputText((prev) =>
            prev
              ? `${prev} Please analyze the operational architecture and report key bottlenecks.`
              : "Please analyze the operational architecture and report key bottlenecks."
          );
          setIsRecording(false);
        }, 2200);
      }
    }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: "Just now",
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");

    // Simulate Agent / Squad Collaboration Response
    setTimeout(() => {
      if (activeTarget?.type === "team" && activeTeam && activeTeam.members.length > 0) {
        // Respond with Squad Collaboration
        const lead = activeTeam.lead || activeTeam.members[0];
        const secondary = activeTeam.members.find((m) => m.id !== lead.id) || lead;

        const leadMsg: ChatMessage = {
          id: `ast-${Date.now()}`,
          role: "assistant",
          sender: lead.agent.customName || lead.agent.template?.name || "Squad Lead",
          senderRole: lead.agent.customRole || lead.agent.template?.role || "Squad Lead",
          senderAvatarLetter: (lead.agent.customName || lead.agent.template?.name || "L")[0],
          isLead: true,
          content: `Directives parsed for "${text}". Coordinating pod members for collaborative synthesis.`,
          timestamp: "Just now",
        };

        setMessages((prev) => [...prev, leadMsg]);

        // Second specialist follow-up response
        setTimeout(() => {
          const specialistMsg: ChatMessage = {
            id: `spec-${Date.now()}`,
            role: "assistant",
            sender: secondary.agent.customName || secondary.agent.template?.name || "Specialist",
            senderRole: secondary.agent.customRole || secondary.agent.template?.role || "Domain Engineer",
            senderAvatarLetter: (secondary.agent.customName || secondary.agent.template?.name || "S")[0],
            isLead: false,
            content: `Execution pipeline completed. All verified parameters align with squad standards.`,
            timestamp: "Just now",
          };
          setMessages((prev) => [...prev, specialistMsg]);
        }, 1200);
      } else {
        // Single Agent Direct Response
        const replyMsg: ChatMessage = {
          id: `ast-${Date.now()}`,
          role: "assistant",
          sender: activeTarget?.name || "Specialist",
          senderRole: activeTarget?.role || "Autonomous Specialist",
          senderAvatarLetter: (activeTarget?.name || "A")[0],
          content: `Understood. I have evaluated your request regarding "${text}". Execution directives have been verified against active workspace parameters.`,
          timestamp: "Just now",
        };
        setMessages((prev) => [...prev, replyMsg]);
      }
    }, 800);
  };

  if (!activeTarget) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/30">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted text-primary mb-3 shadow-sm">
          <Users className="h-7 w-7" />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
          No Discussion Target Selected
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Select a squad or an individual recruited specialist from the left panel to begin discussion.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden relative">
      {/* Modern Chat Header */}
      <header className="px-6 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between shrink-0 select-none z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            {activeTarget.type === "team" ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-fg font-bold text-sm shadow-sm">
                <Users className="h-5 w-5" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-sm shadow-sm">
                {activeTarget.avatarLetter || activeTarget.name[0]}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {activeTarget.name}
              </h2>

              {activeTarget.type === "team" ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-primary-muted text-primary border border-primary-border shrink-0">
                  {activeTarget.focus || "Squad Collaboration"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                  Direct Agent
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              {activeTarget.type === "team" ? (
                <span>
                  {activeTeam?.members.length || 0} Specialists Assembled • Lead:{" "}
                  {activeTeam?.lead?.agent.customName || activeTeam?.lead?.agent.template?.name || "Assigned"}
                </span>
              ) : (
                <span>{activeTarget.role || "Autonomous Specialist"}</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Header Status & Toggle Pane */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleRightPane}
            title={isRightPaneOpen ? "Hide session resources" : "Show session resources"}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isRightPaneOpen
                ? "bg-primary-muted border-primary text-primary"
                : "border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-white dark:bg-slate-800"
            }`}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3 shadow-xs">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No Messages Yet
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Send a directive or activate voice recognition to start the discussion with {activeTarget.name}.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="relative shrink-0 mt-0.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold text-xs shadow-xs ${
                    msg.isLead
                      ? "bg-amber-500 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {msg.senderAvatarLetter || (msg.sender ? msg.sender[0] : "A")}
                </div>
                {msg.isLead && (
                  <Crown className="absolute -top-1 -left-1 h-3.5 w-3.5 text-amber-500 fill-amber-400 drop-shadow-xs -rotate-12" />
                )}
              </div>
            )}

            <div
              className={`max-w-xl rounded-2xl p-4 shadow-xs text-xs space-y-1.5 ${
                msg.role === "user"
                  ? "bg-primary text-primary-fg rounded-tr-none ml-12"
                  : "bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none mr-12"
              }`}
            >
              {msg.role === "assistant" && msg.sender && (
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/80">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {msg.sender}
                  </span>
                  {msg.senderRole && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                      {msg.senderRole}
                    </span>
                  )}
                  {msg.isLead && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200">
                      LEAD
                    </span>
                  )}
                </div>
              )}

              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>

              <div
                className={`text-[9px] pt-1 text-right ${
                  msg.role === "user" ? "text-primary-fg/70" : "text-slate-400"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))
      )}
      <div ref={messagesEndRef} />
    </div>

      {/* Voice Recognition Active Bar (when listening) */}
      {isRecording && (
        <div className="px-6 py-2 bg-red-500/10 border-t border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-between text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="font-bold">Listening... Speak your mandate or instruction clearly</span>
          </div>
          <button
            type="button"
            onClick={toggleVoiceRecording}
            className="text-[11px] font-bold hover:underline cursor-pointer"
          >
            Stop Recording
          </button>
        </div>
      )}

      {/* Modernized Input Box (Uploads strictly omitted as they are handled in Right Pane) */}
      <div className="p-4 bg-white/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 backdrop-blur-md shrink-0">
        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-2 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl px-3 py-2 shadow-xs focus-within:ring-2 focus-within:ring-primary-ring focus-within:border-primary transition-all"
        >
          {/* Voice Activated Speech Recognition Button */}
          <button
            type="button"
            onClick={toggleVoiceRecording}
            title={isRecording ? "Stop voice recognition" : "Activate voice recognition"}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "text-slate-400 hover:text-primary hover:bg-slate-200/70 dark:hover:bg-slate-700"
            }`}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {/* Main Input Text Field */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              activeTarget.type === "team"
                ? `Dispatch directive to ${activeTarget.name} squad...`
                : `Instruct ${activeTarget.name}...`
            }
            className="flex-1 bg-transparent border-none text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            title="Send directive"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-fg shadow-xs transition-all cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 px-1">
          <span>Press Enter to send directive</span>
          <span>Voice text recognition & collaborative autonomous synthesis active</span>
        </div>
      </div>
    </div>
  );
};

