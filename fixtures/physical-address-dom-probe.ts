import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FrameHost } from './signer-helpers';

export const SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS_ENV = 'SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS';

const PHYSICAL_ADDRESS_PROBE_FILE_STEM = 'latest-physical-operating-address-dom-probe';

const TRACKED_KEYWORDS: Array<{ keyword: string; patternSource: string }> = [
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
];

export type PhysicalOperatingAddressProbeStage = 'before-toggle' | 'after-toggle';

export type PhysicalOperatingAddressProbeValueShape =
  | 'blank'
  | 'text_like'
  | 'postal_like'
  | 'state_like'
  | 'numeric'
  | 'selected'
  | 'checked'
  | 'unchecked'
  | 'unknown';

export interface PhysicalOperatingAddressDomProbeTextFragment {
  text: string;
  keywords: string[];
  source: 'nearby' | 'frame';
  left: number | null;
  top: number | null;
}

export interface PhysicalOperatingAddressDomProbeControl {
  tagName: string;
  inputType: string | null;
  role: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
  name: string | null;
  dataType: string | null;
  left: number | null;
  top: number | null;
  width: number | null;
  height: number | null;
  visible: boolean;
  editable: boolean;
  checked: boolean | null;
  withinDocTab: boolean;
  nearestSectionText: string | null;
  labelText: string | null;
  keywordMatches: string[];
  valueShape: PhysicalOperatingAddressProbeValueShape;
}

export interface PhysicalOperatingAddressDomProbeSnapshot {
  stage: PhysicalOperatingAddressProbeStage;
  capturedAt: string;
  anchorLabel: string | null;
  counts: {
    candidateDocTabs: number;
    visibleInputs: number;
    visibleControlCandidates: number;
    visibleControlsOutsideDocTab: number;
    physicalOperatingAddressMentionControls: number;
  };
  nearbyText: PhysicalOperatingAddressDomProbeTextFragment[];
  keywordText: PhysicalOperatingAddressDomProbeTextFragment[];
  nearbyControls: PhysicalOperatingAddressDomProbeControl[];
  matchingControls: PhysicalOperatingAddressDomProbeControl[];
}

export interface PhysicalOperatingAddressDomProbeReport {
  generatedAt: string;
  toggleCandidateLabel: string | null;
  toggleAction: 'selected' | 'already_selected';
  discoveryCounts: {
    discoveredFieldsBefore: number;
    discoveredFieldsAfter: number;
    labeledPhysicalAddressFieldsBefore: number;
    labeledPhysicalAddressFieldsAfter: number;
  };
  snapshots: PhysicalOperatingAddressDomProbeSnapshot[];
  observations: string[];
}

export interface PhysicalOperatingAddressDomProbeAnchor {
  label: string | null;
  left: number | null;
  top: number | null;
}

export interface PhysicalOperatingAddressDomProbeBuildInput {
  toggleCandidateLabel: string | null;
  toggleAction: 'selected' | 'already_selected';
  discoveredFieldsBefore: number;
  discoveredFieldsAfter: number;
  labeledPhysicalAddressFieldsBefore: number;
  labeledPhysicalAddressFieldsAfter: number;
  snapshots: PhysicalOperatingAddressDomProbeSnapshot[];
}

export interface RawPhysicalOperatingAddressProbeControl {
  tagName: string;
  inputType: string | null;
  role: string | null;
  ariaLabel: string | null;
  ariaLabelledBy: string | null;
  name: string | null;
  dataType: string | null;
  left: number | null;
  top: number | null;
  width: number | null;
  height: number | null;
  visible: boolean;
  editable: boolean;
  checked: boolean | null;
  withinDocTab: boolean;
  nearestSectionText: string | null;
  labelText: string | null;
  currentValue: string | null;
}

export function guardedPhysicalOperatingAddressDomProbeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS_ENV] === '1';
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 160) : null;
}

