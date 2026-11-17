import type { UserNotification, NotificationsResponse } from "./api";

type Scope = { userId?: string; workspaceId?: string };
type CreateInput = Pick<UserNotification, "userId" | "title" | "message" | "type"> & { workspaceId?: string };
export interface NotificationApi {
  list: (scope: { userId: string; workspaceId?: string }) => Promise<NotificationsResponse>;
  create: (input: CreateInput) => Promise<UserNotification>;
  markRead: (id: string) => Promise<boolean>;
  markAllRead: (scope: { userId: string; workspaceId?: string }) => Promise<boolean>;
}
export interface NotificationSnapshot {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  loadError: string | null;
}

/** One store per account/workspace. Late requests can only change their original store. */
export class NotificationStore {
  private remote: UserNotification[] = [];
  private local: UserNotification[] = [];
  private remoteUnread = 0;
  private version = 0;
  private writes = 0;
  private listeners = new Set<() => void>();
  private reads = new Map<string, Promise<boolean>>();
  private snapshot: NotificationSnapshot;

  constructor(private readonly scope: Scope, private readonly api: NotificationApi) {
    this.snapshot = { notifications: [], unreadCount: 0, loading: Boolean(scope.userId), loadError: null };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  cancelRefresh = () => { this.version++; };

  private emit(patch: Partial<NotificationSnapshot> = {}) {
    this.snapshot = {
      ...this.snapshot,
      notifications: [...this.local, ...this.remote].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      unreadCount: this.remoteUnread + this.local.filter(item => !item.isRead).length,
      ...patch,
    };
    this.listeners.forEach(listener => listener());
  }
  private beginWrite() { this.writes++; this.version++; }
  private endWrite() {
    this.writes--;
    this.version++;
    this.emit({ loading: false });
    // Reconcile the total count (the server may have more history than the visible page).
    if (this.writes === 0) void this.refresh();
  }

  refresh = async (): Promise<void> => {
    if (!this.scope.userId || this.writes > 0) return;
    const requestVersion = ++this.version;
    try {
      const result = await this.api.list({ userId: this.scope.userId, workspaceId: this.scope.workspaceId });
      if (requestVersion !== this.version) return;
      this.remote = result.notifications;
      this.remoteUnread = result.unreadCount;
      this.emit({ loading: false, loadError: null });
    } catch {
      if (requestVersion === this.version) this.emit({ loading: false, loadError: "Notifications could not be refreshed. Your recent activity is still available." });
    }
  };

  create(type: UserNotification["type"], title: string, message: string): { id: string; saved: Promise<boolean> } {
    const id = "local-" + crypto.randomUUID();
    if (!this.scope.userId) return { id, saved: Promise.resolve(false) };
    const input = { userId: this.scope.userId, workspaceId: this.scope.workspaceId, type, title, message };
    this.beginWrite();
    this.local = [{ ...input, id, isRead: false, createdAt: new Date().toISOString() }, ...this.local].slice(0, 100);
    this.emit();
    const saved = (async () => {
      try {
        const result = await this.api.create(input);
        // Reading an entry while its POST is pending must carry through to the saved entry.
        if (this.local.find(item => item.id === id)?.isRead) result.isRead = await this.api.markRead(result.id);
        if (!this.remote.some(item => item.id === result.id) && !result.isRead) this.remoteUnread++;
        this.remote = [result, ...this.remote.filter(item => item.id !== result.id)].slice(0, 50);
        this.local = this.local.filter(item => item.id !== id);
        return true;
      } catch {
        // Keep failed saves in this session's history; a successful download stays successful.
        return false;
      } finally { this.endWrite(); }
    })();
    return { id, saved };
  }

  markRead = (id: string): Promise<boolean> => {
    const local = this.local.find(item => item.id === id);
    if (local) {
      this.local = this.local.map(item => item.id === id ? { ...item, isRead: true } : item);
      this.emit();
      return Promise.resolve(true);
    }
    const pending = this.reads.get(id);
    if (pending) return pending;
    const item = this.remote.find(item => item.id === id);
    if (!item || item.isRead) return Promise.resolve(true);
    this.beginWrite();
    const result = (async () => {
      try {
        if (!await this.api.markRead(id)) return false;
        if (this.remote.some(item => item.id === id && !item.isRead)) this.remoteUnread = Math.max(0, this.remoteUnread - 1);
        this.remote = this.remote.map(item => item.id === id ? { ...item, isRead: true } : item);
        return true;
      } catch { return false; }
      finally { this.reads.delete(id); this.endWrite(); }
    })();
    this.reads.set(id, result);
    return result;
  };

  markAllRead = async (): Promise<boolean> => {
    if (!this.scope.userId) return true;
    const ids = new Set(this.remote.map(item => item.id));
    const unreadBefore = this.remoteUnread;
    this.local = this.local.map(item => ({ ...item, isRead: true }));
    this.beginWrite();
    this.emit();
    try {
      if (!await this.api.markAllRead({ userId: this.scope.userId, workspaceId: this.scope.workspaceId })) return false;
      this.remote = this.remote.map(item => ids.has(item.id) ? { ...item, isRead: true } : item);
      this.remoteUnread = Math.max(0, this.remoteUnread - unreadBefore);
      return true;
    } catch { return false; }
    finally { this.endWrite(); }
  };
}
