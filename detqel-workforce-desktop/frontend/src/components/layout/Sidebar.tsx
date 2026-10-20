"use client";

import React from "react";
import { WorkspaceLink as Link } from "@/components/navigation/WorkspaceLink";
import Image from "next/image";
import {
  HelpCircle,
  Crown,
  Bell,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useTheme } from "@/context/ThemeContext";
import { useNavigation } from "@/context/NavigationContext";
import { defaultPageId, pageIds, sidebarPages } from "@/lib/navigation";
import {
  apiGetUserNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  type UserNotification,
} from "@/lib/api";
import { IconOnlyButton } from "@/components/ui/icon-only-button";

export const Sidebar: React.FC = () => {
  const { activePageId, navigate } = useNavigation();
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
      navigate(notif.link);
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

  const activeItemIndex = sidebarPages.findIndex((page) => page.id === activePageId);

  return (
    <aside
      className={`${
        isCollapsed ? "w-16" : "w-60"
      } flex-shrink-0 bg-transparent flex flex-col justify-between h-full min-h-screen select-none border-none transition-[width] duration-300 ease-in-out will-change-[width] relative z-40 overflow-visible`}
    >
      {/* Top Section: Sidebar Collapsible Toggle Icon & Logo when expanded */}
      <div className="w-full pt-4 pb-2 px-3.5 flex items-center justify-between min-h-[46px] overflow-hidden">
        {/* Logo container: smoothly collapses and fades */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out flex items-center ${
            isCollapsed
              ? "max-w-0 opacity-0 -translate-x-4 pointer-events-none"
              : "max-w-[140px] opacity-100 translate-x-0"
          }`}
        >
          <Link
            href={defaultPageId}
            className="flex items-center hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
          >
            <Image
              src="/images/detqel-logo-banner.png"
              alt="DETQEL"
              width={140}
              height={40}
              priority
              className="h-9 w-auto object-contain select-none transition-all drop-shadow-xs"
            />
          </Link>
        </div>

        {/* Toggle Button: glides smoothly with micro-animation */}
        <IconOnlyButton
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-9 h-9 text-[#8a2be2] hover:text-[#7823c9] dark:text-[#FFA500] dark:hover:text-[#FFA500]/80 bg-transparent shrink-0"
          icon={
            isCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
            ) : (
              <PanelLeftClose className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
            )
          }
        />
      </div>

      {/* Theme Toggle: Positioned at top of sidebar below sidebar header */}
      <div className="w-full pb-2 px-3.5 relative overflow-hidden">
        {/* Expanded: Horizontal Switcher */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            isCollapsed
              ? "max-h-0 opacity-0 pointer-events-none -translate-y-2 scale-95 overflow-hidden"
              : "max-h-12 opacity-100 translate-y-0 scale-100"
          }`}
        >
          <div
            className="w-full h-8.5 rounded-xl bg-slate-200/80 dark:bg-[#151f32] p-0.5 flex items-center relative border border-slate-300/60 dark:border-[#FFA500]/40 transition-colors select-none"
            role="radiogroup"
            aria-label="Theme switcher"
          >
            {/* Horizontal Sliding Pill Indicator */}
            <div
              className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-lg transition-all duration-300 ease-out shadow-xs pointer-events-none ${
                theme === "light"
                  ? "left-0.5 bg-white text-slate-900 shadow-sm border border-slate-200/50"
                  : "left-[calc(50%+1px)] bg-[#8a2be2] dark:bg-[#FFA500] text-white shadow-md shadow-[#8a2be2]/40 dark:shadow-[#FFA500]/40"
              }`}
            />

            {/* Left Option: Light Theme */}
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex-1 h-full z-10 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                theme === "light"
                  ? "text-slate-900 font-bold"
                  : "text-[#8a2be2] hover:text-[#7823c9] dark:text-[#FFA500]/70 dark:hover:text-[#FFA500]"
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
                  : "text-[#8a2be2] hover:text-[#7823c9] dark:text-[#FFA500]/70 dark:hover:text-[#FFA500]"
              }`}
            >
              <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-white fill-white/20" : ""}`} />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Collapsed: Vertical Switcher */}
        <div
          className={`transition-all duration-300 ease-in-out flex justify-center ${
            isCollapsed
              ? "max-h-20 opacity-100 translate-y-0 scale-100"
              : "max-h-0 opacity-0 pointer-events-none -translate-y-2 scale-95 overflow-hidden"
          }`}
        >
          <div className="py-1 flex justify-center relative">
            <div
              className="w-8.5 h-[62px] rounded-xl bg-slate-200/80 dark:bg-[#151f32] p-0.5 flex flex-col items-center justify-between relative border border-slate-300/60 dark:border-[#FFA500]/40 transition-colors select-none"
              role="radiogroup"
              aria-label="Theme switcher"
            >
              {/* Vertical Sliding Pill Indicator */}
              <div
                className={`absolute left-0.5 right-0.5 h-[28px] rounded-lg transition-all duration-300 ease-out shadow-xs pointer-events-none ${
                  theme === "light"
                    ? "top-0.5 bg-white text-slate-900 shadow-sm border border-slate-200/50"
                    : "top-[calc(100%-29px)] bg-[#8a2be2] dark:bg-[#FFA500] text-white shadow-md shadow-[#8a2be2]/40 dark:shadow-[#FFA500]/40"
                }`}
              />

              {/* Top Option: Light Theme */}
              <button
                type="button"
                onClick={() => setTheme("light")}
                aria-label="Switch to light theme"
                className={`w-7.5 h-7 z-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  theme === "light"
                    ? "text-slate-900"
                    : "text-[#8a2be2] hover:text-[#7823c9] dark:text-[#FFA500]/70 dark:hover:text-[#FFA500]"
                }`}
              >
                <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500 fill-amber-500/20" : ""}`} />
              </button>

              {/* Bottom Option: Dark Theme */}
              <button
                type="button"
                onClick={() => setTheme("dark")}
                aria-label="Switch to dark theme"
                className={`w-7.5 h-7 z-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  theme === "dark"
                    ? "text-white"
                    : "text-[#8a2be2] hover:text-[#7823c9] dark:text-[#FFA500]/70 dark:hover:text-[#FFA500]"
                }`}
              >
                <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-white fill-white/20" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section: Centered Navigation Icons with Smooth Sliding Animation */}
      <div className="flex-1 flex flex-col justify-center px-3.5 my-auto">
        <nav className="space-y-1.5 relative">
          {/* Smooth Sliding Active Background Indicator */}
          <div
            className={`absolute left-0 h-9 rounded-xl bg-[#8a2be2]/12 dark:bg-[#FFA500]/20 border border-[#8a2be2]/30 dark:border-[#FFA500]/50 shadow-[0_0_12px_rgba(138,43,226,0.15)] dark:shadow-[0_0_16px_rgba(255,165,0,0.35)] pointer-events-none transition-all duration-300 ease-in-out z-0 ${
              isCollapsed ? "w-9" : "w-full"
            }`}
            style={{
              top: `${Math.max(0, activeItemIndex) * 42}px`,
              opacity: activeItemIndex < 0 ? 0 : 1,
            }}
          />

          {sidebarPages.map((item) => {
            const Icon = item.icon;
            const isActive = activePageId === item.id;

            return (
              <Link
                key={item.id}
                href={item.id}
                aria-current={isActive ? "page" : undefined}
                aria-label={item.name}
                className={`relative group flex items-center h-9 w-full rounded-xl transition-colors z-10 cursor-pointer ${
                  isActive
                    ? "text-[#8a2be2] dark:text-[#FFA500] font-bold"
                    : "text-[#8a2be2] dark:text-[#FFA500]/80 hover:text-[#7823c9] dark:hover:text-[#FFA500]"
                }`}
              >
                <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                  <Icon
                    className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                      isActive
                        ? "text-[#8a2be2] dark:text-[#FFA500]"
                        : "text-[#8a2be2] dark:text-[#FFA500]/80 group-hover:text-[#7823c9] dark:group-hover:text-[#FFA500]"
                    }`}
                  />
                </div>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out flex items-center ${
                    isCollapsed
                      ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none ml-0"
                      : "max-w-[160px] opacity-100 translate-x-0 ml-1.5"
                  }`}
                >
                  <span className="text-xs font-semibold whitespace-nowrap">{item.name}</span>
                </div>

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
      <div className="w-full px-3.5 pb-3.5 mt-auto space-y-1.5 flex flex-col items-stretch border-none">
        {/* 1. Help & Support */}
        <Link
          href={pageIds.support}
          className="relative group flex items-center h-9 w-full rounded-xl text-xs font-semibold whitespace-nowrap text-[#8a2be2] dark:text-[#FFA500]/80 hover:text-[#7823c9] dark:hover:text-[#FFA500] hover:bg-purple-50/60 dark:hover:bg-[#FFA500]/15 transition-all duration-300 cursor-pointer bg-transparent border-none shadow-none"
        >
          <div className="w-9 h-9 shrink-0 flex items-center justify-center">
            <HelpCircle className="w-4.5 h-4.5 shrink-0 transition-colors text-[#8a2be2] dark:text-[#FFA500]/80 group-hover:text-[#7823c9] dark:group-hover:text-[#FFA500]" />
          </div>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out flex items-center ${
              isCollapsed
                ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none ml-0"
                : "max-w-[160px] opacity-100 translate-x-0 ml-1.5"
            }`}
          >
            <span className="whitespace-nowrap">Help & Support</span>
          </div>

          {/* Modernized floating pill tooltip on hover */}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 dark:bg-[#182234] backdrop-blur-md text-white text-xs font-semibold whitespace-nowrap shadow-2xl pointer-events-none opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50 border border-slate-700/60 dark:border-[#223048]">
              Help & Support
            </div>
          )}
        </Link>

        {/* 2. Alert / Notifications Icon (Dynamic DB-driven, highlight dot only if unreadCount > 0) */}
        <div className="relative w-full">
          <button
            ref={alertButtonRef}
            type="button"
            onClick={() => {
              setAlertMenuOpen((prev) => !prev);
              setUserMenuOpen(false);
            }}
            aria-label="Notifications"
            title="Notifications"
            className="relative group flex items-center h-9 w-full rounded-xl text-xs font-semibold whitespace-nowrap bg-transparent border-none shadow-none text-[#8a2be2] dark:text-[#FFA500]/80 hover:text-[#7823c9] dark:hover:text-[#FFA500] hover:bg-purple-50/60 dark:hover:bg-[#FFA500]/15 transition-all duration-300 cursor-pointer"
          >
            <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 shrink-0 transition-colors text-[#8a2be2] dark:text-[#FFA500]/80 group-hover:text-[#7823c9] dark:group-hover:text-[#FFA500]" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#8a2be2] dark:bg-[#FFA500] ring-2 ring-white dark:ring-[#182234]" />
              )}
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out flex items-center ${
                isCollapsed
                  ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none ml-0"
                  : "max-w-[160px] opacity-100 translate-x-0 ml-1.5"
              }`}
            >
              <span className="whitespace-nowrap">Notifications</span>
            </div>

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
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-[#FFA500]/15 text-[10px] font-semibold text-[#8a2be2] dark:text-[#FFA500]">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-semibold text-[#8a2be2] dark:text-[#FFA500] hover:text-[#7823c9] dark:hover:text-[#FFA500]/80 transition-colors cursor-pointer"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {loadingNotifications ? (
                <div className="py-6 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-[#8a2be2] dark:border-[#FFA500] border-t-transparent animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-6 px-3 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#151f32] flex items-center justify-center text-slate-400 dark:text-slate-400">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">No notifications</div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 max-w-[190px] leading-tight">
                    Notifications linked to your account will appear here.
                  </div>
                </div>
              ) : (
                <div className="py-2 space-y-1.5 max-h-64 overflow-y-auto">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-2.5 rounded-xl border text-slate-700 dark:text-slate-300 cursor-pointer transition-colors ${
                        notif.isRead
                          ? "bg-slate-50/70 dark:bg-[#151f32]/60 border-slate-100 dark:border-[#223048]"
                          : "bg-purple-50/50 dark:bg-[#FFA500]/10 border-purple-100/80 dark:border-[#FFA500]/30"
                      } hover:bg-purple-50/80 dark:hover:bg-[#1e2a40]`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8a2be2] dark:bg-[#FFA500] shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. User Icon */}
        <div className="relative w-full">
          <button
            ref={userButtonRef}
            type="button"
            onClick={() => {
              setUserMenuOpen((prev) => !prev);
              setAlertMenuOpen(false);
            }}
            aria-label="User profile and options"
            title={displayName}
            className="relative group flex items-center h-9 w-full rounded-xl bg-[#8a2be2] dark:bg-[#FFA500] text-white dark:text-slate-950 font-bold text-[11px] shadow-xs hover:ring-2 hover:ring-[#8a2be2]/40 dark:hover:ring-[#FFA500]/40 transition-all duration-300 ease-in-out cursor-pointer select-none overflow-hidden"
          >
            <div className="w-9 h-9 shrink-0 flex items-center justify-center">
              <div className="w-7 h-7 rounded-lg bg-white/20 dark:bg-black/20 text-white dark:text-slate-950 flex items-center justify-center font-bold text-xs">
                {avatarLetter}
              </div>
            </div>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out flex flex-col text-left whitespace-nowrap min-w-0 ${
                isCollapsed
                  ? "max-w-0 opacity-0 -translate-x-2 pointer-events-none ml-0"
                  : "max-w-[160px] opacity-100 translate-x-0 ml-1.5 pr-2"
              }`}
            >
              <span className="text-xs font-bold text-white dark:text-slate-950 whitespace-nowrap truncate">{displayName}</span>
            </div>

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
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {displayName}
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate(pageIds.settings);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#8a2be2] dark:hover:text-[#FFA500] hover:bg-purple-50/60 dark:hover:bg-[#FFA500]/15 rounded-xl transition-colors cursor-pointer text-left"
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
