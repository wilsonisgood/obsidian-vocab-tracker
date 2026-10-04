// Tiny mustache-style renderer for AI prompt templates (規劃書 06 §6.3).
// Templates stay readable as plain text with named slots instead of being
// assembled from string concatenation scattered across task code:
//
//   {{name}}               → slot value ("" when missing)
//   {{#name}}…{{/name}}    → kept only when the slot is non-empty
//   {{^name}}…{{/name}}    → kept only when the slot is empty
//
// Sections don't nest the same name and there's no escaping — the output is
// a prompt, not HTML. Pure and deterministic so composed AiRequests can be
// snapshot-tested and stay byte-stable for prompt caching.

export type TemplateSlots = Record<string, string | number | undefined | null>;

const SECTION_RE = /\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
const SLOT_RE = /\{\{(\w+)\}\}/g;

function filled(value: TemplateSlots[string]): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function renderTemplate(template: string, slots: TemplateSlots): string {
  // Sections first so a slot inside an omitted section never renders.
  // Looping handles sibling sections that the single regex pass may have
  // exposed after an outer replacement.
  let out = template;
  let prev: string;
  do {
    prev = out;
    out = out.replace(SECTION_RE, (_m, kind: string, name: string, body: string) => {
      const keep = kind === "#" ? filled(slots[name]) : !filled(slots[name]);
      return keep ? body : "";
    });
  } while (out !== prev);

  out = out.replace(SLOT_RE, (_m, name: string) => {
    const value = slots[name];
    return value === undefined || value === null ? "" : String(value);
  });

  // Omitted sections leave blank-line runs behind; collapse them so the
  // prompt (and its snapshot) doesn't depend on which optional slots were set.
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Every slot name a template references (plain and section). Used by tests
// to assert a task never references a slot its context builder doesn't
// provide — a typo would otherwise silently render as "".
export function templateSlots(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(/\{\{[#^/]?(\w+)\}\}/g)) names.add(m[1]);
  return [...names].sort();
}
