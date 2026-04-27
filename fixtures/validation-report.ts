/**
 * Accumulates per-field validation results and writes artifacts:
 *   - artifacts/latest-validation-summary.json  (machine-readable)
 *   - artifacts/latest-validation-summary.md    (human-readable)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DiscoveredField,
  ControlCategory,
  LabelSource,
  LabelConfidence,
  LabelCandidate,
  RejectedLabelCandidate,
  LabelRejectReason,
  AttachmentEvidence,
} from './field-discovery';
import { sectionPriorityRank } from './field-discovery';
import type { FieldType, RuleClassification } from './validation-rules';
import type {
  EnrichmentRecord,
  EnrichmentIndex,
  EnrichmentMatch,
  EnrichmentUnavailableReason,
} from '../lib/enrichment-loader';
import { buildPositionalFingerprint, matchField, normalizeFamily } from '../lib/enrichment-loader';

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
  resolvedLabel: string | null;
  labelSource: LabelSource;
  labelConfidence: LabelConfidence;
  rawCandidateLabels: LabelCandidate[];
  rejectedLabelCandidates: RejectedLabelCandidate[];
  labelLooksLikeValue: boolean;
  observedValueLikeTextNearControl: string | null;
  idOrNameKey: string | null;
  attachmentEvidence: AttachmentEvidence;
  groupName: string | null;
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
  docusignTabType: string | null;
  visible: boolean;
  editable: boolean;
  controlCategory: ControlCategory;
  inferredType: FieldType;
  inferredClassification: RuleClassification;
  locatorConfidence: string;
  checks: CheckResult[];
  /** Optional enrichment annotation applied when the offline sample
   *  enrichment bundle has a matching record.  `null` when no match or
   *  when enrichment is disabled. */
  enrichment: FieldEnrichmentAnnotation | null;
  /** GUID extracted from the underlying tab id, carried here so reviewers
   *  can audit why enrichment did or did not match. */
  tabGuid: string | null;
  /** 1-based page index the tab sits on. */
  pageIndex: number | null;
  /** 1-based document-order ordinal among `.doc-tab` elements on that page. */
  ordinalOnPage: number | null;
  /** Inline `.doc-tab` coordinates captured during live discovery. */
  tabLeft: number | null;
  tabTop: number | null;
  tabWidth: number | null;
  tabHeight: number | null;
}

/** Snapshot of why a field was enriched.  Preserved in the JSON report. */
export interface FieldEnrichmentAnnotation {
  matchedBy: 'guid' | 'position' | 'coordinate';
  jsonKeyPath: string;
  suggestedDisplayName: string;
  suggestedBusinessSection: string;
  confidence: 'high' | 'medium' | 'low';
  positionalFingerprint: string;
  /** The original (pre-enrichment) resolved label, kept for audit. */
  priorResolvedLabel: string | null;
  /** The original label source before enrichment overrode it. */
  priorLabelSource: LabelSource;
  /** `true` when enrichment upgraded the display name; `false` when it was
   *  recorded for reference but the existing label was kept. */
  appliedToLabel: boolean;
}

export interface Finding {
  category: FindingCategory;
  field: string;
  section: string | null;
  controlCategory: ControlCategory;
  inferredType: FieldType;
  case: string;
  status: CheckStatus;
  detail?: string;
  priorityScore: number;
}

export interface CandidateValidation {
  scenario: string;
  targetType: FieldType;
  count: number;
  sampleLabels: string[];
}

export interface DiscoveryDiagnostics {
  disclosureDetected: boolean | null;
  disclosureCheckboxChecked: boolean | null;
  disclosureContinueClicked: boolean | null;
  formReadyAfterDisclosure: boolean | null;
  signerSurfaceResolved: boolean | null;
}

export interface EnrichmentSummary {
  /** True when enrichment was explicitly requested for this run. */
  requested: boolean;
  /** True when the bundle was loaded for this run. */
  enabled: boolean;
  /** Resolved path of the bundle that was loaded (for reviewer audit).
   *  `null` only when no bundle path applies. */
  bundlePath: string | null;
  /** Reason the bundle was unavailable when requested. */
  unavailableReason: EnrichmentUnavailableReason | null;
  /** Count of records the loaded bundle exposed. */
  bundleRecordCount: number;
  /** Discovered fields considered for enrichment (merchant-facing only). */
  fieldsConsidered: number;
  /** Fields matched via DocuSign tab GUID. */
  matchesByGuid: number;
  /** Fields matched via positional fingerprint fallback. */
  matchesByPosition: number;
  /** Fields matched via page/type/coordinate fallback. */
  matchesByCoordinate: number;
  /** Fields whose display name was upgraded by enrichment. */
  labelsUpgraded: number;
  /** Fields whose business section was upgraded by enrichment. */
  businessSectionsUpgraded: number;
  /** Bundle records that did not match any live field. */
  unmatchedRecords: number;
  /** Reason counts for unmatched bundle records. */
  unmatchedRecordReasons: Record<string, number>;
}

export interface LabelQualitySummary {
  acceptedHumanLabels: number;
  enrichmentLabels: number;
  genericDocusignTabTypeHints: number;
  genericDocusignTabTypeLabelsAccepted: number;
  unresolvedFields: number;
}

export interface EnrichmentMatchedRecordDiagnostic {
  jsonKeyPath: string;
  matchedBy: 'guid' | 'position' | 'coordinate';
  positionalFingerprint: string;
}

export interface EnrichmentUnmatchedRecordDiagnostic {
  jsonKeyPath: string;
  positionalFingerprint: string;
  reason: string;
}

export interface EnrichmentDiagnostics {
  matchedRecords: EnrichmentMatchedRecordDiagnostic[];
  unmatchedRecords: EnrichmentUnmatchedRecordDiagnostic[];
}

export interface ValidationReport {
  runStartedAt: string;
  runFinishedAt: string;
  destructiveMode: boolean;
  discoveryDiagnostics: DiscoveryDiagnostics;
  totals: {
    discovered: number;
    merchantInputs: number;
    pass: number;
    fail: number;
    warning: number;
    manual_review: number;
    skipped: number;
  };
  countsByControlCategory: Record<ControlCategory, number>;
  countsByClassification: Record<RuleClassification, number>;
  countsByInferredType: Record<string, number>;
  countsByLabelSource: Record<string, number>;
  countsBySection: Record<string, number>;
  countsByBusinessSection: Record<string, number>;
  countsByCategory: Record<FindingCategory, number>;
  labelExtractionSummary: {
    labelsRejectedTotal: number;
    labelsRejectedByReason: Record<LabelRejectReason, number>;
    labelsLookedLikeValue: number;
    controlsWithNoAcceptedLabel: number;
  };
  labelQualitySummary: LabelQualitySummary;
  enrichmentDiagnostics: EnrichmentDiagnostics;
  attachmentEvidenceBreakdown: Record<AttachmentEvidence, number>;
  candidateValidations: CandidateValidation[];
  prioritizedUnknowns: Finding[];
  fragileSelectors: string[];
  topFindings: Finding[];
  quickFieldIndex: QuickFieldRow[];
  enrichmentSummary: EnrichmentSummary;
  fields: FieldRecord[];
}

