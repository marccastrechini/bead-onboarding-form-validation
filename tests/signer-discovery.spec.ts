/**
 * Bead Onboarding – Live Signer Field Discovery and Validation Sweep
 *
 * Discovers every interactive field in the live DocuSign signing iframe and
 * runs a per-type validation case matrix against each one.  Emits:
 *   - artifacts/latest-validation-summary.json
 *   - artifacts/latest-validation-summary.md
 *
 * Non-destructive by default.  Destructive format checks (fill + blur + read
 * aria-invalid) run only when DESTRUCTIVE_VALIDATION=1.  Each destructive
 * case clears the field in a finally block so the envelope is not mutated.
 */

import * as path from 'node:path';
import { test, expect, type TestInfo } from '@playwright/test';
import { hasSignerUrl, openSigner } from '../fixtures/signer-helpers';
import {
  discoverFields,
  sectionPriorityRank,
  type DiscoveredField,
} from '../fixtures/field-discovery';
import { maybeExpandPhysicalOperatingAddressSection } from '../fixtures/conditional-discovery';
import { writePhysicalOperatingAddressDomProbeArtifacts } from '../fixtures/physical-address-dom-probe';
import { ReportBuilder, type CheckResult, type CheckStatus } from '../fixtures/validation-report';
import { loadEnrichment } from '../lib/enrichment-loader';
import type { ValidationCase } from '../fixtures/validation-rules';

const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts');
const DESTRUCTIVE = process.env.DESTRUCTIVE_VALIDATION === '1';

