"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Send,
  Mic,
  MicOff,
  Users,
  Crown,
  MessageSquare,
  Zap,
  Brain,
  Globe,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  Square,
  Play,
  RotateCcw,
  CornerDownRight,
} from "lucide-react";
import type { DiscussionTarget } from "@/lib/discussionStore";
import type { AgentTeam, RecruitedAgent } from "@/lib/api";
import {
  apiExportDiscussionMessage,
  apiStreamContinueTurn,
  apiStreamDiscussionMessage,
  apiRestoreDiscussionCheckpoint,
  apiListDiscussionQuestions,
  type PendingQuestion,
  type ConversationContext,
  type ExportFormat,
  type PendingSpeaker,
  type ResponseMode,
  type CapabilityMode,
  type SessionUsage,
  type TurnEvent,
} from "@/lib/api/discussions";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { ContextTracker } from "./ContextTracker";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { listNames } from "@/constants/discussionConstants";
import { AgentActivity } from "./AgentActivity";
import { ReplyLine } from "./ReplyLine";
import { ReplyViewer } from "./ReplyViewer";
import { MessageSurface } from "./MessageSurface";
import { CopyMessageButton } from "./CopyMessageButton";
import { MarkdownComposer } from "./MarkdownComposer";
import { PendingQuestionCard, questionIntro } from "./PendingQuestionCard";
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
  toViewMessage,
  upsertStep,
  type ChatMessage,
} from "./discussionView";

export type { ChatMessage, ChatMessageSource } from "./discussionView";

interface VoiceRecognitionResult {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface VoiceRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: VoiceRecognitionResult) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type VoiceWindow = Window & { SpeechRecognition?: new () => VoiceRecognition; webkitSpeechRecognition?: new () => VoiceRecognition };

interface DiscussionChatWindowProps {
  activeTarget: DiscussionTarget | null;
  activeSessionId: string;
  workspaceId: string | null;
  initialMessages?: ChatMessage[];
  initialDraft?: string;
  initialQuestionId?: string;
  /** The session's gateway usage so far. */
  initialUsage: SessionUsage;
  /** Agents still due to reply in a turn that stopped before they did, when the session was opened. */
  initialPendingAgentIds: string[];
  teams: AgentTeam[];
  agents: RecruitedAgent[];
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  /** A document was saved in the discussion's artifacts. */
  onArtifactsChanged: () => void;
}

