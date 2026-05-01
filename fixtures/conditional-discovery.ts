import { discoverFields, type DiscoveredField } from './field-discovery';
import {
  buildPhysicalOperatingAddressDomProbeReport,
  capturePhysicalOperatingAddressDomProbeSnapshot,
  guardedPhysicalOperatingAddressDomProbeEnabled,
  type PhysicalOperatingAddressDomProbeReport,
} from './physical-address-dom-probe';
import {
  capturePhysicalOperatingAddressPostToggleStructure,
  guardedPhysicalOperatingAddressPostToggleCaptureEnabled,
  type PhysicalOperatingAddressPostToggleCaptureReport,
} from './physical-address-post-toggle-capture';
import type { FrameHost } from './signer-helpers';

export const SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV = 'SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS';

type GuardedToggleField = Pick<
  DiscoveredField,
  'kind' | 'controlCategory' | 'visible' | 'editable' | 'resolvedLabel' | 'label' | 'sectionName' | 'rawCandidateLabels' | 'groupName' | 'inferredType'
>;

export interface GuardedPhysicalOperatingAddressDiscoveryResult {
  fields: DiscoveredField[];
  diagnostics: string[];
  expanded: boolean;
  probeReport: PhysicalOperatingAddressDomProbeReport | null;
  captureReport: PhysicalOperatingAddressPostToggleCaptureReport | null;
}

const ADDRESS_OPTIONS_RE = /\baddressoptions\b/i;
const OPERATING_ADDRESS_RE = /\bisoperatingaddress\b|\boperating\s+address\b/i;
const LEGAL_ADDRESS_RE = /\bislegaladdress\b|\blegal\s+address\b/i;
const VIRTUAL_ADDRESS_RE = /\bisvirtualaddress\b|\bvirtual\s+address\b/i;
const PHYSICAL_ADDRESS_RE = /\bphysical\s+operating\s+address\b/i;

function normalizeText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function fieldTextFragments(field: GuardedToggleField): string[] {
  const fragments = [
    field.sectionName,
    field.label,
    field.resolvedLabel,
    ...field.rawCandidateLabels.map((candidate) => candidate.value),
  ]
    .map(normalizeText)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(fragments));
}

function fieldResolvedFragments(field: GuardedToggleField): string[] {
  const fragments = [
    field.sectionName,
    field.label,
    field.resolvedLabel,
    ...field.rawCandidateLabels
      .filter((candidate) => candidate.source === 'section+row' || candidate.source === 'preceding-text')
      .map((candidate) => candidate.value),
  ]
    .map(normalizeText)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(fragments));
}

function fieldMentions(field: GuardedToggleField, pattern: RegExp): boolean {
  return fieldTextFragments(field).some((value) => pattern.test(value));
}

function fieldResolvedMentions(field: GuardedToggleField, pattern: RegExp): boolean {
  return fieldResolvedFragments(field).some((value) => pattern.test(value));
}

function isEligibleAddressOptionRadio(field: GuardedToggleField): boolean {
  return field.kind === 'radio'
    && field.controlCategory === 'merchant_input'
    && field.visible
    && field.editable
    && field.inferredType.type === 'address_option';
}

function countPhysicalOperatingAddressFields(fields: GuardedToggleField[]): number {
  return fields.filter((field) => fieldMentions(field, PHYSICAL_ADDRESS_RE)).length;
}

export function guardedPhysicalOperatingAddressDiscoveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV] === '1';
}

export function findPhysicalOperatingAddressToggle<T extends GuardedToggleField>(fields: T[]): T | null {
  const matches = fields.filter((field) =>
    isEligibleAddressOptionRadio(field)
    && fieldResolvedMentions(field, ADDRESS_OPTIONS_RE)
    && fieldResolvedMentions(field, OPERATING_ADDRESS_RE)
    && !fieldResolvedMentions(field, LEGAL_ADDRESS_RE)
    && !fieldResolvedMentions(field, VIRTUAL_ADDRESS_RE),
  );

  return matches.length === 1 ? matches[0] : null;
}

