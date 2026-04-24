/**
 * Field discovery for the DocuSign signing frame.
 *
 * Walks the signing iframe and returns a structured description of every
 * interactive form control we can see.  Purely read-only – no clicks, no
 * fills – so it is safe to run against a live signing URL.
 */

import type { Locator } from '@playwright/test';
import { inferFieldType, type FieldTypeDefinition } from './validation-rules';
import type { FrameHost } from './signer-helpers';

export type FieldKind = 'textbox' | 'textarea' | 'combobox' | 'checkbox' | 'radio' | 'upload';

export type LocatorConfidence = 'role-with-label' | 'role-only' | 'css-fallback';

/** Where the resolved label came from.  Ordered strongest → weakest. */
export type LabelSource =
  | 'aria-label'
  | 'aria-labelledby'
  | 'label-for'
  | 'wrapping-label'
  | 'id-or-name-key'
  | 'title'
  | 'placeholder'
  | 'described-by'
  | 'row-header'
  | 'positional-prompt'
  | 'preceding-text'
  | 'helper-text'
  | 'section+row'
  | 'docusign-tab-type'
  | 'enrichment-guid'
  | 'enrichment-position'
  | 'none';

export type LabelConfidence = 'high' | 'medium' | 'low' | 'none';

/** Why a candidate was rejected during label resolution. */
export type LabelRejectReason =
  | 'looks-like-value'
  | 'docusign-stub'
  | 'chrome-text'
  | 'equals-field-value'
  | 'too-short'
  | 'too-long'
  | 'pure-punctuation'
  | 'pure-digits';

export interface RejectedLabelCandidate {
  source: LabelSource;
  value: string;
  reason: LabelRejectReason;
}

/**
 * How strong the evidence is that a control is an attachment/upload widget.
 *   - `strong`: input[type=file], upload button, or an explicit DocuSign
 *     attachment tab marker on the element itself.
 *   - `weak`:   attachment-ish tokens only on distant ancestors or helper
 *     text – not enough to override a textbox/combobox classification.
 *   - `none`:   no evidence at all.
 */
export type AttachmentEvidence = 'strong' | 'weak' | 'none';

/**
 * How a control fits into the onboarding flow.  The report uses this to
 * stop treating DocuSign chrome / signature / read-only controls as though
 * they were merchant inputs.
 */
export type ControlCategory =
  | 'merchant_input'
  | 'read_only_display'
  | 'docusign_chrome'
  | 'signature_widget'
  | 'date_signed_widget'
  | 'attachment_control'
  | 'acknowledgement_checkbox'
  | 'unknown_control';

export interface LabelCandidate {
  source: LabelSource;
  value: string;
}

export interface DiscoveredField {
  kind: FieldKind;
  index: number;
  sectionName: string | null;

  /** Back-compat alias for resolvedLabel. */
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  title: string | null;
  describedByText: string | null;
  helperText: string | null;

  resolvedLabel: string | null;
  labelSource: LabelSource;
  labelConfidence: LabelConfidence;
  /** True when the chosen candidate looked like a field value (we still used it, but flagged). */
  labelLooksLikeValue: boolean;
  rawCandidateLabels: LabelCandidate[];
  rejectedLabelCandidates: RejectedLabelCandidate[];
  /** Text near the control that clearly reads as a field value, not a prompt. */
  observedValueLikeTextNearControl: string | null;
  /** Stable key derived from id / name / data-qa when meaningful (e.g. "legalEntityType"). */
  idOrNameKey: string | null;
  /** Strength of attachment/upload evidence used by classifyControl. */
  attachmentEvidence: AttachmentEvidence;
  /** Shared group name for radios/checkboxes (from `name` attribute). */
  groupName: string | null;
  /** Current filled value, used only by label resolution (not serialised). */
  currentValue: string | null;

  type: string | null;
  inputMode: string | null;
  autocomplete: string | null;
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  required: boolean;
  docusignTabType: string | null;

  /** Raw `id` of the underlying control, e.g. `tab-form-element-{GUID}`. */
  elementId: string | null;
  /** DocuSign tab GUID extracted from `elementId`, lowercased.  `null`
   *  when the control isn't a tab-form-element. */
  tabGuid: string | null;
  /** 1-based page index derived from the ancestor `img.page-image` `src`
   *  parameter `p=N`, falling back to document-order page rank.  `null`
   *  when the control isn't inside a page container. */
  pageIndex: number | null;
  /** 1-based ordinal among `.doc-tab` elements of the same `data-type`
   *  on the same page, in document order.  `null` when not a DocuSign tab. */
  ordinalOnPage: number | null;

  visible: boolean;
  editable: boolean;

