/**
 * Offline MHTML parser for DocuSign application snapshots (SAFE MODE).
 *
 * Reads a Chrome-saved "single file" .mhtml of a DocuSign signing page and
 * extracts the structured tab inventory: per-tab GUID, data-type, page
 * index, position, rendered value and the decorator label DocuSign places on
 * the `<label for>` element.
 *
 * This module NEVER touches the network, NEVER executes scripts, and NEVER
 * exposes raw signing URLs in its output — snapshot-location URLs are
 * redacted via redactUrl() before anything leaves this module.
 *
 * Consumers: scripts/align-sample.ts and (optionally) future live-report
 * enrichment code.
 */

import { readFileSync } from 'node:fs';
import { redactUrl } from './url-sanitize';

export type MhtmlTabType =
  | 'Text'
  | 'List'
  | 'Checkbox'
  | 'Radio'
  | 'SignHere'
  | 'SignerAttachment'
  | 'DateSigned'
  | 'FullName'
  | 'Email'
  | 'Formula'
  | 'Unknown';

export interface MhtmlTab {
  /** DocuSign tab GUID (everything after `tab-form-element-`). */
  tabGuid: string;
  /** DocuSign data-type attribute, normalized. */
  dataType: MhtmlTabType;
  /** Raw data-type string as seen in the DOM (empty if absent). */
  rawDataType: string;
  /** 1-based page index within the envelope, or null if undetectable. */
  pageIndex: number | null;
  /** DocuSign page GUID, or null if undetectable. */
  pageGuid: string | null;
  /** Zero-based ordinal within the page (useful when GUIDs rotate). */
  ordinalOnPage: number;
  /** CSS left in pixels, or null. */
  left: number | null;
  /** CSS top in pixels, or null. */
  top: number | null;
  /** True if the tab carries the `signing-required` class. */
  required: boolean;
  /** True if the tab carries the `owned` class (this signer's tab). */
  ownedBySigner: boolean;
  /** Value the signer filled in (from tab-sizer span / input[value]). */
  renderedValue: string | null;
  /** Raw `value` attribute on the underlying input, if any.  Sometimes the
   *  visual tab-sizer is truncated while the input holds the full value. */
  inputValue: string | null;
  /** Raw text of the associated `<label for=...>` element, if any. */
  decoratorLabel: string | null;
  /** `data-qa` attribute on the input, if any (e.g. "text-single-input-tab-..."). */
  dataQa: string | null;
  /** `maxlength` attribute on the input, if numeric. */
  maxLength: number | null;
}

export interface MhtmlParseResult {
  /** Sanitized snapshot location from the MHTML headers. */
  snapshotLocationRedacted: string | null;
  /** Sanitized subject line. */
  subject: string | null;
  /** Parsed tabs, in document order. */
  tabs: MhtmlTab[];
  /** Counts keyed by dataType for quick inspection. */
  countsByType: Record<string, number>;
  /** Detected page count (from `<img class="page-image">` elements). */
  pageCount: number;
  /** Raw decoded HTML length in bytes (for diagnostics only). */
  decodedHtmlLength: number;
  /** Warnings surfaced while parsing (non-fatal). */
  warnings: string[];
}

/**
 * Decode a quoted-printable body into UTF-8. Handles soft line breaks (`=\n`)
 * and hex escapes (`=XX`). Tolerant of malformed input (leaves unparseable
 * escapes alone).
 */