export function keywordsForPhysicalOperatingAddressProbeText(value: string | null | undefined): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const matches = TRACKED_KEYWORDS
    .filter((entry) => new RegExp(entry.patternSource, 'i').test(normalized))
    .map((entry) => entry.keyword);

  return Array.from(new Set(matches));
}

export function physicalOperatingAddressProbeValueShape(
  value: string | null | undefined,
  options?: {
    tagName?: string | null;
    inputType?: string | null;
    checked?: boolean | null;
  },
): PhysicalOperatingAddressProbeValueShape {
  const tagName = (options?.tagName ?? '').toUpperCase();
  const inputType = (options?.inputType ?? '').toLowerCase();

  if (inputType === 'radio' || inputType === 'checkbox') {
    return options?.checked ? 'checked' : 'unchecked';
  }

  const normalized = normalizeText(value);
  if (!normalized) return 'blank';

  if (tagName === 'SELECT') {
    return normalized ? 'selected' : 'blank';
  }

  if (/^\d{5}(?:-\d{4})?$/.test(normalized)) return 'postal_like';
  if (/^[A-Z]{2}$/.test(normalized.toUpperCase())) return 'state_like';
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return 'numeric';

  return 'text_like';
}

export function sanitizePhysicalOperatingAddressProbeControl(
  raw: RawPhysicalOperatingAddressProbeControl,
): PhysicalOperatingAddressDomProbeControl {
  const keywordMatches = Array.from(new Set([
    ...keywordsForPhysicalOperatingAddressProbeText(raw.labelText),
    ...keywordsForPhysicalOperatingAddressProbeText(raw.ariaLabel),
    ...keywordsForPhysicalOperatingAddressProbeText(raw.name),
    ...keywordsForPhysicalOperatingAddressProbeText(raw.dataType),
  ]));

  return {
    tagName: raw.tagName,
    inputType: normalizeText(raw.inputType),
    role: normalizeText(raw.role),
    ariaLabel: normalizeText(raw.ariaLabel),
    ariaLabelledBy: normalizeText(raw.ariaLabelledBy),
    name: normalizeText(raw.name),
    dataType: normalizeText(raw.dataType),
    left: raw.left,
    top: raw.top,
    width: raw.width,
    height: raw.height,
    visible: raw.visible,
    editable: raw.editable,
    checked: raw.checked,
    withinDocTab: raw.withinDocTab,
    nearestSectionText: normalizeText(raw.nearestSectionText),
    labelText: normalizeText(raw.labelText),
    keywordMatches,
    valueShape: physicalOperatingAddressProbeValueShape(raw.currentValue, {
      tagName: raw.tagName,
      inputType: raw.inputType,
      checked: raw.checked,
    }),
  };
}

