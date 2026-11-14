import { createRequire } from "node:module";
import { Ajv, type ErrorObject } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConfigurationSchema } from "../../../shared/types/connector-catalog.js";
import { REPOSITORY_NAME_PATTERN } from "../../../constants/connectionConstants.js";
const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;

/** One sentence per invalid field, named by its form label, so the user knows what to change. */
function describeIssue(schema: ConfigurationSchema, issue: ErrorObject): string {
    const field = issue.keyword === "required" ? String(issue.params.missingProperty) : issue.instancePath.split("/")[1] ?? "";
    const property = schema.properties[field];
    const label = property?.title ?? (field || "The configuration");
    switch (issue.keyword) {
        case "required": return `${label} is required.`;
        case "minLength": return `${label} cannot be empty.`;
        case "maxLength": return `${label} is too long.`;
        case "enum": return `${label} must be one of the listed options.`;
        case "format": return issue.params.format === "uri" ? `${label} must be a full URL, such as https://example.com.` : `${label} is not in the expected format.`;
        case "pattern":
            return issue.params.pattern === REPOSITORY_NAME_PATTERN
                ? `${label} must be the name as it appears in the repository URL: letters, numbers, "-", "_" or "." only, with no spaces and no full URL.`
                : `${label} is not in the expected format.`;
        case "additionalProperties": return `"${String(issue.params.additionalProperty)}" is not a setting of this connector.`;
        default: return `${label} ${issue.message ?? "is not valid"}.`;
    }
}

export class ConfigurationValidator {
    private readonly validator = new Ajv({ allErrors: true, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false });
    constructor() { addFormats(this.validator); }
    validate(schema: ConfigurationSchema, configuration: Record<string, unknown>): void {
        const validate = this.validator.compile(schema);
        if (!validate(configuration)) {
            const issues = validate.errors ?? [];
            // Conditional branches report an extra "must match then schema" error; the field errors already explain it.
            const problems = [...new Set(issues.filter(issue => issue.keyword !== "if").map(issue => describeIssue(schema, issue)))];
            throw new AppError(400, ["Connection configuration is invalid.", ...problems].join(" "), {
                issues: issues.map(issue => ({ path: issue.instancePath, message: issue.message })),
            });
        }
    }
    visibleConfiguration(schema: ConfigurationSchema, configuration: Record<string, unknown>): Record<string, unknown> {
        return Object.fromEntries(Object.entries(configuration).filter(([name]) => {
            const conditions = schema.properties[name]?.["x-visibleWhen"];
            return !conditions || Object.entries(conditions).every(([field, value]) => configuration[field] === value);
        }));
    }
}