  controlCategory: ControlCategory;
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

async function describedByText(loc: Locator, frame: FrameHost): Promise<string | null> {
  const ids = await safeAttr(loc, 'aria-describedby');
  if (!ids) return null;
  const parts: string[] = [];
  for (const id of ids.split(/\s+/).filter(Boolean)) {
    try {
      const txt = await frame.locator(`[id="${id.replace(/"/g, '\\"')}"]`).textContent({ timeout: 1_000 });
      if (txt?.trim()) parts.push(txt.trim());
    } catch {
      /* ignore – id may live in a different frame */
    }
  }
  return parts.length ? parts.join(' | ') : null;
}

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

/**
 * Pull richer label candidates from the DOM in a single evaluate() call.
 */
async function extractDomContext(loc: Locator): Promise<{
  labelledByText: string | null;
  labelForText: string | null;
  wrappingLabelText: string | null;
  rowHeaderText: string | null;
  precedingText: string | null;
  positionalPromptText: string | null;
  sectionHeading: string | null;
  dataTabType: string | null;
  className: string | null;
  ownClassName: string | null;
  dataQa: string | null;
  ownDataTabType: string | null;
  elementId: string | null;
  elementName: string | null;
  groupName: string | null;
  valueLikeNearText: string | null;
  anchorText: string | null;
  currentValue: string | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
}> {
  const fallback = {
    labelledByText: null,
    labelForText: null,
    wrappingLabelText: null,
    rowHeaderText: null,
    precedingText: null,
    positionalPromptText: null,
    sectionHeading: null,
    dataTabType: null,
    className: null,
    ownClassName: null,
    dataQa: null,
    ownDataTabType: null,
    elementId: null,
    elementName: null,
    groupName: null,
    valueLikeNearText: null,
    anchorText: null,
    currentValue: null,
    pageIndex: null,
    ordinalOnPage: null,
  };
  try {
    return await loc.evaluate((el) => {
      const clean = (s: string | null | undefined): string | null =>
        (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || null;

      const getIdsText = (ids: string | null): string | null => {
        if (!ids) return null;
        const parts: string[] = [];
        for (const id of ids.split(/\s+/).filter(Boolean)) {
          const node = document.getElementById(id);
          const t = clean(node?.textContent);
          if (t) parts.push(t);
        }
        return parts.length ? parts.join(' | ').slice(0, 240) : null;
      };

      const labelledByText = getIdsText(el.getAttribute('aria-labelledby'));

      let labelForText: string | null = null;
      const id = el.getAttribute('id');
      if (id) {
        try {
          const sel = `label[for="${id.replace(/"/g, '\\"')}"]`;
          const lbl = document.querySelector(sel);
          labelForText = clean(lbl?.textContent);
        } catch {
          labelForText = null;
        }
      }

      let wrappingLabelText: string | null = null;
      let walk: Element | null = el.parentElement;
      while (walk && walk !== document.body) {
        if (walk.tagName.toLowerCase() === 'label') {
          wrappingLabelText = clean(walk.textContent);
          break;
        }
        walk = walk.parentElement;
      }

      let rowHeaderText: string | null = null;
      const row: Element | null = el.closest('tr, [role="row"]');
      if (row) {
        const header =
          row.querySelector('th, [role="rowheader"]') ||
          row.querySelector('td:first-child, [role="gridcell"]:first-child');
        if (header && !header.contains(el)) {
          rowHeaderText = clean(header.textContent);
        }
      }

      const isInteractive = (n: Element) =>
        n.matches(
          'input, select, textarea, button, [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"]',
        );

      const VALUE_RE = /^(\$?\s*-?\d{1,3}(,\d{3})*(\.\d+)?\s*%?|\$?\s*-?\d+(\.\d+)?\s*%?|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/;
      const CHROME_RE = /(this\s*link\s*will\s*open|select\s*to\s*load|click\s*here|loading\.{3}|page\s*\d+\s*of|see\s*instructions|drag\s*and\s*drop)/i;
      // Compound DocuSign decoration strings seen in PDF tab labels.
      const STUB_RE =
        /signer\s*attachment|attachment\s*(required|optional)|(required|optional)\s*[-–]\s*(attachment|signhere|signature|datesigned|[a-z][a-zA-Z0-9]{2,}$)|^-{1,3}\s*select\s*-{1,3}/i;
      const looksValueOrChrome = (t: string | null): boolean =>
        !!t && (VALUE_RE.test(t) || CHROME_RE.test(t) || STUB_RE.test(t));

      let precedingText: string | null = null;
      let valueLikeNearText: string | null = null;
      {
        let node: Element | null = el;
        let up = 0;
        while (node && up < 4) {
          let sib: Element | null = node.previousElementSibling;
          while (sib) {
            if (!isInteractive(sib)) {
              const t = clean(sib.textContent);
              if (t && t.length >= 2 && t.length <= 120) {
                if (looksValueOrChrome(t)) {
                  if (!valueLikeNearText) valueLikeNearText = t;
                } else if (!precedingText) {
                  precedingText = t;
                }
                if (precedingText) break;
              }
            }
            sib = sib.previousElementSibling;
          }
          if (precedingText) break;
          node = node.parentElement;
          up++;
        }
      }

      // Section heading: walk ancestors looking for any preceding heading
      // (numbered or not), legend, or DocuSign page anchor text.
      let sectionHeading: string | null = null;
      let anchorText: string | null = null;
      {
        const HEADING_RE = /^(h1|h2|h3|h4|h5|h6|legend)$/i;
        const NUMBERED_RE = /^\s*\d+\.\s+\w/;
        let cur: Element | null = el;
        outer: while (cur) {
          const fieldset = cur.closest?.('fieldset');
          if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
              const t = clean(legend.textContent);
              if (t) {
                sectionHeading = t;
                break outer;
              }
            }
          }
          let sib: Element | null = cur.previousElementSibling;
          while (sib) {
            if (HEADING_RE.test(sib.tagName)) {
              const t = clean(sib.textContent);
              if (t) {
                sectionHeading = t;
                break outer;
              }
            }
            // Numbered section convention (e.g. "1. Business Details")
            const line = (sib.textContent ?? '').trim().split('\n')[0].trim();
            if (NUMBERED_RE.test(line)) {
              sectionHeading = line.slice(0, 80);
              break outer;
            }
            sib = sib.previousElementSibling;
          }
          cur = cur.parentElement;
        }

        // DocuSign page anchor: nearest [data-page], [data-anchor], or
        // aria-label on a page container.
        const pageContainer = el.closest(
          '[data-page-number], [data-page], [data-anchor], [aria-label*="page" i]',
        );
        if (pageContainer) {
          anchorText =
            clean(pageContainer.getAttribute('aria-label')) ||
            clean(pageContainer.getAttribute('data-anchor')) ||
            null;
        }
      }

      const closestTab = el.closest('[data-tabtype], [data-tab-type]');
      const dataTabType =
        el.getAttribute('data-tabtype') ||
        el.getAttribute('data-tab-type') ||
        closestTab?.getAttribute('data-tabtype') ||
        closestTab?.getAttribute('data-tab-type') ||
        null;
      const ownDataTabType =
        el.getAttribute('data-tabtype') || el.getAttribute('data-tab-type') || null;

      const closestQa = el.closest('[data-qa]');
      const dataQa = el.getAttribute('data-qa') || closestQa?.getAttribute('data-qa') || null;

      const className = el.getAttribute('class');
      // "own" vs "ancestor" — own class only.
      const ownClassName = className;

      // Radios and checkboxes may share a group name via `name` attribute,
      // or a role=radiogroup ancestor with aria-label.
      const elementName = el.getAttribute('name');
      let groupName: string | null = elementName || null;
      if (!groupName) {
        const group = el.closest('[role="radiogroup"], [role="group"]');
        if (group) {
          groupName = clean(group.getAttribute('aria-label')) || null;
        }
      }

      const elementId = el.getAttribute('id');

      // --- Positional prompt scan -----------------------------------------
      // DocuSign PDF envelopes render tabs on top of a rasterised PDF.  The
      // real prompt ("Legal Business Name") sits in a neighbouring <span>
      // that is NOT the element's previousElementSibling in DOM order —
      // position-wise it is ABOVE or to the LEFT of the tab.  Scan siblings
      // of a handful of ancestors, pick non-interactive text whose bounding
      // box is above / level-left of the tab, and is neither a value nor
      // chrome text.
      let positionalPromptText: string | null = null;
      try {
        const inputEl = el as HTMLElement;
        const rect = inputEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          type Cand = { text: string; dy: number; dx: number };
          const candidates: Cand[] = [];
          const seenTexts = new Set<string>();
          const pushCand = (text: string, r: DOMRect) => {
            if (!text || text.length < 2 || text.length > 120) return;
            if (seenTexts.has(text)) return;
            if (VALUE_RE.test(text) || CHROME_RE.test(text) || STUB_RE.test(text)) return;
            // Prompt typically sits directly above the input, close in Y,
            // and left edge roughly aligned.  Widened slightly to pick up
            // PDF-form prompts that sit 60-80px above the tab row.
            const verticalGap = rect.top - r.bottom;
            if (verticalGap < -6 || verticalGap > 90) return;
            const horizontalGap = r.left - rect.left;
            if (horizontalGap < -300 || horizontalGap > 320) return;
            seenTexts.add(text);
            candidates.push({ text, dy: verticalGap, dx: Math.abs(horizontalGap) });
          };
          // Walk up a few ancestors and inspect their descendant non-interactive
          // elements whose text is short and prompt-shaped.
          const PROMPT_TAG_RE = /^(span|div|label|p|strong|b|em)$/i;
          // DocuSign renders filled tab values as sibling elements — we must
          // NOT treat those as prompts.  Rejects anything whose id / class
          // marks it as a tab value / display layer.
          const isTabValueElement = (n: Element): boolean => {
            const id = n.id ?? '';
            if (/^tab-form-element-/i.test(id)) return true;
            const cls = n.getAttribute('class') ?? '';
            if (
              /\btab[-_]?value\b|\btab[-_]?input\b|\btab[-_]?display\b|\btextdisplay\b|\btab[-_]?content\b|\bsigner[-_]?tab\b|\bfield[-_]?value\b/i.test(
                cls,
              )
            ) {
              return true;
            }
            if (
              /\btab[-_]?value\b|\btab[-_]?input\b|\btab[-_]?display\b|\btextdisplay\b/i.test(
                n.getAttribute('data-tabtype') ?? '',
              )
            ) {
              return true;
            }
            // Skip direct parents of form controls (leaf wrappers only) —
            // but do NOT skip larger ancestor layout nodes.
            if (
              n.children.length <= 3 &&
              n.querySelector(':scope > input, :scope > textarea, :scope > select, :scope > button, :scope > [role="textbox"]')
            ) {
              return true;
            }
            return false;
          };
          let cur: Element | null = inputEl.parentElement;
          let up = 0;
          while (cur && up < 5) {
            const walker = document.createTreeWalker(cur, NodeFilter.SHOW_ELEMENT);
            let node: Node | null = walker.currentNode;
            let steps = 0;
            while (node && steps < 400) {
              steps++;
              node = walker.nextNode();
              if (!node || !(node instanceof Element)) continue;
              if (isInteractive(node)) continue;
              if (isTabValueElement(node)) continue;
              if (!PROMPT_TAG_RE.test(node.tagName)) continue;
              // Skip deeply nested layout wrappers whose textContent is a
              // pile of unrelated text; accept leaf-ish nodes with at most
              // a few element children.
              if (node.children.length > 6) continue;
              const t = clean(node.textContent);
              if (!t) continue;
              const r = (node as HTMLElement).getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              pushCand(t, r);
            }
            cur = cur.parentElement;
            up++;
          }
          // Pick the candidate closest to the input (by dy, then dx).
          candidates.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
          positionalPromptText = candidates[0]?.text ?? null;
        }
      } catch {
        /* ignore */
      }

      // Current filled value of the input (for rejecting candidates that
      // equal the value).
      let currentValue: string | null = null;
      try {
        const inputLike = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const v = inputLike.value;
        if (typeof v === 'string' && v.trim()) currentValue = clean(v);
      } catch {
        /* ignore */
      }

      // --- Page index + ordinal-on-page -----------------------------------
      // Used by the optional enrichment seam to match tabs to the offline
      // sample-field-enrichment bundle by positional fingerprint.
      let pageIndex: number | null = null;
      let ordinalOnPage: number | null = null;
      try {
        // Locate the enclosing DocuSign tab div (data-type lives here) and
        // the enclosing page container (which owns the `img.page-image`).
        const tabDiv = (el.closest('.doc-tab[data-type]') ?? el.closest('.doc-tab')) as HTMLElement | null;
        const tabDataType = tabDiv?.getAttribute('data-type') ?? null;

        // Walk up to the nearest container that includes an `img.page-image`.
        let pageContainer: HTMLElement | null = null;
        let walker: HTMLElement | null = (tabDiv ?? el) as HTMLElement | null;
        let up = 0;
        while (walker && up < 12) {
          if (walker.querySelector(':scope > img.page-image, :scope img.page-image')) {
            pageContainer = walker;
            break;
          }
          walker = walker.parentElement;
          up++;
        }

        if (pageContainer) {
          // Preferred: read `p=N` from the image's src.
          const img = pageContainer.querySelector('img.page-image') as HTMLImageElement | null;
          const src = img?.getAttribute('src') ?? '';
          const pMatch = /[?&]p=(\d+)\b/.exec(src);
          if (pMatch) {
            pageIndex = parseInt(pMatch[1], 10);
          } else {
            // Fallback: document-order rank among all page-image elements.
            const allPages = Array.from(document.querySelectorAll('img.page-image'));
            const idx = img ? allPages.indexOf(img) : -1;
            if (idx >= 0) pageIndex = idx + 1;
          }

          if (tabDiv && tabDataType) {
            const sameTypeTabs = Array.from(
              pageContainer.querySelectorAll(`.doc-tab[data-type="${tabDataType}"]`),
            );
            const idx = sameTypeTabs.indexOf(tabDiv);
            if (idx >= 0) ordinalOnPage = idx + 1;
          }
        }
      } catch {
        /* ignore — enrichment is best-effort */
      }

      return {
        labelledByText,
        labelForText,
        wrappingLabelText,
        rowHeaderText,
        precedingText,
        positionalPromptText,
        sectionHeading,
        dataTabType,
        className,
        ownClassName,
        dataQa,
        ownDataTabType,
        elementId,
        elementName,
        groupName,
        valueLikeNearText,
        anchorText,
        currentValue,
        pageIndex,
        ordinalOnPage,
      };
    }, { timeout: 1_500 });
  } catch {
    return fallback;
  }
}

