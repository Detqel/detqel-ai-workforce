"use client";

import { AUTH_STORAGE_KEYS } from "@/constants/authConstants";

import React, { createContext, useContext, useState, useEffect } from "react";
import { SESSION_EXPIRED_EVENT, clearAccessToken, readAccessToken, renewSession } from "@/lib/auth-session";
import {
  UserProfile,
  WorkspaceSummary,
  apiDeleteWorkspace,
  apiUpdateWorkspace,
} from "@/lib/api";

interface WorkspaceContextType {
  user: UserProfile | null;
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceSummary | null;
  isLoading: boolean;
  isCreateWorkspaceModalOpen: boolean;
  openCreateWorkspaceModal: () => void;
  closeCreateWorkspaceModal: () => void;
  switchWorkspace: (workspaceId: string) => void;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  updateWorkspace: (
    workspaceId: string,
    payload: { name?: string; industry?: string; description?: string }
  ) => Promise<WorkspaceSummary>;
  setSession: (user: UserProfile, workspaces: WorkspaceSummary[]) => void;
  addNewWorkspace: (workspace: WorkspaceSummary) => void;
  logout: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(
  undefined
);

function clearStoredSession(): void {
  clearAccessToken();
  localStorage.removeItem(AUTH_STORAGE_KEYS.user);
  localStorage.removeItem(AUTH_STORAGE_KEYS.workspaces);
  localStorage.removeItem(AUTH_STORAGE_KEYS.currentWorkspace);
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceSummary | null>(null);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(AUTH_STORAGE_KEYS.user);
      const parsedUser: UserProfile | null = storedUser ? JSON.parse(storedUser) : null;
      if (parsedUser && !readAccessToken()) {
        // A saved profile without a session token cannot be renewed; the user must sign in again.
        clearStoredSession();
        return;
      }
      if (parsedUser) {
        setUser(parsedUser);
        // The saved profile is from sign-in; replace it with the server's current one (license, name, etc.).
        renewSession()
          .then((session) => {
            if (session?.user) setUser(session.user);
          })
          .catch(() => undefined);
      }

      const storedWorkspaces = localStorage.getItem(AUTH_STORAGE_KEYS.workspaces);
      const parsedWorkspaces: WorkspaceSummary[] = storedWorkspaces ? JSON.parse(storedWorkspaces) : [];
      setWorkspaces(parsedWorkspaces);

      const storedCurrent = localStorage.getItem(AUTH_STORAGE_KEYS.currentWorkspace);
      if (storedCurrent) {
        setCurrentWorkspace(JSON.parse(storedCurrent));
      } else if (parsedWorkspaces.length > 0) {
        setCurrentWorkspace(parsedWorkspaces[0]);
      }

      if (parsedUser && parsedWorkspaces.length === 0) {
        setIsCreateWorkspaceModalOpen(true);
      }
    } catch {
      // Ignore corrupted localStorage entries
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSession = (
    newUser: UserProfile,
    newWorkspaces: WorkspaceSummary[]
  ) => {
    setUser(newUser);
    setWorkspaces(newWorkspaces);
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(newUser));
    localStorage.setItem(AUTH_STORAGE_KEYS.workspaces, JSON.stringify(newWorkspaces));

    if (newWorkspaces.length > 0) {
      setCurrentWorkspace(newWorkspaces[0]);
      localStorage.setItem(
        AUTH_STORAGE_KEYS.currentWorkspace,
        JSON.stringify(newWorkspaces[0])
      );
      setIsCreateWorkspaceModalOpen(false);
    } else {
      setCurrentWorkspace(null);
      localStorage.removeItem(AUTH_STORAGE_KEYS.currentWorkspace);
      setIsCreateWorkspaceModalOpen(true);
    }
  };

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId);
    if (target) {
      setCurrentWorkspace(target);
      localStorage.setItem(
        AUTH_STORAGE_KEYS.currentWorkspace,
        JSON.stringify(target)
      );
    }
  };

  const addNewWorkspace = (workspace: WorkspaceSummary) => {
    const updated = [...workspaces.filter((w) => w.id !== workspace.id), workspace];
    setWorkspaces(updated);
    setCurrentWorkspace(workspace);
    localStorage.setItem(AUTH_STORAGE_KEYS.workspaces, JSON.stringify(updated));
    localStorage.setItem(
      AUTH_STORAGE_KEYS.currentWorkspace,
      JSON.stringify(workspace)
    );
    setIsCreateWorkspaceModalOpen(false);
  };

  const deleteWorkspace = async (workspaceId: string): Promise<boolean> => {
    try {
      await apiDeleteWorkspace(workspaceId);
      const updated = workspaces.filter((w) => w.id !== workspaceId);
      setWorkspaces(updated);
      localStorage.setItem(AUTH_STORAGE_KEYS.workspaces, JSON.stringify(updated));

      if (currentWorkspace?.id === workspaceId) {
        if (updated.length > 0) {
          setCurrentWorkspace(updated[0]);
          localStorage.setItem(
            AUTH_STORAGE_KEYS.currentWorkspace,
            JSON.stringify(updated[0])
          );
        } else {
          setCurrentWorkspace(null);
          localStorage.removeItem(AUTH_STORAGE_KEYS.currentWorkspace);
          setIsCreateWorkspaceModalOpen(true);
        }
      }
      return true;
    } catch (err) {
      console.error("Failed to delete workspace:", err);
      throw err;
    }
  };

  const updateWorkspace = async (
    workspaceId: string,
    payload: { name?: string; industry?: string; description?: string }
  ): Promise<WorkspaceSummary> => {
    try {
      const updated = await apiUpdateWorkspace(workspaceId, payload);
      const updatedList = workspaces.map((w) =>
        w.id === workspaceId ? { ...w, ...updated } : w
      );
      setWorkspaces(updatedList);
      localStorage.setItem(AUTH_STORAGE_KEYS.workspaces, JSON.stringify(updatedList));

      if (currentWorkspace?.id === workspaceId) {
        const newCurrent = { ...currentWorkspace, ...updated };
        setCurrentWorkspace(newCurrent);
        localStorage.setItem(
          AUTH_STORAGE_KEYS.currentWorkspace,
          JSON.stringify(newCurrent)
        );
      }
      return updated;
    } catch (err) {
      console.error("Failed to update workspace:", err);
      throw err;
    }
  };

  const logout = () => {
    clearStoredSession();
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    setIsCreateWorkspaceModalOpen(false);
  };

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout);
    // logout only calls state setters and clears storage, so the first-render closure stays valid.
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        user,
        workspaces,
        currentWorkspace,
        isLoading,
        isCreateWorkspaceModalOpen,
        openCreateWorkspaceModal: () => setIsCreateWorkspaceModalOpen(true),
        closeCreateWorkspaceModal: () => {
          // If the user has at least one workspace, allow closing modal.
          // Otherwise, workspace is required to enter the application.
          if (workspaces.length > 0) {
            setIsCreateWorkspaceModalOpen(false);
          }
        },
        switchWorkspace,
        deleteWorkspace,
        updateWorkspace,
        setSession,
        addNewWorkspace,
        logout,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