export interface QuickFieldRow {
  index: number;
  displayName: string;
  inferredType: string;
  controlCategory: ControlCategory;
  section: string;
  businessSection: string;
  labelSource: LabelSource;
  status: 'high_confidence' | 'best_guess' | 'needs_review';
  notes: string;
}

const ALL_CONTROL_CATEGORIES: ControlCategory[] = [
  'merchant_input',
  'read_only_display',
  'docusign_chrome',
  'signature_widget',
  'date_signed_widget',
  'attachment_control',
  'acknowledgement_checkbox',
  'unknown_control',
];

export class ReportBuilder {
  private readonly startedAt = new Date().toISOString();
  private readonly fields: FieldRecord[] = [];
  private readonly fragile: string[] = [];
  private readonly destructiveMode: boolean;
  private enrichmentIndex: EnrichmentIndex | null = null;
  private enrichmentApplied = false;
  private enrichmentSummary: EnrichmentSummary = {
    requested: false,
    enabled: false,
    bundlePath: null,
    unavailableReason: null,
    bundleRecordCount: 0,
    fieldsConsidered: 0,
    matchesByGuid: 0,
    matchesByPosition: 0,
    matchesByCoordinate: 0,
    labelsUpgraded: 0,
    businessSectionsUpgraded: 0,
    unmatchedRecords: 0,
    unmatchedRecordReasons: {},
  };
  private enrichmentDiagnostics: EnrichmentDiagnostics = {
    matchedRecords: [],
    unmatchedRecords: [],
  };
  private diagnostics: DiscoveryDiagnostics = {
    disclosureDetected: null,
    disclosureCheckboxChecked: null,
    disclosureContinueClicked: null,
    formReadyAfterDisclosure: null,
    signerSurfaceResolved: null,
  };

  constructor(destructiveMode: boolean) {
    this.destructiveMode = destructiveMode;
  }

  recordField(f: DiscoveredField, checks: CheckResult[]): void {
    this.fields.push({
      kind: f.kind,
      index: f.index,
      section: f.sectionName,
      label: f.resolvedLabel,
      resolvedLabel: f.resolvedLabel,
      labelSource: f.labelSource,
      labelConfidence: f.labelConfidence,
      rawCandidateLabels: f.rawCandidateLabels,
      rejectedLabelCandidates: f.rejectedLabelCandidates,
      labelLooksLikeValue: f.labelLooksLikeValue,
      observedValueLikeTextNearControl: f.observedValueLikeTextNearControl,
      idOrNameKey: f.idOrNameKey,
      attachmentEvidence: f.attachmentEvidence,
      groupName: f.groupName,
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
      docusignTabType: f.docusignTabType,
      visible: f.visible,
      editable: f.editable,
      controlCategory: f.controlCategory,
      inferredType: f.inferredType.type,
      inferredClassification: f.inferredType.classification,
      locatorConfidence: f.locatorConfidence,
      checks,
      enrichment: null,
      tabGuid: f.tabGuid,
      pageIndex: f.pageIndex,
      ordinalOnPage: f.ordinalOnPage,
      tabLeft: f.tabLeft,
      tabTop: f.tabTop,
      tabWidth: f.tabWidth,
      tabHeight: f.tabHeight,
    });
  }

  noteFragileSelector(note: string): void {
    if (!this.fragile.includes(note)) this.fragile.push(note);
  }

  /**
   * Attach an optional enrichment index loaded from the offline
   * `sample-field-enrichment.json` bundle.  Safe to pass `null` — when
   * omitted or disabled, the live report behaves exactly as before.
   *
   * Must be called BEFORE `build()` / `writeArtifacts()` so the applied
   * annotations flow into the quick field index and metrics.
   */
  attachEnrichment(
    index: EnrichmentIndex | null,
    opts?: {
      requested?: boolean;
      bundlePath?: string | null;
      unavailableReason?: EnrichmentUnavailableReason | null;
    },
  ): void {
    this.enrichmentIndex = index;
    this.enrichmentSummary = {
      requested: opts?.requested ?? index !== null,
      enabled: index !== null,
      bundlePath: index?.bundlePath ?? opts?.bundlePath ?? null,
      unavailableReason: index ? null : opts?.unavailableReason ?? null,
      bundleRecordCount: index?.recordCount ?? 0,
      fieldsConsidered: 0,
      matchesByGuid: 0,
      matchesByPosition: 0,
      matchesByCoordinate: 0,
      labelsUpgraded: 0,
      businessSectionsUpgraded: 0,
      unmatchedRecords: 0,
      unmatchedRecordReasons: {},
    };
    this.enrichmentDiagnostics = {
      matchedRecords: [],
      unmatchedRecords: [],
    };
  }

  /**
   * Update the discovery diagnostics block from raw signer-helper diagnostic
   * lines.  Safely leaves unknown fields as null (never guesses).
   */
  absorbSignerDiagnostics(lines: string[]): void {
    const hit = (re: RegExp): boolean | null => {
      const match = lines.find((l) => re.test(l));
      if (!match) return null;
      return /:\s*yes\b/i.test(match);
    };

    const detectedLine = lines.find((l) => /disclosure .* detected:/i.test(l));
    if (detectedLine) {
      this.diagnostics.disclosureDetected = /:\s*yes\b/i.test(detectedLine);
    }
    const checkboxLine = lines.find((l) => /disclosure .* checkbox checked:/i.test(l));
    if (checkboxLine) {
      this.diagnostics.disclosureCheckboxChecked = /:\s*yes\b/i.test(checkboxLine);
    }
    const continueLine = lines.find((l) => /disclosure .* Continue clicked:/i.test(l));
    if (continueLine) {
      this.diagnostics.disclosureContinueClicked = /:\s*yes\b/i.test(continueLine);
    }
    const formReady = hit(/form ready after disclosure/i);
    if (formReady !== null) this.diagnostics.formReadyAfterDisclosure = formReady;

    if (lines.some((l) => /signing frame resolved/i.test(l))) {
      this.diagnostics.signerSurfaceResolved = true;
    } else if (lines.some((l) => /FRAGILE fallback iframe selector in use/i.test(l))) {
      this.diagnostics.signerSurfaceResolved = false;
    }
  }

