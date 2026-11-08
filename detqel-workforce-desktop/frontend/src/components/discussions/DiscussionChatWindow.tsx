"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Send,
  Mic,
  MicOff,
  Users,
  Crown,
  PanelRight,
  MessageSquare,
  Zap,
  Brain,
  Globe,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  Square,
  Play,
} from "lucide-react";
import type { DiscussionTarget } from "@/lib/discussionStore";
import type { AgentTeam, RecruitedAgent } from "@/lib/api";
import {
  apiExportDiscussionMessage,
  apiStreamContinueTurn,
  apiStreamDiscussionMessage,
  type ExportFormat,
  type PendingSpeaker,
  type ResponseMode,
  type CapabilityMode,
  type SessionUsage,
  type TurnEvent,
} from "@/lib/api/discussions";
import { useToast } from "@/context/ToastContext";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { listNames } from "@/constants/discussionConstants";
import { AgentActivity } from "./AgentActivity";
import { ReplyLine } from "./ReplyLine";
import { ReplyViewer } from "./ReplyViewer";
import { ExportMenu } from "./ExportMenu";
import { saveDownload } from "@/lib/download";
import { MessageSources } from "./MessageSources";
import {
  formatCost,
  formatTime,
  formatTokens,
  formatTokensExact,
  documentOf,
  isCompact,
  isHandoff,
  isSaved,
  toViewMessage,
  upsertStep,
  type ChatMessage,
} from "./discussionView";

export type { ChatMessage, ChatMessageSource } from "./discussionView";

interface DiscussionChatWindowProps {
  activeTarget: DiscussionTarget | null;
  activeSessionId: string;
  workspaceId: string | null;
  initialMessages?: ChatMessage[];
  /** The session's gateway usage so far. */
  initialUsage: SessionUsage;
  /** Agents still due to reply in a turn that stopped before they did, when the session was opened. */
  initialPendingAgentIds: string[];
  teams: AgentTeam[];
  agents: RecruitedAgent[];
  isRightPaneOpen: boolean;
  onToggleRightPane: () => void;
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  /** A document or export was saved in the discussion's artifacts. */
  onArtifactsChanged: () => void;
}

