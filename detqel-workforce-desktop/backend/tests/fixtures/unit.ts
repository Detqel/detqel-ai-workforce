import type { IUnitOfWork } from "../../src/shared/contracts/unit-of-work.js";
import { SessionService } from "../../src/shared/security/session.js";
import { testConfig as config } from "./config.js";

export const userId = "b7bc2723-5cdd-4c33-b8b7-260825d65030";
export const otherUserId = "0a1c4d6e-8f20-4b3a-9c55-1d2e3f405162";
export const workspaceId = "5f1a9a42-7d3e-4c1b-8a60-93b7c2d4e611";
export const otherWorkspaceId = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

export const userRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, name: "Test User", email: `${id}@example.test`, username: null, passwordHash: "SECRET-PASSWORD-HASH",
  avatarUrl: null, status: "active", licenseId: "9e0c7a52-41d4-4f6b-9a3e-2b8c5d1f7a60", licenseToken: "SECRET-LICENSE-TOKEN",
  licenseExpiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date(), ...overrides,
});
export const workspaceRow = (id: string, createdBy: string | null, overrides: Record<string, unknown> = {}) => ({
  id, name: "Workspace", slug: id, description: null, industry: null, timezone: "UTC", logoUrl: null,
  status: "active", createdBy, createdAt: new Date(), updatedAt: new Date(), ...overrides,
});
export const memberRow = (id: string, role: string, overrides: Record<string, unknown> = {}) => ({
  id: `member-${id}`, role, status: "active", joinedAt: new Date(), user: { id, name: "Member", email: `${id}@example.test`, avatarUrl: null }, ...overrides,
});

const sessions = new SessionService(config.AUTH_SESSION_SECRET, config.AUTH_SESSION_TTL_SECONDS);
export const tokenFor = (id: string) => sessions.issue(id).accessToken;
/** Request headers for a signed-in user. */
export const bearer = (id: string = userId) => ({ authorization: `Bearer ${tokenFor(id)}` });

const REPOSITORIES = ["users", "workspaces", "business", "connections", "workforce", "missions", "analytics", "automations", "activities", "notifications", "domains", "settings"] as const;

/**
 * A unit of work whose repositories fail loudly on any method a test did not provide, so a test can never pass
 * by accidentally touching data it did not mean to. Every user is active unless a test says otherwise.
 */
export function mockUnit(overrides: Record<string, Record<string, unknown>> = {}): IUnitOfWork {
  const defaults: Record<string, Record<string, unknown>> = { users: { findById: async (id: string) => userRow(id) } };
  const strictRepository = (name: string) => {
    const methods = { ...defaults[name], ...overrides[name] };
    return new Proxy(methods, { get: (object, key: string) => object[key] ?? (() => { throw new Error(`Unexpected repository access: ${name}.${key}`); }) });
  };
  const unit = Object.fromEntries(REPOSITORIES.map(name => [name, strictRepository(name)])) as unknown as IUnitOfWork;
  unit.transaction = async operation => operation(unit);
  return unit;
}
