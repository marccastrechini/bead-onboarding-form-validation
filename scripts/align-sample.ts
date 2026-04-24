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
import {
  buildAlignment,
  buildEnrichmentBundle,
  renderAlignmentMarkdown,
} from '../lib/sample-alignment';

function parseArgs(): { json: string; mhtml: string; outDir: string } {
  const argv = process.argv.slice(2);
  let json = 'samples/private/app-submit-sample.json';
  let mhtml = 'samples/private/docusign-app-sample.mhtml';
  let outDir = 'artifacts';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json' && argv[i + 1]) json = argv[++i];
    else if (a === '--mhtml' && argv[i + 1]) mhtml = argv[++i];
    else if (a === '--out' && argv[i + 1]) outDir = argv[++i];
  }
  return { json, mhtml, outDir };
}

function main(): void {
  const { json: jsonPath, mhtml: mhtmlPath, outDir } = parseArgs();
  if (!existsSync(jsonPath)) {
    console.error(`[align] missing JSON: ${jsonPath}`);
    process.exit(2);
  }
  if (!existsSync(mhtmlPath)) {
    console.error(`[align] missing MHTML: ${mhtmlPath}`);
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });

  console.log(`[align] parsing MHTML: ${mhtmlPath}`);
  const mhtml = parseDocusignMhtml(mhtmlPath);
  console.log(
    `[align] MHTML: pages=${mhtml.pageCount}, tabs=${mhtml.tabs.length}, by type=${JSON.stringify(
      mhtml.countsByType,
    )}`,
  );
  if (mhtml.warnings.length) {
    console.warn(`[align] ${mhtml.warnings.length} parser warnings`);
  }

  const submission = JSON.parse(readFileSync(jsonPath, 'utf8'));
  console.log('[align] building alignment...');
  const report = buildAlignment(submission, mhtml, { jsonPath, mhtmlPath });
  const bundle = buildEnrichmentBundle(report);

  const jsonOut = path.join(outDir, 'sample-field-alignment.json');
  const mdOut = path.join(outDir, 'sample-field-alignment.md');
  const bundleOut = path.join(outDir, 'sample-field-enrichment.json');

  writeFileSync(jsonOut, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(mdOut, renderAlignmentMarkdown(report), 'utf8');
  writeFileSync(bundleOut, JSON.stringify(bundle, null, 2), 'utf8');

  const t = report.totals;
  console.log(
    `[align] wrote ${jsonOut} / ${mdOut} / ${bundleOut} — matched=${t.matchedFields}/${t.jsonFields} (high=${t.highConfidence}, medium=${t.mediumConfidence}, low=${t.lowConfidence}), unmatched rendered=${t.unmatchedRenderedValues}`,
  );
}

try {
  main();
} catch (err) {
  console.error('[align] fatal:', (err as Error).message);
  process.exit(1);
}
