import { lazy } from "react";
import {
  LayoutDashboard,
  UserPlus,
  Users,
  Brain,
  Workflow,
  Plug,
  MessageSquare,
  LayoutGrid,
  Settings,
  HelpCircle,
} from "lucide-react";

export const appPages = [
  {
    id: "dashboard",
    name: "Command Center",
    icon: LayoutDashboard,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/dashboard/page")),
  },
  {
    id: "recruit",
    name: "Recruit",
    icon: UserPlus,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/recruit/page")),
  },
  {
    id: "teams",
    name: "Teams",
    icon: Users,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/teams/page")),
  },
  {
    id: "brain",
    name: "Business Brain",
    icon: Brain,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/brain/page")),
  },
  {
    id: "workflows",
    name: "Workflows",
    icon: Workflow,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/workflows/page")),
  },
  {
    id: "connectors",
    name: "Connectors",
    icon: Plug,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/connectors/page")),
  },
  {
    id: "discussions",
    name: "Discussions",
    icon: MessageSquare,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/discussions/page")),
  },
  {
    id: "marketplace",
    name: "Marketplace",
    icon: LayoutGrid,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/marketplace/page")),
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings,
    sidebar: true,
    component: lazy(() => import("@/app/_pages/settings/page")),
  },
  {
    id: "support",
    name: "Help & Support",
    icon: HelpCircle,
    sidebar: false,
    component: lazy(() => import("@/app/_pages/support/page")),
  },
] as const;

export type AppPageId = (typeof appPages)[number]["id"];

export const defaultPageId: AppPageId = appPages[0].id;

export const pageIds = Object.fromEntries(
  appPages.map(({ id }) => [id, id]),
) as { [Id in AppPageId]: Id };

export const sidebarPages = appPages.filter((page) => page.sidebar);

export const pageRegistry = new Map<AppPageId, (typeof appPages)[number]>(
  appPages.map((page) => [page.id, page]),
);