export const DiscussionChatWindow: React.FC<DiscussionChatWindowProps> = ({
  activeTarget,
  activeSessionId,
  teams,
  agents,
  isRightPaneOpen,
  onToggleRightPane,
  onMessagesUpdate,
  workspaceId,
  initialMessages,
  initialUsage,
  initialPendingAgentIds,
  onArtifactsChanged,
}) => {
  const toast = useToast();
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>("detailed");
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>("fast");
  const [webEnabled, setWebEnabled] = useState(false);
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

  // Session message stream, seeded from the session's persisted history. The parent remounts this component
  // (via its key) whenever a different session's history loads, so no prop-to-state syncing is needed.
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [usage, setUsage] = useState<SessionUsage>(initialUsage);
  const [isStreaming, setIsStreaming] = useState(false);
  // Teammates due to reply after the one speaking now, as the server reports them.
  const [upNext, setUpNext] = useState<PendingSpeaker[]>([]);
  // Agents still due to reply in a turn that was stopped or left; the user can let them continue.
  const [stalled, setStalled] = useState<string[]>(initialPendingAgentIds);
  // The handoff open in the viewer.
  const [viewingId, setViewingId] = useState<string | null>(null);

  // The viewer moves between the handoffs given together with the one opened: the run of consecutive handoffs
  // around it. A document is viewed on its own. A reply cut off mid-way is removed, which closes the viewer.
  const viewerReplies = useMemo(() => {
    const at = messages.findIndex((message) => message.id === viewingId);
    if (at < 0) return [];
    if (!isHandoff(messages[at])) return isCompact(messages[at]) ? [messages[at]] : [];
    let first = at;
    let last = at;
    while (first > 0 && isHandoff(messages[first - 1])) first--;
    while (last < messages.length - 1 && isHandoff(messages[last + 1])) last++;
    return messages.slice(first, last + 1);
  }, [messages, viewingId]);
  const closeViewer = useCallback(() => setViewingId(null), []);

  /** Exports a saved reply, downloads it, and keeps the file in the discussion's artifacts. */
  const exportReply = useCallback(async (message: ChatMessage, format: ExportFormat) => {
    if (!workspaceId || !activeSessionId) return;
    try {
      const file = await apiExportDiscussionMessage(workspaceId, activeSessionId, message.id, format);
      saveDownload(file);
      onArtifactsChanged();
      toast.success(`Exported ${file.fileName}. It is also saved in this discussion's artifacts.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the reply.");
    }
  }, [workspaceId, activeSessionId, onArtifactsChanged, toast]);

  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // The reply being written by each speaker of the running turn, and who is speaking now.
  const liveIds = useRef(new Map<string, string>());
  const speaking = useRef<string | null>(null);
  const queued = useRef<string[]>([]);
  // Reply text arrives many times a second; it is applied once per frame so long replies stay smooth.
  const pendingText = useRef(new Map<string, string>());
  const frame = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving the discussion stops the turn; what was finished is saved, and the rest can continue later.
      abortRef.current?.abort();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const nameOf = useCallback((agentId: string) => {
    if (activeTarget?.type === "agent") return activeTarget.name;
    const member = activeTeam?.members.find((candidate) => candidate.agentId === agentId);
    return member ? member.agent.customName || member.agent.template?.name || "A teammate" : "A teammate";
  }, [activeTarget, activeTeam]);

  const updateLive = useCallback((agentId: string, change: (message: ChatMessage) => ChatMessage) => {
    const id = liveIds.current.get(agentId);
    if (!id) return;
    setMessages((prev) => prev.map((message) => (message.id === id ? change(message) : message)));
  }, []);

  const flushText = useCallback(() => {
    frame.current = null;
    const batch = new Map(pendingText.current);
    pendingText.current.clear();
    batch.forEach((text, agentId) => updateLive(agentId, (message) => ({ ...message, content: message.content + text })));
  }, [updateLive]);

  /** Applies one streamed event to the conversation. */
  const applyEvent = useCallback((event: TurnEvent, onUserMessageSaved: (message: ChatMessage) => void) => {
    if (!mounted.current) return;
    switch (event.type) {
      case "turn":
        onUserMessageSaved(toViewMessage(event.userMessage, activeTarget));
        break;
      case "speaker": {
        const id = `live-${event.agentId}-${crypto.randomUUID()}`;
        liveIds.current.set(event.agentId, id);
        speaking.current = event.agentId;
        queued.current = queued.current.filter((agentId) => agentId !== event.agentId);
        setUpNext((prev) => prev.filter((speaker) => speaker.agentId !== event.agentId));
        setMessages((prev) => [...prev, {
          id,
          role: "assistant",
          content: "",
          sender: event.name,
          senderRole: event.role,
          senderAvatarLetter: event.name[0],
          isLead: event.isLead,
          turnRole: event.turnRole,
          timestamp: formatTime(new Date()),
          activity: [],
          streaming: true,
        }]);
        break;
      }
      case "activity":
        updateLive(event.agentId, (message) => ({ ...message, activity: upsertStep(message.activity, event.step) }));
        break;
      case "token":
        pendingText.current.set(event.agentId, (pendingText.current.get(event.agentId) ?? "") + event.text);
        if (frame.current === null) frame.current = requestAnimationFrame(flushText);
        break;
      case "reply": {
        // The saved reply replaces the one being written, so what is shown matches what was stored.
        pendingText.current.delete(event.agentId);
        const id = liveIds.current.get(event.agentId);
        liveIds.current.delete(event.agentId);
        if (speaking.current === event.agentId) speaking.current = null;
        const saved = toViewMessage(event.message, activeTarget, event.sources);
        setMessages((prev) => prev.map((message) => (message.id === id ? saved : message)));
        if (documentOf(saved)?.saved) onArtifactsChanged();
        // A handoff open in the viewer stays open as its saved version.
        setViewingId((current) => (current === id ? saved.id : current));
        setUsage(event.usage);
        break;
      }
      case "pending":
        queued.current = event.speakers.map((speaker) => speaker.agentId);
        setUpNext(event.speakers);
        break;
      case "done":
        setUsage(event.usage);
        break;
    }
  }, [activeTarget, updateLive, flushText, onArtifactsChanged]);

  /**
   * Runs one streamed turn. Stopping it (or leaving) keeps the replies already saved; a reply cut off mid-way
   * was not saved, so it is removed, and the agents still due can continue later. A failure is reported.
   */
  const runTurn = useCallback(async (
    start: (onEvent: (event: TurnEvent) => void, signal: AbortSignal) => Promise<void>,
    handlers: { onUserMessageSaved?: (message: ChatMessage) => void; onFailedBeforeSaving?: () => void } = {},
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    liveIds.current.clear();
    speaking.current = null;
    queued.current = [];
    setStalled([]);
    setUpNext([]);
    setIsStreaming(true);
    let userMessageSaved = false;
    const onUserMessageSaved = (message: ChatMessage) => {
      userMessageSaved = true;
      handlers.onUserMessageSaved?.(message);
    };
    try {
      await start((event) => applyEvent(event, onUserMessageSaved), controller.signal);
    } catch (error) {
      if (!mounted.current) return;
      if (controller.signal.aborted) {
        setStalled([speaking.current, ...queued.current].filter((agentId): agentId is string => Boolean(agentId)));
      } else {
        if (!userMessageSaved) handlers.onFailedBeforeSaving?.();
        toast.error(error instanceof Error ? error.message : "The agent could not respond.");
      }
    } finally {
      if (mounted.current && abortRef.current === controller) {
        abortRef.current = null;
        if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
        pendingText.current.clear();
        setMessages((prev) => prev.filter((message) => !message.streaming));
        setUpNext([]);
        setIsStreaming(false);
      }
    }
  }, [applyEvent, toast]);

  const stopTurn = () => abortRef.current?.abort();

  const continueTurn = () => {
    if (!workspaceId || !activeSessionId) return;
    void runTurn((onEvent, signal) => apiStreamContinueTurn(workspaceId, activeSessionId, onEvent, signal));
  };

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

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || isStreaming) return;
    if (!workspaceId) {
      toast.error("Select a workspace before starting a discussion.");
      return;
    }
    if (!activeSessionId) {
      toast.error("This discussion session is not ready yet.");
      return;
    }

    const optimisticUser: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: formatTime(new Date()),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInputText("");
    // A new message starts a new turn: agents still due from an earlier one no longer reply.
    await runTurn(
      (onEvent, signal) => apiStreamDiscussionMessage(workspaceId, activeSessionId, {
        message: text,
        responseMode,
        capabilityMode,
        // Web search is only meaningful on the expert path.
        webEnabled: capabilityMode === "expert" && webEnabled,
      }, onEvent, signal),
      {
        onUserMessageSaved: (saved) => setMessages((prev) => prev.map((message) => (message.id === optimisticUser.id ? saved : message))),
        // Nothing was saved (for example, no model is configured), so the message goes back to the input.
        onFailedBeforeSaving: () => {
          setMessages((prev) => prev.filter((message) => message.id !== optimisticUser.id));
          setInputText(text);
        },
      },
    );
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
          {/* Session usage from the gateway, refreshed after every reply */}
          <div
            role="status"
            aria-live="polite"
            aria-label={`Session usage: ${formatTokensExact(usage.inputTokens)} input tokens sent, ${formatTokensExact(usage.outputTokens)} output tokens received, total cost ${formatCost(usage.costUsd)}`}
            title={`Input sent: ${formatTokensExact(usage.inputTokens)} tokens (${formatTokensExact(usage.cachedTokens)} served from cache)\nOutput received: ${formatTokensExact(usage.outputTokens)} tokens\nTotal cost: ${formatCost(usage.costUsd)}`}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-[10px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums shrink-0"
          >
            <span className="inline-flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3 text-sky-500" aria-hidden="true" />{formatTokens(usage.inputTokens)}</span>
            <span className="inline-flex items-center gap-0.5"><ArrowDownLeft className="h-3 w-3 text-emerald-500" aria-hidden="true" />{formatTokens(usage.outputTokens)}</span>
            <span className="pl-2 border-l border-slate-200 dark:border-slate-700">{formatCost(usage.costUsd)}</span>
          </div>

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
          messages.map((msg) => isCompact(msg) ? (
          <ReplyLine key={msg.id} message={msg} onView={() => setViewingId(msg.id)} onExport={(format) => exportReply(msg, format)} />
        ) : (
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
                  : "bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none mr-12"
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
                  {isSaved(msg) && (
                    <span className="ml-auto">
                      <ExportMenu onExport={(format) => exportReply(msg, format)} label={`Export ${msg.sender}'s reply`} />
                    </span>
                  )}
                </div>
              )}

              {msg.role === "assistant" && msg.activity && msg.activity.length > 0 && (
                <AgentActivity steps={msg.activity} live={Boolean(msg.streaming)} />
              )}

              {msg.role === "assistant" ? (
                msg.content || !msg.streaming ? (
                  <div className={msg.streaming ? "[&>div>*:last-child]:after:content-['▍'] [&>div>*:last-child]:after:ml-0.5 [&>div>*:last-child]:after:animate-pulse [&>div>*:last-child]:after:text-primary" : undefined}>
                    <MarkdownContent content={msg.content} />
                  </div>
                ) : null
              ) : (
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}

              {msg.role === "assistant" && msg.sources && <MessageSources sources={msg.sources} idPrefix={msg.id} />}

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
      {isStreaming && !messages.some((message) => message.streaming) && (
        <div className="flex items-center gap-2 text-xs text-slate-400 pl-11" role="status" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{activeTarget.type === "team" ? `${activeTarget.name} is gathering` : `${activeTarget.name} is getting ready`}…</span>
        </div>
      )}
      {isStreaming && upNext.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 pl-11" role="status" aria-live="polite">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Up next: {listNames(upNext.map((speaker) => speaker.name))}</span>
        </div>
      )}
      {!isStreaming && stalled.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pl-11" role="status">
          <span>
            {listNames(stalled.map(nameOf))} {stalled.length === 1 ? "has" : "have"} not replied yet.
          </span>
          <button
            type="button"
            onClick={continueTurn}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary-border text-primary bg-primary-muted hover:opacity-90 font-semibold cursor-pointer"
          >
            <Play className="h-3 w-3" aria-hidden="true" /> Continue
          </button>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>

      <ReplyViewer replies={viewerReplies} openId={viewingId} onNavigate={setViewingId} onClose={closeViewer} onExport={exportReply} />

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
      <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
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

          {/* Send, or stop the turn while agents are replying */}
          {isStreaming ? (
            <button
              type="button"
              onClick={stopTurn}
              title="Stop replying"
              aria-label="Stop replying"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white shadow-xs transition-all cursor-pointer"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputText.trim()}
              title="Send directive"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-fg shadow-xs transition-all cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        {/* Response and capability mode controls */}
        <div className="flex flex-wrap items-center gap-2 mt-2.5 px-1">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(["brief", "detailed"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setResponseMode(mode)}
                className={`px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors cursor-pointer ${responseMode === mode ? "bg-primary text-primary-fg" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setCapabilityMode("fast")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${capabilityMode === "fast" ? "bg-primary text-primary-fg" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <Zap className="h-3 w-3" /> Fast
            </button>
            <button
              type="button"
              onClick={() => setCapabilityMode("expert")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${capabilityMode === "expert" ? "bg-primary text-primary-fg" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              <Brain className="h-3 w-3" /> Expert
            </button>
          </div>

          <button
            type="button"
            onClick={() => setWebEnabled((value) => !value)}
            disabled={capabilityMode !== "expert"}
            title={capabilityMode === "expert" ? "Toggle web search" : "Web search is available in Expert mode"}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${webEnabled && capabilityMode === "expert" ? "bg-primary-muted border-primary text-primary" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            <Globe className="h-3 w-3" /> Web
          </button>

          <span className="ml-auto text-[10px] text-slate-400">Press Enter to send</span>
        </div>
      </div>
    </div>
  );
};