function parseIntOrNull(s: string | null): number | null {
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Chrome / instructional phrases that DocuSign renders near tab inputs.
 * These are NOT field labels — treat as rejectable.
 */
const CHROME_TEXT_RE =
  /(this\s*link\s*will\s*open|select\s*to\s*load|click\s*here|loading\.{3}|please\s*wait|page\s*\d+\s*of|view\s*all\s*fields|required\s*field|optional\s*field|see\s*instructions|drag\s*and\s*drop)/i;

/**
 * Return true when a string looks like a VALUE (currency, number, email,
 * URL, phone, date, GUID, bare digits) rather than a prompt.  We accept
 * values as fallback labels only when nothing else is available.
 */
export function looksLikeValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  // Currency / formatted number: "4,013,394.00", "$1,200", "1815.00", "605"
  if (/^\$?\s*-?\d{1,3}(,\d{3})*(\.\d+)?\s*%?$/.test(v)) return true;
  if (/^\$?\s*-?\d+(\.\d+)?\s*%?$/.test(v)) return true;
  // Email
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v)) return true;
  // URL
  if (/^(https?:\/\/|www\.)\S+$/i.test(v)) return true;
  // Phone
  if (/^[\s()+\-.]*\d[\s()+\-.\d]{6,}$/.test(v) && /\d{7,}/.test(v.replace(/\D/g, ''))) return true;
  // Date-ish
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)) return true;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v)) return true;
  // GUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  // SSN/EIN-shaped
  if (/^\d{3}-\d{2}-\d{4}$/.test(v) || /^\d{2}-\d{7}$/.test(v)) return true;
  // Corporate registration / state filing ids: 1-3 letters followed by 5+
  // digits (e.g. "NC1023126", "DL1234567").  Not a prompt.
  if (/^[A-Z]{1,3}\d{5,}$/.test(v)) return true;
  return false;
}

