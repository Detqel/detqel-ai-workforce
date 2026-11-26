import { createHmac, hkdfSync } from "node:crypto";
import { SECRET_CRYPTO } from "../../../../constants/authConstants.js";
import { BRAIN_DATA_PROTECTION } from "../../../../constants/brainConstants.js";
import { SecretCipher } from "../../../../shared/security/secret-cipher.js";
import { stableStringify } from "../brain-types.js";

const SEALED = "$sealed";
const PSEUDONYM = new RegExp(`^${BRAIN_DATA_PROTECTION.pseudonymPrefix}[a-f0-9]{${BRAIN_DATA_PROTECTION.pseudonymHexLength}}$`);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,24}$/i;

const segmentsOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
/** True when a column name says it holds personal data (contact details, identity documents, birth dates, addresses). */
export const isPersonalField = (name: string): boolean => BRAIN_DATA_PROTECTION.personalFieldPattern.test(segmentsOf(name));
export const isPseudonym = (value: unknown): boolean => typeof value === "string" && PSEUDONYM.test(value);

export interface ProtectedBatch {
    readonly records: Record<string, unknown>[];
    /** Every field protected in this dataset so far: the stored list plus anything detected in this batch. */
    readonly protectedFields: string[];
}

/**
 * Protects business records before anything is stored:
 * - the raw copy kept in Bronze is sealed with AES-256-GCM, bound to its dataset and record, so a copied row or a
 *   database dump reveals nothing without the installation's master key;
 * - personal fields are replaced in Silver, quarantine and everything derived from them (entities, metrics,
 *   answers, model prompts) by keyed pseudonyms. A pseudonym is stable inside one workspace, so counts, joins and
 *   duplicate detection still work, and cannot be reversed or correlated across workspaces;
 * - fingerprints used for de-duplication are keyed HMACs, never plain hashes of record contents.
 * Credentials and card numbers are removed earlier and never stored at all, sealed or not.
 */
export class BrainDataProtector {
    private readonly cipher: SecretCipher;
    private readonly pseudonymRoot: Buffer;

    constructor(encodedMasterKey: string) {
        this.cipher = new SecretCipher(encodedMasterKey, BRAIN_DATA_PROTECTION.rawRecordPurpose);
        const master = Buffer.from(encodedMasterKey, "base64");
        this.pseudonymRoot = Buffer.from(hkdfSync(SECRET_CRYPTO.derivation.digest, master, SECRET_CRYPTO.derivation.salt, BRAIN_DATA_PROTECTION.pseudonymPurpose, SECRET_CRYPTO.keyBytes));
    }

    /** The sealed form stored in place of a raw record or cursor. Only the server holding the master key can open it. */
    seal(value: unknown, context: string): Record<string, unknown> {
        return { [SEALED]: this.cipher.encrypt(stableStringify(value), context) };
    }
    isSealed(value: unknown): value is Record<string, string> {
        return value !== null && typeof value === "object" && typeof (value as Record<string, unknown>)[SEALED] === "string";
    }
    /** Opens a sealed value; values stored before sealing existed are returned as they are. */
    open<T = Record<string, unknown>>(value: unknown, context: string): T {
        return (this.isSealed(value) ? JSON.parse(this.cipher.decrypt(value[SEALED], context)) : value) as T;
    }

    /** Keyed fingerprint of a record or value, for de-duplication and key-less records. */
    fingerprint(workspaceId: string, value: unknown): string {
        return createHmac(SECRET_CRYPTO.derivation.digest, this.workspaceKey(workspaceId, "fingerprint")).update(stableStringify(value)).digest("hex");
    }

    /** A stable, irreversible stand-in for a personal value. Case and surrounding spaces are ignored, so equal values match. */
    pseudonymise(workspaceId: string, value: unknown): unknown {
        if (value === null || value === undefined || value === "" || isPseudonym(value)) return value;
        const normalized = (value instanceof Date ? value.toISOString() : typeof value === "object" ? stableStringify(value) : String(value)).trim().toLowerCase();
        const digest = createHmac(SECRET_CRYPTO.derivation.digest, this.workspaceKey(workspaceId, "pseudonym")).update(normalized).digest("hex");
        return `${BRAIN_DATA_PROTECTION.pseudonymPrefix}${digest.slice(0, BRAIN_DATA_PROTECTION.pseudonymHexLength)}`;
    }

    /**
     * Detects personal fields (by name, or by values that are mostly e-mail addresses) and pseudonymises them.
     * A field once protected stays protected for the dataset. Fields the dataset needs as time or watermark
     * fields are never replaced, because their values must stay comparable.
     */
    protect(workspaceId: string, records: ReadonlyArray<Record<string, unknown>>, known: ReadonlyArray<string>, keepReadable: ReadonlyArray<string>): ProtectedBatch {
        const readable = new Set(keepReadable.filter(Boolean));
        const fields = new Set(known.filter(field => !readable.has(field)));
        const emailHits = new Map<string, { emails: number; values: number }>();
        for (const record of records) {
            for (const [name, value] of Object.entries(record)) {
                if (fields.has(name) || readable.has(name)) continue;
                if (isPersonalField(name)) { fields.add(name); continue; }
                if (typeof value !== "string" || !value) continue;
                const hits = emailHits.get(name) ?? { emails: 0, values: 0 };
                hits.values++;
                if (EMAIL.test(value.trim())) hits.emails++;
                emailHits.set(name, hits);
            }
        }
        for (const [name, hits] of emailHits) if (hits.emails / hits.values >= BRAIN_DATA_PROTECTION.emailShareThreshold) fields.add(name);
        if (!fields.size) return { records: [...records], protectedFields: [] };
        const protectedRecords = records.map(record => {
            const copy: Record<string, unknown> = { ...record };
            for (const field of fields) if (field in copy) copy[field] = this.pseudonymise(workspaceId, copy[field]);
            return copy;
        });
        return { records: protectedRecords, protectedFields: [...fields].sort() };
    }

    private workspaceKey(workspaceId: string, use: string): Buffer {
        return Buffer.from(hkdfSync(SECRET_CRYPTO.derivation.digest, this.pseudonymRoot, workspaceId, use, SECRET_CRYPTO.keyBytes));
    }
}
