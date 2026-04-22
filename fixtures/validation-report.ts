/**
 * Accumulates per-field validation results and writes artifacts:
 *   - artifacts/latest-validation-summary.json  (machine-readable)
 *   - artifacts/latest-validation-summary.md    (human-readable)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DiscoveredField } from './field-discovery';
import { sectionPriorityRank } from './field-discovery';
import type { FieldType, RuleClassification } from './validation-rules';

export type CheckStatus = 'pass' | 'fail' | 'warning' | 'manual_review' | 'skipped';

export type FindingCategory =
  | 'hard_fail'
  | 'warning'
  | 'accessibility_gap'
  | 'validation_gap'
  | 'selector_risk'
  | 'manual_review';

export interface CheckResult {
  case: string;
  status: CheckStatus;
  detail?: string;
  evidence?: string[];
}

export interface FieldRecord {
  kind: DiscoveredField['kind'];
  index: number;
  section: string | null;
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  title: string | null;
  describedBy: string | null;
  helperText: string | null;
  type: string | null;
  inputMode: string | null;
  autocomplete: string | null;
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  required: boolean;
  visible: boolean;
  editable: boolean;
  inferredType: FieldType;
  inferredClassification: RuleClassification;
  locatorConfidence: string;
  checks: CheckResult[];
}

export interface Finding {
  category: FindingCategory;
  field: string;
  section: string | null;
  case: string;
  status: CheckStatus;
  detail?: string;
  priorityScore: number;
}

export interface ValidationReport {
  runStartedAt: string;
  runFinishedAt: string;
  destructiveMode: boolean;
  totals: {
    discovered: number;
    pass: number;
    fail: number;
    warning: number;
    manual_review: number;
    skipped: number;
  };
  countsByClassification: Record<RuleClassification, number>;
  countsByInferredType: Record<string, number>;
  countsByCategory: Record<FindingCategory, number>;
  fragileSelectors: string[];
  topFindings: Finding[];
  fields: FieldRecord[];
}

export class ReportBuilder {
  private readonly startedAt = new Date().toISOString();
  private readonly fields: FieldRecord[] = [];
  private readonly fragile: string[] = [];
  private readonly destructiveMode: boolean;

  constructor(destructiveMode: boolean) {
    this.destructiveMode = destructiveMode;
  }

  recordField(f: DiscoveredField, checks: CheckResult[]): void {
    this.fields.push({
      kind: f.kind,
      index: f.index,
      section: f.sectionName,
      label: f.label,
      placeholder: f.placeholder,
      ariaLabel: f.ariaLabel,
      title: f.title,
      describedBy: f.describedByText,
      helperText: f.helperText,
      type: f.type,
      inputMode: f.inputMode,
      autocomplete: f.autocomplete,
      pattern: f.pattern,
      minLength: f.minLength,
      maxLength: f.maxLength,
      required: f.required,
      visible: f.visible,
      editable: f.editable,
      inferredType: f.inferredType.type,
      inferredClassification: f.inferredType.classification,
      locatorConfidence: f.locatorConfidence,
      checks,
    });
  }

  noteFragileSelector(note: string): void {
    if (!this.fragile.includes(note)) this.fragile.push(note);
  }

  build(): ValidationReport {
    const allChecks = this.fields.flatMap((f) => f.checks);
    const totals = {
      discovered: this.fields.length,
      pass: allChecks.filter((c) => c.status === 'pass').length,
      fail: allChecks.filter((c) => c.status === 'fail').length,
      warning: allChecks.filter((c) => c.status === 'warning').length,
      manual_review: allChecks.filter((c) => c.status === 'manual_review').length,
      skipped: allChecks.filter((c) => c.status === 'skipped').length,
    };

    const countsByClassification: Record<RuleClassification, number> = {
      confirmed_from_ui: 0,
      inferred_best_practice: 0,
      manual_review: 0,
    };
    for (const f of this.fields) {
      countsByClassification[f.inferredClassification]++;
    }

    const countsByInferredType: Record<string, number> = {};
    for (const f of this.fields) {
      countsByInferredType[f.inferredType] = (countsByInferredType[f.inferredType] ?? 0) + 1;
    }

    const statusRank: Record<CheckStatus, number> = {
      fail: 0,
      warning: 1,
      manual_review: 2,
      pass: 99,
      skipped: 99,
    };

    const findings: Finding[] = [];
    for (const f of this.fields) {
      for (const c of f.checks) {
        if (c.status === 'pass' || c.status === 'skipped') continue;
        const priorityScore = statusRank[c.status] * 100 + sectionPriorityRank(f.section);
        findings.push({
          category: categorizeFinding(c, f.inferredClassification),
          field: `${f.inferredType}:${f.label ?? '(no label)'}`,
          section: f.section,
          case: c.case,
          status: c.status,
          detail: c.detail,
          priorityScore,
        });
      }
    }
    findings.sort((a, b) => a.priorityScore - b.priorityScore);

    const countsByCategory: Record<FindingCategory, number> = {
      hard_fail: 0,
      warning: 0,
      accessibility_gap: 0,
      validation_gap: 0,
      selector_risk: 0,
      manual_review: 0,
    };
    for (const f of findings) countsByCategory[f.category]++;

    return {
      runStartedAt: this.startedAt,
      runFinishedAt: new Date().toISOString(),
      destructiveMode: this.destructiveMode,
      totals,
      countsByClassification,
      countsByInferredType,
      countsByCategory,
      fragileSelectors: this.fragile,
      topFindings: findings.slice(0, 50),
      fields: this.fields,
    };
  }

  writeArtifacts(outDir: string): { jsonPath: string; mdPath: string } {
    fs.mkdirSync(outDir, { recursive: true });
    const report = this.build();

    const jsonPath = path.join(outDir, 'latest-validation-summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

    const mdPath = path.join(outDir, 'latest-validation-summary.md');
    fs.writeFileSync(mdPath, renderMarkdown(report), 'utf8');

    return { jsonPath, mdPath };
  }
}

/** Map a single check into one of six categories used in the top-findings view. */
function categorizeFinding(c: CheckResult, classification: RuleClassification): FindingCategory {
  const name = c.case.toLowerCase();
  if (name.includes('accessible-name') || name.includes('required-has-label') || name.includes('focusable')) {
    return 'accessibility_gap';
  }
  if (name.startsWith('fragile') || name.includes('selector') || name.includes('iframe') || name.includes('locator')) {
    return 'selector_risk';
  }
  if (c.status === 'manual_review') return 'manual_review';
  if (classification === 'manual_review' && (c.status === 'fail' || c.status === 'warning')) {
    return 'manual_review';
  }
  if (c.status === 'fail') return 'hard_fail';
  if (c.status === 'warning') {
    // Fills that accepted but were expected to reject → validation gap
    if (name.includes('format-') || name.includes(':valid') || name.includes(':too-') || name.includes(':letters') || name.includes(':missing') || name.includes(':spaces')) {
      return 'validation_gap';
    }
    return 'warning';
  }
  return 'warning';
}

