"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Brain,
  LayoutGrid,
  Settings,
  HelpCircle,
  Crown,
  Bell,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UserPlus,
  Workflow,
  Plug,
  MessageSquare,
  Sun,
  Moon,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/context/ThemeContext";
import {
  apiGetUserNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  type UserNotification,
} from "@/lib/api";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, currentWorkspace, logout } = useWorkspace();
  const { theme, setTheme } = useTheme();

  // Collapsed by default as requested: "By default collapsed to display only icons"
  const [isCollapsed, setIsCollapsed] = React.useState(true);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [alertMenuOpen, setAlertMenuOpen] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  // Dynamic user notifications
  const [notifications, setNotifications] = React.useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState<number>(0);
  const [loadingNotifications, setLoadingNotifications] = React.useState<boolean>(false);

  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const userButtonRef = React.useRef<HTMLButtonElement>(null);
  const alertMenuRef = React.useRef<HTMLDivElement>(null);
  const alertButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch dynamic user-linked notifications from DB
  const fetchNotifications = React.useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoadingNotifications(true);
    try {
      const res = await apiGetUserNotifications({
        userId: user.id,
        workspaceId: currentWorkspace?.id,
      });
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoadingNotifications(false);
    }
  }, [user?.id, currentWorkspace?.id]);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    await apiMarkAllNotificationsRead({
      userId: user.id,
      workspaceId: currentWorkspace?.id,
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (notif: UserNotification) => {
    if (!notif.isRead) {
      await apiMarkNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (notif.link) {
      router.push(notif.link);
      setAlertMenuOpen(false);
    }
  };

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(target) &&
        !userButtonRef.current?.contains(target)
      ) {
        setUserMenuOpen(false);
      }
      if (
        alertMenuRef.current &&
        !alertMenuRef.current.contains(target) &&
        !alertButtonRef.current?.contains(target)
      ) {
        setAlertMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const displayName = isMounted && user?.name ? user.name : "DETQEL Admin";
  const avatarLetter = (displayName[0] || "A").toUpperCase();

  const navItems = [
    { name: "Command Center", href: "/dashboard", icon: LayoutDashboard },
    { name: "Recruit", href: "/dashboard#recruit", icon: UserPlus },
    { name: "Teams", href: "/dashboard#teams", icon: Users },
    { name: "Business Brain", href: "/dashboard#brain", icon: Brain },
    { name: "Workflows", href: "/dashboard#workflows", icon: Workflow },
    { name: "Connectors", href: "/dashboard#connectors", icon: Plug },
    { name: "Discussions", href: "/dashboard#discussions", icon: MessageSquare },
    { name: "Marketplace", href: "/dashboard#marketplace", icon: LayoutGrid },
    { name: "Settings", href: "/dashboard#settings", icon: Settings },
  ];

  // Calculate active index with support for smooth sliding animation
  const [activeItemIndex, setActiveItemIndex] = React.useState<number>(0);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#recruit") setActiveItemIndex(1);
      else if (hash === "#teams") setActiveItemIndex(2);
      else if (hash === "#brain") setActiveItemIndex(3);
      else if (hash === "#workflows") setActiveItemIndex(4);
      else if (hash === "#connectors") setActiveItemIndex(5);
      else if (hash === "#discussions") setActiveItemIndex(6);
      else if (hash === "#marketplace") setActiveItemIndex(7);
      else if (hash === "#settings") setActiveItemIndex(8);
      else setActiveItemIndex(0);
    }
  }, [pathname]);

  return (
    <aside
      className={`${
        isCollapsed ? "w-14" : "w-fit min-w-fit max-w-[320px]"
      } flex-shrink-0 bg-transparent flex flex-col justify-between h-full min-h-screen select-none border-none transition-[width] duration-200 ease-in-out relative z-40 overflow-visible`}
    >
      {/* Top Section: Sidebar Collapsible Toggle Icon & Logo when expanded */}
      <div className={`w-full pt-4 pb-2 ${isCollapsed ? "px-1 flex justify-center" : "px-3"}`}>
        {isCollapsed ? (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="w-9 h-9 flex items-center justify-center text-[#8a2be2] hover:text-[#7823c9] dark:text-[#a855f7] dark:hover:text-[#c084fc] transition-colors cursor-pointer relative group bg-transparent border-none shadow-none"
          >
            <PanelLeftOpen className="w-5 h-5 text-[#8a2be2] dark:text-[#a855f7] group-hover:text-[#7823c9] dark:group-hover:text-[#c084fc] transition-colors" />

            {/* Modernized pill tooltip on hover when collapsed */}
            <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 flex items-center gap-1.5 border border-slate-700/60 dark:border-[#223048]">
              <span>Expand sidebar</span>
            </div>
          </button>
        ) : (
          <div className="w-full flex items-center justify-between gap-3 animate-in fade-in duration-150">
            <Link
              href="/dashboard"
              className="flex items-center hover:opacity-90 transition-opacity"
            >
              <Image
                src="/images/detqel-logo-banner.png"
                alt="DETQEL"
                width={160}
                height={46}
                priority
                className="h-10.5 w-auto object-contain select-none transition-all drop-shadow-xs"
              />
            </Link>

            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="w-7 h-7 flex items-center justify-center text-[#8a2be2] dark:text-[#a855f7] hover:text-[#7823c9] dark:hover:text-[#c084fc] transition-colors cursor-pointer bg-transparent border-none shadow-none shrink-0"
            >
              <PanelLeftClose className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* Theme Toggle: Positioned at top of sidebar below sidebar header */}
      <div className={`w-full pb-2 ${isCollapsed ? "px-1 flex justify-center" : "px-3"}`}>
        {!isCollapsed ? (
          <div className="w-full">
            <div
              className="w-full h-8.5 rounded-xl bg-slate-200/80 dark:bg-[#151f32] p-0.5 flex items-center relative border border-slate-300/60 dark:border-purple-900/50 transition-colors select-none"
              role="radiogroup"
              aria-label="Theme switcher"
            >
              {/* Horizontal Sliding Pill Indicator */}
              <div
                className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-lg transition-all duration-300 ease-out shadow-xs pointer-events-none ${
                  theme === "light"
                    ? "left-0.5 bg-white text-slate-900 shadow-sm border border-slate-200/50"
                    : "left-[calc(50%+1px)] bg-[#8a2be2] text-white shadow-md shadow-[#8a2be2]/40"
                }`}
              />

              {/* Left Option: Light Theme */}
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex-1 h-full z-10 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  theme === "light"
                    ? "text-slate-900 font-bold"
                    : "text-[#8a2be2] hover:text-[#7823c9] dark:text-purple-300/80 dark:hover:text-purple-100"
                }`}
              >
                <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500 fill-amber-500/20" : ""}`} />
                <span>Light</span>
              </button>

              {/* Right Option: Dark Theme */}
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex-1 h-full z-10 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  theme === "dark"
                    ? "text-white font-bold"
                    : "text-[#8a2be2] hover:text-[#7823c9] dark:text-purple-300/80 dark:hover:text-purple-100"
                }`}
              >
                <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-white fill-white/20" : ""}`} />
                <span>Dark</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="py-1 flex justify-center relative group">
            <div
              className="w-8.5 h-[62px] rounded-xl bg-slate-200/80 dark:bg-[#151f32] p-0.5 flex flex-col items-center justify-between relative border border-slate-300/60 dark:border-purple-900/50 transition-colors select-none"
              role="radiogroup"
              aria-label="Theme switcher"
            >
              {/* Vertical Sliding Pill Indicator */}
              <div
                className={`absolute left-0.5 right-0.5 h-[28px] rounded-lg transition-all duration-300 ease-out shadow-xs pointer-events-none ${
                  theme === "light"
                    ? "top-0.5 bg-white text-slate-900 shadow-sm border border-slate-200/50"
                    : "top-[calc(100%-29px)] bg-[#8a2be2] text-white shadow-md shadow-[#8a2be2]/40"
                }`}
              />

              {/* Top Option: Light Theme */}
              <button
                type="button"
                onClick={() => setTheme("light")}
                title="Light Theme"
                aria-label="Switch to light theme"
                className={`w-7.5 h-7 z-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  theme === "light"
                    ? "text-slate-900"
                    : "text-[#8a2be2] hover:text-[#7823c9] dark:text-purple-300/80 dark:hover:text-purple-100"
                }`}
              >
                <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500 fill-amber-500/20" : ""}`} />
              </button>

              {/* Bottom Option: Dark Theme */}
              <button
                type="button"
                onClick={() => setTheme("dark")}
                title="Dark Theme"
                aria-label="Switch to dark theme"
                className={`w-7.5 h-7 z-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  theme === "dark"
                    ? "text-white"
                    : "text-[#8a2be2] hover:text-[#7823c9] dark:text-purple-300/80 dark:hover:text-purple-100"
                }`}
              >
                <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-white fill-white/20" : ""}`} />
              </button>
            </div>

            {/* Hover tooltip when collapsed */}
            <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 border border-slate-700/60 dark:border-[#223048]">
              {theme === "light" ? "Light Mode" : "Dark Mode"}
            </div>
          </div>
        )}
      </div>

      {/* Middle Section: Centered Navigation Icons with Smooth Sliding Animation */}
      <div className={`flex-1 flex flex-col justify-center ${isCollapsed ? "px-1" : "px-3"} my-auto`}>
        <nav className="space-y-1.5 relative">
          {/* Smooth Sliding Active Background Indicator */}
          <div
            className={`absolute ${
              isCollapsed
                ? "w-9 h-9 left-1/2 -translate-x-1/2 rounded-xl"
                : "left-0 right-0 h-9 rounded-xl"
            } bg-[#8a2be2]/12 dark:bg-[#8a2be2]/22 border border-[#8a2be2]/30 dark:border-[#8a2be2]/50 shadow-[0_0_12px_rgba(138,43,226,0.15)] dark:shadow-[0_0_16px_rgba(138,43,226,0.35)] pointer-events-none transition-all duration-300 ease-out z-0`}
            style={{
              top: `${activeItemIndex * 42}px`,
            }}
          />

          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = activeItemIndex === index;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setActiveItemIndex(index)}
                className={`relative group flex items-center ${
                  isCollapsed
                    ? "w-9 h-9 mx-auto justify-center rounded-xl"
                    : "w-full h-9 gap-2.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap"
                } transition-colors z-10 ${
                  isActive
                    ? "text-[#8a2be2] dark:text-[#f3e8ff] font-bold"
                    : "text-[#8a2be2] dark:text-[#c084fc] hover:text-[#7823c9] dark:hover:text-[#f3e8ff]"
                }`}
              >
                <Icon
                  className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                    isActive
                      ? "text-[#8a2be2] dark:text-[#e9d5ff]"
                      : "text-[#8a2be2] dark:text-[#c084fc] group-hover:text-[#7823c9] dark:group-hover:text-[#f3e8ff]"
                  }`}
                />

                {!isCollapsed && <span className="whitespace-nowrap">{item.name}</span>}

                {/* Modernized Floating Pill Tooltip on Hover */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 flex items-center gap-1.5 border border-slate-700/60 dark:border-[#223048]">
                    <span>{item.name}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Help & Support, Alert above User, and User at Bottom */}
      <div
        className={`p-1.5 pb-3.5 mt-auto space-y-1.5 flex flex-col ${
          isCollapsed ? "items-center" : "w-full items-stretch"
        } border-none`}
      >
        {/* 1. Help & Support */}
        <Link
          href="/support"
          className={`relative group flex items-center ${
            isCollapsed
              ? "w-9 h-9 mx-auto justify-center rounded-xl"
              : "w-full h-9 gap-2.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap"
          } text-[#8a2be2] dark:text-[#c084fc] hover:text-[#7823c9] dark:hover:text-[#f3e8ff] transition-colors cursor-pointer bg-transparent border-none shadow-none`}
        >
          <HelpCircle className="w-4.5 h-4.5 shrink-0 transition-colors text-[#8a2be2] dark:text-[#c084fc] group-hover:text-[#7823c9] dark:group-hover:text-[#f3e8ff]" />
          {!isCollapsed && <span className="whitespace-nowrap">Help & Support</span>}

          {/* Modernized floating pill tooltip on hover */}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 border border-slate-700/60 dark:border-[#223048]">
              Help & Support
            </div>
          )}
        </Link>

        {/* 2. Alert / Notifications Icon (Dynamic DB-driven, highlight dot only if unreadCount > 0) */}
        <div className={`relative ${isCollapsed ? "" : "w-full"}`}>
          <button
            ref={alertButtonRef}
            type="button"
            onClick={() => {
              setAlertMenuOpen((prev) => !prev);
              setUserMenuOpen(false);
            }}
            aria-label="Notifications"
            title="Notifications"
            className={`relative group flex items-center ${
              isCollapsed
                ? "w-9 h-9 mx-auto justify-center rounded-xl"
                : "w-full h-9 gap-2.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap"
            } bg-transparent border-none shadow-none text-[#8a2be2] dark:text-[#c084fc] hover:text-[#7823c9] dark:hover:text-[#f3e8ff] transition-colors cursor-pointer`}
          >
            <div className="relative w-5 h-5 shrink-0 flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 shrink-0 transition-colors text-[#8a2be2] dark:text-[#c084fc] group-hover:text-[#7823c9] dark:group-hover:text-[#f3e8ff]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#8a2be2] ring-2 ring-white dark:ring-[#182234]" />
              )}
            </div>

            {!isCollapsed && <span className="whitespace-nowrap">Notifications</span>}

            {/* Hover pill when collapsed and menu is closed */}
            {isCollapsed && !alertMenuOpen && (
              <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 border border-slate-700/60 dark:border-[#223048]">
                Notifications
              </div>
            )}
          </button>

          {/* Dynamic Notifications Popover (No mock items, dynamic fetch from DB) */}
          {alertMenuOpen && (
            <div
              ref={alertMenuRef}
              className={`absolute ${
                isCollapsed
                  ? "left-full ml-3 bottom-0"
                  : "bottom-full left-0 mb-3"
              } w-72 rounded-2xl bg-white dark:bg-[#182234] border border-slate-200 dark:border-[#223048] shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#223048]">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-purple-100">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-[10px] font-semibold text-[#8a2be2] dark:text-[#c084fc]">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-semibold text-[#8a2be2] dark:text-[#c084fc] hover:text-[#7823c9] transition-colors cursor-pointer"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {loadingNotifications ? (
                <div className="py-6 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-[#8a2be2] border-t-transparent animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-6 px-3 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#151f32] flex items-center justify-center text-slate-400 dark:text-purple-400/60">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-purple-200">No notifications</div>
                  <div className="text-[10px] text-slate-400 dark:text-purple-400/50 max-w-[190px] leading-tight">
                    Notifications linked to your account will appear here.
                  </div>
                </div>
              ) : (
                <div className="py-2 space-y-1.5 max-h-64 overflow-y-auto">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-2.5 rounded-xl border text-slate-700 dark:text-purple-200 cursor-pointer transition-colors ${
                        notif.isRead
                          ? "bg-slate-50/70 dark:bg-[#151f32]/60 border-slate-100 dark:border-[#223048]"
                          : "bg-purple-50/50 dark:bg-purple-950/40 border-purple-100/80 dark:border-purple-900/50"
                      } hover:bg-purple-50/80 dark:hover:bg-[#1e2a40]`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 dark:text-purple-100 truncate">
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8a2be2] shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-purple-300/70 mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. User Icon (Stayed at Bottom, green active badge removed, text in white for high contrast) */}
        <div className={`relative ${isCollapsed ? "" : "w-full"}`}>
          <button
            ref={userButtonRef}
            type="button"
            onClick={() => {
              setUserMenuOpen((prev) => !prev);
              setAlertMenuOpen(false);
            }}
            aria-label="User profile and options"
            title={displayName}
            className={`relative group flex items-center ${
              isCollapsed
                ? "w-8.5 h-8.5 justify-center rounded-full mx-auto"
                : "w-full gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-[#7b24cb]"
            } bg-[#8a2be2] text-white font-bold text-[11px] shadow-xs hover:ring-2 hover:ring-[#8a2be2]/40 transition-all cursor-pointer select-none`}
          >
            <div className="relative w-8.5 h-8.5 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0">
              {avatarLetter}
            </div>

            {!isCollapsed && (
              <div className="flex flex-col text-left whitespace-nowrap min-w-0 pr-1">
                <span className="text-xs font-bold text-white whitespace-nowrap">{displayName}</span>
              </div>
            )}

            {/* Hover pill when collapsed and menu is closed */}
            {isCollapsed && !userMenuOpen && (
              <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 border border-slate-700/60 dark:border-[#223048]">
                {displayName}
              </div>
            )}
          </button>

          {/* Click Popover: Displays user name, upgrade option, logout option */}
          {userMenuOpen && (
            <div
              ref={userMenuRef}
              className={`absolute ${
                isCollapsed
                  ? "left-full ml-3 bottom-0"
                  : "bottom-full left-0 mb-3"
              } w-56 rounded-2xl bg-white dark:bg-[#182234] border border-slate-200 dark:border-[#223048] shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150`}
            >
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-[#223048]">
                <div className="text-xs font-bold text-slate-900 dark:text-purple-100 truncate">
                  {displayName}
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-purple-200 hover:text-[#8a2be2] dark:hover:text-[#c084fc] hover:bg-purple-50/60 dark:hover:bg-[#151f32] rounded-xl transition-colors cursor-pointer text-left"
                >
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>Upgrade Plan</span>
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-[#223048]">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