export const DiscussionChatWindow: React.FC<DiscussionChatWindowProps> = ({
  activeTarget,
  activeSessionId,
  teams,
  onMessagesUpdate,
  workspaceId,
  initialMessages,
  initialDraft,
  initialQuestionId,
  initialUsage,
  initialPendingAgentIds,
  onArtifactsChanged,
}) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [contextState, setContextState] = useState<ConversationContext | null | undefined>(undefined);
  const [isRestoring, setIsRestoring] = useState(false);
  const [inputText, setInputText] = useState(initialDraft ?? "");
  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [answerToQuestionId, setAnswerToQuestionId] = useState<string | null>(initialQuestionId ?? null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionsNotice, setQuestionsNotice] = useState<string | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(Boolean(workspaceId && activeSessionId));
  const [questionsVersion, setQuestionsVersion] = useState(0);
  const questionRevision = useRef(0);
  const questionFocus = useRef<string | undefined>(initialQuestionId);
  const newMessageMode = useRef(false);
  useEffect(() => {
    if (!workspaceId || !activeSessionId) return;
    let active = true;
    const controller = new AbortController();
    const revision = questionRevision.current;
    apiListDiscussionQuestions(workspaceId, { sessionId: activeSessionId, focusQuestionId: questionFocus.current, limit: 100 }, controller.signal).then(result => {
      if (!active || revision !== questionRevision.current) return;
      setQuestions(result.items);
      setQuestionsError(null);
      const focused = questionFocus.current;
      const stale = focused && !result.items.some(question => question.id === focused);
      if (stale) {
        newMessageMode.current = true;
        setQuestionsNotice("That question is no longer pending. Review the chat before resending your draft, or choose another question.");
      }
      const selected = newMessageMode.current ? null : focused ?? result.items[0]?.id ?? null;
      questionFocus.current = selected ?? undefined;
      setAnswerToQuestionId(selected);
    }).catch(error => { if (active && revision === questionRevision.current) setQuestionsError(error instanceof Error ? error.message : "Could not load unanswered questions."); }).finally(() => { if (active) setQuestionsLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, activeSessionId, questionsVersion]);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const documentAssetContext = useMemo(() => workspaceId && activeSessionId ? { workspaceId, sessionId: activeSessionId } : undefined, [workspaceId, activeSessionId]);
  const [isRecording, setIsRecording] = useState(false);
  const [responseMode, setResponseMode] = useState<ResponseMode>("detailed");
  const [capabilityMode, setCapabilityMode] = useState<CapabilityMode>("fast");
  const [webEnabled, setWebEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  // Active Team object if target is a team
  const activeTeam =
    activeTarget?.type === "team"
      ? teams.find((t) => t.id === activeTarget.id)
      : null;

  // Session message stream, seeded from the session's persisted history. The parent remounts this component
  // (via its key) whenever a different session's history loads, so no prop-to-state syncing is needed.
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [usage, setUsage] = useState<SessionUsage>(initialUsage);
  const [isStreaming, setIsStreaming] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  // Teammates due to reply after the one speaking now, as the server reports them.
  const [upNext, setUpNext] = useState<PendingSpeaker[]>([]);
  // Agents still due to reply in a turn that was stopped or left; the user can let them continue.
  const [stalled, setStalled] = useState<string[]>(initialPendingAgentIds);
  // The handoff open in the viewer.
  const [viewingId, setViewingId] = useState<string | null>(null);

  // The viewer moves between the handoffs given together with the one opened: the run of consecutive handoffs
  // around it. A document is viewed on its own. Interrupted attempts remain visible in the conversation.
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
  const closeViewer = useCallback(() => setViewingId(null), [setViewingId]);

  /** Exports a saved reply for download. */
  const exportReply = useCallback(async (message: ChatMessage, format: ExportFormat) => {
    if (!workspaceId || !activeSessionId) return;
    try {
      const file = await apiExportDiscussionMessage(workspaceId, activeSessionId, message.id, format);
      toast.download(saveDownload(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the reply.");
    }
  }, [workspaceId, activeSessionId, toast]);

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
      case "routed": {
        const id = liveIds.current.get(event.agentId);
        liveIds.current.delete(event.agentId);
        pendingText.current.delete(event.agentId);
        if (speaking.current === event.agentId) speaking.current = null;
        if (id) setMessages(previous => previous.filter(message => message.id !== id));
        break;
      }
      case "turn":
        onUserMessageSaved(toViewMessage(event.userMessage, activeTarget));
        if (event.answerToQuestionId) {
          questionRevision.current++;
          if (questionFocus.current === event.answerToQuestionId) questionFocus.current = undefined;
          setQuestions(items => items.filter(question => question.id !== event.answerToQuestionId));
          setAnswerToQuestionId(current => current === event.answerToQuestionId ? null : current);
        }
        break;
      case "question":
        questionRevision.current++;
        newMessageMode.current = false;
        setQuestions(items => [...items.filter(question => question.id !== event.question.id), event.question]);
        questionFocus.current = event.question.id;
        setAnswerToQuestionId(event.question.id);
        setQuestionsError(null);
        setQuestionsNotice(null);
        setQuestionsLoading(false);
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
        setMessages(prev => prev.some(message => message.id === id) ? prev.map(message => message.id === id ? saved : message) : prev.some(message => message.id === saved.id) ? prev : [...prev, saved]);
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
      case "context":
        setContextState(event.context);
        break;
    }
  }, [activeTarget, updateLive, flushText, onArtifactsChanged, setViewingId]);

  /**
   * Runs a streamed turn, retaining interrupted progress until the server history replaces it.
   */
  const runTurn = useCallback(async (
    start: (onEvent: (event: TurnEvent) => void, signal: AbortSignal) => Promise<void>,
    handlers: { onUserMessageSaved?: (message: ChatMessage) => void; onFailedBeforeSaving?: () => void; pendingAgentIds?: string[] } = {},
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    liveIds.current.clear();
    speaking.current = null;
    queued.current = [];
    setStalled([]);
    setTurnError(null);
    setUpNext([]);
    setIsStreaming(true);
    let userMessageSaved = false;
    let interruption: string | null = null;
    const onUserMessageSaved = (message: ChatMessage) => {
      userMessageSaved = true;
      handlers.onUserMessageSaved?.(message);
    };
    try {
      await start((event) => applyEvent(event, onUserMessageSaved), controller.signal);
    } catch (error) {
      if (!mounted.current) return;
      interruption = controller.signal.aborted ? "Stopped before completion. Continue when you are ready."
        : error instanceof Error ? error.message : "The agent could not complete this request.";
      setStalled([...new Set([speaking.current, ...queued.current, ...(handlers.pendingAgentIds ?? [])].filter((agentId): agentId is string => Boolean(agentId)))]);
      setTurnError(interruption);
      if (!controller.signal.aborted) {
        if (!userMessageSaved) handlers.onFailedBeforeSaving?.();
        toast.error(interruption);
      }
    } finally {
      if (mounted.current && abortRef.current === controller) {
        abortRef.current = null;
        if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
        const tail = new Map(pendingText.current);
        const live = new Map(liveIds.current);
        pendingText.current.clear();
        setMessages(previous => previous.map(message => {
          if (!message.streaming) return message;
          const agentId = [...live].find(([, id]) => id === message.id)?.[0];
          return { ...message, streaming: false, content: message.content + (agentId ? tail.get(agentId) ?? "" : ""),
            interruption: interruption ?? "The response ended before it was completed. Continue the unfinished work.",
            activity: message.activity?.map(step => step.status === "running" ? { ...step, status: "failed" } : step) };
        }));
        setUpNext([]);
        setIsStreaming(false);
        setQuestionsVersion(value => value + 1);
      }
    }
  }, [applyEvent, toast]);

  const stopTurn = () => abortRef.current?.abort();

  const continueTurn = () => {
    if (!workspaceId || !activeSessionId || isRestoring) return;
    void runTurn((onEvent, signal) => apiStreamContinueTurn(workspaceId, activeSessionId, onEvent, signal), { pendingAgentIds: stalled });
  };

  const restoreCheckpoint = async (message: ChatMessage) => {
    if (!workspaceId || !activeSessionId || isStreaming || isRestoring) return;
    const approved = await confirm({ title: "Restore checkpoint", message: `Remove this user message and everything after it, clear pending responses and agent memory, and put this request back in the chat box so you can edit and send it again. Earlier history, saved files and attached sources remain available.${inputText ? " Your current unsent draft will be replaced." : ""}`, confirmText: "Restore checkpoint", variant: "danger" });
    if (!approved) return;
    setIsRestoring(true);
    try {
      if (isRecording && recognitionRef.current) {
        recognitionRef.current.onresult = null;
        setIsRecording(false);
        recognitionRef.current.stop();
      }
      const session = await apiRestoreDiscussionCheckpoint(workspaceId, activeSessionId, message.id);
      setMessages(session.messages.map(item => toViewMessage(item, activeTarget)));
      setInputText(session.composerDraft.content);
      setUsage({ inputTokens: session.inputTokens, outputTokens: session.outputTokens, cachedTokens: session.cachedTokens, costUsd: session.costUsd });
      setContextState(null); setViewingId(null); setTurnError(null); setUpNext([]);
      setStalled([]);
      questionRevision.current++;
      newMessageMode.current = !session.composerDraft.answerToQuestionId;
      questionFocus.current = session.composerDraft.answerToQuestionId;
      setQuestions([]); setAnswerToQuestionId(session.composerDraft.answerToQuestionId ?? null); setQuestionsVersion(value => value + 1);
      queued.current = []; speaking.current = null; liveIds.current.clear(); pendingText.current.clear();
      if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
      setComposerFocusRequest(value => value + 1);
      toast.success("Checkpoint restored. Edit the request in the chat box and send it when ready.");
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : "The checkpoint could not be restored."); }
    finally { setIsRestoring(false); }
  };

  // Keep the session list in sync with the last message.
  useEffect(() => {
    onMessagesUpdate(messages);
  }, [messages, onMessagesUpdate]);

  // Auto scroll to bottom, including when a question card appears under its message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, questions]);

  // Open questions render under the message that asked them; any whose message is not loaded go last.
  const questionsByMessage = useMemo(() => new Map(questions.map(question => [question.messageId, question])), [questions]);
  const orphanQuestions = useMemo(() => questions.filter(question => !messages.some(message => message.id === question.messageId)), [questions, messages]);
  const answeringQuestion = questions.find(question => question.id === answerToQuestionId);
  const routeComposer = (id: string | null) => {
    questionRevision.current++;
    questionFocus.current = id ?? undefined;
    newMessageMode.current = id === null;
    setQuestionsNotice(null);
    setAnswerToQuestionId(id);
    setQuestionsVersion(value => value + 1);
    setComposerFocusRequest(value => value + 1);
  };

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
      (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setIsRecording(true);
        };

        recognition.onresult = (event: VoiceRecognitionResult) => {
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
        setIsRecording(false);
        toast.error("Voice dictation could not start. Check microphone access and try again.");
      }
    } else {
      toast.error("Voice dictation is unavailable in this browser.");
    }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    void sendMessage(inputText, answerToQuestionId, true);
  };

  /**
   * Sends a message. With a question id it answers that question, and the server resumes the original request.
   * A composer draft goes back to the chat box if nothing was saved; a question card keeps its own choices.
   */
  const sendMessage = async (text: string, questionId: string | null, fromComposer: boolean) => {
    if (!text.trim() || isStreaming || isRestoring || questionsLoading) return;
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
    if (fromComposer) setInputText("");
    // A new message starts a new turn: agents still due from an earlier one no longer reply.
    await runTurn(
      (onEvent, signal) => apiStreamDiscussionMessage(workspaceId, activeSessionId, {
        message: text,
        ...(questionId ? { answerToQuestionId: questionId } : {}),
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
          if (fromComposer) setInputText(text);
        },
      },
    );
  };

  if (!activeTarget) {
    return (
      <div className="relative min-w-0 flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/30">
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
    <div className="min-w-0 flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden relative">
      {/* Modern Chat Header */}
      <header className="px-6 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between gap-4 shrink-0 select-none z-10">
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

        {/* Real usage figures reported by the orchestrator (Dollar Tracker) */}
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
      </header>

      {workspaceId && activeSessionId && <div className="px-6 py-1.5 bg-white/60 dark:bg-slate-900/60"><ContextTracker workspaceId={workspaceId} sessionId={activeSessionId} context={contextState} busy={isStreaming || isRestoring} onContext={setContextState} /></div>}

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
          messages.map((msg) => {
          const openQuestion = msg.role === "assistant" ? questionsByMessage.get(msg.id) : undefined;
          const body = openQuestion ? questionIntro(msg.content, openQuestion.questions) : msg.content;
          return <React.Fragment key={msg.id}>{isCompact(msg) ? (
          <ReplyLine message={msg} onView={() => setViewingId(msg.id)} onExport={(format) => exportReply(msg, format)} />
        ) : (
          <div
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

            <MessageSurface timestamp={msg.timestamp}
              className={`relative select-text min-w-0 rounded-2xl p-4 shadow-xs text-xs ${
                msg.role === "user"
                  ? "max-w-xl bg-slate-200/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-none ml-12"
                  : "max-w-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none mr-12"
              }`}
            >
              <CopyMessageButton text={msg.content} label={msg.role === "user" ? "Copy your message" : "Copy agent response"} disabled={Boolean(msg.streaming)} className={`absolute top-0 ${msg.role === "user" ? "-left-9" : "-right-9"}`} />
              {msg.role === "user" && !msg.id.startsWith("pending-") && <button type="button" onClick={() => { void restoreCheckpoint(msg); }} disabled={isStreaming || isRestoring} title="Restore checkpoint at this message" aria-label="Restore checkpoint at this message" className="absolute -left-9 top-8 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary disabled:opacity-30 cursor-pointer"><RotateCcw className="h-3.5 w-3.5" /></button>}
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

              {msg.role === "assistant" && msg.activity && msg.activity.length > 0 && (
                <AgentActivity steps={msg.activity} live={Boolean(msg.streaming)} />
              )}

              {msg.role === "assistant" ? (
                body || (!msg.streaming && !openQuestion) ? (
                  <div className={msg.streaming ? "[&>div>*:last-child]:after:content-['▍'] [&>div>*:last-child]:after:ml-0.5 [&>div>*:last-child]:after:animate-pulse [&>div>*:last-child]:after:text-primary" : undefined}>
                    <MarkdownContent content={body} assetContext={documentAssetContext} />
                  </div>
                ) : null
              ) : (
                <p data-chat-text className="select-text cursor-text break-words leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              )}

              {msg.role === "assistant" && msg.sources && <MessageSources sources={msg.sources} idPrefix={msg.id} />}
              {msg.interruption && <p role="status" className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 p-2.5 text-amber-800 dark:text-amber-200 text-xs">{msg.interruption}</p>}

            </MessageSurface>
          </div>
        )}
        {openQuestion && <PendingQuestionCard item={openQuestion} disabled={isStreaming || isRestoring || questionsLoading} onSubmit={(id, text) => { void sendMessage(text, id, false); }} />}
        </React.Fragment>;
        })
      )}
      {orphanQuestions.map(question => <PendingQuestionCard key={question.id} item={question} disabled={isStreaming || isRestoring || questionsLoading} onSubmit={(id, text) => { void sendMessage(text, id, false); }} />)}
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
      {!isStreaming && turnError && !messages.at(-1)?.interruption && (
        <p role="alert" className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3">{turnError}</p>
      )}
      {!isStreaming && stalled.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pl-11" role="status">
          <span>
            {listNames(stalled.map(nameOf))} {stalled.length === 1 ? "has" : "have"} not replied yet.
          </span>
          <button
            type="button"
            onClick={continueTurn}
            disabled={isRestoring}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary-border text-primary bg-primary-muted hover:opacity-90 font-semibold cursor-pointer"
          >
            <Play className="h-3 w-3" aria-hidden="true" /> Continue
          </button>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>

      <ReplyViewer replies={viewerReplies} openId={viewingId} onNavigate={setViewingId} onClose={closeViewer} onExport={exportReply} assetContext={workspaceId && activeSessionId ? { workspaceId, sessionId: activeSessionId } : undefined} />

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

      {/* Markdown composer */}
      <div className="min-w-0 p-4 shrink-0">
        {questionsLoading && <p role="status" className="mb-2 flex items-center gap-2 text-[11px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />Checking pending questions...</p>}
        {questionsError && <div role="alert" className="mb-2 flex items-center justify-between gap-3 text-xs text-red-700 dark:text-red-400"><p>{questionsError}</p><button type="button" onClick={() => setQuestionsVersion(value => value + 1)} className="shrink-0 font-semibold underline">Try again</button></div>}
        {questionsNotice && <p role="status" className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">{questionsNotice}</p>}
        {questions.length > 0 && <div role="status" className="mb-2 flex items-center justify-between gap-3 px-1 text-[11px] text-slate-500 dark:text-slate-400">
          <p className="flex min-w-0 items-center gap-1.5 truncate"><CornerDownRight className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
            {answeringQuestion ? <>Messages here answer <span className="font-semibold text-slate-700 dark:text-slate-200">{answeringQuestion.speakerName ?? "the agent"}</span>&apos;s question and continue the request.</> : "Messages here start a new request."}</p>
          <button type="button" disabled={isStreaming || isRestoring} onClick={() => routeComposer(answeringQuestion ? null : questions.at(-1)!.id)} className="shrink-0 font-semibold text-primary hover:underline disabled:opacity-50 cursor-pointer">
            {answeringQuestion ? "Send a new request instead" : "Answer the question instead"}
          </button>
        </div>}
        <form
          onSubmit={handleSendMessage}
          className="flex w-full min-w-0 flex-col gap-2 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl px-3 py-2 shadow-xs focus-within:ring-2 focus-within:ring-primary-ring focus-within:border-primary transition-colors"
        >
          <div className="flex w-full min-w-0 items-end gap-2">
          {/* Voice Activated Speech Recognition Button */}
          <button
            type="button"
            onClick={toggleVoiceRecording}
            title={isRecording ? "Stop voice recognition" : "Activate voice recognition"}
            disabled={isRestoring || questionsLoading}
            className={`shrink-0 p-2 rounded-xl transition-all cursor-pointer ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "text-slate-400 hover:text-primary hover:bg-slate-200/70 dark:hover:bg-slate-700"
            }`}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <MarkdownComposer
            value={inputText}
            onChange={setInputText}
            onSubmit={() => { void handleSendMessage(); }}
            sending={isStreaming || isRestoring || questionsLoading}
            disabled={isRestoring || questionsLoading}
            focusRequest={composerFocusRequest}
            placeholder={activeTarget.type === "team" ? `Dispatch directive to ${activeTarget.name} squad...` : `Instruct ${activeTarget.name}...`}
          />

          {/* Send, or stop the turn while agents are replying */}
          {isStreaming ? (
            <button
              type="button"
              onClick={stopTurn}
              title="Stop replying"
              aria-label="Stop replying"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white shadow-xs transition-all cursor-pointer"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputText.trim() || isRestoring || questionsLoading}
              title="Send directive"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-fg shadow-xs transition-all cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
          </div>
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

          <span className="ml-auto text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</span>
        </div>
      </div>
    </div>
  );
};