function renderMarkdown(r: ValidationReport): string {
  const L: string[] = [];
  L.push('# Bead Onboarding – Live Signer Validation Summary');
  L.push('');
  L.push(`- Run started:    \`${r.runStartedAt}\``);
  L.push(`- Run finished:   \`${r.runFinishedAt}\``);
  L.push(`- Destructive mode: **${r.destructiveMode ? 'ON' : 'OFF'}**`);
  L.push('');

  L.push('## Totals');
  L.push('');
  L.push(`| Outcome | Count |`);
  L.push(`|---|---|`);
  L.push(`| Fields discovered | ${r.totals.discovered} |`);
  L.push(`| Pass | ${r.totals.pass} |`);
  L.push(`| Fail | ${r.totals.fail} |`);
  L.push(`| Warning | ${r.totals.warning} |`);
  L.push(`| Manual review | ${r.totals.manual_review} |`);
  L.push(`| Skipped | ${r.totals.skipped} |`);
  L.push('');

  L.push('## Findings by category');
  L.push('');
  L.push('| Category | Count |');
  L.push('|---|---|');
  for (const [cat, count] of Object.entries(r.countsByCategory)) {
    L.push(`| ${cat} | ${count} |`);
  }
  L.push('');

  L.push('## Rule classification buckets');
  L.push('');
  L.push('| Classification | Field count |');
  L.push('|---|---|');
  L.push(`| confirmed_from_ui | ${r.countsByClassification.confirmed_from_ui} |`);
  L.push(`| inferred_best_practice | ${r.countsByClassification.inferred_best_practice} |`);
  L.push(`| manual_review | ${r.countsByClassification.manual_review} |`);
  L.push('');

  L.push('## Inferred type distribution');
  L.push('');
  L.push('| Type | Count |');
  L.push('|---|---|');
  for (const [type, count] of Object.entries(r.countsByInferredType).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${type} | ${count} |`);
  }
  L.push('');

  if (r.topFindings.length) {
    L.push('## Top findings');
    L.push('');
    L.push('| # | Category | Status | Section | Field | Case | Detail |');
    L.push('|---|----------|--------|---------|-------|------|--------|');
    r.topFindings.forEach((f, i) => {
      L.push(
        `| ${i + 1} | ${f.category} | **${f.status}** | ${esc(f.section) ?? '—'} | ${esc(f.field)} | ${f.case} | ${esc(f.detail) ?? ''} |`,
      );
    });
    L.push('');
  }

  // Fields grouped by classification – makes it easy to see what was observed
  // vs what was inferred vs what needs manual review.
  for (const bucket of ['confirmed_from_ui', 'inferred_best_practice', 'manual_review'] as const) {
    const rows = r.fields.filter((f) => f.inferredClassification === bucket);
    if (rows.length === 0) continue;
    L.push(`## Fields – ${bucket}`);
    L.push('');
    L.push('| # | Section | Kind | Label | Inferred | Required | Confidence | Helper text | Checks |');
    L.push('|---|---------|------|-------|----------|----------|------------|-------------|--------|');
    rows.forEach((f, i) => {
      const checkSummary = f.checks.map((c) => `${c.case}:${c.status}`).join(' / ') || '—';
      L.push(
        `| ${i + 1} | ${esc(f.section) ?? '—'} | ${f.kind} | ${esc(f.label) ?? '_(no label)_'} | ${f.inferredType} | ${f.required ? 'yes' : 'no'} | ${f.locatorConfidence} | ${esc(f.helperText) ?? '—'} | ${checkSummary} |`,
      );
    });
    L.push('');
  }

  if (r.fragileSelectors.length) {
    L.push('## Fragile selectors / diagnostics');
    L.push('');
    for (const s of r.fragileSelectors) L.push(`- ${s}`);
    L.push('');
  }

  L.push('## Local run commands');
  L.push('');
  L.push('```powershell');
  L.push('npm run test:smoke         # smoke only');
  L.push('npm run test:discovery     # non-destructive sweep (safe on live URL)');
  L.push('npm run test:destructive   # destructive sweep (TEST ENVELOPE ONLY)');
  L.push('npm run report:open        # open Playwright HTML report');
  L.push('npm run summary:open       # open latest-validation-summary.md / .json');
  L.push('```');
  L.push('');

  L.push('## Recommendations');
  L.push('');
  L.push('- Every `manual_review` row is an explicit TODO for confirming the rule against the live UI.');
  L.push('- Promote `inferred_best_practice` rules to `confirmed_from_ui` once verified.');
  L.push('- Replace `locatorConfidence=role-only` entries with `getByLabel(\'<confirmed label>\')`.');
  L.push('- Investigate any **hard_fail** under `Business Details`, `Stakeholders`, `Acknowledgements` first.');
  L.push('- Any `selector_risk` entry is a hint the iframe or Start-button strategy needs an explicit selector.');
  L.push('');

  return L.join('\n');
}

function esc(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