export function collectPhysicalOperatingAddressProbeTextFragments(
  entries: Array<{
    text: string | null | undefined;
    source: 'nearby' | 'frame';
    left?: number | null;
    top?: number | null;
  }>,
): PhysicalOperatingAddressDomProbeTextFragment[] {
  const seen = new Set<string>();
  const out: PhysicalOperatingAddressDomProbeTextFragment[] = [];

  for (const entry of entries) {
    const text = normalizeText(entry.text);
    if (!text) continue;
    const keywords = keywordsForPhysicalOperatingAddressProbeText(text);
    if (keywords.length === 0) continue;

    const dedupeKey = `${entry.source}|${entry.left ?? 'na'}|${entry.top ?? 'na'}|${text}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      text,
      keywords,
      source: entry.source,
      left: entry.left ?? null,
      top: entry.top ?? null,
    });
  }

  return out;
}

export function selectPhysicalOperatingAddressDomProbeAnchor(
  controls: PhysicalOperatingAddressDomProbeControl[],
  keywordText: PhysicalOperatingAddressDomProbeTextFragment[],
): PhysicalOperatingAddressDomProbeAnchor {
  const controlAnchor = controls.find((control) =>
    control.inputType === 'radio' && control.keywordMatches.includes('isOperatingAddress')
  );
  if (controlAnchor) {
    return {
      label: controlAnchor.labelText ?? controlAnchor.name ?? null,
      left: controlAnchor.left,
      top: controlAnchor.top,
    };
  }

  const textAnchor = keywordText.find((entry) => entry.keywords.includes('isOperatingAddress'));
  if (textAnchor) {
    return {
      label: textAnchor.text,
      left: textAnchor.left,
      top: textAnchor.top,
    };
  }

  return {
    label: null,
    left: null,
    top: null,
  };
}

export async function capturePhysicalOperatingAddressDomProbeSnapshot(
  frame: FrameHost,
  stage: PhysicalOperatingAddressProbeStage,
): Promise<PhysicalOperatingAddressDomProbeSnapshot> {
  const body = frame.locator('body').first();

  const snapshot = await body.evaluate((root, payload) => {
    const stageName = payload.stage;
    const keywordSpecs = payload.keywordSpecs;

    const normalize = (value: string | null | undefined): string | null => {
      const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
      return normalized ? normalized.slice(0, 160) : null;
    };

    const round = (value: number | null | undefined): number | null =>
      typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null;

    const matchesKeywords = (value: string | null | undefined): string[] => {
      const normalized = normalize(value);
      if (!normalized) return [];

      const matches = keywordSpecs
        .filter((entry) => new RegExp(entry.patternSource, 'i').test(normalized))
        .map((entry) => entry.keyword);

      return Array.from(new Set(matches));
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

    const nearestSectionText = (element: Element): string | null => {
      let current: Element | null = element;
      while (current) {
        let sibling: Element | null = current.previousElementSibling;
        while (sibling) {
          if (isVisible(sibling)) {
            const text = normalize((sibling as HTMLElement).innerText || sibling.textContent);
            if (text && (text.length <= 120 || matchesKeywords(text).length > 0)) {
              if (/^\s*\d+\.\s+\w/.test(text) || matchesKeywords(text).length > 0) return text;
            }
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
        const text = normalize(candidate);
        if (text) return text;
      }

      return null;
    };

    const controlValueShape = (element: Element): PhysicalOperatingAddressProbeValueShape => {
      if (element instanceof HTMLInputElement) {
        if (element.type === 'radio' || element.type === 'checkbox') {
          return element.checked ? 'checked' : 'unchecked';
        }
        const value = normalize(element.value);
        if (!value) return 'blank';
        if (/^\d{5}(?:-\d{4})?$/.test(value)) return 'postal_like';
        if (/^[A-Z]{2}$/.test(value.toUpperCase())) return 'state_like';
        if (/^\d+(?:\.\d+)?$/.test(value)) return 'numeric';
        return 'text_like';
      }

      if (element instanceof HTMLSelectElement) {
        const value = normalize(element.value || element.selectedOptions?.[0]?.textContent);
        return value ? 'selected' : 'blank';
      }

      if (element instanceof HTMLTextAreaElement) {
        const value = normalize(element.value);
        if (!value) return 'blank';
        if (/^\d{5}(?:-\d{4})?$/.test(value)) return 'postal_like';
        if (/^[A-Z]{2}$/.test(value.toUpperCase())) return 'state_like';
        if (/^\d+(?:\.\d+)?$/.test(value)) return 'numeric';
        return 'text_like';
      }

      return 'unknown';
    };

    const editability = (element: Element): boolean => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return !element.disabled && !element.readOnly;
      }
      return !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true';
    };

    const controlCandidates = new Set<Element>();
    for (const element of Array.from(root.querySelectorAll('input, select, textarea, [role="textbox"], [role="combobox"], [role="radio"], [role="checkbox"]'))) {
      if (isVisible(element)) controlCandidates.add(element);
    }

    const controls = Array.from(controlCandidates)
      .map((element) => {
        const rect = rectInfo(element);
        const dataType = normalize(
          element.getAttribute('data-type')
          || element.getAttribute('data-tab-type')
          || element.closest('[data-type], [data-tab-type]')?.getAttribute('data-type')
          || element.closest('[data-type], [data-tab-type]')?.getAttribute('data-tab-type'),
        );
        const labelText = labelTextForControl(element);
        const sectionText = nearestSectionText(element);
        const keywordMatches = Array.from(new Set([
          ...matchesKeywords(labelText),
          ...matchesKeywords(element.getAttribute('aria-label')),
          ...matchesKeywords(element.getAttribute('name')),
          ...matchesKeywords(dataType),
        ]));

        return {
          tagName: element.tagName,
          inputType: element instanceof HTMLInputElement ? normalize(element.type) : null,
          role: impliedRole(element),
          ariaLabel: normalize(element.getAttribute('aria-label')),
          ariaLabelledBy: normalize(element.getAttribute('aria-labelledby')),
          name: normalize(element.getAttribute('name')),
          dataType,
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
          nearestSectionText: sectionText,
          labelText,
          keywordMatches,
          valueShape: controlValueShape(element),
        };
      })
      .sort((a, b) => (a.top ?? 0) - (b.top ?? 0) || (a.left ?? 0) - (b.left ?? 0));

    const textSeen = new Set<string>();
    const allKeywordText: PhysicalOperatingAddressDomProbeTextFragment[] = [];
    const textElements = Array.from(root.querySelectorAll('label, span, div, p, legend, strong, h1, h2, h3, h4, td, th'));
    for (const element of textElements) {
      if (!isVisible(element)) continue;
      const text = normalize((element as HTMLElement).innerText || element.textContent);
      if (!text) continue;
      const keywords = matchesKeywords(text);
      if (keywords.length === 0) continue;
      const rect = rectInfo(element);
      const dedupeKey = `${rect.left ?? 'na'}|${rect.top ?? 'na'}|${text}`;
      if (textSeen.has(dedupeKey)) continue;
      textSeen.add(dedupeKey);
      const record = {
        text,
        keywords,
        source: 'frame' as const,
        left: rect.left,
        top: rect.top,
      };
      allKeywordText.push(record);
    }

    return {
      stage: stageName,
      capturedAt: new Date().toISOString(),
      counts: {
        candidateDocTabs: Array.from(root.querySelectorAll('.doc-tab')).filter((element) => isVisible(element)).length,
        visibleInputs: Array.from(root.querySelectorAll('input, select, textarea')).filter((element) => isVisible(element)).length,
        visibleControlCandidates: controls.length,
        visibleControlsOutsideDocTab: controls.filter((control) => !control.withinDocTab).length,
        physicalOperatingAddressMentionControls: controls.filter((control) => control.keywordMatches.includes('Physical Operating Address')).length,
      },
      keywordText: allKeywordText.slice(0, 40),
      controls,
    };
  }, {
    stage,
    keywordSpecs: TRACKED_KEYWORDS,
  });

  const anchor = selectPhysicalOperatingAddressDomProbeAnchor(snapshot.controls, snapshot.keywordText);
  const isNearbyAnchor = (left: number | null, top: number | null): boolean => {
    if (anchor.left === null || anchor.top === null || left === null || top === null) return false;
    return top >= anchor.top - 60 && top <= anchor.top + 320 && left >= anchor.left - 220 && left <= anchor.left + 460;
  };

  return {
    stage: snapshot.stage,
    capturedAt: snapshot.capturedAt,
    anchorLabel: anchor.label,
    counts: snapshot.counts,
    nearbyText: snapshot.keywordText
      .filter((entry) => isNearbyAnchor(entry.left, entry.top))
      .map((entry) => ({ ...entry, source: 'nearby' }))
      .slice(0, 25),
    keywordText: snapshot.keywordText,
    nearbyControls: snapshot.controls.filter((control) => isNearbyAnchor(control.left, control.top)).slice(0, 25),
    matchingControls: snapshot.controls.filter((control) => control.keywordMatches.length > 0).slice(0, 25),
  };
}

export function buildPhysicalOperatingAddressDomProbeReport(
  input: PhysicalOperatingAddressDomProbeBuildInput,
): PhysicalOperatingAddressDomProbeReport {
  const afterSnapshot = input.snapshots.find((snapshot) => snapshot.stage === 'after-toggle') ?? null;
  const observations: string[] = [];

  if (afterSnapshot) {
    if (afterSnapshot.keywordText.length === 0) {
      observations.push('No tracked Physical Operating Address keyword text was visible after the toggle.');
    }

    if (afterSnapshot.physicalOperatingAddressMentionControls === 0) {
      observations.push('No visible control metadata mentioned Physical Operating Address after the toggle.');
    }

    const unlabeledNearbyControls = afterSnapshot.nearbyControls.filter((control) => !control.labelText);
    if (unlabeledNearbyControls.length > 0) {
      observations.push(`Found ${unlabeledNearbyControls.length} nearby visible control(s) without label text after the toggle.`);
    }

    const outsideDocTabs = afterSnapshot.nearbyControls.filter((control) => !control.withinDocTab);
    if (outsideDocTabs.length > 0) {
      observations.push(`Found ${outsideDocTabs.length} nearby visible control(s) outside .doc-tab after the toggle.`);
    }
  }

  if (input.discoveredFieldsAfter < input.discoveredFieldsBefore) {
    observations.push(
      `Discovery field count decreased from ${input.discoveredFieldsBefore} to ${input.discoveredFieldsAfter} after the toggle.`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    toggleCandidateLabel: normalizeText(input.toggleCandidateLabel),
    toggleAction: input.toggleAction,
    discoveryCounts: {
      discoveredFieldsBefore: input.discoveredFieldsBefore,
      discoveredFieldsAfter: input.discoveredFieldsAfter,
      labeledPhysicalAddressFieldsBefore: input.labeledPhysicalAddressFieldsBefore,
      labeledPhysicalAddressFieldsAfter: input.labeledPhysicalAddressFieldsAfter,
    },
    snapshots: input.snapshots,
    observations,
  };
}

export function writePhysicalOperatingAddressDomProbeArtifacts(
  report: PhysicalOperatingAddressDomProbeReport,
  outDir: string,
): { jsonPath: string; mdPath: string } {
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `${PHYSICAL_ADDRESS_PROBE_FILE_STEM}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const mdPath = path.join(outDir, `${PHYSICAL_ADDRESS_PROBE_FILE_STEM}.md`);
  fs.writeFileSync(mdPath, renderPhysicalOperatingAddressDomProbeMarkdown(report), 'utf8');

  return { jsonPath, mdPath };
}

function renderPhysicalOperatingAddressDomProbeMarkdown(report: PhysicalOperatingAddressDomProbeReport): string {
  const lines: string[] = [];

  lines.push('# Physical Operating Address DOM Probe');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Toggle candidate: ${report.toggleCandidateLabel ?? '(none)'}`);
  lines.push(`- Toggle action: ${report.toggleAction}`);
  lines.push('');
  lines.push('## Discovery Counts');
  lines.push('');
  lines.push('| Signal | Before | After |');
  lines.push('|---|---|---|');
  lines.push(`| Discovered fields | ${report.discoveryCounts.discoveredFieldsBefore} | ${report.discoveryCounts.discoveredFieldsAfter} |`);
  lines.push(`| Labeled Physical Operating Address fields | ${report.discoveryCounts.labeledPhysicalAddressFieldsBefore} | ${report.discoveryCounts.labeledPhysicalAddressFieldsAfter} |`);
  lines.push('');

  for (const snapshot of report.snapshots) {
    lines.push(`## Snapshot: ${snapshot.stage}`);
    lines.push('');
    lines.push(`- Captured at: ${snapshot.capturedAt}`);
    lines.push(`- Anchor label: ${snapshot.anchorLabel ?? '(none)'}`);
    lines.push(`- Candidate .doc-tab count: ${snapshot.counts.candidateDocTabs}`);
    lines.push(`- Visible input/select/textarea count: ${snapshot.counts.visibleInputs}`);
    lines.push(`- Visible control candidate count: ${snapshot.counts.visibleControlCandidates}`);
    lines.push(`- Nearby visible controls outside .doc-tab: ${snapshot.counts.visibleControlsOutsideDocTab}`);
    lines.push(`- Controls mentioning Physical Operating Address: ${snapshot.counts.physicalOperatingAddressMentionControls}`);
    lines.push('');

    lines.push('### Nearby Keyword Text');
    lines.push('');
    if (snapshot.nearbyText.length === 0) {
      lines.push('No nearby keyword text matched the probe allowlist.');
    } else {
      lines.push('| Text | Keywords | Top | Left |');
      lines.push('|---|---|---|---|');
      for (const entry of snapshot.nearbyText) {
        lines.push(`| ${escapeMarkdownTableCell(entry.text)} | ${entry.keywords.join(', ')} | ${entry.top ?? 'n/a'} | ${entry.left ?? 'n/a'} |`);
      }
    }
    lines.push('');

    lines.push('### Nearby Controls');
    lines.push('');
    if (snapshot.nearbyControls.length === 0) {
      lines.push('No nearby visible controls were captured around the radio group.');
    } else {
      lines.push('| Tag | Type | Role | Label-ish text | Keywords | Value shape | Visible | Editable | Checked | In .doc-tab | Top | Left |');
      lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const control of snapshot.nearbyControls) {
        lines.push(`| ${escapeMarkdownTableCell(control.tagName)} | ${escapeMarkdownTableCell(control.inputType ?? '')} | ${escapeMarkdownTableCell(control.role ?? '')} | ${escapeMarkdownTableCell(control.labelText ?? '')} | ${escapeMarkdownTableCell(control.keywordMatches.join(', '))} | ${control.valueShape} | ${control.visible ? 'yes' : 'no'} | ${control.editable ? 'yes' : 'no'} | ${control.checked === null ? 'n/a' : control.checked ? 'yes' : 'no'} | ${control.withinDocTab ? 'yes' : 'no'} | ${control.top ?? 'n/a'} | ${control.left ?? 'n/a'} |`);
      }
    }
    lines.push('');

    lines.push('### Matching Controls Anywhere In Frame');
    lines.push('');
    if (snapshot.matchingControls.length === 0) {
      lines.push('No visible controls matched the tracked keywords.');
    } else {
      lines.push('| Tag | Type | Role | Name | Aria label | Data type | Keywords | Value shape | In .doc-tab | Top | Left |');
      lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
      for (const control of snapshot.matchingControls) {
        lines.push(`| ${escapeMarkdownTableCell(control.tagName)} | ${escapeMarkdownTableCell(control.inputType ?? '')} | ${escapeMarkdownTableCell(control.role ?? '')} | ${escapeMarkdownTableCell(control.name ?? '')} | ${escapeMarkdownTableCell(control.ariaLabel ?? '')} | ${escapeMarkdownTableCell(control.dataType ?? '')} | ${escapeMarkdownTableCell(control.keywordMatches.join(', '))} | ${control.valueShape} | ${control.withinDocTab ? 'yes' : 'no'} | ${control.top ?? 'n/a'} | ${control.left ?? 'n/a'} |`);
      }
    }
    lines.push('');
  }

  lines.push('## Observations');
  lines.push('');
  if (report.observations.length === 0) {
    lines.push('No additional structural observations were derived from the captured snapshots.');
  } else {
    for (const observation of report.observations) {
      lines.push(`- ${observation}`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}