import assert from "node:assert/strict";
import { test } from "node:test";
import { NotificationStore, type NotificationApi } from "../frontend/src/lib/notification-store.ts";
import type { UserNotification } from "../frontend/src/lib/api.ts";
import { createNotificationSchema } from "../backend/src/modules/notifications/validation/notification.schemas.ts";

const scope = { userId: "user-a", workspaceId: "workspace-a" };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  let rows: UserNotification[] = [];
  let sequence = 0;
  const counts = { creates: 0, reads: 0 };
  const api: NotificationApi = {
    async list(request) {
      const notifications = rows.filter(row => row.userId === request.userId && (!request.workspaceId || row.workspaceId === request.workspaceId));
      return { notifications: notifications.map(item => ({ ...item })), unreadCount: notifications.filter(item => !item.isRead).length };
    },
    async create(input) {
      counts.creates++;
      const row = { ...input, id: "saved-" + (++sequence), isRead: false, createdAt: new Date().toISOString() };
      rows = [row, ...rows];
      return { ...row };
    },
    async markRead(id) { counts.reads++; rows = rows.map(row => row.id === id ? { ...row, isRead: true } : row); return true; },
    async markAllRead(request) { rows = rows.map(row => row.userId === request.userId && row.workspaceId === request.workspaceId ? { ...row, isRead: true } : row); return true; },
  };
  const store = new NotificationStore(scope, api);
  return { api, store, counts };
}

test("download feedback persists once and is available after reopening history", async () => {
  const { store, api, counts } = fixture();
  await store.refresh();
  const { saved } = store.create("download", "PDF download started", "Plan.pdf · 12 KB");
  assert.equal(store.getSnapshot().unreadCount, 1);
  assert.equal(await saved, true);
  assert.equal(counts.creates, 1);
  assert.equal(store.getSnapshot().notifications.length, 1);
  assert.equal(store.getSnapshot().notifications[0].type, "download");
  const reopened = new NotificationStore(scope, api);
  await reopened.refresh();
  assert.equal(reopened.getSnapshot().notifications[0].message, "Plan.pdf · 12 KB");
  assert.equal(reopened.getSnapshot().unreadCount, 1);
});

test("a refresh started before a download cannot erase its new notification", async () => {
  const { store, api } = fixture();
  const original = api.list;
  const old = deferred<Awaited<ReturnType<NotificationApi["list"]>>>();
  api.list = () => old.promise;
  const refreshing = store.refresh();
  api.list = original;
  await store.create("download", "PDF download started", "Plan.pdf").saved;
  old.resolve({ notifications: [], unreadCount: 0 });
  await refreshing;
  assert.equal(store.getSnapshot().notifications.length, 1);
  assert.equal(store.getSnapshot().unreadCount, 1);
});

test("reading a notification before persistence completes carries through to the saved entry", async () => {
  const { store, api } = fixture();
  const original = api.create;
  const pending = deferred<UserNotification>();
  let input!: Parameters<NotificationApi["create"]>[0];
  api.create = data => { input = data; return pending.promise; };
  const item = store.create("download", "Word download started", "Plan.docx");
  await store.markRead(item.id);
  assert.equal(store.getSnapshot().unreadCount, 0);
  pending.resolve(await original(input));
  await item.saved;
  assert.equal(store.getSnapshot().notifications.length, 1);
  assert.equal(store.getSnapshot().notifications[0].isRead, true);
  assert.equal(store.getSnapshot().unreadCount, 0);
});

test("a failed notification save keeps download feedback in this session", async () => {
  const { store, api } = fixture();
  api.create = async () => { throw new Error("offline"); };
  const item = store.create("download", "PDF download started", "Plan.pdf");
  assert.equal(await item.saved, false);
  await store.refresh();
  assert.equal(store.getSnapshot().notifications.length, 1);
  assert.equal(store.getSnapshot().notifications[0].id, item.id);
  await store.markRead(item.id);
  assert.equal(store.getSnapshot().unreadCount, 0);
});

test("read failures retain unread state, and concurrent read clicks issue one request", async () => {
  const { store, api, counts } = fixture();
  await store.create("success", "All done", "Saved").saved;
  const id = store.getSnapshot().notifications[0].id;
  const original = api.markRead;
  const pending = deferred<boolean>();
  let readCalls = 0;
  api.markRead = () => { readCalls++; return pending.promise; };
  const first = store.markRead(id);
  const second = store.markRead(id);
  assert.equal(first, second);
  assert.equal(readCalls, 1);
  pending.resolve(false);
  assert.equal(await first, false);
  assert.equal(store.getSnapshot().unreadCount, 1);
  assert.equal(store.getSnapshot().notifications[0].isRead, false);
  api.markRead = original;
  assert.equal(await store.markRead(id), true);
  assert.equal(store.getSnapshot().unreadCount, 0);
  assert.equal(counts.reads, 1);
});

test("mark all read covers downloads and other notification kinds", async () => {
  const { store } = fixture();
  await store.create("download", "PDF download started", "Plan.pdf").saved;
  await store.create("info", "Update", "Account update").saved;
  assert.equal(store.getSnapshot().unreadCount, 2);
  assert.equal(await store.markAllRead(), true);
  assert.equal(store.getSnapshot().unreadCount, 0);
  assert.ok(store.getSnapshot().notifications.every(item => item.isRead));
});

test("failed refresh preserves existing history and reports a retryable error", async () => {
  const { store, api } = fixture();
  await store.create("download", "PDF download started", "Plan.pdf").saved;
  api.list = async () => { throw new Error("offline"); };
  await store.refresh();
  assert.equal(store.getSnapshot().notifications.length, 1);
  assert.ok(store.getSnapshot().loadError);
});

test("account and workspace stores never share notification history", async () => {
  const { store, api } = fixture();
  const otherUser = new NotificationStore({ ...scope, userId: "user-b" }, api);
  const otherWorkspace = new NotificationStore({ ...scope, workspaceId: "workspace-b" }, api);
  await store.create("download", "PDF download started", "Private.pdf").saved;
  await Promise.all([otherUser.refresh(), otherWorkspace.refresh()]);
  assert.deepEqual(otherUser.getSnapshot().notifications, []);
  assert.deepEqual(otherWorkspace.getSnapshot().notifications, []);
  assert.equal(otherUser.getSnapshot().unreadCount, 0);
  const guest = new NotificationStore({}, api);
  await guest.create("info", "Guest", "Feedback").saved;
  assert.deepEqual(guest.getSnapshot().notifications, []);
});

test("the notification API accepts downloads and rejects unknown kinds", () => {
  const valid = { userId: "a0a0a0a0-0000-4000-8000-000000000001", title: "PDF download started", message: "Plan.pdf", type: "download" };
  assert.equal(createNotificationSchema.parse(valid).type, "download");
  assert.equal(createNotificationSchema.safeParse({ ...valid, type: "unexpected" }).success, false);
});