function decodeQuotedPrintable(body: string): string {
  const withoutSoftBreaks = body.replace(/=\r?\n/g, '');
  // Collect bytes so multi-byte UTF-8 sequences decode correctly.
  const bytes: number[] = [];
  let i = 0;
  while (i < withoutSoftBreaks.length) {
    const ch = withoutSoftBreaks.charCodeAt(i);
    if (ch === 0x3d /* = */ && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(ch & 0xff);
    i += 1;
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tagOpen: string, name: string): string | null {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = re.exec(tagOpen);
  return m ? m[1] : null;
}

function numberAttr(tagOpen: string, name: string): number | null {
  const v = attr(tagOpen, name);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pixelFromStyle(style: string | null, prop: 'left' | 'top'): number | null {
  if (!style) return null;
  const re = new RegExp(`${prop}\\s*:\\s*([0-9.]+)px`, 'i');
  const m = re.exec(style);
  return m ? Number(m[1]) : null;
}

function normalizeDataType(raw: string): MhtmlTabType {
  const v = raw.trim();
  const known: MhtmlTabType[] = [
    'Text',
    'List',
    'Checkbox',
    'Radio',
    'SignHere',
    'SignerAttachment',
    'DateSigned',
    'FullName',
    'Email',
    'Formula',
  ];
  for (const k of known) if (v.toLowerCase() === k.toLowerCase()) return k;
  return 'Unknown';
}

/**
 * Extract the largest `text/html` part from an MHTML file and decode it.
 */
export function decodeMhtml(path: string): { html: string; snapshotLocation: string | null; subject: string | null } {
  const raw = readFileSync(path, 'utf8');
  const boundaryMatch = /boundary="([^"]+)"/.exec(raw);
  const snapshotMatch = /^Snapshot-Content-Location:\s*(.+)$/im.exec(raw);
  const subjectMatch = /^Subject:\s*(.+)$/im.exec(raw);
  if (!boundaryMatch) {
    // Single-part MHTML fallback: just decode the whole body as quoted-printable.
    return {
      html: decodeQuotedPrintable(raw),
      snapshotLocation: snapshotMatch?.[1]?.trim() ?? null,
      subject: subjectMatch?.[1]?.trim() ?? null,
    };
  }
  const parts = raw.split('--' + boundaryMatch[1]);
  const htmls: string[] = [];
  for (const p of parts) {
    if (!/Content-Type:\s*text\/html/i.test(p)) continue;
    const hdrEnd = p.search(/\r?\n\r?\n/);
    if (hdrEnd < 0) continue;
    let body = p.slice(hdrEnd).replace(/^\r?\n\r?\n/, '');
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(p)) {
      body = decodeQuotedPrintable(body);
    }
    htmls.push(body);
  }
  // Largest text/html part is the document body; smaller parts are usually
  // iframes or small widgets.
  htmls.sort((a, b) => b.length - a.length);
  return {
    html: htmls[0] ?? '',
    snapshotLocation: snapshotMatch?.[1]?.trim() ?? null,
    subject: subjectMatch?.[1]?.trim() ?? null,
  };
}

/**
 * Parse a DocuSign MHTML snapshot into a structured tab inventory.
 */
