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

      // Check if there is an incoming discussion target set via navigation
      const incoming = getDiscussionTarget();
      if (incoming) {
        const newSession: DiscussionSession = {
          id: `session-${incoming.id}-${Date.now()}`,
          targetId: incoming.id,
          targetType: incoming.type,
          name: incoming.name,
          subtitle: incoming.role || incoming.focus,
          avatarLetter: incoming.avatarLetter || incoming.name[0],
        };
        setSessions([newSession]);
        setActiveTarget(incoming);
        setActiveSessionId(newSession.id);
        clearDiscussionTarget();
      }
      // Strictly no default session or fallback target selection
    } catch {
      setTeams([]);
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectTarget = (target: DiscussionTarget) => {
    const existing = sessions.find((s) => s.targetId === target.id);
    if (existing) {
      setActiveTarget(target);
      setActiveSessionId(existing.id);
    } else {
      const newSession: DiscussionSession = {
        id: `session-${target.id}-${Date.now()}`,
        targetId: target.id,
        targetType: target.type,
        name: target.name,
        subtitle: target.role || target.focus,
        avatarLetter: target.avatarLetter || target.name[0],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveTarget(target);
      setActiveSessionId(newSession.id);
    }
  };

  const handleSelectSession = (session: DiscussionSession) => {
    setActiveSessionId(session.id);
    if (session.targetType === "team") {
      const team = teams.find((t) => t.id === session.targetId);
      if (team) {
        setActiveTarget({
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
        setActiveTarget({
          type: "agent",
          id: agent.id,
          name,
          role: agent.customRole || agent.template?.role,
          avatarLetter: name[0],
        });
        return;
      }
    }
    setActiveTarget({
      type: session.targetType,
      id: session.targetId,
      name: session.name,
      role: session.subtitle,
      avatarLetter: session.avatarLetter,
    });
  };

  const handleMessagesUpdate = (messages: ChatMessage[]) => {
    setCurrentMessages(messages);
    if (messages.length > 0 && activeSessionId) {
      const last = messages[messages.length - 1];
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                lastMessage: last.content,
                timestamp: last.timestamp,
              }
            : s
        )
      );
    }
  };

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
      />

      {/* Center modernized chat window */}
      <DiscussionChatWindow
        activeTarget={activeTarget}
        activeSessionId={activeSessionId}
        teams={teams}
        agents={agents}
        isRightPaneOpen={isRightPaneOpen}
        onToggleRightPane={() => setIsRightPaneOpen(!isRightPaneOpen)}
        onMessagesUpdate={handleMessagesUpdate}
      />

      {/* Right-hand pane for artifacts, knowledge base, connectors */}
      {isRightPaneOpen && (
        <DiscussionRightPane
          activeTarget={activeTarget}
          workspaceId={workspaceId}
          messages={currentMessages}
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
