import { createRequire } from "node:module";
import { Ajv } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConfigurationSchema } from "../../../shared/types/connector-catalog.js";

const addFormats = createRequire(import.meta.url)("ajv-formats") as FormatsPlugin;

export class ConfigurationValidator {
    private readonly validator = new Ajv({ allErrors: true, strict: false, useDefaults: false, coerceTypes: false, removeAdditional: false });

    constructor() { addFormats(this.validator); }

    validate(schema: ConfigurationSchema, configuration: Record<string, unknown>): void {
        const validate = this.validator.compile(schema);
        if (!validate(configuration)) {
            throw new AppError(400, "Connection configuration is invalid", {
                issues: validate.errors?.map(issue => ({ path: issue.instancePath, message: issue.message })),
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