export function parseDocusignMhtml(path: string): MhtmlParseResult {
  const warnings: string[] = [];
  const { html, snapshotLocation, subject } = decodeMhtml(path);

  // Build page boundary map: each page is anchored by an
  // <img class="page-image" ... src="...&p=N&...&pid=GUID&...">.
  const pageAnchors: Array<{ offset: number; index: number; guid: string | null }> = [];
  const pageImgRe = /<img[^>]*class="[^"]*page-image[^"]*"[^>]*>/gi;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageImgRe.exec(html)) !== null) {
    const tag = pageMatch[0];
    const src = attr(tag, 'src') ?? '';
    const pidAttr = attr(tag, 'data-page-id');
    const nMatch = /[?&]p=(\d+)/.exec(src);
    const idx = nMatch ? Number(nMatch[1]) : pageAnchors.length + 1;
    pageAnchors.push({ offset: pageMatch.index, index: idx, guid: pidAttr });
  }
  const pageCount = pageAnchors.length;

  function pageFor(offset: number): { index: number | null; guid: string | null } {
    let current: { index: number | null; guid: string | null } = { index: null, guid: null };
    for (const a of pageAnchors) {
      if (a.offset <= offset) current = { index: a.index, guid: a.guid };
      else break;
    }
    return current;
  }

  // Walk every doc-tab div. DocuSign renders them as:
  //   <div class="doc-tab ..." id="tab-GUID" data-type="Text" style="left:..;top:..;">
  //     <span class="tab-form-element ... tab-sizer ...">RENDERED_VALUE</span>
  //     <input id="tab-form-element-GUID" data-qa="..." value="...">
  //     <label for="tab-form-element-GUID" class="tab-label ...">DECORATOR</label>
  //   </div>
  const tabs: MhtmlTab[] = [];
  const ordinalByPage = new Map<number | string, number>();
  const tabOpenRe = /<div[^>]*class="[^"]*\bdoc-tab\b[^"]*"[^>]*>/gi;

  let m: RegExpExecArray | null;
  while ((m = tabOpenRe.exec(html)) !== null) {
    const openTag = m[0];
    const startOffset = m.index;
    const afterOpen = m.index + openTag.length;

    // Balanced close: count nested <div>/</div> from the opening div.
    const closeOffset = findMatchingDivClose(html, startOffset);
    if (closeOffset < 0) {
      warnings.push(`unbalanced doc-tab at offset ${startOffset}`);
      continue;
    }
    const inner = html.slice(afterOpen, closeOffset);

    const className = attr(openTag, 'class') ?? '';
    const style = attr(openTag, 'style');
    const rawDataType = attr(openTag, 'data-type') ?? '';
    const outerId = attr(openTag, 'id') ?? '';
    const tabGuid = /^tab-(.+)$/i.exec(outerId)?.[1] ?? '';

    // Prefer the tab-sizer span for the rendered value — it mirrors the
    // committed input value even when the input itself has been re-rendered.
    const sizerMatch = /<span[^>]*class="[^"]*\btab-sizer\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(inner);
    const sizerText = sizerMatch ? stripHtml(sizerMatch[1]) : null;
    const inputTag = /<input[^>]*>/i.exec(inner)?.[0] ?? '';
    const inputValue = attr(inputTag, 'value');
    // Prefer whichever is longer — inputs sometimes hold the full value when
    // the visual sizer has been truncated.
    let rendered: string | null = null;
    if (sizerText && inputValue) {
      rendered = sizerText.length >= inputValue.length ? sizerText : inputValue;
    } else {
      rendered = sizerText ?? inputValue ?? null;
    }

    const dataQa = attr(inputTag, 'data-qa');
    const maxLength = numberAttr(inputTag, 'maxlength');

    // Decorator label ("Required - Date", "Required - SignerAttachment" etc.)
    // Strip the nested <span class="tab-error-message"> before measuring.
    const labelMatch = /<label[^>]*class="[^"]*\btab-label\b[^"]*"[^>]*>([\s\S]*?)<\/label>/i.exec(inner);
    let decoratorLabel: string | null = null;
    if (labelMatch) {
      const text = labelMatch[1].replace(/<span[^>]*tab-error-message[^>]*>[\s\S]*?<\/span>/gi, '');
      decoratorLabel = stripHtml(text) || null;
    }

    const page = pageFor(startOffset);
    const pageKey = page.guid ?? `idx-${page.index ?? 'none'}`;
    const ordinal = ordinalByPage.get(pageKey) ?? 0;
    ordinalByPage.set(pageKey, ordinal + 1);

    tabs.push({
      tabGuid,
      dataType: normalizeDataType(rawDataType),
      rawDataType,
      pageIndex: page.index,
      pageGuid: page.guid,
      ordinalOnPage: ordinal,
      left: pixelFromStyle(style, 'left'),
      top: pixelFromStyle(style, 'top'),
      required: /\bsigning-required\b/.test(className),
      ownedBySigner: /\bowned\b/.test(className),
      renderedValue: rendered ? rendered.trim() || null : null,
      inputValue: inputValue ? inputValue.trim() || null : null,
      decoratorLabel,
      dataQa,
      maxLength,
    });
  }

  const countsByType: Record<string, number> = {};
  for (const t of tabs) countsByType[t.dataType] = (countsByType[t.dataType] ?? 0) + 1;

  return {
    snapshotLocationRedacted: snapshotLocation ? redactUrl(snapshotLocation) : null,
    subject: subject ? subject.replace(/\s+/g, ' ').trim() : null,
    tabs,
    countsByType,
    pageCount,
    decodedHtmlLength: html.length,
    warnings,
  };
}

/**
 * Given an offset that points at the start of a `<div ...>` open tag, return
 * the offset of the matching `</div>` close tag, or -1 if unbalanced.
 */
function findMatchingDivClose(html: string, openStart: number): number {
  const openRe = /<div\b[^>]*>/gi;
  const closeRe = /<\/div\s*>/gi;
  openRe.lastIndex = openStart;
  const first = openRe.exec(html);
  if (!first || first.index !== openStart) return -1;
  let depth = 1;
  let cursor = first.index + first[0].length;
  while (depth > 0) {
    openRe.lastIndex = cursor;
    closeRe.lastIndex = cursor;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      cursor = nextClose.index + nextClose[0].length;
      if (depth === 0) return nextClose.index;
    }
  }
  return -1;
}