test.describe('Bead Onboarding – Field Discovery Sweep', () => {
  test('discover and validate every visible field', async ({ page }, testInfo) => {
    test.slow();

    const report = new ReportBuilder(DESTRUCTIVE);
    // Opt-in: when BEAD_SAMPLE_ENRICHMENT=1 and the bundle exists, merge
    // the offline crosswalk so the quick field index surfaces real names.
    // Silent no-op otherwise.
    const enrichment = loadEnrichment();
    report.attachEnrichment(enrichment.index, {
      requested: enrichment.requested,
      bundlePath: enrichment.bundlePath,
      unavailableReason:
        enrichment.unavailableReason === 'disabled' ? null : enrichment.unavailableReason,
    });
    for (const f of FRAGILE_NOTES) report.noteFragileSelector(f);
    if (enrichment.requested && !enrichment.index) {
      report.noteFragileSelector(
        `sample enrichment requested but unavailable: ${enrichment.unavailableReason} (${enrichment.bundlePath})`,
      );
    }

    if (!hasSignerUrl()) {
      const preflight = 'Preflight: DOCUSIGN_SIGNING_URL is not set; skipped live signer discovery in safe mode.';
      report.noteFragileSelector(preflight);

      const { jsonPath, mdPath } = report.writeArtifacts(ARTIFACTS_DIR);

      await testInfo.attach('validation-summary.json', {
        path: jsonPath,
        contentType: 'application/json',
      });
      await testInfo.attach('validation-summary.md', {
        path: mdPath,
        contentType: 'text/markdown',
      });

      test.skip(true, preflight);
    }

    const { frame, diagnostics } = await openSigner(page, testInfo);
    for (const d of diagnostics) {
      report.noteFragileSelector(d);
      testInfo.annotations.push({ type: 'diagnostic', description: d });
    }
    report.absorbSignerDiagnostics(diagnostics);

    let fields = await discoverFields(frame);
    testInfo.annotations.push({
      type: 'diagnostic',
      description: `discovery phase: initial field discovery complete (${fields.length} fields)`,
    });

    const expansion = await maybeExpandPhysicalOperatingAddressSection(frame, fields);
    for (const diagnostic of expansion.diagnostics) {
      report.noteFragileSelector(diagnostic);
      testInfo.annotations.push({ type: 'diagnostic', description: diagnostic });
    }

    if (expansion.probeReport) {
      const { jsonPath, mdPath } = writePhysicalOperatingAddressDomProbeArtifacts(expansion.probeReport, ARTIFACTS_DIR);
      report.noteFragileSelector(
        `physical-operating-address dom probe artifacts: ${path.basename(jsonPath)}, ${path.basename(mdPath)}`,
      );
      testInfo.annotations.push({
        type: 'diagnostic',
        description: 'physical-operating-address dom probe artifacts written',
      });
      await testInfo.attach('physical-operating-address-dom-probe.json', {
        path: jsonPath,
        contentType: 'application/json',
      });
      await testInfo.attach('physical-operating-address-dom-probe.md', {
        path: mdPath,
        contentType: 'text/markdown',
      });
    }

    fields = expansion.fields;
    testInfo.annotations.push({
      type: 'diagnostic',
      description:
        `discovery phase: ${expansion.expanded ? 'guarded physical operating address expansion complete' : 'guarded physical operating address expansion skipped'} (${fields.length} fields)`,
    });

    expect(
      fields.length,
      'no fields discovered – iframe selector is likely wrong',
    ).toBeGreaterThan(0);

    // Sort so high-priority sections are processed first – matters if the
    // test is interrupted or an envelope times out mid-run.
    fields.sort((a, b) => sectionPriorityRank(a.sectionName) - sectionPriorityRank(b.sectionName));

    for (const field of fields) {
      const checks: CheckResult[] = [];
      const isMerchantInput = field.controlCategory === 'merchant_input';

      // Non-destructive checks always run
      checks.push(...(await runStaticChecks(field)));

      // Destructive case-matrix + manual_review bookkeeping only applies to
      // merchant inputs.  DocuSign signature/date-signed/read-only/chrome
      // controls are not validation targets and must not inflate findings.
      if (isMerchantInput) {
        if (DESTRUCTIVE && field.visible && field.editable) {
          checks.push(...(await runCaseMatrix(field, testInfo)));
        } else if (field.inferredType.cases.length > 0) {
          checks.push({
            case: `case-matrix:${field.inferredType.type}`,
            status: 'skipped',
            detail: DESTRUCTIVE
              ? 'field not visible/editable'
              : 'set DESTRUCTIVE_VALIDATION=1 to run',
          });
        }

        if (field.inferredType.classification === 'manual_review') {
          checks.push({
            case: `classification:${field.inferredType.type}`,
            status: 'manual_review',
            detail: field.inferredType.description,
          });
        }
      } else {
        checks.push({
          case: `non-merchant:${field.controlCategory}`,
          status: 'skipped',
          detail: `excluded from merchant validation (inferred ${field.inferredType.type})`,
        });
      }

      report.recordField(field, checks);
    }

    const { jsonPath, mdPath } = report.writeArtifacts(ARTIFACTS_DIR);

    // Attach artifacts to the Playwright report so they show up in HTML too.
    await testInfo.attach('validation-summary.json', {
      path: jsonPath,
      contentType: 'application/json',
    });
    await testInfo.attach('validation-summary.md', {
      path: mdPath,
      contentType: 'text/markdown',
    });

    // Informational – don't fail the whole run on warnings / manual_review.
    expect(fields.some((f) => f.visible), 'no discovered field was visible').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fragile selectors recorded into every run's summary.
// ---------------------------------------------------------------------------
const FRAGILE_NOTES: string[] = [
  'signingFrame() iframe selector is an :is() pattern guess – confirm id/title/name in DevTools',
  '"1. Business Details" heading text – breaks if the template is renamed',
  'Start/Continue button label regex /^(start|continue|begin)$/i',
  'upload discovery uses native input[type="file"] plus upload/attach button-name heuristics – nonstandard custom buttons still need manual review',
  'nearestSectionName() walks preceding siblings – can miss floating DocuSign layouts',
  'aria-describedby text lookup assumes the helper node lives in the same iframe',
];

// ---------------------------------------------------------------------------
// Non-destructive static checks – applied to every field.
// ---------------------------------------------------------------------------
async function runStaticChecks(field: DiscoveredField): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(statusOf('visible', field.visible, 'locator did not resolve as visible'));
  results.push(statusOf('accessible-name', field.label !== null,
    'no aria-label, placeholder, or title attribute found'));

  if (field.kind === 'textbox' || field.kind === 'textarea' || field.kind === 'combobox') {
    results.push(statusOf('editable', field.editable, 'field is not editable'));

    if (field.visible && field.editable) {
      try {
        await field.locator.focus({ timeout: 3_000 });
        await expect(field.locator).toBeFocused({ timeout: 2_000 });
        results.push({ case: 'focusable', status: 'pass' });
      } catch (err) {
        results.push({ case: 'focusable', status: 'fail', detail: oneLine(err) });
      }
    } else {
      results.push({ case: 'focusable', status: 'skipped', detail: 'not visible/editable' });
    }

    // Heuristic: a required field should expose something accessible.
    if (field.required && field.label === null) {
      results.push({
        case: 'required-has-label',
        status: 'warning',
        detail: 'required field with no accessible name',
      });
    }
  }

  if (field.kind === 'checkbox') {
    results.push(
      statusOf('checkbox-has-accessible-name', field.label !== null,
        'checkbox has no accessible name'),
    );
  }

  if (field.kind === 'upload') {
    const nativeUpload = field.type === 'file';
    results.push({
      case: 'upload-detected',
      status: 'pass',
      detail: nativeUpload
        ? 'native input[type="file"] present'
        : 'custom upload trigger detected',
    });
    results.push({
      case: 'upload-custom-trigger',
      status: nativeUpload ? 'manual_review' : 'pass',
      detail: nativeUpload
        ? 'if the envelope also exposes a custom upload button, verify the trigger manually'
        : 'custom upload trigger matched accessible button-name heuristic',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Destructive case-matrix execution.  Runs only when DESTRUCTIVE=true.
// ---------------------------------------------------------------------------
async function runCaseMatrix(field: DiscoveredField, testInfo: TestInfo): Promise<CheckResult[]> {
  if (field.kind === 'checkbox') return runCheckboxCases(field);
  if (field.kind !== 'textbox' && field.kind !== 'textarea' && field.kind !== 'combobox') {
    return [];
  }

  const rule = field.inferredType;
  if (rule.cases.length === 0) return [];

  const results: CheckResult[] = [];
  for (const c of rule.cases) {
    const res = await runSingleCase(field, c, testInfo);
    results.push(res);
  }
  return results;
}

async function runSingleCase(
  field: DiscoveredField,
  c: ValidationCase,
  testInfo: TestInfo,
): Promise<CheckResult> {
  const caseId = `${field.inferredType.type}:${c.name}`;
  const evidence: string[] = [];

  try {
    await field.locator.fill(c.input);
    await field.locator.blur();

    const [ariaInvalid, value] = await Promise.all([
      field.locator.getAttribute('aria-invalid'),
      field.locator.inputValue().catch(() => ''),
    ]);

    const rejectedByUi = ariaInvalid === 'true';
    const accepted = !rejectedByUi;
    const normalized = value !== c.input;

    const detail = `input="${c.input}" value="${value}" aria-invalid=${ariaInvalid ?? 'null'}`;

    const { status, attachEvidence } = evaluate(c, accepted, normalized, value);

    if (attachEvidence) {
      const shot = await field.locator
        .screenshot({ timeout: 3_000 })
        .catch(() => null);
      if (shot) {
        await testInfo.attach(`${caseId}.png`, { body: shot, contentType: 'image/png' });
        evidence.push(`${caseId}.png`);
      }
      await testInfo.attach(`${caseId}.json`, {
        body: Buffer.from(
          JSON.stringify(
            { field: field.label, inferredType: field.inferredType.type, case: c, observed: { ariaInvalid, value } },
            null,
            2,
          ),
        ),
        contentType: 'application/json',
      });
      evidence.push(`${caseId}.json`);
    }

    return { case: caseId, status, detail, evidence };
  } catch (err) {
    return { case: caseId, status: 'fail', detail: oneLine(err) };
  } finally {
    // Always clear – do not mutate the envelope.
    await field.locator.fill('').catch(() => {});
    await field.locator.blur().catch(() => {});
  }
}

function evaluate(
  c: ValidationCase,
  accepted: boolean,
  normalized: boolean,
  value: string,
): { status: CheckStatus; attachEvidence: boolean } {
  switch (c.expectation) {
    case 'accept':
      if (accepted) return { status: 'pass', attachEvidence: false };
      return { status: c.severity === 'warning' ? 'warning' : 'fail', attachEvidence: true };

    case 'reject':
      if (!accepted) return { status: 'pass', attachEvidence: false };
      return { status: c.severity === 'warning' ? 'warning' : 'fail', attachEvidence: true };

    case 'normalize': {
      if (!accepted) return { status: 'fail', attachEvidence: true };
      if (c.expectedNormalized && c.expectedNormalized.test(value)) {
        return { status: 'pass', attachEvidence: false };
      }
      if (!normalized) {
        return { status: 'warning', attachEvidence: true };
      }
      return { status: 'pass', attachEvidence: false };
    }
  }
}

async function runCheckboxCases(field: DiscoveredField): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  try {
    const startState = await field.locator.isChecked().catch(() => false);
    results.push({
      case: 'checkbox:default-state',
      status: 'pass',
      detail: `initial=${startState}`,
    });

    await field.locator.check();
    const afterCheck = await field.locator.isChecked();
    results.push({
      case: 'checkbox:can-check',
      status: afterCheck ? 'pass' : 'fail',
      detail: `after check=${afterCheck}`,
    });

    // Acknowledgements may disable uncheck; warning only.
    try {
      await field.locator.uncheck({ timeout: 2_000 });
      const afterUncheck = await field.locator.isChecked();
      results.push({
        case: 'checkbox:can-uncheck',
        status: afterUncheck ? 'warning' : 'pass',
        detail: `after uncheck=${afterUncheck}`,
      });
    } catch {
      results.push({
        case: 'checkbox:can-uncheck',
        status: 'warning',
        detail: 'uncheck() was blocked – field may be a sticky acknowledgement',
      });
    }

    // Restore starting state
    try {
      if (startState) await field.locator.check({ timeout: 2_000 });
      else await field.locator.uncheck({ timeout: 2_000 });
    } catch {
      /* best effort */
    }
  } catch (err) {
    results.push({ case: 'checkbox:error', status: 'fail', detail: oneLine(err) });
  }
  return results;
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function statusOf(name: string, ok: boolean, failDetail: string): CheckResult {
  return ok ? { case: name, status: 'pass' } : { case: name, status: 'fail', detail: failDetail };
}

function oneLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 200);
}
