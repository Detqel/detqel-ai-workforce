import type { UserLicense } from "@/lib/api";

const DAY_MS = 86_400_000;

/** Midnight of the given instant in the user's local time zone. */
const startOfLocalDay = (time: number): number => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/**
 * Whole calendar days from today until the license ends, so a 365-day license reads 365 on the day it is granted
 * and 364 the next day. Null when the license has no end date.
 */
export function licenseDaysRemaining(expiresAt: string | null, now: number): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  if (end <= now) return 0;
  return Math.round((startOfLocalDay(end) - startOfLocalDay(now)) / DAY_MS);
}

/** "Enterprise" from the portal's display name, falling back to the plan code ("ENTERPRISE"). */
export function licenseName(license: UserLicense | null | undefined): string {
  const name = license?.name?.trim();
  if (name) return name;
  const code = license?.type?.trim();
  if (!code) return "No license";
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
}

export interface LicenseSummary {
  /** "Enterprise · 365 days" */
  label: string;
  expired: boolean;
}

/** The license line under the user's name: "<name> · <N> days", "Expires today", "Expired" or "No expiry". */
export function licenseSummary(license: UserLicense | null | undefined, now: number): LicenseSummary | null {
  if (!license) return null;
  const name = licenseName(license);
  if (!license.expiresAt) return { label: `${name} · No expiry`, expired: false };
  if (new Date(license.expiresAt).getTime() <= now) return { label: `${name} · Expired`, expired: true };
  const days = licenseDaysRemaining(license.expiresAt, now) ?? 0;
  const validity = days === 0 ? "Expires today" : `${days} ${days === 1 ? "day" : "days"}`;
  return { label: `${name} · ${validity}`, expired: false };
}
