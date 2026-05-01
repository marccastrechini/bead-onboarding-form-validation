import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import type { FrameHost } from './signer-helpers';
import {
  keywordsForPhysicalOperatingAddressProbeText,
  physicalOperatingAddressProbeValueShape,
  selectPhysicalOperatingAddressDomProbeAnchor,
  type PhysicalOperatingAddressDomProbeControl,
  type PhysicalOperatingAddressDomProbeTextFragment,
  type PhysicalOperatingAddressProbeValueShape,
} from './physical-address-dom-probe';

export const SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS_ENV = 'SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS';

const PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_STEM = 'latest-physical-operating-address-post-toggle';
const SAFE_CAPTURE_LABEL_RE = /physical\s+operating\s+address|address\s+line\s*[12]|city|state|zip|postal\s+code|website|email|phone|country|bank|account|routing|location|business\s+type|proof|required|optional|general|details|info|legal|virtual|operating|addressoptions/i;

type PhysicalOperatingAddressCaptureTextShape =
  | 'url'
  | 'email'
  | 'phone'
  | PhysicalOperatingAddressProbeValueShape;

export interface PhysicalOperatingAddressPostToggleCaptureBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PhysicalOperatingAddressPostToggleCaptureTextNode {
  tagName: string;
  domPath: string;
  className: string | null;
  text: string;
  keywords: string[];
  textShape: PhysicalOperatingAddressCaptureTextShape;
  redacted: boolean;
  left: number | null;
  top: number | null;
  width: number | null;
  height: number | null;
}

export interface PhysicalOperatingAddressPostToggleCaptureControl extends PhysicalOperatingAddressDomProbeControl {
  elementId: string | null;
  className: string | null;
  dataTabType: string | null;
  ariaLabelledByText: string | null;
  domPath: string;
  parentPath: string | null;
}

export interface PhysicalOperatingAddressPostToggleCaptureReport {
  generatedAt: string;
  anchorLabel: string | null;
  anchorLeft: number | null;
  anchorTop: number | null;
  captureBounds: PhysicalOperatingAddressPostToggleCaptureBounds;
  textNodes: PhysicalOperatingAddressPostToggleCaptureTextNode[];
  controls: PhysicalOperatingAddressPostToggleCaptureControl[];
  observations: string[];
}

export function guardedPhysicalOperatingAddressPostToggleCaptureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS_ENV] === '1';
}

export function sanitizePhysicalOperatingAddressPostToggleCaptureText(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const keywords = keywordsForPhysicalOperatingAddressProbeText(normalized);
  if (keywords.length > 0 || SAFE_CAPTURE_LABEL_RE.test(normalized)) return normalized;

  return `[redacted:${captureTextShape(normalized)}]`;
}

