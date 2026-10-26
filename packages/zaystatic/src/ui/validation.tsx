"use client";

import * as React from "react";

import { validateDoc } from "../schema/dsl.mjs";
import type { Fields, Issue } from "../schema/dsl.mjs";
import type { Messages } from "./i18n";
import { isEmpty } from "./util";

/** What the form needs to render problems: messages by field path, and whether to show them yet. */
export type ValidationState = { show: boolean; errors: Record<string, string[]> };
const ValidationContext = React.createContext<ValidationState>({ show: false, errors: {} });
export const ValidationProvider = ValidationContext.Provider;

export const pathKey = (path: (string | number)[]) => path.join(".");

/** Messages for the field at `path` (empty until the first failed save attempt). */
export function useFieldErrors(path: (string | number)[]): string[] {
  const { show, errors } = React.useContext(ValidationContext);
  return show ? (errors[pathKey(path)] ?? []) : [];
}

/** Does anything under `path` have a problem? (marks collapsed list items) */
export function useHasErrorsUnder(path: (string | number)[]): boolean {
  const { show, errors } = React.useContext(ValidationContext);
  if (!show) return false;
  const key = pathKey(path);
  return Object.keys(errors).some((k) => k === key || k.startsWith(`${key}.`));
}

const fill = (tpl: string, params: Record<string, unknown> | undefined) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ""));

export function issueText(t: Messages, issue: Pick<Issue, "code" | "params">): string {
  const p = issue.params as Record<string, unknown> | undefined;
  switch (issue.code) {
    case "required": return t.vRequired;
    case "minLength": return fill(t.vMinLength, p);
    case "maxLength": return fill(t.vMaxLength, p);
    case "pattern": return typeof p?.message === "string" ? p.message : t.vPattern;
    case "min": return fill(t.vMin, p);
    case "max": return fill(t.vMax, p);
    case "minItems": return fill(t.vMinItems, p);
    case "maxItems": return fill(t.vMaxItems, p);
    default: return t.vPattern;
  }
}

/** Issues per language for a set of documents (mirrors the server: `required` only in the default language, empty translations skipped). */
export function validateDocs(
  docs: Record<string, Record<string, unknown>>,
  fieldsFor: (locale: string) => Fields,
  locales: string[],
  defaultLocale: string,
): Record<string, Issue[]> {
  const out: Record<string, Issue[]> = {};
  for (const l of locales) {
    const doc = docs[l];
    const isDefault = l === defaultLocale;
    out[l] = !doc || (!isDefault && isEmpty(doc)) ? [] : validateDoc(fieldsFor(l), doc, { checkRequired: isDefault });
  }
  return out;
}

export function toErrors(t: Messages, issues: Issue[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) (out[pathKey(i.path)] ??= []).push(issueText(t, i));
  return out;
}