  /**
   * Merge enrichment annotations into the recorded fields.  Only upgrades
   * a field when the existing label is weak or when we have a
   * high-confidence GUID match.  Preserves the original label under
   * `enrichment.priorResolvedLabel` for audit.
   */
  private applyEnrichment(): void {
    const idx = this.enrichmentIndex;
    if (!idx) return;

    const weakLabelSources: Set<LabelSource> = new Set([
      'none',
      'docusign-tab-type',
      'placeholder',
      'described-by',
      'helper-text',
      'section+row',
      'positional-prompt',
      'preceding-text',
    ]);

    const matchedRecordKeys = new Set<string>();
    const matchedRecords: EnrichmentMatchedRecordDiagnostic[] = [];

    for (const f of this.fields) {
      // Only merchant inputs are valid targets for this sample-data bundle.
      // Read-only/display/widget controls may share DocuSign tab positions,
      // but matching them would inflate diagnostics without improving labels.
      if (f.controlCategory !== 'merchant_input') {
        continue;
      }

      this.enrichmentSummary.fieldsConsidered++;

      const match: EnrichmentMatch | null = matchField(idx, {
        tabGuid: f.tabGuid,
        pageIndex: f.pageIndex,
        dataType: f.docusignTabType,
        ordinalOnPage: f.ordinalOnPage,
        tabLeft: f.tabLeft,
        tabTop: f.tabTop,
      });
      if (!match) continue;

      const recordKey = enrichmentRecordKey(match.record);
      if (matchedRecordKeys.has(recordKey)) continue;
      matchedRecordKeys.add(recordKey);
      matchedRecords.push({
        jsonKeyPath: match.record.jsonKeyPath,
        matchedBy: match.matchedBy,
        positionalFingerprint: match.record.positionalFingerprint,
      });

      if (match.matchedBy === 'guid') this.enrichmentSummary.matchesByGuid++;
      else if (match.matchedBy === 'coordinate') this.enrichmentSummary.matchesByCoordinate++;
      else this.enrichmentSummary.matchesByPosition++;

      const priorLabel = f.resolvedLabel;
      const priorSource = f.labelSource;

      const canUpgradeLabel =
        (!priorLabel && f.labelConfidence !== 'high') ||
        weakLabelSources.has(priorSource) ||
        (match.matchedBy === 'guid' && match.record.confidence === 'high');

      let appliedToLabel = false;
      if (canUpgradeLabel && match.record.suggestedDisplayName) {
        f.resolvedLabel = match.record.suggestedDisplayName;
        f.label = match.record.suggestedDisplayName;
        f.labelSource = enrichmentLabelSource(match.matchedBy);
        if (match.matchedBy === 'guid' && match.record.confidence === 'high') {
          f.labelConfidence = 'high';
        } else if (f.labelConfidence === 'none' || f.labelConfidence === 'low') {
          f.labelConfidence = 'medium';
        }
        appliedToLabel = true;
        this.enrichmentSummary.labelsUpgraded++;
      }

      f.enrichment = {
        matchedBy: match.matchedBy,
        jsonKeyPath: match.record.jsonKeyPath,
        suggestedDisplayName: match.record.suggestedDisplayName,
        suggestedBusinessSection: match.record.suggestedBusinessSection,
        confidence: match.record.confidence,
        positionalFingerprint: match.record.positionalFingerprint,
        priorResolvedLabel: priorLabel,
        priorLabelSource: priorSource,
        appliedToLabel,
      };
    }

    const unmatchedRecords = idx.records
      .filter((record) => !matchedRecordKeys.has(enrichmentRecordKey(record)))
      .map<EnrichmentUnmatchedRecordDiagnostic>((record) => ({
        jsonKeyPath: record.jsonKeyPath,
        positionalFingerprint: record.positionalFingerprint,
        reason: diagnoseUnmatchedEnrichmentRecord(record, this.fields),
      }));

    const reasonCounts: Record<string, number> = {};
    for (const record of unmatchedRecords) {
      reasonCounts[record.reason] = (reasonCounts[record.reason] ?? 0) + 1;
    }

    this.enrichmentDiagnostics = {
      matchedRecords,
      unmatchedRecords,
    };
    this.enrichmentSummary.unmatchedRecords = unmatchedRecords.length;
    this.enrichmentSummary.unmatchedRecordReasons = reasonCounts;
  }