export async function capturePhysicalOperatingAddressPostToggleStructure(
  frame: FrameHost,
): Promise<PhysicalOperatingAddressPostToggleCaptureReport> {
  const body = frame.locator('body').first();

  const snapshot = await body.evaluate((root, payload) => {
    const keywordSpecs = payload.keywordSpecs;
    const safeLabelPattern = new RegExp(payload.safeLabelPatternSource, 'i');

    const normalize = (value: string | null | undefined): string | null => {
      const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
      return normalized ? normalized.slice(0, 200) : null;
    };

    const round = (value: number | null | undefined): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null;

    const matchesKeywords = (value: string | null | undefined): string[] => {
      const normalized = normalize(value);
      if (!normalized) return [];
      return Array.from(new Set(
        keywordSpecs
          .filter((entry) => new RegExp(entry.patternSource, 'i').test(normalized))
          .map((entry) => entry.keyword),
      ));
    };

    const captureTextShape = (value: string | null | undefined): PhysicalOperatingAddressCaptureTextShape => {
      const normalized = normalize(value);
      if (!normalized) return 'blank';
      if (/^https?:\/\//i.test(normalized) || /^www\./i.test(normalized)) return 'url';
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalized)) return 'email';
      if (/^\+?[\d\s().-]{7,}$/.test(normalized)) return 'phone';
      if (/^\d{5}(?:-\d{4})?$/.test(normalized)) return 'postal_like';
      if (/^[A-Z]{2}$/i.test(normalized)) return 'state_like';
      if (/^\d+(?:\.\d+)?$/.test(normalized)) return 'numeric';
      return 'text_like';
    };

    const sanitizeText = (value: string | null | undefined): string | null => {
      const normalized = normalize(value);
      if (!normalized) return null;

      const keywords = matchesKeywords(normalized);
      if (keywords.length > 0 || safeLabelPattern.test(normalized)) return normalized;

      return `[redacted:${captureTextShape(normalized)}]`;
    };

    const isVisible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(element as HTMLElement);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    const rectInfo = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
      };
    };

    const cssPath = (element: Element): string => {
      const segments: string[] = [];
      let current: Element | null = element;

      while (current && current !== root && segments.length < 6) {
        const tag = current.tagName.toLowerCase();
        const id = normalize(current.getAttribute('id'));
        if (id) {
          segments.unshift(`${tag}#${id}`);
          break;
        }

        let nth = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === current.tagName) nth += 1;
          sibling = sibling.previousElementSibling;
        }
        segments.unshift(`${tag}:nth-of-type(${nth})`);
        current = current.parentElement;
      }

      return segments.join(' > ');
    };

    const impliedRole = (element: Element): string | null => {
      const explicit = normalize(element.getAttribute('role'));
      if (explicit) return explicit;
      if (element instanceof HTMLTextAreaElement) return 'textbox';
      if (element instanceof HTMLSelectElement) return 'combobox';
      if (element instanceof HTMLInputElement) {
        if (element.type === 'radio') return 'radio';
        if (element.type === 'checkbox') return 'checkbox';
        return 'textbox';
      }
      return null;
    };

    const editability = (element: Element): boolean => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return !element.disabled && !element.readOnly;
      }
      return !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true';
    };

    const resolveAriaLabelledByText = (element: Element): string | null => {
      const ids = normalize(element.getAttribute('aria-labelledby'));
      if (!ids) return null;
      const texts = ids
        .split(/\s+/)
        .map((id) => root.querySelector(`#${CSS.escape(id)}`))
        .filter((candidate): candidate is Element => Boolean(candidate))
        .map((candidate) => sanitizeText((candidate as HTMLElement).innerText || candidate.textContent))
        .filter((candidate): candidate is string => Boolean(candidate));

      return texts.length > 0 ? texts.join(' | ') : null;
    };

    const nearestSectionText = (element: Element): string | null => {
      let current: Element | null = element;
      while (current) {
        let sibling: Element | null = current.previousElementSibling;
        while (sibling) {
          if (isVisible(sibling)) {
            const text = sanitizeText((sibling as HTMLElement).innerText || sibling.textContent);
            if (text) return text;
          }
          sibling = sibling.previousElementSibling;
        }
        current = current.parentElement;
      }
      return null;
    };

    const labelTextForControl = (element: Element): string | null => {
      const candidates = [
        element.getAttribute('aria-label'),
        element.getAttribute('name'),
        element.getAttribute('data-type'),
        element.getAttribute('data-tab-type'),
        element.closest('[data-type], [data-tab-type]')?.getAttribute('data-type'),
        element.closest('[data-type], [data-tab-type]')?.getAttribute('data-tab-type'),
        element.closest('label') ? ((element.closest('label') as HTMLElement).innerText || element.closest('label')?.textContent) : null,
      ];

      for (const candidate of candidates) {
        const text = sanitizeText(candidate);
        if (text) return text;
      }

      return null;
    };

    const controlCandidates = Array.from(root.querySelectorAll('input, select, textarea, [role="textbox"], [role="combobox"], [role="radio"], [role="checkbox"]'))
      .filter((element) => isVisible(element));

    const controls = controlCandidates
      .map((element) => {
        const rect = rectInfo(element);
        const dataType = normalize(
          element.getAttribute('data-type')
          || element.getAttribute('data-tab-type')
          || element.closest('[data-type], [data-tab-type]')?.getAttribute('data-type')
          || element.closest('[data-type], [data-tab-type]')?.getAttribute('data-tab-type'),
        );
        const dataTabType = normalize(
          element.getAttribute('data-tab-type')
          || element.closest('[data-tab-type]')?.getAttribute('data-tab-type'),
        );
        const labelText = labelTextForControl(element);
        const keywordMatches = Array.from(new Set([
          ...matchesKeywords(labelText),
          ...matchesKeywords(element.getAttribute('aria-label')),
          ...matchesKeywords(element.getAttribute('name')),
          ...matchesKeywords(dataType),
          ...matchesKeywords(dataTabType),
        ]));
        const currentValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? normalize(element.value)
          : element instanceof HTMLSelectElement
            ? normalize(element.value || element.selectedOptions?.[0]?.textContent)
            : null;

        return {
          tagName: element.tagName,
          inputType: element instanceof HTMLInputElement ? normalize(element.type) : null,
          role: impliedRole(element),
          ariaLabel: sanitizeText(element.getAttribute('aria-label')),
          ariaLabelledBy: normalize(element.getAttribute('aria-labelledby')),
          ariaLabelledByText: resolveAriaLabelledByText(element),
          name: normalize(element.getAttribute('name')),
          dataType,
          dataTabType,
          elementId: normalize(element.getAttribute('id')),
          className: normalize(element.getAttribute('class')),
          domPath: cssPath(element),
          parentPath: element.parentElement ? cssPath(element.parentElement) : null,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          visible: true,
          editable: editability(element),
          checked: element instanceof HTMLInputElement && (element.type === 'radio' || element.type === 'checkbox')
            ? element.checked
            : null,
          withinDocTab: Boolean(element.closest('.doc-tab')),
          nearestSectionText: nearestSectionText(element),
          labelText,
          keywordMatches,
          valueShape: physicalOperatingAddressProbeValueShape(currentValue, {
            tagName: element.tagName,
            inputType: element instanceof HTMLInputElement ? element.type : null,
            checked: element instanceof HTMLInputElement ? element.checked : null,
          }),
        };
      })
      .sort((a, b) => (a.top ?? 0) - (b.top ?? 0) || (a.left ?? 0) - (b.left ?? 0));

    const textNodes = Array.from(root.querySelectorAll('label, span, div, p, legend, strong, h1, h2, h3, h4, td, th'))
      .filter((element) => isVisible(element))
      .map((element) => {
        const rawText = normalize((element as HTMLElement).innerText || element.textContent);
        if (!rawText) return null;

        const rect = rectInfo(element);
        const text = sanitizeText(rawText);
        if (!text) return null;

        return {
          tagName: element.tagName,
          domPath: cssPath(element),
          className: normalize(element.getAttribute('class')),
          text,
          keywords: matchesKeywords(rawText),
          textShape: captureTextShape(rawText),
          redacted: text !== rawText,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => (a.top ?? 0) - (b.top ?? 0) || (a.left ?? 0) - (b.left ?? 0));

    const keywordText: PhysicalOperatingAddressDomProbeTextFragment[] = textNodes
      .filter((entry) => entry.keywords.length > 0)
      .map((entry) => ({
        text: entry.text,
        keywords: entry.keywords,
        source: 'frame' as const,
        left: entry.left,
        top: entry.top,
      }));

    const anchor = selectPhysicalOperatingAddressDomProbeAnchor(controls, keywordText);

    const defaultBounds = {
      left: round((anchor.left ?? 0) - 260) ?? 0,
      top: round((anchor.top ?? 0) - 90) ?? 0,
      right: round((anchor.left ?? 0) + 700) ?? 900,
      bottom: round((anchor.top ?? 0) + 430) ?? 430,
    };

    const intersectsBounds = (
      bounds: { left: number; top: number; right: number; bottom: number },
      rect: { left: number | null; top: number | null; width: number | null; height: number | null },
    ): boolean => {
      if (rect.left === null || rect.top === null || rect.width === null || rect.height === null) return false;
      const right = rect.left + rect.width;
      const bottom = rect.top + rect.height;
      return right >= bounds.left && rect.left <= bounds.right && bottom >= bounds.top && rect.top <= bounds.bottom;
    };

    const nearbyControls = controls.filter((control) => intersectsBounds(defaultBounds, control));
    const nearbyTextNodes = textNodes.filter((node) => intersectsBounds(defaultBounds, node));
    const boundsSeed = [...nearbyControls, ...nearbyTextNodes];

    const refinedBounds = boundsSeed.length > 0
      ? {
        left: round(Math.max(0, Math.min(...boundsSeed.map((entry) => entry.left ?? Number.POSITIVE_INFINITY)) - 24)) ?? defaultBounds.left,
        top: round(Math.max(0, Math.min(...boundsSeed.map((entry) => entry.top ?? Number.POSITIVE_INFINITY)) - 24)) ?? defaultBounds.top,
        right: round(Math.max(...boundsSeed.map((entry) => (entry.left ?? 0) + (entry.width ?? 0))) + 24) ?? defaultBounds.right,
        bottom: round(Math.max(...boundsSeed.map((entry) => (entry.top ?? 0) + (entry.height ?? 0))) + 24) ?? defaultBounds.bottom,
      }
      : defaultBounds;

    const finalControls = controls.filter((control) => intersectsBounds(refinedBounds, control));
    const finalTextNodes = textNodes.filter((node) => intersectsBounds(refinedBounds, node));

    return {
      anchor,
      captureBounds: {
        left: refinedBounds.left,
        top: refinedBounds.top,
        width: round(refinedBounds.right - refinedBounds.left) ?? 0,
        height: round(refinedBounds.bottom - refinedBounds.top) ?? 0,
      },
      controls: finalControls,
      textNodes: finalTextNodes,
    };
  }, {
    keywordSpecs: [
      { keyword: 'Physical Operating Address', patternSource: 'physical\\s+operating\\s+address' },
      { keyword: 'Address Line 1', patternSource: 'address\\s+line\\s*1' },
      { keyword: 'Address Line 2', patternSource: 'address\\s+line\\s*2' },
      { keyword: 'City', patternSource: '\\bcity\\b' },
      { keyword: 'State', patternSource: '\\bstate\\b' },
      { keyword: 'ZIP', patternSource: '\\bzip\\b|\\bpostal\\s+code\\b' },
      { keyword: 'isOperatingAddress', patternSource: '\\bisoperatingaddress\\b|\\boperating\\s+address\\b' },
      { keyword: 'isLegalAddress', patternSource: '\\bislegaladdress\\b|\\blegal\\s+address\\b' },
      { keyword: 'isVirtualAddress', patternSource: '\\bisvirtualaddress\\b|\\bvirtual\\s+address\\b' },
      { keyword: 'addressOptions', patternSource: '\\baddressoptions\\b' },
    ],
    safeLabelPatternSource: SAFE_CAPTURE_LABEL_RE.source,
  });

  const observations: string[] = [];
  const directLeafText = snapshot.textNodes.filter((node) =>
    node.keywords.some((keyword) => ['Physical Operating Address', 'Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP'].includes(keyword)),
  );
  if (directLeafText.length === 0) {
    observations.push('No field-local Physical Operating Address leaf labels were recovered inside the post-toggle capture bounds.');
  }
  if (snapshot.controls.some((control) => !control.withinDocTab)) {
    observations.push('The post-toggle capture bounds still include controls outside .doc-tab.');
  }
  if (snapshot.textNodes.some((node) => node.redacted)) {
    observations.push('Potential value-like text was redacted inside the post-toggle capture preview.');
  }

  return {
    generatedAt: new Date().toISOString(),
    anchorLabel: snapshot.anchor.label,
    anchorLeft: snapshot.anchor.left,
    anchorTop: snapshot.anchor.top,
    captureBounds: snapshot.captureBounds,
    textNodes: dedupeCaptureTextNodes(snapshot.textNodes),
    controls: snapshot.controls,
    observations,
  };
}

