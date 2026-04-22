/**
 * Field discovery for the DocuSign signing frame.
 *
 * Walks the signing iframe and returns a structured description of every
 * interactive form control we can see.  Purely read-only – no clicks, no
 * fills – so it is safe to run against a live signing URL.
 */

import type { FrameLocator, Locator } from '@playwright/test';
import { inferFieldType, type FieldTypeDefinition } from './validation-rules';

export type FieldKind = 'textbox' | 'textarea' | 'combobox' | 'checkbox' | 'radio' | 'upload';

export type LocatorConfidence = 'role-with-label' | 'role-only' | 'css-fallback';

export interface DiscoveredField {
  kind: FieldKind;
  index: number;
  sectionName: string | null;

  // Text signals
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  title: string | null;
  describedByText: string | null;
  /** Nearby helper/hint text captured from sibling/parent nodes that look like tooltips. */
  helperText: string | null;

  // DOM attributes
  type: string | null;
  inputMode: string | null;
  autocomplete: string | null;
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  required: boolean;

  // State
  visible: boolean;
  editable: boolean;

  // Inference
  inferredType: FieldTypeDefinition;
  locatorConfidence: LocatorConfidence;

  /** Not serialised in the report – used by the spec only. */
  locator: Locator;
}

async function safeAttr(loc: Locator, name: string): Promise<string | null> {
  try {
    return await loc.getAttribute(name, { timeout: 1_000 });
  } catch {
    return null;
  }
}

async function describedByText(loc: Locator, frame: FrameLocator): Promise<string | null> {
  const ids = await safeAttr(loc, 'aria-describedby');
  if (!ids) return null;
  const parts: string[] = [];
  for (const id of ids.split(/\s+/).filter(Boolean)) {
    try {
      // Escape the id for CSS.  DocuSign ids can contain colons/hyphens.
      const txt = await frame.locator(`[id="${id.replace(/"/g, '\\"')}"]`).textContent({ timeout: 1_000 });
      if (txt?.trim()) parts.push(txt.trim());
    } catch {
      /* ignore – id may live in a different frame */
    }
  }
  return parts.length ? parts.join(' | ') : null;
}

/**
 * Look for nearby helper/hint text.  Scans:
 *   - siblings / parent's children with class or role containing
 *     tooltip|help|hint|info|description|error
 *   - aria-labelledby referenced nodes
 * Returns up to ~200 chars of non-duplicate text.
 * If nothing is found, returns null (never guesses).
 */
async function nearbyHelperText(loc: Locator): Promise<string | null> {
  try {
    return await loc.evaluate((el) => {
      const HELPER_RE = /(tooltip|help|hint|info|description|error|sub-?text|caption)/i;
      const seen = new Set<string>();
      const out: string[] = [];
      const consider = (node: Element | null) => {
        if (!node) return;
        const cls = node.getAttribute('class') || '';
        const role = node.getAttribute('role') || '';
        const dataRole = node.getAttribute('data-role') || '';
        if (!HELPER_RE.test(cls + ' ' + role + ' ' + dataRole)) return;
        const txt = (node.textContent ?? '').trim();
        if (!txt || txt.length > 300 || seen.has(txt)) return;
        seen.add(txt);
        out.push(txt);
      };
      const parent = el.parentElement;
      if (parent) {
        for (const child of Array.from(parent.children)) consider(child);
        const grand = parent.parentElement;
        if (grand) for (const child of Array.from(grand.children)) consider(child);
      }
      // aria-labelledby – different from aria-describedby, still helpful
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        for (const id of labelledby.split(/\s+/).filter(Boolean)) {
          const n = document.getElementById(id);
          if (n) {
            const txt = (n.textContent ?? '').trim();
            if (txt && !seen.has(txt)) {
              seen.add(txt);
              out.push(txt);
            }
          }
        }
      }
      return out.length ? out.join(' | ').slice(0, 400) : null;
    }, { timeout: 1_500 });
  } catch {
    return null;
  }
}

async function nearestSectionName(loc: Locator): Promise<string | null> {
  // FRAGILE: DocuSign section headings have no canonical role.  We look at the
  // nearest preceding element that looks like a numbered section heading.
  try {
    const txt = await loc.evaluate((el) => {
      const pattern = /^\s*\d+\.\s+\w/;
      let cur: Element | null = el;
      while (cur) {
        let sib: Element | null = cur.previousElementSibling;
        while (sib) {
          const t = (sib.textContent ?? '').trim();
          const firstLine = t.split('\n')[0].trim();
          if (pattern.test(firstLine)) return firstLine.slice(0, 80);
          sib = sib.previousElementSibling;
        }
        cur = cur.parentElement;
      }
      return null;
    }, { timeout: 1_500 });
    return txt;
  } catch {
    return null;
  }
}

