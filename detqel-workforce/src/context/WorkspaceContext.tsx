"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  UserProfile,
  WorkspaceSummary,
  apiDeleteWorkspace,
  apiUpdateWorkspace,
} from "@/lib/api";
import { useRouter } from "next/navigation";

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

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceSummary | null>(null);
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("detqel_user");
      const parsedUser: UserProfile | null = storedUser ? JSON.parse(storedUser) : null;
      if (parsedUser) {
        setUser(parsedUser);
      }

      const storedWorkspaces = localStorage.getItem("detqel_workspaces");
      const parsedWorkspaces: WorkspaceSummary[] = storedWorkspaces ? JSON.parse(storedWorkspaces) : [];
      setWorkspaces(parsedWorkspaces);

      const storedCurrent = localStorage.getItem("detqel_current_workspace");
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
    localStorage.setItem("detqel_user", JSON.stringify(newUser));
    localStorage.setItem("detqel_workspaces", JSON.stringify(newWorkspaces));

    if (newWorkspaces.length > 0) {
      setCurrentWorkspace(newWorkspaces[0]);
      localStorage.setItem(
        "detqel_current_workspace",
        JSON.stringify(newWorkspaces[0])
      );
      setIsCreateWorkspaceModalOpen(false);
    } else {
      setCurrentWorkspace(null);
      localStorage.removeItem("detqel_current_workspace");
      setIsCreateWorkspaceModalOpen(true);
    }
  };

  const switchWorkspace = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId);
    if (target) {
      setCurrentWorkspace(target);
      localStorage.setItem(
        "detqel_current_workspace",
        JSON.stringify(target)
      );
    }
  };

  const addNewWorkspace = (workspace: WorkspaceSummary) => {
    const updated = [...workspaces.filter((w) => w.id !== workspace.id), workspace];
    setWorkspaces(updated);
    setCurrentWorkspace(workspace);
    localStorage.setItem("detqel_workspaces", JSON.stringify(updated));
    localStorage.setItem(
      "detqel_current_workspace",
      JSON.stringify(workspace)
    );
    setIsCreateWorkspaceModalOpen(false);
  };

  const deleteWorkspace = async (workspaceId: string): Promise<boolean> => {
    try {
      await apiDeleteWorkspace(workspaceId);
      const updated = workspaces.filter((w) => w.id !== workspaceId);
      setWorkspaces(updated);
      localStorage.setItem("detqel_workspaces", JSON.stringify(updated));

      if (currentWorkspace?.id === workspaceId) {
        if (updated.length > 0) {
          setCurrentWorkspace(updated[0]);
          localStorage.setItem(
            "detqel_current_workspace",
            JSON.stringify(updated[0])
          );
        } else {
          setCurrentWorkspace(null);
          localStorage.removeItem("detqel_current_workspace");
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
      localStorage.setItem("detqel_workspaces", JSON.stringify(updatedList));

      if (currentWorkspace?.id === workspaceId) {
        const newCurrent = { ...currentWorkspace, ...updated };
        setCurrentWorkspace(newCurrent);
        localStorage.setItem(
          "detqel_current_workspace",
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
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    localStorage.removeItem("detqel_user");
    localStorage.removeItem("detqel_workspaces");
    localStorage.removeItem("detqel_current_workspace");
    router.push("/");
  };

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
