"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  apiGetTeams,
  apiGetRecruitedAgents,
  type AgentTeam,
  type RecruitedAgent,
} from "@/lib/api";
import {
  getDiscussionTarget,
  clearDiscussionTarget,
  type DiscussionTarget,
} from "@/lib/discussionStore";
import {
  apiCreateDiscussionSession,
  apiListDiscussionSessions,
  apiListDiscussionMessages,
  apiDeleteDiscussionSession,
  apiGetDiscussionSession,
  apiRenameDiscussionSession,
  type ChatSession,
  type SessionUsage,
} from "@/lib/api/discussions";
import { EMPTY_USAGE, toViewMessage } from "@/components/discussions/discussionView";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import {
  DiscussionSidebar,
  type DiscussionSession,
} from "@/components/discussions/DiscussionSidebar";
import {
  DiscussionChatWindow,
  type ChatMessage,
} from "@/components/discussions/DiscussionChatWindow";
import { DiscussionRightPane } from "@/components/discussions/DiscussionRightPane";
import { NewDiscussionModal } from "@/components/discussions/NewDiscussionModal";
import { Loader2 } from "lucide-react";

export default function DiscussionsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const toast = useToast();
  const confirm = useConfirm();

  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [agents, setAgents] = useState<RecruitedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sessions state - strictly initialized empty with no mock/default sessions
  const [sessions, setSessions] = useState<DiscussionSession[]>([]);
  const [activeTarget, setActiveTarget] = useState<DiscussionTarget | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [isRightPaneOpen, setIsRightPaneOpen] = useState(true);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [currentMessages, setCurrentMessages] = useState<ChatMessage[]>([]);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [initialUsage, setInitialUsage] = useState<SessionUsage>(EMPTY_USAGE);
  const [initialPendingAgentIds, setInitialPendingAgentIds] = useState<string[]>([]);
  // Bumped whenever the chat saves a document or an export, so the artifacts list reloads.
  const [artifactsVersion, setArtifactsVersion] = useState(0);
  const handleArtifactsChanged = useCallback(() => setArtifactsVersion((version) => version + 1), []);

  /** Maps a backend session to the sidebar's session shape, keyed by the real backend id. */
  const toSidebarSession = useCallback((session: ChatSession, target: { name: string; avatarLetter?: string; targetId: string; targetType: "team" | "agent" }): DiscussionSession => ({
    id: session.id,
    title: session.title,
    targetId: target.targetId,
    targetType: target.targetType,
    name: target.name,
    avatarLetter: target.avatarLetter ?? target.name[0],
  }), []);

  /**
   * Shows a session's history, usage, and any agents still due to reply in the chat window. The window is
   * keyed by this version, so new history remounts it with fresh state instead of copying props into state.
   */
  const showHistory = useCallback((messages: ChatMessage[], session?: ChatSession) => {
    setInitialMessages(messages);
    setInitialUsage(session ? { inputTokens: session.inputTokens, outputTokens: session.outputTokens, cachedTokens: session.cachedTokens, costUsd: session.costUsd } : EMPTY_USAGE);
    setInitialPendingAgentIds(session?.pendingTurn?.queue.map((entry) => entry.agentId) ?? []);
    setHistoryVersion((version) => version + 1);
  }, []);

  const loadSessionMessages = useCallback(async (sessionId: string, target: DiscussionTarget | null) => {
    if (!workspaceId) return;
    try {
      const [messages, session] = await Promise.all([
        apiListDiscussionMessages(workspaceId, sessionId),
        apiGetDiscussionSession(workspaceId, sessionId),
      ]);
      showHistory(messages.map((message) => toViewMessage(message, target)), session);
    } catch (error) {
      showHistory([]);
      toast.error(error instanceof Error ? error.message : "Could not load the conversation.");
    }
  }, [workspaceId, toast, showHistory]);

  /** Opens the session for a target if one exists in `known`, otherwise creates it on the server. */
  const openOrCreateSession = useCallback(async (target: DiscussionTarget, known: DiscussionSession[]) => {
    if (!workspaceId) return;
    const existing = known.find((s) => s.targetId === target.id);
    if (existing) {
      setActiveTarget(target);
      setActiveSessionId(existing.id);
      await loadSessionMessages(existing.id, target);
      return;
    }
    try {
      const session = await apiCreateDiscussionSession({
        workspaceId,
        agentId: target.type === "agent" ? target.id : undefined,
        teamId: target.type === "team" ? target.id : undefined,
        title: target.name,
      });
      const sidebar = toSidebarSession(session, {
        targetId: target.id,
        targetType: target.type,
        name: target.name,
        avatarLetter: target.avatarLetter || target.name[0],
      });
      setSessions((prev) => [sidebar, ...prev]);
      setActiveTarget(target);
      setActiveSessionId(session.id);
      showHistory([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the discussion.");
    }
  }, [workspaceId, toSidebarSession, loadSessionMessages, showHistory, toast]);

  // Load workspace teams and recruited agents
  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setIsLoading(true);
      const [fetchedTeams, fetchedAgents] = await Promise.all([
        apiGetTeams(workspaceId),
        apiGetRecruitedAgents(workspaceId),
      ]);
      setTeams(fetchedTeams);
      setAgents(fetchedAgents);

      // Load persisted sessions for the sidebar. Their id is the real backend session id.
      const persisted = await apiListDiscussionSessions(workspaceId);
      const resolveTarget = (session: ChatSession) => {
        if (session.teamId) {
          const team = fetchedTeams.find((t) => t.id === session.teamId);
          const name = team?.name ?? session.title;
          return { targetId: session.teamId, targetType: "team" as const, name, avatarLetter: name[0] };
        }
        const agent = fetchedAgents.find((a) => a.id === session.agentId);
        const name = agent ? agent.customName || agent.template?.name || session.title : session.title;
        return {
          // A session whose agent was removed keeps its own id, so it can still be opened and deleted.
          targetId: session.agentId ?? session.id,
          targetType: "agent" as const,
          name,
          avatarLetter: name[0],
        };
      };
      const sidebarSessions = persisted.map((session) => toSidebarSession(session, resolveTarget(session)));
      setSessions(sidebarSessions);

      // A navigation target opens its existing session, or creates one for that agent/team.
      const incoming = getDiscussionTarget();
      if (incoming) {
        clearDiscussionTarget();
        await openOrCreateSession(incoming, sidebarSessions);
      }
    } catch (error) {
      setTeams([]);
      setAgents([]);
      toast.error(error instanceof Error ? error.message : "Could not load discussions.");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, toast, toSidebarSession, openOrCreateSession]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectTarget = (target: DiscussionTarget) => { void openOrCreateSession(target, sessions); };

  const handleDeleteSession = useCallback(async (session: DiscussionSession) => {
    if (!workspaceId) return;
    const confirmed = await confirm({ title: "Delete discussion", message: `Delete "${session.title}" and all of its messages and knowledge? This cannot be undone.`, variant: "danger", confirmText: "Delete" });
    if (!confirmed) return;
    try {
      await apiDeleteDiscussionSession(workspaceId, session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      if (activeSessionId === session.id) { setActiveSessionId(""); setActiveTarget(null); showHistory([]); }
      toast.success("Discussion deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the discussion.");
    }
  }, [workspaceId, confirm, activeSessionId, toast, showHistory]);

  const handleSelectSession = (session: DiscussionSession) => {
    setActiveSessionId(session.id);
    const applyTarget = (target: DiscussionTarget) => { setActiveTarget(target); void loadSessionMessages(session.id, target); };
    if (session.targetType === "team") {
      const team = teams.find((t) => t.id === session.targetId);
      if (team) {
        applyTarget({
          type: "team",
          id: team.id,
          name: team.name,
          focus: team.focus,
          accentColor: team.accentColor,
          memberCount: team.members.length,
        });
        return;
      }
    } else {
      const agent = agents.find((a) => a.id === session.targetId);
      if (agent) {
        const name = agent.customName || agent.template?.name || "Specialist";
        applyTarget({
          type: "agent",
          id: agent.id,
          name,
          role: agent.customRole || agent.template?.role,
          avatarLetter: name[0],
        });
        return;
      }
    }
    applyTarget({
      type: session.targetType,
      id: session.targetId,
      name: session.name,
      avatarLetter: session.avatarLetter,
    });
  };

  // Stable identity: the chat window reports messages from an effect that depends on this callback, so a new
  // function on every render would re-run that effect and loop.
  const handleMessagesUpdate = useCallback((messages: ChatMessage[]) => {
    setCurrentMessages(messages);
    if (messages.length === 0 || !activeSessionId) return;
    const last = messages[messages.length - 1];
    setSessions((prev) => {
      const current = prev.find((s) => s.id === activeSessionId);
      // Returning the same array when nothing changed lets React skip the re-render.
      if (!current || current.timestamp === last.timestamp) return prev;
      return prev.map((s) => (s.id === activeSessionId ? { ...s, timestamp: last.timestamp } : s));
    });
  }, [activeSessionId]);

  /** Renames a discussion; the list shows the new title at once and reverts if the server refuses it. */
  const handleRenameSession = useCallback(async (session: DiscussionSession, title: string) => {
    if (!workspaceId) return;
    const setTitle = (value: string) => setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, title: value } : s)));
    setTitle(title);
    try {
      const renamed = await apiRenameDiscussionSession(workspaceId, session.id, title);
      setTitle(renamed.title);
    } catch (error) {
      setTitle(session.title);
      toast.error(error instanceof Error ? error.message : "Could not rename the discussion.");
    }
  }, [workspaceId, toast]);

  if (!workspaceId) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center text-xs text-slate-400">
        Please select a workspace to view and participate in discussions.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex overflow-hidden bg-slate-100/70 dark:bg-[#0f172a]">
      {/* Left-hand window for chat histories of sessions */}
      <DiscussionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onOpenNewChatModal={() => setIsNewChatModalOpen(true)}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />

      {/* Center modernized chat window */}
      <DiscussionChatWindow
        key={`${activeSessionId}:${historyVersion}`}
        activeTarget={activeTarget}
        activeSessionId={activeSessionId}
        workspaceId={workspaceId ?? null}
        initialMessages={initialMessages}
        initialUsage={initialUsage}
        initialPendingAgentIds={initialPendingAgentIds}
        teams={teams}
        agents={agents}
        isRightPaneOpen={isRightPaneOpen}
        onToggleRightPane={() => setIsRightPaneOpen(!isRightPaneOpen)}
        onMessagesUpdate={handleMessagesUpdate}
        onArtifactsChanged={handleArtifactsChanged}
      />

      {/* Right-hand pane for artifacts, knowledge base, connectors */}
      {isRightPaneOpen && (
        <DiscussionRightPane
          activeTarget={activeTarget}
          workspaceId={workspaceId}
          activeSessionId={activeSessionId}
          messages={currentMessages}
          artifactsVersion={artifactsVersion}
          onClose={() => setIsRightPaneOpen(false)}
        />
      )}

      {/* Modal to pick target for new discussion */}
      <NewDiscussionModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        teams={teams}
        agents={agents}
        onSelectTarget={handleSelectTarget}
      />
    </div>
  );
}
