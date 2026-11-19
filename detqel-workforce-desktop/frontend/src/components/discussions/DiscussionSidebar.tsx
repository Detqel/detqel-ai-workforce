"use client";

import React, { useState } from "react";
import {
  Users,
  User,
  Search,
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { DISCUSSION_TITLE_MAX_LENGTH } from "@/constants/discussionConstants";

export interface DiscussionSession {
  id: string;
  /** The discussion's own title, which the user can edit. */
  title: string;
  targetId: string;
  targetType: "agent" | "team";
  /** The agent or team the discussion is with. */
  name: string;
  avatarLetter?: string;
  timestamp?: string;
}

interface DiscussionSidebarProps {
  isCollapsed?: boolean;
  onExpand?: () => void;
  onCollapse: () => void;
  sessions: DiscussionSession[];
  activeSessionId: string | null;
  onSelectSession: (session: DiscussionSession) => void;
  onOpenNewChatModal: () => void;
  onDeleteSession?: (session: DiscussionSession) => void;
  onRenameSession: (session: DiscussionSession, title: string) => void;
}

/** The discussion title, edited in place: Enter or leaving the field saves, Escape cancels. */
function EditableTitle({ session, onRename }: { session: DiscussionSession; onRename: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);

  const save = () => {
    if (draft === null) return;
    const title = draft.trim();
    setDraft(null);
    if (title && title !== session.title) onRename(title);
  };

  if (draft === null) {
    return (
      <div className="flex items-center gap-1 min-w-0 group/title">
        <h4
          className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate"
          title={session.title}
          onDoubleClick={(event) => { event.stopPropagation(); setDraft(session.title); }}
        >
          {session.title}
        </h4>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); setDraft(session.title); }}
          aria-label={`Rename "${session.title}"`}
          title="Rename"
          className="p-0.5 rounded text-slate-400 hover:text-primary opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer shrink-0"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      maxLength={DISCUSSION_TITLE_MAX_LENGTH}
      aria-label="Discussion title"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); save(); }
        else if (event.key === "Escape") { event.preventDefault(); setDraft(null); }
      }}
      className="w-full text-xs font-bold px-1.5 py-0.5 -ml-1.5 rounded-md bg-white dark:bg-slate-900 border border-primary text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-ring"
    />
  );
}

export const DiscussionSidebar: React.FC<DiscussionSidebarProps> = ({
  isCollapsed = false,
  onExpand,
  sessions,
  activeSessionId,
  onSelectSession,
  onOpenNewChatModal,
  onDeleteSession,
  onRenameSession,
  onCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
  });

  return (
    <aside className={`${isCollapsed ? "w-16" : "w-80"} shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md flex flex-col h-full overflow-hidden select-none transition-[width] duration-200 ease-in-out`}>
      {isCollapsed ? (
        <div className="flex flex-col h-full w-full items-center">
          {/* Top Expansion Button */}
          <div className="py-3.5 px-2 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-center w-full min-h-[57px] shrink-0">
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand chat history"
              title="Expand chat history"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>

          {/* New Chat icon alone in top */}
          <div className="pt-3 pb-2 flex items-center justify-center w-full shrink-0">
            <div
              title="New Chat"
              aria-label="New Chat"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg font-semibold shadow-xs select-none cursor-default"
            >
              <Plus className="h-4 w-4" />
            </div>
          </div>

          {/* User like icon for each chat history */}
          <div className="flex-1 w-full overflow-y-auto overflow-x-hidden p-2 space-y-2 flex flex-col items-center">
            {sessions.map((session) => {
              const isSelected = activeSessionId === session.id;

              return (
                <div
                  key={session.id}
                  title={session.title || session.name}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all select-none cursor-default ${
                    isSelected
                      ? "bg-primary-muted border border-primary text-primary shadow-xs"
                      : "bg-white/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {session.targetType === "team" ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
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
          <button type="button" onClick={onCollapse} aria-label="Collapse chat history" title="Collapse chat history" className="p-1.5 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <PanelLeftClose className="h-4 w-4" />
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
            <p className="text-[11px] text-slate-400 mt-1 max-w-50">
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
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {session.targetType === "team" ? (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg font-bold text-xs shadow-xs">
                          <Users className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-xs">
                          {session.avatarLetter || session.name[0]}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <EditableTitle session={session} onRename={(title) => onRenameSession(session, title)} />
                        <span className="text-[10px] text-slate-400 block truncate" title={session.name}>
                          {session.name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {session.timestamp && (
                        <span className="text-[9px] text-slate-400">{session.timestamp}</span>
                      )}
                      {onDeleteSession && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onDeleteSession(session); }}
                          title="Delete discussion"
                          className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </aside>
  );
};
