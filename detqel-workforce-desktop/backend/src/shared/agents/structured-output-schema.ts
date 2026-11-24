/**
 * Keep the generation grammar small. Value limits, formats and patterns belong to the caller's
 * full validator; nested bounded arrays multiply constrained-decoder states at the provider.
 */
export function structuredOutputShape(schema: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of ["type", "enum", "const", "required", "$ref", "description"]) {
        if (schema[key] !== undefined) result[key] = schema[key];
    }
    for (const key of ["properties", "$defs", "definitions"]) {
        const values = schema[key];
        if (values && typeof values === "object" && !Array.isArray(values)) {
            result[key] = Object.fromEntries(Object.entries(values).map(([name, child]) => [name,
                typeof child === "boolean" ? child : structuredOutputShape(child as Record<string, unknown>)]));
        }
    }
    for (const key of ["items", "additionalProperties"]) {
        const value = schema[key];
        if (typeof value === "boolean") result[key] = value;
        else if (value && typeof value === "object" && !Array.isArray(value)) result[key] = structuredOutputShape(value as Record<string, unknown>);
    }
    for (const key of ["anyOf", "oneOf", "allOf"]) {
        const values = schema[key];
        if (Array.isArray(values)) result[key] = values.map(value => structuredOutputShape(value as Record<string, unknown>));
    }
    return result;
}
