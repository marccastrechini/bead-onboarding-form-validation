import * as path from 'node:path';
import { test } from '@playwright/test';
import { hasSignerUrl, openSigner } from '../fixtures/signer-helpers';
import { discoverFields } from '../fixtures/field-discovery';
import { ReportBuilder } from '../fixtures/validation-report';
import { loadEnrichment } from '../lib/enrichment-loader';
import {
  assertInteractiveValidationGuards,
  buildInteractiveResultsFile,
  buildInteractiveValidationPlan,
  getInteractiveGuardState,
  runInteractiveCase,
  skippedConceptToResult,
  writeInteractiveResultsArtifacts,
  type InteractiveValidationPlan,
  type InteractiveValidationResult,
} from '../fixtures/interactive-validation';

const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts');

test.describe('Bead Onboarding - Interactive Field Validation', () => {
  test.beforeAll(() => {
    assertInteractiveValidationGuards();
  });

  test('observes mapped merchant field validation', async ({ page }, testInfo) => {
    test.slow();

    const runStartedAt = new Date().toISOString();
    const guardState = getInteractiveGuardState();
    const results: InteractiveValidationResult[] = [];
    let plan: InteractiveValidationPlan | null = null;

    const flush = () => writeInteractiveResultsArtifacts(
      buildInteractiveResultsFile({ runStartedAt, guardState, plan, results }),
      ARTIFACTS_DIR,
    );

    if (!hasSignerUrl()) {
      const artifacts = flush();
      await attachArtifacts(testInfo, artifacts);
      test.skip(true, 'DOCUSIGN_SIGNING_URL is not set; provide a fresh disposable envelope URL.');
    }

    try {
      const { frame, diagnostics } = await openSigner(page, testInfo);
      for (const diagnostic of diagnostics) {
        testInfo.annotations.push({ type: 'diagnostic', description: diagnostic });
      }

      const fields = await discoverFields(frame);
      const report = new ReportBuilder(false);
      const enrichment = loadEnrichment();
      report.attachEnrichment(enrichment.index, {
        requested: enrichment.requested,
        bundlePath: enrichment.bundlePath,
        unavailableReason: enrichment.unavailableReason === 'disabled' ? null : enrichment.unavailableReason,
      });
      for (const field of fields) report.recordField(field, []);

      plan = buildInteractiveValidationPlan(report.build());
      results.push(...plan.skippedConcepts.map(skippedConceptToResult));
      flush();

      for (const validationCase of plan.cases) {
        const field = fields[validationCase.targetField.fieldIndex - 1] ?? null;
        const result = await runInteractiveCase(validationCase, field, frame);
        results.push(result);
        flush();
      }

      const artifacts = flush();
      await attachArtifacts(testInfo, artifacts);
    } catch (error) {
      flush();
      throw error;
    }
  });
});

async function attachArtifacts(
  testInfo: { attach: (name: string, options: { path: string; contentType: string }) => Promise<void> },
  paths: {
    jsonPath: string;
    mdPath: string;
    targetDiagnosticsJsonPath: string;
    targetDiagnosticsMdPath: string;
  },
): Promise<void> {
  await testInfo.attach('interactive-validation-results.json', {
    path: paths.jsonPath,
    contentType: 'application/json',
  });
  await testInfo.attach('interactive-validation-results.md', {
    path: paths.mdPath,
    contentType: 'text/markdown',
  });
  await testInfo.attach('interactive-target-diagnostics.json', {
    path: paths.targetDiagnosticsJsonPath,
    contentType: 'application/json',
  });
  await testInfo.attach('interactive-target-diagnostics.md', {
    path: paths.targetDiagnosticsMdPath,
    contentType: 'text/markdown',
  });
}