export async function writePhysicalOperatingAddressPostToggleArtifacts(
  page: Page,
  report: PhysicalOperatingAddressPostToggleCaptureReport,
  outDir: string,
): Promise<{ screenshotPath: string; htmlPath: string; jsonPath: string; mdPath: string }> {
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_STEM}-structure.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const htmlPath = path.join(outDir, `${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_STEM}-dom.html`);
  const html = renderPhysicalOperatingAddressPostToggleCaptureHtml(report);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const mdPath = path.join(outDir, `${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_STEM}-structure.md`);
  fs.writeFileSync(mdPath, renderPhysicalOperatingAddressPostToggleCaptureMarkdown(report), 'utf8');

  const screenshotPath = path.join(outDir, `${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_STEM}-screenshot.png`);
  const previewPage = await page.context().newPage();
  try {
    await previewPage.setViewportSize({
      width: Math.min(Math.max(Math.ceil(report.captureBounds.width) + 140, 960), 1600),
      height: 1200,
    });
    await previewPage.setContent(html, { waitUntil: 'load' });
    await previewPage.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    await previewPage.close().catch(() => undefined);
  }

  return { screenshotPath, htmlPath, jsonPath, mdPath };
}

function dedupeCaptureTextNodes(
  entries: PhysicalOperatingAddressPostToggleCaptureTextNode[],
): PhysicalOperatingAddressPostToggleCaptureTextNode[] {
  const seen = new Set<string>();
  const out: PhysicalOperatingAddressPostToggleCaptureTextNode[] = [];

  for (const entry of entries) {
    const key = `${entry.left ?? 'na'}|${entry.top ?? 'na'}|${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }

  return out;
}

function renderPhysicalOperatingAddressPostToggleCaptureHtml(
  report: PhysicalOperatingAddressPostToggleCaptureReport,
): string {
  const previewWidth = Math.max(Math.ceil(report.captureBounds.width), 720);
  const previewHeight = Math.max(Math.ceil(report.captureBounds.height), 340);

  const textNodeMarkup = report.textNodes.map((node) => {
    const left = Math.max((node.left ?? report.captureBounds.left) - report.captureBounds.left, 0);
    const top = Math.max((node.top ?? report.captureBounds.top) - report.captureBounds.top, 0);
    return `<div class="text-node${node.redacted ? ' redacted' : ''}" style="left:${left}px;top:${top}px;max-width:${Math.max((node.width ?? 220), 80)}px;">${escapeHtml(node.text)}</div>`;
  }).join('');

  const controlMarkup = report.controls.map((control) => {
    const left = Math.max((control.left ?? report.captureBounds.left) - report.captureBounds.left, 0);
    const top = Math.max((control.top ?? report.captureBounds.top) - report.captureBounds.top, 0);
    const width = Math.max(control.width ?? 84, 48);
    const height = Math.max(control.height ?? 22, 18);
    const title = [
      control.labelText,
      control.ariaLabel,
      control.ariaLabelledByText,
      control.name,
    ].filter(Boolean).join(' | ');
    return `<div class="control-box" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;">
      <span class="control-title">${escapeHtml(title || control.dataType || control.tagName)}</span>
      <span class="control-meta">${escapeHtml((control.dataType ?? control.tagName))} / ${escapeHtml(control.valueShape)}</span>
    </div>`;
  }).join('');

  const controlRows = report.controls.map((control) => `<tr>
    <td>${escapeHtml(control.dataType ?? control.tagName)}</td>
    <td>${escapeHtml(control.labelText ?? '')}</td>
    <td>${escapeHtml(control.ariaLabel ?? '')}</td>
    <td>${escapeHtml(control.ariaLabelledByText ?? '')}</td>
    <td>${escapeHtml(control.name ?? '')}</td>
    <td>${escapeHtml(control.valueShape)}</td>
    <td>${control.withinDocTab ? 'yes' : 'no'}</td>
    <td>${control.top ?? 'n/a'}, ${control.left ?? 'n/a'}</td>
  </tr>`).join('');

  const textRows = report.textNodes.map((node) => `<tr>
    <td>${escapeHtml(node.tagName)}</td>
    <td>${escapeHtml(node.text)}</td>
    <td>${escapeHtml(node.keywords.join(', '))}</td>
    <td>${escapeHtml(node.textShape)}</td>
    <td>${node.redacted ? 'yes' : 'no'}</td>
    <td>${node.top ?? 'n/a'}, ${node.left ?? 'n/a'}</td>
  </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Physical Operating Address Post-Toggle Capture</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 24px; color: #1f2933; background: #f6f7f9; }
    h1, h2 { margin-bottom: 8px; }
    .meta { margin: 0 0 18px; }
    .preview { position: relative; width: ${previewWidth}px; height: ${previewHeight}px; border: 1px solid #c5ced8; background: #fffdf8; overflow: hidden; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
    .preview-grid { position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.12) 1px, transparent 1px); background-size: 24px 24px; }
    .text-node { position: absolute; font-size: 12px; line-height: 1.25; color: #102a43; background: rgba(255,255,255,0.72); padding: 1px 3px; border-radius: 3px; }
    .text-node.redacted { color: #9b1c1c; background: rgba(254, 226, 226, 0.8); }
    .control-box { position: absolute; border: 2px dashed #3b82f6; background: rgba(219, 234, 254, 0.45); border-radius: 6px; padding: 2px 4px; box-sizing: border-box; overflow: hidden; }
    .control-title { display: block; font-size: 11px; font-weight: 600; color: #102a43; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .control-meta { display: block; font-size: 10px; color: #486581; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; background: white; }
    th, td { border: 1px solid #d9e2ec; padding: 6px 8px; font-size: 12px; text-align: left; vertical-align: top; }
    th { background: #eef2f6; }
    ul { margin-top: 8px; }
    code { font-family: Consolas, monospace; }
  </style>
</head>
<body>
  <h1>Physical Operating Address Post-Toggle Capture</h1>
  <p class="meta">Anchor: <code>${escapeHtml(report.anchorLabel ?? '(none)')}</code> at ${report.anchorTop ?? 'n/a'}, ${report.anchorLeft ?? 'n/a'}.</p>
  <div class="preview">
    <div class="preview-grid"></div>
    ${textNodeMarkup}
    ${controlMarkup}
  </div>
  <h2>Observations</h2>
  ${report.observations.length === 0 ? '<p>No additional observations.</p>' : `<ul>${report.observations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`}
  <h2>Controls</h2>
  <table>
    <thead>
      <tr><th>Family</th><th>Label-ish text</th><th>Aria label</th><th>Aria labelledby text</th><th>Name</th><th>Value shape</th><th>In .doc-tab</th><th>Top, Left</th></tr>
    </thead>
    <tbody>${controlRows}</tbody>
  </table>
  <h2>Visible Text</h2>
  <table>
    <thead>
      <tr><th>Tag</th><th>Text</th><th>Keywords</th><th>Text shape</th><th>Redacted</th><th>Top, Left</th></tr>
    </thead>
    <tbody>${textRows}</tbody>
  </table>
</body>
</html>`;
}

function renderPhysicalOperatingAddressPostToggleCaptureMarkdown(
  report: PhysicalOperatingAddressPostToggleCaptureReport,
): string {
  const lines: string[] = [];

  lines.push('# Physical Operating Address Post-Toggle Capture');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Anchor label: ${report.anchorLabel ?? '(none)'}`);
  lines.push(`- Anchor coordinates: ${report.anchorTop ?? 'n/a'}, ${report.anchorLeft ?? 'n/a'}`);
  lines.push(`- Capture bounds: left ${report.captureBounds.left}, top ${report.captureBounds.top}, width ${report.captureBounds.width}, height ${report.captureBounds.height}`);
  lines.push('');

  lines.push('## Observations');
  lines.push('');
  if (report.observations.length === 0) {
    lines.push('No additional observations.');
  } else {
    for (const item of report.observations) lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Controls');
  lines.push('');
  lines.push('| Family | Label-ish text | Aria label | Aria labelledby text | Name | Value shape | In .doc-tab | Top | Left | Path |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const control of report.controls) {
    lines.push(`| ${escapeMarkdown(control.dataType ?? control.tagName)} | ${escapeMarkdown(control.labelText ?? '')} | ${escapeMarkdown(control.ariaLabel ?? '')} | ${escapeMarkdown(control.ariaLabelledByText ?? '')} | ${escapeMarkdown(control.name ?? '')} | ${escapeMarkdown(control.valueShape)} | ${control.withinDocTab ? 'yes' : 'no'} | ${control.top ?? 'n/a'} | ${control.left ?? 'n/a'} | ${escapeMarkdown(control.domPath)} |`);
  }
  lines.push('');

  lines.push('## Visible Text');
  lines.push('');
  lines.push('| Tag | Text | Keywords | Text shape | Redacted | Top | Left | Path |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const node of report.textNodes) {
    lines.push(`| ${escapeMarkdown(node.tagName)} | ${escapeMarkdown(node.text)} | ${escapeMarkdown(node.keywords.join(', '))} | ${escapeMarkdown(node.textShape)} | ${node.redacted ? 'yes' : 'no'} | ${node.top ?? 'n/a'} | ${node.left ?? 'n/a'} | ${escapeMarkdown(node.domPath)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

function captureTextShape(value: string): PhysicalOperatingAddressCaptureTextShape {
  if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return 'email';
  if (/^\+?[\d\s().-]{7,}$/.test(value)) return 'phone';
  if (/^\d{5}(?:-\d{4})?$/.test(value)) return 'postal_like';
  if (/^[A-Z]{2}$/i.test(value)) return 'state_like';
  if (/^\d+(?:\.\d+)?$/.test(value)) return 'numeric';
  return 'text_like';
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|');
}