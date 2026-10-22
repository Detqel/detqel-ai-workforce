"use client";

import { BOOLEAN_CONFIGURATION_OPTIONS } from "@/constants/connectorConstants";

import React, { useId, useState } from "react";
import { OptionMenu } from "@/components/ui/option-menu";
import type { ConfigurationSchema } from "@/lib/api/connector-catalog";
import { connectionInputClass } from "./ConnectionDialog";

type Configuration = Record<string, unknown>;

export function isConfigurationFieldVisible(field: ConfigurationSchema, values: Configuration) {
  return Object.entries(field["x-visibleWhen"] ?? {}).every(([name, expected]) => JSON.stringify(values[name]) === JSON.stringify(expected));
}

function matchesCondition(condition: ConfigurationSchema, values: Configuration): boolean {
  if (condition.required?.some(name => values[name] === undefined)) return false;
  return Object.entries(condition.properties ?? {}).every(([name, field]) => {
    if (Object.prototype.hasOwnProperty.call(field, "const")) return JSON.stringify(values[name]) === JSON.stringify(field.const);
    if (field.enum) return field.enum.some(option => JSON.stringify(option) === JSON.stringify(values[name]));
    return false;
  });
}

export function configurationRequiredFields(schema: ConfigurationSchema, values: Configuration): Set<string> {
  const required = new Set(schema.required);
  for (const branch of schema.allOf ?? []) {
    const selected = branch.if ? (matchesCondition(branch.if, values) ? branch.then : branch.else) : branch;
    for (const name of selected?.required ?? []) required.add(name);
  }
  return required;
}

export function visibleConfiguration(schema: ConfigurationSchema, values: Configuration): Configuration {
  return Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([name, field]) => isConfigurationFieldVisible(field, values) && values[name] !== undefined && values[name] !== "").map(([name]) => [name, values[name]]));
}

export function missingConfigurationFields(schema: ConfigurationSchema, values: Configuration, configuredSecrets: string[]) {
  const required = configurationRequiredFields(schema, values);
  return Object.entries(schema.properties ?? {}).filter(([name, field]) => required.has(name) && isConfigurationFieldVisible(field, values) && !(field["x-secret"] && configuredSecrets.includes(name)) && (values[name] === undefined || values[name] === "" || values[name] === null)).map(([name, field]) => field.title ?? name);
}

interface ConfigurationSchemaFormProps {
  schema: ConfigurationSchema;
  values: Configuration;
  configuredSecretFields: string[];
  onChange: (values: Configuration) => void;
}

export function ConfigurationSchemaForm({ schema, values, configuredSecretFields, onChange }: ConfigurationSchemaFormProps) {
  const id = useId();
  const required = configurationRequiredFields(schema, values);
  return <div className="space-y-4">{Object.entries(schema.properties ?? {}).filter(([, field]) => isConfigurationFieldVisible(field, values)).map(([name, field]) => <ConfigurationField key={name} id={`${id}-${name}`} name={name} schema={field} value={values[name]} required={required.has(name) && !(field["x-secret"] && configuredSecretFields.includes(name))} hasStoredSecret={Boolean(field["x-secret"] && configuredSecretFields.includes(name))} onChange={value => onChange({ ...values, [name]: value })} />)}</div>;
}

interface ConfigurationFieldProps {
  id: string;
  name: string;
  schema: ConfigurationSchema;
  value: unknown;
  required: boolean;
  hasStoredSecret: boolean;
  onChange: (value: unknown) => void;
}

function JsonConfigurationInput({ id, schema, value, required, onChange }: Pick<ConfigurationFieldProps, "id" | "schema" | "value" | "required" | "onChange">) {
  const [text, setText] = useState(value === undefined ? "" : JSON.stringify(value, null, 2));
  const type = Array.isArray(schema.type) ? schema.type.find(item => item !== "null") : schema.type;
  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const input = event.currentTarget;
    setText(input.value);
    input.setCustomValidity("");
    onChange(undefined);
    if (input.value.trim() === "") { onChange(undefined); return; }
    try {
      const parsed: unknown = JSON.parse(input.value);
      if ((type === "array" && !Array.isArray(parsed)) || (type === "object" && (parsed === null || Array.isArray(parsed) || typeof parsed !== "object"))) {
        input.setCustomValidity(`Enter a JSON ${type}.`);
        return;
      }
      onChange(parsed);
    } catch { input.setCustomValidity("Enter valid JSON."); }
  };
  const props = { id, required, value: text, spellCheck: false, autoComplete: "off", className: `${connectionInputClass} font-mono text-xs`, onChange: handleChange };
  return schema["x-secret"] || schema.format === "password" ? <input {...props} type="password" autoComplete="new-password" /> : <textarea {...props} rows={4} />;
}

function ConfigurationField({ id, name, schema, value, required, hasStoredSecret, onChange }: ConfigurationFieldProps) {
  const title = schema.title ?? name;
  const type = Array.isArray(schema.type) ? schema.type.find(item => item !== "null") : schema.type;
  const secret = schema["x-secret"] || schema.format === "password";
  let control: React.ReactNode;

  if (schema.enum) {
    control = <OptionMenu label={title} placeholder={`Select ${title}`} value={value === undefined ? undefined : JSON.stringify(value)} options={schema.enum.map((option, index) => ({ value: JSON.stringify(option), label: schema.enumNames?.[index] ?? String(option) }))} onSelect={selected => onChange(JSON.parse(selected))} />;
  } else if (type === "boolean") {
    control = <OptionMenu label={title} placeholder={`Select ${title}`} value={value === undefined ? undefined : JSON.stringify(value)} options={BOOLEAN_CONFIGURATION_OPTIONS} onSelect={selected => onChange(selected === "true")} />;
  } else if (type === "array" || type === "object") {
    control = <JsonConfigurationInput id={id} schema={schema} value={value} required={required} onChange={onChange} />;
  } else if (type === "string" || type === "number" || type === "integer") {
    const inputType = secret ? "password" : type === "number" || type === "integer" ? "number" : schema.format === "uri" || schema.format === "url" ? "url" : schema.format === "email" ? "email" : "text";
    control = <input id={id} type={inputType} required={required} value={typeof value === "string" || typeof value === "number" ? value : ""} minLength={schema.minLength} maxLength={schema.maxLength} min={schema.minimum} max={schema.maximum} step={type === "integer" ? 1 : type === "number" ? "any" : undefined} pattern={schema.pattern} autoComplete={secret ? "new-password" : "off"} className={connectionInputClass} onChange={event => onChange(event.target.value === "" ? undefined : inputType === "number" ? Number(event.target.value) : event.target.value)} />;
  } else {
    control = <p role="alert" className="text-xs text-red-600 dark:text-red-400">This configuration field uses an unsupported schema type.</p>;
  }

  return <div className="space-y-1.5"><label htmlFor={id} className="block text-xs font-semibold">{title}{required && <span className="ml-1 text-red-500">*</span>}{secret && <span className="ml-2 text-[10px] font-normal text-slate-500 dark:text-slate-400">Encrypted</span>}</label>{control}{schema.description && <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{schema.description}</p>}{hasStoredSecret && <p className="text-[11px] text-slate-500 dark:text-slate-400">A credential is stored. Leave this field empty to keep it.</p>}{!required && value !== undefined && (schema.enum || type === "boolean") && <button type="button" onClick={() => onChange(undefined)} className="text-[11px] font-medium text-[#8a2be2] dark:text-[#FFA500]">Clear selection</button>}</div>;
}