function parseIntOrNull(s: string | null): number | null {
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

async function describe(
  loc: Locator,
  kind: FieldKind,
  index: number,
  frame: FrameLocator,
): Promise<DiscoveredField> {
  const [
    ariaLabel,
    placeholder,
    title,
    type,
    inputMode,
    autocomplete,
    pattern,
    minLength,
    maxLength,
    ariaRequired,
    requiredAttr,
    visible,
    editable,
    describedBy,
    sectionName,
    helperText,
  ] = await Promise.all([
    safeAttr(loc, 'aria-label'),
    safeAttr(loc, 'placeholder'),
    safeAttr(loc, 'title'),
    safeAttr(loc, 'type'),
    safeAttr(loc, 'inputmode'),
    safeAttr(loc, 'autocomplete'),
    safeAttr(loc, 'pattern'),
    safeAttr(loc, 'minlength'),
    safeAttr(loc, 'maxlength'),
    safeAttr(loc, 'aria-required'),
    safeAttr(loc, 'required'),
    loc.isVisible().catch(() => false),
    loc.isEditable().catch(() => false),
    describedByText(loc, frame),
    nearestSectionName(loc),
    nearbyHelperText(loc),
  ]);

  const label = ariaLabel ?? placeholder ?? title ?? null;
  const required = ariaRequired === 'true' || requiredAttr !== null;

  // Inference now includes the helper/hint text, which often makes the
  // difference for DocuSign fields where the <input> has only a generic
  // aria-label but the nearby helper text reveals the real purpose.
  const inferredType = inferFieldType(label, placeholder, title, ariaLabel, describedBy, helperText, sectionName);

  const locatorConfidence: LocatorConfidence =
    kind === 'upload'
      ? label
        ? 'role-with-label'
        : 'css-fallback'
      : label
        ? 'role-with-label'
        : 'role-only';

  return {
    kind,
    index,
    sectionName,
    label,
    placeholder,
    ariaLabel,
    title,
    describedByText: describedBy,
    helperText,
    type,
    inputMode,
    autocomplete,
    pattern,
    minLength: parseIntOrNull(minLength),
    maxLength: parseIntOrNull(maxLength),
    required,
    visible,
    editable,
    inferredType,
    locatorConfidence,
    locator: loc,
  };
}

/**
 * Discover up to `maxPerKind` controls of each kind.  The cap prevents a
 * pathological DocuSign layout from producing a 500-field sweep.
 */
export async function discoverFields(
  frame: FrameLocator,
  maxPerKind = 60,
): Promise<DiscoveredField[]> {
  const fields: DiscoveredField[] = [];

  // Textareas are reported as role="textbox" by Playwright, so we split them
  // out by tag to tag them explicitly as 'textarea' in the report.
  const textareaAll = await frame.locator('textarea').all();
  const textboxAll = await frame.getByRole('textbox').all();
  // De-dupe textboxes that are actually textareas.  We can't compare Locators
  // directly; cheap approach is to tag by tagName via evaluate.
  const textboxOnly: Locator[] = [];
  for (const l of textboxAll) {
    try {
      const tag = await l.evaluate((el) => el.tagName.toLowerCase(), { timeout: 1_000 });
      if (tag !== 'textarea') textboxOnly.push(l);
    } catch {
      textboxOnly.push(l);
    }
  }

  const kinds: Array<{ kind: FieldKind; list: Locator[] }> = [
    { kind: 'textbox', list: textboxOnly },
    { kind: 'textarea', list: textareaAll },
    { kind: 'combobox', list: await frame.getByRole('combobox').all() },
    { kind: 'checkbox', list: await frame.getByRole('checkbox').all() },
    { kind: 'radio', list: await frame.getByRole('radio').all() },
    // Native file inputs
    { kind: 'upload', list: await frame.locator('input[type="file"]').all() },
    // Custom DocuSign upload triggers – buttons whose accessible name
    // suggests an upload / attach action.  These are often the only
    // discoverable surface when the real <input type="file"> is hidden.
    // Tagged as 'upload' so they flow through the same reporting path.
    {
      kind: 'upload',
      list: await frame
        .getByRole('button', { name: /upload|attach|choose\s*file|add\s*file|browse/i })
        .all(),
    },
  ];

  for (const { kind, list } of kinds) {
    const slice = list.slice(0, maxPerKind);
    for (let i = 0; i < slice.length; i++) {
      fields.push(await describe(slice[i], kind, i, frame));
    }
  }

  return fields;
}

/** Priority order used by the report's "top findings" section. */
export const SECTION_PRIORITY = [
  /business\s*details/i,
  /stakeholder/i,
  /acknowledg/i,
];

export function sectionPriorityRank(section: string | null): number {
  if (!section) return 99;
  for (let i = 0; i < SECTION_PRIORITY.length; i++) {
    if (SECTION_PRIORITY[i].test(section)) return i;
  }
  return 50;
}
