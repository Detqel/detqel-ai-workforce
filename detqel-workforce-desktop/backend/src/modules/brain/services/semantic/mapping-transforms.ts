import { BRAIN_MAPPING_TRANSFORMS } from "../../../../constants/brainConstants.js";

/** Applies a mapping transform to a Silver value before it becomes a canonical attribute. */
export function applyTransform(value: unknown, transform: string): unknown {
    if (value === null || value === undefined) return null;
    switch (transform) {
        case BRAIN_MAPPING_TRANSFORMS.trim: return String(value).trim();
        case BRAIN_MAPPING_TRANSFORMS.lowercase: return String(value).trim().toLowerCase();
        case BRAIN_MAPPING_TRANSFORMS.uppercase: return String(value).trim().toUpperCase();
        case BRAIN_MAPPING_TRANSFORMS.number: { const number = Number(value); return Number.isFinite(number) ? number : null; }
        case BRAIN_MAPPING_TRANSFORMS.date: { const time = Date.parse(String(value)); return Number.isNaN(time) ? null : new Date(time).toISOString(); }
        default: return value;
    }
}
