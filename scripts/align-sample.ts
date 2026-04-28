/**
 * Offline sample alignment CLI (SAFE MODE).
 *
 * Reads a local Bead submission JSON and a local DocuSign MHTML snapshot,
 * produces a crosswalk between source fields and rendered tabs, and writes
 * three artifacts for reviewer use:
 *
 *   - artifacts/sample-field-alignment.json        (full report)
 *   - artifacts/sample-field-alignment.md          (human-readable summary)
 *   - artifacts/sample-field-enrichment.json       (future live-report seam)
 *
 * This script never touches the network, never submits a form, and never
 * prints raw DocuSign URLs.  The sample inputs stay in samples/private/ and
 * are never copied into committed fixtures.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { parseDocusignMhtml } from '../lib/mhtml-parser';
import { parsePdfText } from '../lib/pdf-text-parser';
import {
  buildAlignment,
  buildEnrichmentBundle,
  renderAlignmentMarkdown,
} from '../lib/sample-alignment';
import {
  buildSampleIngestionReview,
  renderSampleIngestionReviewMarkdown,
} from '../lib/sample-ingestion';
import { resolveSampleInputs } from '../lib/sample-inputs';

function parseArgs(): {
  json?: string;
  pdf?: string;
  mhtml?: string;
  url?: string;
  manifest?: string;
  outDir: string;
} {
  const argv = process.argv.slice(2);
  let json: string | undefined;
  let pdf: string | undefined;
  let mhtml: string | undefined;
  let url: string | undefined;
  let manifest: string | undefined;
  let outDir = 'artifacts';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' && argv[i + 1]) json = argv[++i];
    else if (a === '--pdf' && argv[i + 1]) pdf = argv[++i];
    else if (a === '--mhtml' && argv[i + 1]) mhtml = argv[++i];
    else if (a === '--url' && argv[i + 1]) url = argv[++i];
    else if (a === '--manifest' && argv[i + 1]) manifest = argv[++i];
    else if (a === '--out' && argv[i + 1]) outDir = argv[++i];
  }
  return { json, pdf, mhtml, url, manifest, outDir };
}

async function main(): Promise<void> {
  const { json, pdf, mhtml, url, manifest, outDir } = parseArgs();
  const inputs = resolveSampleInputs({
    applicationJsonPath: json,
    pdfPath: pdf,
    mhtmlPath: mhtml,
    urlPath: url,
    manifestPath: manifest,
  });
  const jsonPath = inputs.applicationJsonPath;
  const pdfPath = inputs.pdfPath;
  const mhtmlPath = inputs.mhtmlPath;
  const urlPath = inputs.urlPath;
  if (!existsSync(jsonPath)) {
    console.error(`[align] missing JSON: ${jsonPath}`);
    process.exit(2);
  }
  if (pdfPath && !existsSync(pdfPath)) {
    console.error(`[align] missing PDF: ${pdfPath}`);
    process.exit(2);
  }
  if (!existsSync(mhtmlPath)) {
    console.error(`[align] missing MHTML: ${mhtmlPath}`);
    process.exit(2);
  }
  if (urlPath && !existsSync(urlPath)) {
    console.error(`[align] missing URL file: ${urlPath}`);
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });

  console.log(`[align] parsing MHTML: ${mhtmlPath}`);
  const parsedMhtml = parseDocusignMhtml(mhtmlPath);
  console.log(
    `[align] MHTML: pages=${parsedMhtml.pageCount}, tabs=${parsedMhtml.tabs.length}, by type=${JSON.stringify(
      parsedMhtml.countsByType,
    )}`,
  );
  if (parsedMhtml.warnings.length) {
    console.warn(`[align] ${parsedMhtml.warnings.length} parser warnings`);
  }

  let parsedPdf = null;
  if (pdfPath) {
    console.log(`[align] parsing PDF text layer: ${pdfPath}`);
    try {
      parsedPdf = await parsePdfText(pdfPath);
    } catch (error) {
      console.warn(`[align] PDF parse failed: ${(error as Error).message}`);
    }
  }
  if (parsedPdf) {
    console.log(`[align] PDF: pages=${parsedPdf.pageCount}, chars=${parsedPdf.text.length}`);
  }

  const submission = JSON.parse(readFileSync(jsonPath, 'utf8'));
  console.log('[align] reviewing sample set...');
  const ingestion = buildSampleIngestionReview({
    inputs,
    submission,
    mhtml: parsedMhtml,
    pdf: parsedPdf,
  });

  const reviewJsonOut = path.join(outDir, 'latest-sample-ingestion-review.json');
  const reviewMdOut = path.join(outDir, 'latest-sample-ingestion-review.md');
  writeFileSync(reviewJsonOut, JSON.stringify(ingestion.review, null, 2), 'utf8');
  writeFileSync(reviewMdOut, renderSampleIngestionReviewMarkdown(ingestion.review), 'utf8');

  if (!ingestion.review.matchedSet) {
    throw new Error(
      `sample set mismatch; review written to ${reviewJsonOut} and ${reviewMdOut}: ${ingestion.review.stopReason}`,
    );
  }

  console.log('[align] building alignment...');
  const report = buildAlignment(submission, parsedMhtml, {
    jsonPath,
    mhtmlPath,
    valueOverrides: ingestion.valueOverrides,
    pdfText: parsedPdf?.text ?? null,
  });
  const bundle = buildEnrichmentBundle(report);

  const jsonOut = path.join(outDir, 'sample-field-alignment.json');
  const mdOut = path.join(outDir, 'sample-field-alignment.md');
  const bundleOut = path.join(outDir, 'sample-field-enrichment.json');

  writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdOut, renderAlignmentMarkdown(report), 'utf8');
  writeFileSync(bundleOut, JSON.stringify(bundle, null, 2), 'utf8');

  const t = report.totals;
  console.log(
    `[align] wrote ${reviewJsonOut} / ${reviewMdOut} / ${jsonOut} / ${mdOut} / ${bundleOut} — matched=${t.matchedFields}/${t.jsonFields} (high=${t.highConfidence}, medium=${t.mediumConfidence}, low=${t.lowConfidence}), unmatched rendered=${t.unmatchedRenderedValues}, pdf-confirmed overrides=${Object.keys(ingestion.valueOverrides).length}`,
  );
}

main().catch((err) => {
  console.error('[align] fatal:', (err as Error).message);
  process.exit(1);
});