function looksLikeChromeText(value: string): boolean {
  return CHROME_TEXT_RE.test(value);
}

/**
 * Classify a candidate label.  Returns either { ok: true } or a rejection
 * reason.  Separated from looksLikeRealLabel so callers can collect the
 * rejection diagnostics.
 */
function classifyLabelCandidate(
  value: string | null | undefined,
  ctx?: { fieldValue?: string | null; knownFieldValues?: ReadonlySet<string> },
): { ok: true } | { ok: false; reason: LabelRejectReason } {
  if (!value) return { ok: false, reason: 'too-short' };
  const v = value.trim();
  if (v.length < 2) return { ok: false, reason: 'too-short' };
  if (v.length > 120) return { ok: false, reason: 'too-long' };
  // Candidate equals the field's own current value -> it's the value, not a label.
  const fv = ctx?.fieldValue?.trim();
  if (fv && fv.length >= 2 && v === fv) {
    return { ok: false, reason: 'equals-field-value' };
  }
  // Candidate equals some OTHER input's value, or contains one as a long
  // enough substring.  DocuSign PDF renders each filled-in tab as a sibling
  // span so preceding-text often picks up the business name entered a few
  // fields earlier, sometimes concatenated with "Required"/"Optional".
  if (ctx?.knownFieldValues && ctx.knownFieldValues.size) {
    if (ctx.knownFieldValues.has(v)) {
      return { ok: false, reason: 'equals-field-value' };
    }
    // Strip trailing "Required"/"Optional" decoration and retest.
    const stripped = v.replace(/\s*\b(required|optional)\b\s*$/i, '').trim();
    if (stripped && stripped !== v && ctx.knownFieldValues.has(stripped)) {
      return { ok: false, reason: 'equals-field-value' };
    }
    for (const known of ctx.knownFieldValues) {
      if (known.length < 4) continue;
      if (v.includes(known)) return { ok: false, reason: 'equals-field-value' };
    }
  }
  // Classic DocuSign stubs at the start.
  if (
    /^(required\s*[-–]?\s*)?(attachment|signhere|signature|datesigned|full\s*name|initial\s*here|initials|optional\s*signature|signer\s*attachment)(\s*[-–]\s*.+)?$/i.test(
      v,
    )
  ) {
    return { ok: false, reason: 'docusign-stub' };
  }
  if (/^(required|optional)$/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  if (
    /^(required|optional)\s*[-–]?\s*(date|number|text|name|initial|address|addressoptions|checkbox|dropdown|list|ssn|ein|zip|email|phone|state|attachment|signhere|signature|signer\s*attachment)\b/i.test(
      v,
    )
  ) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // "Required - federalTaxIdType", "Required - stakeholder1IdType",
  // "Required - legalState": DocuSign field-identifier decoration.
  if (/^(required|optional)\s*[-–]\s*[a-z][a-zA-Z0-9]{2,}\s*$/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // Combobox accessible name that starts with "-- Select --".
  if (/^-{1,3}\s*select\s*-{1,3}/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // "100 Required", "1 Required - ..."
  if (/^\d+\s+(required|optional)\b/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  // Compound DocuSign decoration strings that can appear ANYWHERE in the text,
  // e.g. "Required-AttachmentRequired-Attachment - SignerAttachmentOptional".
  if (/signer\s*attachment/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  if (/attachment\s*(required|optional)/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  if (/(required|optional)\s*[-–]?\s*attachment/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // "Required - Select at least 1 field", "Select at least 2 fields"
  if (/select\s+at\s+least\s+\d+\s+field/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // Bare "Required" / "Optional" on their own aren't labels.
  if (/^(required|optional)\s*$/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  if (/^(attachment|signhere|datesigned|fullname|formula|readonly)(tab)?$/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  if (/^[\s\-_|•·:;,]+$/.test(v)) return { ok: false, reason: 'pure-punctuation' };
  if (/^\d+$/.test(v)) return { ok: false, reason: 'pure-digits' };
  if (looksLikeChromeText(v)) return { ok: false, reason: 'chrome-text' };
  if (looksLikeValue(v)) return { ok: false, reason: 'looks-like-value' };
  return { ok: true };
}

function looksLikeRealLabel(
  value: string | null | undefined,
  ctx?: { fieldValue?: string | null; knownFieldValues?: ReadonlySet<string> },
): value is string {
  return classifyLabelCandidate(value, ctx).ok;
}

function pickLabel(
  candidates: LabelCandidate[],
  ctx?: { fieldValue?: string | null; knownFieldValues?: ReadonlySet<string> },
): {
  resolvedLabel: string | null;
  labelSource: LabelSource;
  labelConfidence: LabelConfidence;
  labelLooksLikeValue: boolean;
  rejected: RejectedLabelCandidate[];
} {
  const order: Array<{ source: LabelSource; confidence: LabelConfidence }> = [
    { source: 'aria-label', confidence: 'high' },
    { source: 'aria-labelledby', confidence: 'high' },
    { source: 'label-for', confidence: 'high' },
    { source: 'wrapping-label', confidence: 'high' },
    { source: 'id-or-name-key', confidence: 'high' },
    { source: 'positional-prompt', confidence: 'medium' },
    { source: 'row-header', confidence: 'medium' },
    { source: 'title', confidence: 'medium' },
    { source: 'placeholder', confidence: 'medium' },
    { source: 'preceding-text', confidence: 'medium' },
    { source: 'section+row', confidence: 'low' },
    { source: 'described-by', confidence: 'low' },
    { source: 'helper-text', confidence: 'low' },
    { source: 'docusign-tab-type', confidence: 'low' },
  ];

  const rejected: RejectedLabelCandidate[] = [];
  for (const c of candidates) {
    const result = classifyLabelCandidate(c.value, ctx);
    if (!result.ok) rejected.push({ source: c.source, value: c.value, reason: result.reason });
  }

  for (const o of order) {
    const hit = candidates.find(
      (c) => c.source === o.source && looksLikeRealLabel(c.value, ctx),
    );
    if (hit) {
      return {
        resolvedLabel: hit.value.trim(),
        labelSource: o.source,
        labelConfidence: o.confidence,
        labelLooksLikeValue: false,
        rejected,
      };
    }
  }

  return {
    resolvedLabel: null,
    labelSource: 'none',
    labelConfidence: 'none',
    labelLooksLikeValue: false,
    rejected,
  };
}

/**
 * Strength of evidence that a control is truly an attachment/upload widget.
 * Strong = the element ITSELF is a file input / upload button / explicit
 * DocuSign attachment tab. Weak = attachment tokens only appear on distant
 * ancestors or helper text — insufficient to reclassify a textbox/combobox.
 */
function attachmentEvidenceStrength(args: {
  kind: FieldKind;
  ownDataTabType: string | null;
  ownClassName: string | null;
  dataQa: string | null;
  resolvedLabel: string | null;
  ariaLabel: string | null;
  title: string | null;
  idOrNameKey: string | null;
}): AttachmentEvidence {
  const own = [args.ownDataTabType, args.ownClassName, args.dataQa]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // Strong: element-level DocuSign attachment markers
  if (/\bsignerattachment(tab)?\b|\battachment[-_]?tab\b|\battachment[-_]?widget\b/.test(own)) {
    return 'strong';
  }
  if (args.kind === 'upload') return 'strong';

  // Strong: id/name/label that explicitly indicates proof/document upload
  const keyHay = [args.idOrNameKey, args.resolvedLabel, args.ariaLabel, args.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (
    /(^|[_\- ])(proof|document|doc|attachment|upload|voided[-_]?check|bank[-_]?statement|id[-_]?front|id[-_]?back|w9|ein[-_]?letter)([_\- ]|$)/.test(
      keyHay,
    )
  ) {
    return 'strong';
  }
  if (/(upload|attach).*(file|document|image)/.test(keyHay)) return 'strong';

  return 'none';
}

/**
 * Derive a stable, meaningful key from id / name / data-qa.  Filters out
 * auto-generated GUID-ish DocuSign ids so callers don't match rule
 * signals against random tab ids.
 */
function deriveIdOrNameKey(
  elementId: string | null,
  elementName: string | null,
  dataQa: string | null,
): string | null {
  const candidates = [elementId, elementName, dataQa].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  for (const c of candidates) {
    const v = c.trim();
    // Reject pure GUID/hash ids
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) continue;
    if (/^[0-9a-f]{24,}$/i.test(v)) continue;
    if (/^\d+$/.test(v)) continue;
    // Accept as an inference signal (may still be a DocuSign descriptor;
    // whether it becomes a label candidate is decided separately).
    if (/[A-Za-z]/.test(v) && v.length <= 160) return v;
  }
  return null;
}

/**
 * Return true when an id/name key is just a generic DocuSign tab descriptor
 * (e.g. "text single input tab <guid>", "tab form element ...").  Such keys
 * are fine as inference signals but must NOT be used as labels.
 */
function isGenericDocusignIdKey(key: string): boolean {
  if (/^tab[-_\s]*form[-_\s]*element\b/i.test(key)) return true;
  if (
    /^(text|numeric|currency|date|list|checkbox|radio|formula|attachment|signer|signhere|datesigned|full\s*name|initial)[-_\s]+(single|multi|group|input|select|tab)\b/i.test(
      key,
    )
  ) {
    return true;
  }
  if (/^(single|multi)[-_\s]+(input|select|line)\b/i.test(key)) return true;
  if (/^radix[-_]/i.test(key)) return true;
  if (/^:r[0-9a-z]+:$/i.test(key)) return true;
  if (/^(react|mui|rc)[-_]/i.test(key)) return true;
  return false;
}

/**
 * Classify the control into merchant_input vs DocuSign chrome / signature /
 * read-only / attachment / acknowledgement.
 */
function classifyControl(args: {
  kind: FieldKind;
  editable: boolean;
  visible: boolean;
  resolvedLabel: string | null;
  ariaLabel: string | null;
  title: string | null;
  ownDataTabType: string | null;
  ancestorDataTabType: string | null;
  ownClassName: string | null;
  dataQa: string | null;
  helperText: string | null;
  attachmentEvidence: AttachmentEvidence;
}): ControlCategory {
  const {
    kind,
    editable,
    visible,
    resolvedLabel,
    ariaLabel,
    title,
    ownDataTabType,
    ancestorDataTabType,
    ownClassName,
    helperText,
    attachmentEvidence,
  } = args;

  // Chrome/widget signals: include ancestor data-tabtype too, because
  // DocuSign renders signature/date-signed tabs as nested buttons whose
  // own element lacks the tab type attribute.
  const widgetHay = [ownDataTabType, ancestorDataTabType, ownClassName, ariaLabel, title, resolvedLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // OWN-element signals only for generic chrome / read-only classification.
  const ownHay = [ownDataTabType, ownClassName, ariaLabel, title, resolvedLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const helperHay = (helperText ?? '').toLowerCase();

  if (/signhere|\bsign[_-]?here\b|signaturetab|signature\s*tab|adoptsignature|signature\s*widget/.test(widgetHay)) {
    return 'signature_widget';
  }

  if (/datesigned|date[_-]?signed|signedon/.test(widgetHay)) {
    return 'date_signed_widget';
  }

  // STRICT attachment classification: only strong evidence flips a control
  // to attachment_control.  Weak evidence (ancestor class / helper text)
  // is ignored – a business-name textbox should never become "attachment"
  // because some distant ancestor mentions "signer attachment".
  if (attachmentEvidence === 'strong') {
    return 'attachment_control';
  }

  if (kind === 'checkbox' && /acknowledge|agree|consent|certif|terms|authoriz/.test(ownHay + ' ' + helperHay)) {
    return 'acknowledgement_checkbox';
  }

  if (/docusign[-_]?chrome|chrome[-_]?bar|toolbar|docusign-ribbon|envelope[-_]?toolbar/.test(ownHay)) {
    return 'docusign_chrome';
  }

  if (/readonlytab|read[-_]?only|\bfull\s*name\s*tab\b|formuladata|formula\s*tab|textdisplaytab/.test(ownHay)) {
    return 'read_only_display';
  }

  if (!editable && (kind === 'textbox' || kind === 'textarea' || kind === 'combobox')) {
    return 'read_only_display';
  }

  if (!visible && !editable) return 'unknown_control';

  if (editable) return 'merchant_input';

  return 'unknown_control';
}

async function describe(
  loc: Locator,
  kind: FieldKind,
  index: number,
  frame: FrameHost,
  knownFieldValues?: ReadonlySet<string>,
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
    domCtx,
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
    extractDomContext(loc),
  ]);

  const idOrNameKey = deriveIdOrNameKey(domCtx.elementId, domCtx.elementName, domCtx.dataQa);

  const rawCandidateLabels: LabelCandidate[] = [];
  const push = (source: LabelSource, value: string | null | undefined) => {
    if (value && value.trim()) rawCandidateLabels.push({ source, value: value.trim() });
  };
  push('aria-label', ariaLabel);
  push('aria-labelledby', domCtx.labelledByText);
  push('label-for', domCtx.labelForText);
  push('wrapping-label', domCtx.wrappingLabelText);
  // Humanize camelCase/snake_case id keys like "legalEntityType" → "legal Entity Type".
  // Only push as a LABEL candidate when the id isn't a generic DocuSign tab
  // descriptor — those are useful for type inference but noise as labels.
  if (idOrNameKey && !isGenericDocusignIdKey(idOrNameKey)) {
    const humanized = idOrNameKey
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (humanized && /[A-Za-z]{3,}/.test(humanized)) {
      push('id-or-name-key', humanized);
    }
  }
  push('title', title);
  push('placeholder', placeholder);
  push('row-header', domCtx.rowHeaderText);
  push('positional-prompt', domCtx.positionalPromptText);
  push('preceding-text', domCtx.precedingText);
  push('described-by', describedBy);
  push('helper-text', helperText);
  const effectiveSection = sectionName ?? domCtx.sectionHeading;
  if (effectiveSection && domCtx.precedingText) {
    push('section+row', `${effectiveSection} › ${domCtx.precedingText}`);
  }
  if (domCtx.dataTabType) push('docusign-tab-type', domCtx.dataTabType);

  const labelResult = pickLabel(rawCandidateLabels, {
    fieldValue: domCtx.currentValue,
    knownFieldValues,
  });
  const { resolvedLabel, labelSource, labelConfidence } = labelResult;

  const required = ariaRequired === 'true' || requiredAttr !== null;

  const attachmentEvidence = attachmentEvidenceStrength({
    kind,
    ownDataTabType: domCtx.ownDataTabType,
    ownClassName: domCtx.ownClassName,
    dataQa: domCtx.dataQa,
    resolvedLabel,
    ariaLabel,
    title,
    idOrNameKey,
  });

  const controlCategory = classifyControl({
    kind,
    editable,
    visible,
    resolvedLabel,
    ariaLabel,
    title,
    ownDataTabType: domCtx.ownDataTabType,
    ancestorDataTabType: domCtx.dataTabType,
    ownClassName: domCtx.ownClassName,
    dataQa: domCtx.dataQa,
    helperText,
    attachmentEvidence,
  });

  const inferredType = inferFieldType(
    resolvedLabel,
    ariaLabel,
    domCtx.labelForText,
    domCtx.labelledByText,
    domCtx.wrappingLabelText,
    domCtx.rowHeaderText,
    title,
    placeholder,
    domCtx.precedingText,
    effectiveSection,
    helperText,
    describedBy,
    domCtx.dataQa,
    domCtx.dataTabType,
    idOrNameKey,
    domCtx.groupName,
    type,
    autocomplete,
    inputMode,
  );

  const locatorConfidence: LocatorConfidence =
    kind === 'upload'
      ? resolvedLabel
        ? 'role-with-label'
        : 'css-fallback'
      : resolvedLabel
        ? 'role-with-label'
        : 'role-only';

  return {
    kind,
    index,
    sectionName: effectiveSection,
    label: resolvedLabel,
    placeholder,
    ariaLabel,
    title,
    describedByText: describedBy,
    helperText,
    resolvedLabel,
    labelSource,
    labelConfidence,
    labelLooksLikeValue: labelResult.labelLooksLikeValue,
    rawCandidateLabels,
    rejectedLabelCandidates: labelResult.rejected,
    observedValueLikeTextNearControl: domCtx.valueLikeNearText,
    idOrNameKey,
    attachmentEvidence,
    groupName: domCtx.groupName,
    currentValue: domCtx.currentValue,
    type,
    inputMode,
    autocomplete,
    pattern,
    minLength: parseIntOrNull(minLength),
    maxLength: parseIntOrNull(maxLength),
    required,
    docusignTabType: domCtx.dataTabType,
    elementId: domCtx.elementId,
    tabGuid: tabGuidFromElementId(domCtx.elementId),
    pageIndex: domCtx.pageIndex,
    ordinalOnPage: domCtx.ordinalOnPage,
    visible,
    editable,
    controlCategory,
    inferredType,
    locatorConfidence,
    locator: loc,
  };
}

/** Extract the lowercase GUID from a `tab-form-element-{GUID}` id. */
function tabGuidFromElementId(elementId: string | null): string | null {
  if (!elementId) return null;
  const m = /^tab-form-element-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    elementId.trim(),
  );
  return m ? m[1].toLowerCase() : null;
}

/**
 * Discover up to `maxPerKind` controls of each kind.  The cap prevents a
 * pathological DocuSign layout from producing a 500-field sweep.
 */
export async function discoverFields(
  frame: FrameHost,
  maxPerKind = 60,
): Promise<DiscoveredField[]> {
  const fields: DiscoveredField[] = [];

  const textareaAll = await frame.locator('textarea').all();
  const textboxAll = await frame.getByRole('textbox').all();
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
    { kind: 'upload', list: await frame.locator('input[type="file"]').all() },
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

  // Collect the set of filled input values to reject as label candidates
  // (DocuSign PDF-form renders sibling tabs' values inline, so one tab's
  // business name frequently sits above the next tab as pseudo-prompt text).
  const knownFieldValues = new Set<string>();
  for (const f of fields) {
    const v = f.currentValue?.trim();
    if (v && v.length >= 2 && v.length <= 120) knownFieldValues.add(v);
  }

  // Re-run label resolution with knownFieldValues in scope so the
  // substring / equals-field-value filter applies globally.
  for (const f of fields) {
    const relabelled = pickLabel(f.rawCandidateLabels, {
      fieldValue: f.currentValue,
      knownFieldValues,
    });
    if (
      relabelled.resolvedLabel !== f.resolvedLabel ||
      relabelled.labelSource !== f.labelSource
    ) {
      f.resolvedLabel = relabelled.resolvedLabel;
      f.label = relabelled.resolvedLabel;
      f.labelSource = relabelled.labelSource;
      f.labelConfidence = relabelled.labelConfidence;
      f.labelLooksLikeValue = relabelled.labelLooksLikeValue;
    }
    // Always refresh rejected list so reason stats reflect the full filter.
    f.rejectedLabelCandidates = relabelled.rejected;
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