"use client";

import React, { useState } from "react";
import {
  Users,
  Search,
  Plus,
  MessageSquare,
} from "lucide-react";

export interface DiscussionSession {
  id: string;
  targetId: string;
  targetType: "agent" | "team";
  name: string;
  subtitle?: string;
  avatarLetter?: string;
  lastMessage?: string;
  timestamp?: string;
}

interface DiscussionSidebarProps {
  sessions: DiscussionSession[];
  activeSessionId: string | null;
  onSelectSession: (session: DiscussionSession) => void;
  onOpenNewChatModal: () => void;
}

export const DiscussionSidebar: React.FC<DiscussionSidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onOpenNewChatModal,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.subtitle && s.subtitle.toLowerCase().includes(q)) ||
      (s.lastMessage && s.lastMessage.toLowerCase().includes(q))
    );
  });

  return (
    <aside className="w-80 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md flex flex-col h-full overflow-hidden select-none">
      {/* Top Sidebar Header */}
      <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                Discussions
              </h2>
              <p className="text-[10px] text-slate-400 truncate">
                Chat Sessions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenNewChatModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold whitespace-nowrap shrink-0 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search discussions & sessions..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Chat Sessions List (Single unified list, no squad/direct distinction) */}
      <div className="flex-1 overflow-y-auto p-3">
        {filteredSessions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-2">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No Chat Sessions
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
              Click New Chat or initiate a discussion from Teams or Recruit.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredSessions.map((session) => {
              const isSelected = activeSessionId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectSession(session)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-primary-muted border-primary shadow-xs"
                      : "bg-white/80 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {session.targetType === "team" ? (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg font-bold text-xs shadow-xs">
                          <Users className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-xs">
                          {session.avatarLetter || session.name[0]}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {session.name}
                        </h4>
                        {session.subtitle && (
                          <span className="text-[10px] text-slate-400 block truncate">
                            {session.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {session.timestamp && (
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {session.timestamp}
                      </span>
                    )}
                  </div>

                  {session.lastMessage && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2 line-clamp-1">
                      {session.lastMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