  build(): ValidationReport {
    // Apply enrichment BEFORE any downstream aggregation reads labels,
    // label sources, or business sections.  Idempotent: a second build()
    // on the same ReportBuilder is a no-op because labels already reflect
    // the enrichment.
    if (this.enrichmentIndex && !this.enrichmentApplied) {
      this.applyEnrichment();
      this.enrichmentApplied = true;
    }

    const allChecks = this.fields.flatMap((f) => f.checks);
    const totals = {
      discovered: this.fields.length,
      merchantInputs: this.fields.filter((f) => f.controlCategory === 'merchant_input').length,
      pass: allChecks.filter((c) => c.status === 'pass').length,
      fail: allChecks.filter((c) => c.status === 'fail').length,
      warning: allChecks.filter((c) => c.status === 'warning').length,
      manual_review: allChecks.filter((c) => c.status === 'manual_review').length,
      skipped: allChecks.filter((c) => c.status === 'skipped').length,
    };

    const countsByControlCategory = Object.fromEntries(
      ALL_CONTROL_CATEGORIES.map((c) => [c, 0]),
    ) as Record<ControlCategory, number>;
    for (const f of this.fields) countsByControlCategory[f.controlCategory]++;

    const countsByClassification: Record<RuleClassification, number> = {
      confirmed_from_ui: 0,
      inferred_best_practice: 0,
      manual_review: 0,
    };
    for (const f of this.fields) countsByClassification[f.inferredClassification]++;

    const countsByInferredType: Record<string, number> = {};
    for (const f of this.fields) {
      countsByInferredType[f.inferredType] = (countsByInferredType[f.inferredType] ?? 0) + 1;
    }

    const countsByLabelSource: Record<string, number> = {};
    for (const f of this.fields) {
      countsByLabelSource[f.labelSource] = (countsByLabelSource[f.labelSource] ?? 0) + 1;
    }

    const countsBySection: Record<string, number> = {};
    for (const f of this.fields) {
      const key = f.section ?? '(no section)';
      countsBySection[key] = (countsBySection[key] ?? 0) + 1;
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
      // Only merchant inputs are considered real validation targets.  Chrome,
      // signature, date-signed, read-only, and attachment controls are
      // reported in their own category counts but do not create findings.
      if (f.controlCategory !== 'merchant_input') continue;
      for (const c of f.checks) {
        if (c.status === 'pass' || c.status === 'skipped') continue;
        const priorityScore = statusRank[c.status] * 100 + sectionPriorityRank(f.section);
        findings.push({
          category: categorizeFinding(c, f.inferredClassification),
          field: `${f.inferredType}:${f.resolvedLabel ?? '(no label)'}`,
          section: f.section,
          controlCategory: f.controlCategory,
          inferredType: f.inferredType,
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

    const topFindings = findings.slice(0, 25);

    const prioritizedUnknowns = this.fields
      .filter(
        (f) =>
          f.controlCategory === 'merchant_input' &&
          f.inferredType === 'unknown_manual_review',
      )
      // Rank by likelihood the field is a real onboarding input reviewers
      // should act on: editable + has nearby prompt candidates first, then
      // others.  Non-editable or selector-risk rows fall to the bottom.
      .sort((a, b) => {
        const aEd = a.editable ? 0 : 1;
        const bEd = b.editable ? 0 : 1;
        if (aEd !== bEd) return aEd - bEd;
        const aCands = a.rawCandidateLabels.length;
        const bCands = b.rawCandidateLabels.length;
        return bCands - aCands;
      })
      .slice(0, 25)
      .map<Finding>((f) => {
        const displayName = computeDisplayName(f);
        const businessSection = deriveBusinessSection(f, displayName);
        const details: string[] = [];
        if (f.rawCandidateLabels.length) {
          details.push(
            `candidate sources: ${f.rawCandidateLabels.map((c) => c.source).join(', ')}`,
          );
        } else {
          details.push('no label candidates found');
        }
        if (f.labelLooksLikeValue) details.push('label-looks-like-value');
        if (f.observedValueLikeTextNearControl) {
          details.push(`nearby value: "${f.observedValueLikeTextNearControl.slice(0, 40)}"`);
        }
        if (f.idOrNameKey) details.push(`id/name: ${f.idOrNameKey}`);
        if (f.rejectedLabelCandidates.length) {
          const reasons = Array.from(
            new Set(f.rejectedLabelCandidates.map((r) => r.reason)),
          ).join(', ');
          details.push(`rejected: ${reasons}`);
        }
        return {
          category: 'manual_review',
          field: `${f.inferredType}: ${displayName}`,
          section: businessSection !== '(unclassified)' ? businessSection : f.section,
          controlCategory: f.controlCategory,
          inferredType: f.inferredType,
          case: 'needs-label-confirmation',
          status: 'manual_review',
          detail: details.join(' | '),
          priorityScore: 1000,
        };
      });

    const candidateValidations = buildCandidateValidations(this.fields);

    const labelsRejectedByReason: Record<LabelRejectReason, number> = {
      'looks-like-value': 0,
      'docusign-stub': 0,
      'chrome-text': 0,
      'equals-field-value': 0,
      'generic-docusign-tab-type': 0,
      'too-short': 0,
      'too-long': 0,
      'pure-punctuation': 0,
      'pure-digits': 0,
    };
    let labelsRejectedTotal = 0;
    let labelsLookedLikeValue = 0;
    let controlsWithNoAcceptedLabel = 0;
    for (const f of this.fields) {
      for (const r of f.rejectedLabelCandidates ?? []) {
        labelsRejectedTotal++;
        labelsRejectedByReason[r.reason]++;
        if (r.reason === 'looks-like-value') labelsLookedLikeValue++;
      }
      if (!f.resolvedLabel) controlsWithNoAcceptedLabel++;
    }

    const labelQualitySummary: LabelQualitySummary = {
      acceptedHumanLabels: this.fields.filter(
        (f) => Boolean(f.resolvedLabel) && !f.labelSource.startsWith('enrichment-') && f.labelSource !== 'docusign-tab-type',
      ).length,
      enrichmentLabels: this.fields.filter((f) => f.labelSource.startsWith('enrichment-')).length,
      genericDocusignTabTypeHints: this.fields.filter((f) => Boolean(f.docusignTabType)).length,
      genericDocusignTabTypeLabelsAccepted: this.fields.filter((f) => f.labelSource === 'docusign-tab-type').length,
      unresolvedFields: controlsWithNoAcceptedLabel,
    };

    const attachmentEvidenceBreakdown: Record<AttachmentEvidence, number> = {
      strong: 0,
      weak: 0,
      none: 0,
    };
    for (const f of this.fields) {
      attachmentEvidenceBreakdown[f.attachmentEvidence ?? 'none']++;
    }

    const quickFieldIndex = buildQuickFieldIndex(this.fields);
    const countsByBusinessSection: Record<string, number> = {};
    for (const row of quickFieldIndex) {
      countsByBusinessSection[row.businessSection] =
        (countsByBusinessSection[row.businessSection] ?? 0) + 1;
    }

    // Tally business-section upgrades attributable to enrichment.  A field
    // "upgraded" its section when enrichment supplied a real section that
    // the heuristic would have otherwise bucketed as `(unclassified)`.
    if (this.enrichmentIndex) {
      for (const f of this.fields) {
        if (!f.enrichment) continue;
        // Re-derive without the enrichment hint to see what the heuristic
        // would have chosen on its own.
        const withoutHint = deriveBusinessSectionHeuristic(f, computeDisplayName(f));
        if (
          withoutHint === '(unclassified)' &&
          f.enrichment.suggestedBusinessSection &&
          f.enrichment.suggestedBusinessSection !== '(unclassified)'
        ) {
          this.enrichmentSummary.businessSectionsUpgraded++;
        }
      }
    }

    return {
      runStartedAt: this.startedAt,
      runFinishedAt: new Date().toISOString(),
      destructiveMode: this.destructiveMode,
      discoveryDiagnostics: this.diagnostics,
      totals,
      countsByControlCategory,
      countsByClassification,
      countsByInferredType,
      countsByLabelSource,
      countsBySection,
      countsByBusinessSection,
      countsByCategory,
      labelExtractionSummary: {
        labelsRejectedTotal,
        labelsRejectedByReason,
        labelsLookedLikeValue,
        controlsWithNoAcceptedLabel,
      },
      labelQualitySummary,
      enrichmentDiagnostics: this.enrichmentDiagnostics,
      attachmentEvidenceBreakdown,
      candidateValidations,
      prioritizedUnknowns,
      fragileSelectors: this.fragile,
      topFindings,
      quickFieldIndex,
      enrichmentSummary: this.enrichmentSummary,
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

function enrichmentRecordKey(record: EnrichmentRecord): string {
  return `${record.jsonKeyPath}|${record.positionalFingerprint}`;
}

function enrichmentLabelSource(matchedBy: EnrichmentMatch['matchedBy']): LabelSource {
  if (matchedBy === 'guid') return 'enrichment-guid';
  if (matchedBy === 'coordinate') return 'enrichment-coordinate';
  return 'enrichment-position';
}

function parseEnrichmentFingerprint(
  fingerprint: string,
): { pageIndex: number; family: string; ordinalOnPage: number } | null {
  const match = /^page:(\d+)\|([^|]+)\|ord:(\d+)$/.exec(fingerprint);
  if (!match) return null;
  return {
    pageIndex: Number(match[1]),
    family: normalizeFamily(match[2]),
    ordinalOnPage: Number(match[3]),
  };
}

function liveFingerprint(f: FieldRecord): string | null {
  return buildPositionalFingerprint(f.pageIndex, f.docusignTabType, f.ordinalOnPage);
}

function diagnoseUnmatchedEnrichmentRecord(record: EnrichmentRecord, fields: FieldRecord[]): string {
  const guid = record.tabGuid?.toLowerCase();
  if (guid && fields.some((f) => f.tabGuid?.toLowerCase() === guid)) {
    return 'guid-present-but-not-applied';
  }

  const expected = parseEnrichmentFingerprint(record.positionalFingerprint);
  if (!expected) return 'invalid-fingerprint';

  const exactField = fields.find((f) => liveFingerprint(f) === record.positionalFingerprint);
  if (exactField) return `field-excluded-${exactField.controlCategory}`;

  const pageFields = fields.filter((f) => f.pageIndex === expected.pageIndex);
  if (!pageFields.length) return 'page-number-mismatch';

  const sameTypeFields = pageFields.filter((f) => normalizeFamily(f.docusignTabType) === expected.family);
  if (!sameTypeFields.length) return 'tab-type-mismatch';

  const sameOrdinalDifferentType = pageFields.some(
    (f) => f.ordinalOnPage === expected.ordinalOnPage && normalizeFamily(f.docusignTabType) !== expected.family,
  );
  if (sameOrdinalDifferentType) return 'tab-type-mismatch';

  const hasCoordinates = typeof record.tabLeft === 'number' && typeof record.tabTop === 'number';
  const hasNearbyCoordinate =
    hasCoordinates &&
    sameTypeFields.some(
      (f) =>
        typeof f.tabLeft === 'number' &&
        typeof f.tabTop === 'number' &&
        Math.max(Math.abs(f.tabLeft - record.tabLeft!), Math.abs(f.tabTop - record.tabTop!)) <= 3,
    );
  if (hasNearbyCoordinate) return 'coordinate-ambiguous-or-duplicate';

  return 'ordinal-drift-or-field-excluded';
}

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
    if (
      name.includes('format-') ||
      name.includes(':valid') ||
      name.includes(':too-') ||
      name.includes(':letters') ||
      name.includes(':missing') ||
      name.includes(':spaces')
    ) {
      return 'validation_gap';
    }
    return 'warning';
  }
  return 'warning';
}

/**
 * Build a shortlist of concrete validation scenarios that are now practical
 * given what we actually discovered.  Only counts merchant_input controls.
 */
function buildCandidateValidations(fields: FieldRecord[]): CandidateValidation[] {
  const merchant = fields.filter((f) => f.controlCategory === 'merchant_input');

  const spec: Array<{ scenario: string; targetType: FieldType | FieldType[] }> = [
    { scenario: 'Email format validation', targetType: ['signer_email', 'email'] },
    { scenario: 'Phone format validation', targetType: ['signer_phone', 'phone_e164'] },
    { scenario: 'EIN format validation (##-#######)', targetType: ['ein', 'tax_id_ein'] },
    { scenario: 'SSN format validation (###-##-####)', targetType: 'ssn' },
    { scenario: 'DOB (past / adult only)', targetType: ['date_of_birth', 'dob'] },
    { scenario: 'ZIP code validation', targetType: ['zip', 'zip_postal_code'] },
    { scenario: 'State dropdown required', targetType: ['state', 'state_region'] },
    { scenario: 'Formation / incorporation date', targetType: ['formation_date', 'incorporation_date', 'date'] },
    { scenario: 'Ownership percent 0-100', targetType: ['ownership_percent', 'percent'] },
    { scenario: 'Required business name', targetType: ['business_name', 'dba_name'] },
    { scenario: 'Legal entity type dropdown', targetType: 'legal_entity_type' },
    { scenario: 'Attachment / document upload flow', targetType: ['upload', 'file_upload'] },
  ];

  const results: CandidateValidation[] = [];
  for (const s of spec) {
    const types = Array.isArray(s.targetType) ? s.targetType : [s.targetType];
    const matches = merchant.filter((f) => types.includes(f.inferredType));
    if (matches.length === 0) continue;
    results.push({
      scenario: s.scenario,
      targetType: types[0],
      count: matches.length,
      sampleLabels: matches
        .map((m) => computeDisplayName(m))
        .filter((label) => !isPlaceholderDisplayName(label))
        .slice(0, 5),
    });
  }
  return results;
}

function isPlaceholderDisplayName(label: string): boolean {
  return label.startsWith('⟨') || isGenericDocusignTabTypeLabel(label);
}

function isGenericDocusignTabTypeLabel(label: string): boolean {
  return /^(text|list|checkbox|radio|date|signhere|signerattachment|datesigned|fullname|email|formula|unknown)$/i.test(
    label.trim(),
  );
}

/**
 * Decide the best human-readable name to show for a field in the top-level
 * summary.  Preference order:
 *   1. resolvedLabel (when it is clearly a prompt, not a value/stub).
 *   2. humanized idOrNameKey (when not a generic DocuSign descriptor).
 *   3. "<kind> ⟨type hint⟩" fallback, e.g. "textbox · unknown".
 */
function computeDisplayName(f: FieldRecord): string {
  // Enrichment-sourced labels always win when they were actually applied —
  // the merger upstream only sets `appliedToLabel` after confirming the
  // live label was weaker than the suggestion.
  if (f.enrichment?.appliedToLabel && f.resolvedLabel) {
    return f.resolvedLabel;
  }
  const label = f.resolvedLabel?.trim();
  if (label && !f.labelLooksLikeValue && label.length <= 80 && looksLikePromptLabel(label)) {
    return label;
  }
  if (f.idOrNameKey && !isGenericDocusignIdKey(f.idOrNameKey)) {
    const humanized = humanizeIdKey(f.idOrNameKey);
    if (humanized) return humanized;
  }
  // Even when we chose NOT to overwrite the live label, surface the
  // enrichment suggestion as a fallback so the quick index is still useful.
  if (f.enrichment?.suggestedDisplayName) return f.enrichment.suggestedDisplayName;
  const typeHint = f.inferredType === 'unknown_manual_review' ? 'needs label' : f.inferredType;
  return `⟨${f.kind} · ${typeHint}⟩`;
}

function looksLikePromptLabel(s: string): boolean {
  const v = s.trim();
  // Prompt-shaped labels almost always contain at least one letter run and
  // typically end with a word, not a stub fragment.
  if (!/[A-Za-z]{3,}/.test(v)) return false;
  if (isGenericDocusignTabTypeLabel(v)) return false;
  if (/signer\s*attachment|attachment\s*(required|optional)/i.test(v)) return false;
  if (/^(required|optional)\b/i.test(v)) return false;
  return true;
}

function humanizeIdKey(key: string): string | null {
  const h = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!h || !/[A-Za-z]{3,}/.test(h)) return null;
  // Title case first letters.
  return h.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

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
 * Bucket a field into a human-meaningful onboarding section based on the
 * resolved display name, inferred type, id/name key, and surrounding
 * prompt text.  Returns "(unclassified)" when no signal matches.
 */
function deriveBusinessSection(f: FieldRecord, displayName: string): string {
  // Prefer the enrichment-suggested section when present — the offline
  // crosswalk is authoritative about which onboarding bucket a field
  // belongs to.  Fall through to the heuristic only when no enrichment
  // match exists.
  if (f.enrichment?.suggestedBusinessSection) {
    return f.enrichment.suggestedBusinessSection;
  }
  return deriveBusinessSectionHeuristic(f, displayName);
}

function deriveBusinessSectionHeuristic(f: FieldRecord, displayName: string): string {
  // Only use CLEAN evidence – rejected candidates contain docusign-stub text
  // (e.g. "SignerAttachment") which would falsely route everything into
  // Stakeholder.  Rely on the accepted label + id/name key + surrounding
  // section heading only.
  const hay = [displayName, f.resolvedLabel ?? '', f.idOrNameKey ?? '', f.section ?? '']
    .join(' | ')
    .toLowerCase();

  // Agreements / signature
  if (
    f.controlCategory === 'signature_widget' ||
    f.controlCategory === 'date_signed_widget' ||
    f.controlCategory === 'acknowledgement_checkbox' ||
    /acknowledge|i\s*agree|consent|signature|sign\s*here|date\s*signed|terms|authoriz/.test(hay)
  ) {
    return 'Agreements / Signature';
  }

  // Banking
  if (
    /bank|routing|account\s*number|accountnumber|acct|\bach\b|bankname|bankaccounttype/.test(hay) ||
    ['bank_account_type', 'bank_name', 'routing_number', 'account_number'].includes(f.inferredType)
  ) {
    return 'Banking';
  }

  // Stakeholder / signer identity
  if (
    /stakeholder|beneficial|signer|owner|first\s*name|last\s*name|date\s*of\s*birth|\bdob\b|\bssn\b/.test(
      hay,
    ) ||
    ['signer_first_name', 'signer_last_name', 'signer_email', 'signer_phone', 'ssn', 'date_of_birth', 'dob', 'stakeholder_role'].includes(
      f.inferredType,
    )
  ) {
    return 'Stakeholder';
  }

  // Contact
  if (
    /e-?mail|phone|mobile|website|homepage/.test(hay) ||
    ['email', 'signer_email', 'signer_phone', 'phone_e164', 'website', 'url'].includes(f.inferredType)
  ) {
    return 'Contact';
  }

  // Address
  if (
    /address|street|city|state|\bzip\b|postal|legaladdress|operatingaddress|virtualaddress/.test(
      hay,
    ) ||
    [
      'address_line_1',
      'address_line_2',
      'city',
      'state',
      'zip',
      'country',
      'state_region',
      'zip_postal_code',
      'address_option',
    ].includes(f.inferredType)
  ) {
    return 'Address';
  }

  // Processing / financials
  if (
    /annual\s*revenue|monthly\s*volume|average\s*ticket|avg\s*ticket|sales|revenue|processing/.test(
      hay,
    ) ||
    ['annual_revenue', 'average_ticket', 'monthly_volume', 'currency', 'percent', 'ownership_percent'].includes(
      f.inferredType,
    )
  ) {
    return 'Processing & Financials';
  }

  // Business Details
  if (
    /business\s*name|dba|legal\s*name|legal\s*entity|entity\s*type|business\s*type|business\s*description|\bnaics\b|\bmcc\b|\bein\b|tax\s*id|federal\s*tax|proof\s*of\s*business|proofofbusiness|formation|incorporation/.test(
      hay,
    ) ||
    [
      'business_name',
      'dba_name',
      'legal_entity_type',
      'business_description',
      'naics',
      'mcc',
      'ein',
      'tax_id_ein',
      'proof_type',
      'document_type',
      'formation_date',
      'incorporation_date',
      'months_of_operation',
    ].includes(f.inferredType)
  ) {
    return 'Business Details';
  }

  // Uploads / attachments
  if (f.controlCategory === 'attachment_control' || f.inferredType === 'upload' || f.inferredType === 'file_upload') {
    return 'Attachments';
  }

  return '(unclassified)';
}

function statusForField(f: FieldRecord): 'high_confidence' | 'best_guess' | 'needs_review' {
  if (f.controlCategory !== 'merchant_input') {
    // Non-merchant controls are low-risk for reviewers.
    return f.inferredClassification === 'confirmed_from_ui' ? 'high_confidence' : 'best_guess';
  }
  if (f.inferredType === 'unknown_manual_review') return 'needs_review';
  if (f.labelConfidence === 'high' && f.inferredClassification !== 'manual_review') {
    return 'high_confidence';
  }
  if (f.labelConfidence === 'none') return 'needs_review';
  return 'best_guess';
}

function notesForField(f: FieldRecord, displayName: string): string {
  const bits: string[] = [];
  if (f.required) bits.push('required');
  if (f.inferredType !== 'unknown_manual_review' && displayName !== f.resolvedLabel) {
    bits.push(`type=${f.inferredType}`);
  }
  if (f.observedValueLikeTextNearControl) {
    bits.push(`nearby value: "${truncate(f.observedValueLikeTextNearControl, 30)}"`);
  }
  if (!f.resolvedLabel && f.idOrNameKey) {
    bits.push(`id=${truncate(f.idOrNameKey, 40)}`);
  }
  if (f.docusignTabType && (f.labelConfidence === 'none' || f.labelConfidence === 'low' || isPlaceholderDisplayName(displayName))) {
    bits.push(`tabType=${f.docusignTabType}`);
  }
  if (f.enrichment) bits.push(`matched=${f.enrichment.matchedBy}`);
  if (f.labelLooksLikeValue) bits.push('label looked like value');
  if (f.labelConfidence === 'low' || f.labelConfidence === 'none') {
    bits.push(`confidence=${f.labelConfidence}`);
  }
  return bits.join('; ');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function buildQuickFieldIndex(fields: FieldRecord[]): QuickFieldRow[] {
  const sectionRank: Record<string, number> = {
    'Business Details': 1,
    Contact: 2,
    Address: 3,
    Stakeholder: 4,
    Banking: 5,
    'Processing & Financials': 6,
    Attachments: 7,
    'Agreements / Signature': 8,
    '(unclassified)': 9,
  };
  const statusRank: Record<QuickFieldRow['status'], number> = {
    needs_review: 0,
    best_guess: 1,
    high_confidence: 2,
  };
  const rows: QuickFieldRow[] = fields.map((f, i) => {
    const displayName = computeDisplayName(f);
    const businessSection = deriveBusinessSection(f, displayName);
    return {
      index: i + 1,
      displayName,
      inferredType: f.inferredType,
      controlCategory: f.controlCategory,
      section: f.section ?? '(no section)',
      businessSection,
      labelSource: f.labelSource,
      status: statusForField(f),
      notes: notesForField(f, displayName),
    };
  });
  // Sort for readability: business section, then status (needs_review first).
  rows.sort((a, b) => {
    const s = (sectionRank[a.businessSection] ?? 99) - (sectionRank[b.businessSection] ?? 99);
    if (s !== 0) return s;
    const r = statusRank[a.status] - statusRank[b.status];
    if (r !== 0) return r;
    return a.displayName.localeCompare(b.displayName);
  });
  return rows;
}

function renderMarkdown(r: ValidationReport): string {
  const L: string[] = [];
  L.push('# Bead Onboarding – Live Signer Validation Summary');
  L.push('');
  L.push(`- Run started:    \`${r.runStartedAt}\``);
  L.push(`- Run finished:   \`${r.runFinishedAt}\``);
  L.push(`- Destructive mode: **${r.destructiveMode ? 'ON' : 'OFF'}**`);
  L.push('');

  L.push('## Discovery diagnostics');
  L.push('');
  L.push('| Signal | Value |');
  L.push('|---|---|');
  L.push(`| Disclosure detected | ${fmtBool(r.discoveryDiagnostics.disclosureDetected)} |`);
  L.push(`| Consent checkbox checked | ${fmtBool(r.discoveryDiagnostics.disclosureCheckboxChecked)} |`);
  L.push(`| Continue clicked | ${fmtBool(r.discoveryDiagnostics.disclosureContinueClicked)} |`);
  L.push(`| Form ready after disclosure | ${fmtBool(r.discoveryDiagnostics.formReadyAfterDisclosure)} |`);
  L.push(`| Signer surface resolved | ${fmtBool(r.discoveryDiagnostics.signerSurfaceResolved)} |`);
  L.push('');

  L.push('## Totals');
  L.push('');
  L.push('| Outcome | Count |');
  L.push('|---|---|');
  L.push(`| Controls discovered | ${r.totals.discovered} |`);
  L.push(`| **Merchant inputs** | **${r.totals.merchantInputs}** |`);
  L.push(`| Pass | ${r.totals.pass} |`);
  L.push(`| Fail | ${r.totals.fail} |`);
  L.push(`| Warning | ${r.totals.warning} |`);
  L.push(`| Manual review | ${r.totals.manual_review} |`);
  L.push(`| Skipped | ${r.totals.skipped} |`);
  L.push('');

  if (r.enrichmentSummary.requested || r.enrichmentSummary.enabled) {
    L.push('## Sample-field enrichment');
    L.push('');
    if (r.enrichmentSummary.enabled) {
      L.push(
        '_Offline enrichment bundle was merged into this report.  GUID matches are the strongest signal; positional and coordinate matches are template-shape fallbacks._',
      );
    } else {
      L.push(
        '_Sample-field enrichment was requested for this run, but no usable local bundle was loaded. The report below reflects baseline live discovery only._',
      );
    }
    L.push('');
    L.push('| Signal | Value |');
    L.push('|---|---|');
    L.push(`| Requested | ${r.enrichmentSummary.requested ? 'yes' : 'no'} |`);
    L.push(`| Bundle loaded | ${r.enrichmentSummary.enabled ? 'yes' : 'no'} |`);
    L.push(`| Bundle path | \`${r.enrichmentSummary.bundlePath ?? '—'}\` |`);
    if (r.enrichmentSummary.unavailableReason) {
      L.push(`| Unavailable reason | ${r.enrichmentSummary.unavailableReason} |`);
    }
    L.push(`| Records in bundle | ${r.enrichmentSummary.bundleRecordCount} |`);
    L.push(`| Fields considered | ${r.enrichmentSummary.fieldsConsidered} |`);
    L.push(`| Matches by GUID | ${r.enrichmentSummary.matchesByGuid} |`);
    L.push(`| Matches by position | ${r.enrichmentSummary.matchesByPosition} |`);
    L.push(`| Matches by coordinate | ${r.enrichmentSummary.matchesByCoordinate} |`);
    L.push(`| Display names upgraded | ${r.enrichmentSummary.labelsUpgraded} |`);
    L.push(`| Business sections upgraded | ${r.enrichmentSummary.businessSectionsUpgraded} |`);
    L.push(`| Unmatched bundle records | ${r.enrichmentSummary.unmatchedRecords} |`);
    if (Object.keys(r.enrichmentSummary.unmatchedRecordReasons).length) {
      for (const [reason, count] of Object.entries(r.enrichmentSummary.unmatchedRecordReasons).sort(
        (a, b) => b[1] - a[1],
      )) {
        L.push(`| unmatched: ${reason} | ${count} |`);
      }
    }
    L.push('');

    if (r.enrichmentDiagnostics.unmatchedRecords.length) {
      L.push('### Unmatched enrichment records');
      L.push('');
      L.push('| JSON key | Expected fingerprint | Reason |');
      L.push('|---|---|---|');
      for (const record of r.enrichmentDiagnostics.unmatchedRecords) {
        L.push(
          `| \`${esc(record.jsonKeyPath)}\` | \`${esc(record.positionalFingerprint)}\` | ${esc(record.reason)} |`,
        );
      }
      L.push('');
    }
  }

  if (r.quickFieldIndex.length) {
    L.push('## Quick field index');
    L.push('');
    L.push(
      '_Readable summary for reviewers. One row per discovered control, sorted by business section then status._',
    );
    L.push('');
    L.push('| # | Field Name | Inferred Type | Control Category | Business Section | Page / Heading | Label Source | Status | Notes |');
    L.push('|---|------------|---------------|------------------|------------------|----------------|--------------|--------|-------|');
    r.quickFieldIndex.forEach((row, i) => {
      L.push(
        `| ${i + 1} | ${esc(row.displayName) ?? '—'} | ${row.inferredType} | ${row.controlCategory} | ${esc(row.businessSection) ?? '—'} | ${esc(row.section) ?? '—'} | ${row.labelSource} | ${row.status} | ${esc(row.notes) ?? ''} |`,
      );
    });
    L.push('');
  }

  if (Object.keys(r.countsByBusinessSection).length) {
    L.push('## Controls by business section');
    L.push('');
    L.push('| Business section | Count |');
    L.push('|---|---|');
    for (const [sec, count] of Object.entries(r.countsByBusinessSection).sort(
      (a, b) => b[1] - a[1],
    )) {
      L.push(`| ${esc(sec) ?? '—'} | ${count} |`);
    }
    L.push('');
  }

  L.push('## Controls by category');
  L.push('');
  L.push('| Control category | Count |');
  L.push('|---|---|');
  for (const [cat, count] of Object.entries(r.countsByControlCategory)) {
    L.push(`| ${cat} | ${count} |`);
  }
  L.push('');

  L.push('## Labels by source');
  L.push('');
  L.push('| Source | Count |');
  L.push('|---|---|');
  for (const [src, count] of Object.entries(r.countsByLabelSource).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${src} | ${count} |`);
  }
  L.push('');

  L.push('## Controls by section');
  L.push('');
  L.push('| Section | Count |');
  L.push('|---|---|');
  for (const [sec, count] of Object.entries(r.countsBySection).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${esc(sec) ?? '(no section)'} | ${count} |`);
  }
  L.push('');

  L.push('## Findings by category');
  L.push('');
  L.push('| Category | Count |');
  L.push('|---|---|');
  for (const [cat, count] of Object.entries(r.countsByCategory)) {
    L.push(`| ${cat} | ${count} |`);
  }
  L.push('');

  L.push('## Inferred type distribution');
  L.push('');
  L.push('| Type | Count |');
  L.push('|---|---|');
  for (const [type, count] of Object.entries(r.countsByInferredType).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${type} | ${count} |`);
  }
  L.push('');

  L.push('## Label extraction summary');
  L.push('');
  L.push('| Signal | Count |');
  L.push('|---|---|');
  L.push(`| Candidates rejected (total) | ${r.labelExtractionSummary.labelsRejectedTotal} |`);
  L.push(`| Labels that looked like values | ${r.labelExtractionSummary.labelsLookedLikeValue} |`);
  L.push(`| Controls with no accepted label | ${r.labelExtractionSummary.controlsWithNoAcceptedLabel} |`);
  L.push(`| Accepted human labels | ${r.labelQualitySummary.acceptedHumanLabels} |`);
  L.push(`| Enrichment-applied labels | ${r.labelQualitySummary.enrichmentLabels} |`);
  L.push(`| Generic DocuSign tab-type hints | ${r.labelQualitySummary.genericDocusignTabTypeHints} |`);
  L.push(`| Generic DocuSign tab-type labels accepted | ${r.labelQualitySummary.genericDocusignTabTypeLabelsAccepted} |`);
  L.push(`| Unresolved labels | ${r.labelQualitySummary.unresolvedFields} |`);
  for (const [reason, count] of Object.entries(r.labelExtractionSummary.labelsRejectedByReason).sort(
    (a, b) => b[1] - a[1],
  )) {
    if (count === 0) continue;
    L.push(`| rejected: ${reason} | ${count} |`);
  }
  L.push('');

  L.push('## Attachment classification evidence');
  L.push('');
  L.push('| Evidence strength | Count |');
  L.push('|---|---|');
  L.push(`| strong | ${r.attachmentEvidenceBreakdown.strong} |`);
  L.push(`| weak | ${r.attachmentEvidenceBreakdown.weak} |`);
  L.push(`| none | ${r.attachmentEvidenceBreakdown.none} |`);
  L.push('');

  if (r.candidateValidations.length) {
    L.push('## Candidate validations now possible');
    L.push('');
    L.push('| Scenario | Target type | Merchant fields | Sample labels |');
    L.push('|---|---|---|---|');
    for (const c of r.candidateValidations) {
      L.push(
        `| ${c.scenario} | \`${c.targetType}\` | ${c.count} | ${c.sampleLabels.map((s) => esc(s)).join(', ') || '—'} |`,
      );
    }
    L.push('');
  }

  if (r.topFindings.length) {
    L.push('## Top merchant-input findings');
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

  if (r.prioritizedUnknowns.length) {
    L.push('## Prioritized unknowns (merchant inputs still needing a label)');
    L.push('');
    L.push('| # | Section | Field | Detail |');
    L.push('|---|---------|-------|--------|');
    r.prioritizedUnknowns.forEach((f, i) => {
      L.push(`| ${i + 1} | ${esc(f.section) ?? '—'} | ${esc(f.field)} | ${esc(f.detail) ?? ''} |`);
    });
    L.push('');
  }

  for (const bucket of ['confirmed_from_ui', 'inferred_best_practice', 'manual_review'] as const) {
    const rows = r.fields.filter(
      (f) => f.inferredClassification === bucket && f.controlCategory === 'merchant_input',
    );
    if (rows.length === 0) continue;
    L.push(`## Merchant inputs – ${bucket}`);
    L.push('');
    L.push('| # | Section | Kind | Label | Label source | Conf. | Inferred | Required | Helper text |');
    L.push('|---|---------|------|-------|--------------|-------|----------|----------|-------------|');
    rows.forEach((f, i) => {
      L.push(
        `| ${i + 1} | ${esc(f.section) ?? '—'} | ${f.kind} | ${esc(f.resolvedLabel) ?? '_(no label)_'} | ${f.labelSource} | ${f.labelConfidence} | ${f.inferredType} | ${f.required ? 'yes' : 'no'} | ${esc(f.helperText) ?? '—'} |`,
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
  L.push('- Treat `merchant_input` counts as the real validation surface.  Ignore `signature_widget`, `date_signed_widget`, `read_only_display`, and `docusign_chrome` noise.');
  L.push('- Every `manual_review` row is an explicit TODO for confirming the rule against the live UI.');
  L.push('- Promote `inferred_best_practice` rules to `confirmed_from_ui` once verified.');
  L.push('- Replace `labelConfidence=low` entries with `getByLabel(\'<confirmed label>\')` after a DevTools pass.');
  L.push('- Investigate any **hard_fail** under `Business Details`, `Stakeholders`, `Acknowledgements` first.');
  L.push('');

  return L.join('\n');
}

function fmtBool(v: boolean | null): string {
  if (v === null) return '_not observed_';
  return v ? '**yes**' : '**no**';
}

function esc(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