async function readCheckedState(field: DiscoveredField): Promise<boolean | null> {
  try {
    return await field.locator.isChecked({ timeout: 1_500 });
  } catch {
    try {
      return await field.locator.evaluate((element) => {
        if (element instanceof HTMLInputElement) return element.checked;
        const ariaChecked = element.getAttribute('aria-checked');
        if (ariaChecked === 'true') return true;
        if (ariaChecked === 'false') return false;
        return null;
      }, { timeout: 1_500 });
    } catch {
      return null;
    }
  }
}

async function waitForSectionSettle(field: DiscoveredField): Promise<void> {
  await field.locator
    .evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 500)), { timeout: 1_500 })
    .catch(() => undefined);
}

export async function maybeExpandPhysicalOperatingAddressSection(
  frame: FrameHost,
  initialFields: DiscoveredField[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<GuardedPhysicalOperatingAddressDiscoveryResult> {
  const diagnostics: string[] = [];

  if (!guardedPhysicalOperatingAddressDiscoveryEnabled(env)) {
    diagnostics.push('physical-operating-address discovery toggle: disabled');
    return { fields: initialFields, diagnostics, expanded: false, probeReport: null, captureReport: null };
  }

  const toggleField = findPhysicalOperatingAddressToggle(initialFields);
  if (!toggleField) {
    diagnostics.push('physical-operating-address discovery toggle: no unique visible isOperatingAddress radio candidate found');
    return { fields: initialFields, diagnostics, expanded: false, probeReport: null, captureReport: null };
  }

  const toggleLabel = normalizeText(toggleField.resolvedLabel ?? toggleField.label) ?? '(unlabelled radio)';
  const alreadyChecked = await readCheckedState(toggleField);
  const probeEnabled = guardedPhysicalOperatingAddressDomProbeEnabled(env);
  const captureEnabled = guardedPhysicalOperatingAddressPostToggleCaptureEnabled(env);

  diagnostics.push(`physical-operating-address discovery toggle candidate: ${toggleLabel}`);
  diagnostics.push(
    `physical-operating-address discovery toggle already selected: ${alreadyChecked === true ? 'yes' : alreadyChecked === false ? 'no' : 'unknown'}`,
  );

  const beforeProbeSnapshot = probeEnabled
    ? await capturePhysicalOperatingAddressDomProbeSnapshot(frame, 'before-toggle')
    : null;

  if (alreadyChecked !== true) {
    await toggleField.locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    await toggleField.locator.check({ timeout: 3_000, force: true });
    diagnostics.push('physical-operating-address discovery toggle action: selected isOperatingAddress radio');
    await waitForSectionSettle(toggleField);
  } else {
    diagnostics.push('physical-operating-address discovery toggle action: skipped (already selected)');
  }

  const afterProbeSnapshot = probeEnabled
    ? await capturePhysicalOperatingAddressDomProbeSnapshot(frame, 'after-toggle')
    : null;

  const captureReport = captureEnabled
    ? await capturePhysicalOperatingAddressPostToggleStructure(frame)
    : null;

  const fields = await discoverFields(frame);
  diagnostics.push(`physical-operating-address discovery fields: before=${initialFields.length}; after=${fields.length}`);
  const labeledBefore = countPhysicalOperatingAddressFields(initialFields);
  const labeledAfter = countPhysicalOperatingAddressFields(fields);
  diagnostics.push(
    `physical-operating-address labeled fields: before=${labeledBefore}; after=${labeledAfter}`,
  );

  const probeReport = beforeProbeSnapshot && afterProbeSnapshot
    ? buildPhysicalOperatingAddressDomProbeReport({
      toggleCandidateLabel: toggleLabel,
      toggleAction: alreadyChecked === true ? 'already_selected' : 'selected',
      discoveredFieldsBefore: initialFields.length,
      discoveredFieldsAfter: fields.length,
      labeledPhysicalAddressFieldsBefore: labeledBefore,
      labeledPhysicalAddressFieldsAfter: labeledAfter,
      snapshots: [beforeProbeSnapshot, afterProbeSnapshot],
    })
    : null;

  if (probeReport) {
    diagnostics.push('physical-operating-address dom probe: captured before/after structural snapshots');
  }

  if (captureReport) {
    diagnostics.push('physical-operating-address post-toggle capture: captured sanitized structural review payload');
  }

  return { fields, diagnostics, expanded: true, probeReport, captureReport };
}