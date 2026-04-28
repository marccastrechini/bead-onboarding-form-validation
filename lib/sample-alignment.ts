/**
 * Offline alignment between a Bead onboarding submission JSON and a
 * DocuSign MHTML snapshot (SAFE MODE).
 *
 * Produces a reviewer-friendly crosswalk that later code can merge into
 * live-discovery reports.  Nothing here touches the network; all inputs are
 * local files from samples/private/.
 */

import type { MhtmlTab, MhtmlTabType, MhtmlParseResult } from './mhtml-parser';
import {
  inferBeadSampleFieldCellEvidence,
  type FieldCellEvidence,
} from './sample-layout-evidence';
import { isRedactedSampleValue, normalizeSampleApplication } from './sample-inputs';

// ---------------------------------------------------------------------------
// 1. JSON source field inventory
// ---------------------------------------------------------------------------

export type NormalizedTypeHint =
  | 'string'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'email'
  | 'phone'
  | 'url'
  | 'postalCode'
  | 'state'
  | 'country'
  | 'enum'
  | 'taxId'
  | 'unknown';

export type BusinessSection =
  | 'Business Details'
  | 'Address'
  | 'Contact'
  | 'Banking'
  | 'Processing & Financials'
  | 'Stakeholder'
  | 'Attachments'
  | 'Agreements / Signature'
  | 'Fees'
  | '(unclassified)';

export interface SourceField {
  keyPath: string;
  value: unknown;
  valueSample: string;
  typeHint: NormalizedTypeHint;
  businessSection: BusinessSection;
  redacted: boolean;
  valueSource: 'json' | 'pdf_confirmed_mhtml';
  /** Canonical prompt aliases a human might see on a rendered form. */
  promptAliases: string[];
}

export interface BuildSourceFieldInventoryOptions {
  valueOverrides?: Record<string, string>;
}

const MERCHANT_KEY_MAP: Record<string, { type: NormalizedTypeHint; section: BusinessSection; aliases: string[] }> = {
  merchantName: { type: 'string', section: 'Business Details', aliases: ['Merchant Name', 'Account Name'] },
  partnerId: { type: 'string', section: 'Business Details', aliases: ['Partner ID'] },
  partnerExternalId: { type: 'string', section: 'Business Details', aliases: ['Partner External ID', 'External ID'] },
  locationName: { type: 'string', section: 'Business Details', aliases: ['Location Name', 'Location'] },
  locationBusinessType: { type: 'enum', section: 'Business Details', aliases: ['Business Type', 'Location Type'] },
  businessEmail: { type: 'email', section: 'Contact', aliases: ['Business Email', 'Email', 'Email Address'] },
  businessPhone: { type: 'phone', section: 'Contact', aliases: ['Business Phone', 'Phone', 'Phone Number'] },
  businessWebsite: { type: 'url', section: 'Business Details', aliases: ['Business Website', 'Website', 'URL'] },
  registeredName: {
    type: 'string',
    section: 'Business Details',
    aliases: ['Legal Business Name', 'Registered Name', 'Legal Name'],
  },
  dbaName: { type: 'string', section: 'Business Details', aliases: ['DBA', 'DBA Name', 'Doing Business As'] },
  businessDescription: { type: 'string', section: 'Business Details', aliases: ['Business Description', 'Description'] },
  legalEntityType: { type: 'enum', section: 'Business Details', aliases: ['Legal Entity Type', 'Entity Type'] },
  otherLegalEntity: { type: 'string', section: 'Business Details', aliases: ['Other Entity Type'] },
  registrationDate: {
    type: 'date',
    section: 'Business Details',
    aliases: ['Date of Incorporation', 'Registration Date', 'Incorporation Date', 'Date Established'],
  },
  merchantCategoryCode: { type: 'string', section: 'Business Details', aliases: ['MCC', 'Merchant Category Code'] },
  naicsCode: { type: 'string', section: 'Business Details', aliases: ['NAICS', 'NAICS Code'] },
  additionalMcc: { type: 'string', section: 'Business Details', aliases: ['Additional MCC'] },
  federalTaxId: { type: 'taxId', section: 'Business Details', aliases: ['EIN', 'Federal Tax ID', 'Tax ID'] },
  federalTaxIdType: { type: 'enum', section: 'Business Details', aliases: ['Tax ID Type'] },
  isSeasonalBusiness: { type: 'boolean', section: 'Business Details', aliases: ['Seasonal Business'] },
  isLegalAddress: { type: 'boolean', section: 'Address', aliases: ['Is Legal Address'] },
  isOperatingAddress: { type: 'boolean', section: 'Address', aliases: ['Is Operating Address'] },
  isVirtualAddress: { type: 'boolean', section: 'Address', aliases: ['Is Virtual Address'] },
  bankName: { type: 'string', section: 'Banking', aliases: ['Bank Name'] },
  routingNumber: { type: 'string', section: 'Banking', aliases: ['Routing Number', 'ABA'] },
  accountNumber: { type: 'string', section: 'Banking', aliases: ['Account Number'] },
  accountType: { type: 'enum', section: 'Banking', aliases: ['Account Type', 'Bank Account Type'] },
  bankDepositMethod: { type: 'enum', section: 'Banking', aliases: ['Deposit Method'] },
  grossAnnualRevenue: {
    type: 'currency',
    section: 'Processing & Financials',
    aliases: ['Annual Revenue', 'Gross Annual Revenue'],
  },
  highestMonthlyVolume: {
    type: 'currency',
    section: 'Processing & Financials',
    aliases: ['Highest Monthly Volume', 'Max Monthly Volume'],
  },
  averageTicketSize: {
    type: 'currency',
    section: 'Processing & Financials',
    aliases: ['Average Ticket', 'Avg Ticket'],
  },
  maxTicketSize: { type: 'currency', section: 'Processing & Financials', aliases: ['Max Ticket', 'Highest Ticket'] },
  proofOfBankAccountType: { type: 'enum', section: 'Attachments', aliases: ['Proof of Bank Account'] },
  proofOfBusinessType: { type: 'enum', section: 'Attachments', aliases: ['Proof of Business'] },
  proofOfAddressType: { type: 'enum', section: 'Attachments', aliases: ['Proof of Address'] },
};

const ADDRESS_KEY_MAP: Record<string, { type: NormalizedTypeHint; aliases: string[] }> = {
  line1: { type: 'string', aliases: ['Address Line 1', 'Street', 'Address'] },
  Line1: { type: 'string', aliases: ['Address Line 1', 'Street'] },
  line2: { type: 'string', aliases: ['Address Line 2', 'Apt', 'Suite'] },
  Line2: { type: 'string', aliases: ['Address Line 2'] },
  city: { type: 'string', aliases: ['City'] },
  City: { type: 'string', aliases: ['City'] },
  state: { type: 'state', aliases: ['State', 'Province'] },
  State: { type: 'state', aliases: ['State'] },
  postalCode: { type: 'postalCode', aliases: ['Zip', 'Postal Code', 'Zip Code'] },
  PostalCode: { type: 'postalCode', aliases: ['Postal Code', 'Zip'] },
  country: { type: 'country', aliases: ['Country'] },
  Country: { type: 'country', aliases: ['Country'] },
};

const CONTACT_KEY_MAP: Record<string, { type: NormalizedTypeHint; aliases: string[] }> = {
  firstName: { type: 'string', aliases: ['First Name', 'Legal First Name'] },
  lastName: { type: 'string', aliases: ['Last Name', 'Legal Last Name'] },
  email: { type: 'email', aliases: ['Email', 'Email Address'] },
  phoneNumber: { type: 'phone', aliases: ['Phone', 'Phone Number', 'Mobile'] },
};

const STAKEHOLDER_KEY_MAP: Record<string, { type: NormalizedTypeHint; aliases: string[] }> = {
  firstName: { type: 'string', aliases: ['Stakeholder First Name', 'First Name'] },
  lastName: { type: 'string', aliases: ['Stakeholder Last Name', 'Last Name'] },
  email: { type: 'email', aliases: ['Stakeholder Email', 'Email'] },
  phoneNumber: { type: 'phone', aliases: ['Stakeholder Phone', 'Phone'] },
  jobTitle: { type: 'string', aliases: ['Job Title', 'Title', 'Role'] },
  ownershipType: { type: 'enum', aliases: ['Ownership Type'] },
  citizenship: { type: 'country', aliases: ['Citizenship', 'Country of Citizenship'] },
  idType: { type: 'enum', aliases: ['ID Type', 'Identification Type'] },
  idNumber: { type: 'string', aliases: ['ID Number', 'License Number'] },
  taxIdType: { type: 'enum', aliases: ['Tax ID Type'] },
  taxIdNumber: { type: 'taxId', aliases: ['SSN', 'Tax ID', 'Tax ID Number'] },
  proofOfIdentityType: { type: 'enum', aliases: ['Proof of Identity'] },
  proofOfAddressType: { type: 'enum', aliases: ['Proof of Address'] },
  countryOfIssuance: { type: 'country', aliases: ['Country of Issuance'] },
  ownershipPercentage: { type: 'percentage', aliases: ['Ownership %', 'Ownership Percentage'] },
  dateOfBirth: { type: 'date', aliases: ['Date of Birth', 'DOB'] },
  isApplicationSigner: { type: 'boolean', aliases: ['Application Signer', 'Is Signer'] },
  name: { type: 'string', aliases: ['Full Name', 'Name'] },
};

function classifyAddressSection(parentKey: string): BusinessSection {
  if (/bank/i.test(parentKey)) return 'Banking';
  if (/mailing/i.test(parentKey)) return 'Address';
  if (/legal/i.test(parentKey)) return 'Address';
  if (/stakeholder/i.test(parentKey)) return 'Stakeholder';
  return 'Address';
}

function stringifyValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Produce a flat inventory of source fields from the submission JSON. Only
 * known business-meaningful keys are emitted; the raw envelope isn't
 * reproduced.
 */
export function buildSourceFieldInventory(
  submission: unknown,
  options: BuildSourceFieldInventoryOptions = {},
): SourceField[] {
  const fields: SourceField[] = [];
  const normalized = normalizeSampleApplication(submission);
  const md = normalized.merchantData;
  const push = (
    keyPath: string,
    value: unknown,
    type: NormalizedTypeHint,
    section: BusinessSection,
    aliases: string[],
  ) => {
    if (value === undefined) return;
    const originalRedacted = isRedactedSampleValue(value);
    const overrideValue = originalRedacted ? options.valueOverrides?.[keyPath] : undefined;
    const effectiveValue = overrideValue ?? value;
    const sample = stringifyValue(effectiveValue);
    const redacted = isRedactedSampleValue(effectiveValue);
    fields.push({
      keyPath,
      value: effectiveValue,
      valueSample: sample.length > 120 ? sample.slice(0, 117) + '...' : sample,
      typeHint: type,
      businessSection: section,
      redacted,
      valueSource: overrideValue ? 'pdf_confirmed_mhtml' : 'json',
      promptAliases: aliases,
    });
  };

  for (const [k, spec] of Object.entries(MERCHANT_KEY_MAP)) {
    if (!(k in md)) continue;
    push(`merchantData.${k}`, (md as Record<string, unknown>)[k], spec.type, spec.section, spec.aliases);
  }

  // Address blocks.
  for (const addrKey of ['bankAddress', 'registeredLegalAddress', 'businessMailingAddress']) {
    const addr = (md as Record<string, unknown>)[addrKey] as Record<string, unknown> | undefined;
    if (!addr) continue;
    const section = classifyAddressSection(addrKey);
    for (const [k, v] of Object.entries(addr)) {
      const spec = ADDRESS_KEY_MAP[k];
      if (!spec) continue;
      push(
        `merchantData.${addrKey}.${k}`,
        v,
        spec.type,
        section,
        spec.aliases.map((a) => `${addrKey === 'bankAddress' ? 'Bank ' : ''}${a}`.trim()),
      );
    }
  }

  // Main point of contact.
  const poc = (md as Record<string, unknown>).mainPointOfContact as Record<string, unknown> | undefined;
  if (poc) {
    for (const [k, v] of Object.entries(poc)) {
      const spec = CONTACT_KEY_MAP[k];
      if (!spec) continue;
      push(
        `merchantData.mainPointOfContact.${k}`,
        v,
        spec.type,
        'Contact',
        spec.aliases.map((a) => `Contact ${a}`),
      );
    }
  }

  // Stakeholders.
  const stakeholders = (md as Record<string, unknown>).stakeholders as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(stakeholders)) {
    stakeholders.forEach((sh, idx) => {
      const prefix = `merchantData.stakeholders[${idx}]`;
      for (const [k, v] of Object.entries(sh)) {
        if (k === 'address') {
          const addr = v as Record<string, unknown>;
          for (const [ak, av] of Object.entries(addr ?? {})) {
            const aspec = ADDRESS_KEY_MAP[ak];
            if (!aspec) continue;
            push(
              `${prefix}.address.${ak}`,
              av,
              aspec.type,
              'Stakeholder',
              aspec.aliases.map((a) => `Stakeholder ${a}`),
            );
          }
          continue;
        }
        const spec = STAKEHOLDER_KEY_MAP[k];
        if (!spec) continue;
        push(`${prefix}.${k}`, v, spec.type, 'Stakeholder', spec.aliases);
      }
    });
  }

  // Fee information: keep it shallow — only the top-level flat sell rates.
  const fees = (md as Record<string, unknown>).feeInformation as Record<string, unknown> | undefined;
  if (fees) {
    const flatFeeKeys = [
      'achSettlementFixedFee',
      'wireSettlementFixedFee',
      'settlementReturnFixedFee',
      'monthlyMaintenanceFee',
    ];
    for (const k of flatFeeKeys) {
      const entry = fees[k] as { sellRate?: unknown } | undefined;
      if (!entry || entry.sellRate === undefined) continue;
      push(`merchantData.feeInformation.${k}.sellRate`, entry.sellRate, 'currency', 'Fees', [
        k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      ]);
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// 2. Value-shape normalization for fuzzy matching
// ---------------------------------------------------------------------------

/** Generate candidate rendered-value shapes a vendor might use. */
export function renderedVariants(field: SourceField): string[] {
  if (field.redacted) return [];
  const raw = field.valueSample;
  if (!raw) return [];
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (s && s.trim()) out.add(s.trim());
  };
  add(raw);

  switch (field.typeHint) {
    case 'phone': {
      const digits = raw.replace(/\D/g, '');
      add(digits);
      if (digits.length === 11 && digits.startsWith('1')) {
        const core = digits.slice(1);
        add('+1' + core);
        add('+' + digits);
        add(`(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`);
        add(`${core.slice(0, 3)}-${core.slice(3, 6)}-${core.slice(6)}`);
      } else if (digits.length === 10) {
        add(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
        add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
        add('+1' + digits);
      }
      break;
    }
    case 'currency': {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        add(n.toLocaleString('en-US'));
        add(n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        add('$' + n.toLocaleString('en-US'));
        add('$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        add(n.toFixed(2));
      }
      break;
    }
    case 'percentage': {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        add(String(n));
        add(n.toFixed(0) + '%');
        add(n.toFixed(2) + '%');
      }
      break;
    }
    case 'date': {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (m) {
        const [, y, mo, d] = m;
        add(`${y}/${mo}/${d}`);
        add(`${mo}/${d}/${y}`);
        add(`${Number(mo)}/${Number(d)}/${y}`);
        add(`${mo}-${d}-${y}`);
        add(`${y}${mo}${d}`);
      }
      break;
    }
    case 'boolean': {
      add(raw === 'true' ? 'Yes' : 'No');
      add(raw === 'true' ? 'On' : 'Off');
      break;
    }
    case 'enum': {
      // Vendor translations commonly re-cap enum values.
      add(raw.charAt(0).toUpperCase() + raw.slice(1));
      add(raw.toUpperCase());
      const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2');
      add(spaced);
      add(spaced.charAt(0).toUpperCase() + spaced.slice(1));
      if (raw === 'ein') add('EIN');
      if (raw === 'ssn') add('SSN');
      if (raw === 'llc') add('LLC');
      if (raw === 'ach') add('ACH');
      if (raw === 'checking') add('Checking');
      if (raw === 'savings') add('Savings');
      if (raw === 'driverLicense') add('Driver License');
      if (raw === 'bankLetter') add('Bank Letter');
      if (raw === 'businessLicense') add('Business License');
      if (raw === 'utilityBill') add('Utility Bill');
      break;
    }
    case 'state':
    case 'country': {
      add(raw.toUpperCase());
      break;
    }
    default:
      break;
  }
  return Array.from(out);
}

function normalizeForCompare(v: string): string {
  return v.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// 3. Alignment
// ---------------------------------------------------------------------------

export type AlignmentMethod =
  | 'exact_value'
  | 'normalized_value'
  | 'format_variant'
  | 'layout_cell'
  | 'substring'
  | 'unmatched';

export interface AlignmentRow {
  jsonKeyPath: string;
  jsonFieldFamily: BusinessSection;
  jsonValueSample: string;
  jsonTypeHint: NormalizedTypeHint;
  matchedTabGuid: string | null;
  matchedRenderedValue: string | null;
  candidateRenderedPrompt: string | null;
  candidateDocuSignFieldFamily: MhtmlTabType | null;
  tabPageIndex: number | null;
  tabOrdinalOnPage: number | null;
  tabLeft: number | null;
  tabTop: number | null;
  layoutSectionHeader: string | null;
  layoutFieldLabel: string | null;
  layoutEvidenceSource: string | null;
  layoutValueShape: string | null;
  layoutNeighboringLabels: string[];
  layoutEditability: string | null;
  businessSection: BusinessSection;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchingMethod: AlignmentMethod;
  notes: string;
}

export interface AlignmentReport {
  generatedAt: string;
  source: {
    jsonPath: string;
    mhtmlPath: string;
    mhtmlSubject: string | null;
    mhtmlSnapshotRedacted: string | null;
    mhtmlPageCount: number;
    mhtmlTabCount: number;
    mhtmlCountsByType: Record<string, number>;
  };
  totals: {
    jsonFields: number;
    matchedFields: number;
    unmatchedJsonFields: number;
    unmatchedRenderedValues: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  rows: AlignmentRow[];
  layoutEvidence: FieldCellEvidence[];
  unmatchedRenderedValues: Array<{
    tabGuid: string;
    dataType: MhtmlTabType;
    renderedValue: string;
    pageIndex: number | null;
    ordinalOnPage: number;
  }>;
  recommendedManualConfirmations: string[];
}

function decoratorFamily(t: MhtmlTabType): BusinessSection | null {
  switch (t) {
    case 'SignHere':
    case 'DateSigned':
    case 'FullName':
      return 'Agreements / Signature';
    case 'SignerAttachment':
      return 'Attachments';
    default:
      return null;
  }
}

/**
 * Build the crosswalk. Strategy:
 *  1. Index filled MHTML tabs by several normalized value shapes.
 *  2. For each JSON field, generate variants and probe the index.
 *  3. Track which tabs got claimed so we can report unclaimed rendered values.
 */
export function buildAlignment(
  submission: unknown,
  mhtml: MhtmlParseResult,
  opts: { jsonPath: string; mhtmlPath: string; valueOverrides?: Record<string, string>; pdfText?: string | null },
): AlignmentReport {
  const jsonFields = buildSourceFieldInventory(submission, { valueOverrides: opts.valueOverrides });
  const layoutEvidence = inferBeadSampleFieldCellEvidence({ mhtml, pdfText: opts.pdfText ?? null });
  const layoutByJsonKey = new Map(
    layoutEvidence
      .filter((evidence) => evidence.jsonKeyPath)
      .map((evidence) => [evidence.jsonKeyPath!, evidence]),
  );

  // Index tabs by lowercase trimmed rendered value.  Include both the visual
  // sizer text and the underlying input[value] — the visual text is often
  // truncated to fit the tab width even though the input carries the full
  // string.
  const valueIndex = new Map<string, MhtmlTab[]>();
  const add = (key: string | null | undefined, t: MhtmlTab) => {
    if (!key) return;
    const norm = normalizeForCompare(key);
    if (!norm) return;
    const arr = valueIndex.get(norm) ?? [];
    if (!arr.includes(t)) arr.push(t);
    valueIndex.set(norm, arr);
  };
  for (const t of mhtml.tabs) {
    add(t.renderedValue, t);
    add(t.inputValue, t);
  }

  const claimed = new Set<string>(); // tabGuid set
  const rows: AlignmentRow[] = [];

  for (const f of jsonFields) {
    const variants = renderedVariants(f);
    let match: { tab: MhtmlTab; method: AlignmentMethod; variant: string } | null = null;

    // Pass 1: exact case-sensitive match on raw value.
    for (const v of variants) {
      const candidates = valueIndex.get(normalizeForCompare(v)) ?? [];
      const unclaimed = candidates.filter((c) => !claimed.has(c.tabGuid));
      if (unclaimed.length) {
        const exact = unclaimed.find((c) => c.renderedValue === v);
        if (exact) {
          match = { tab: exact, method: 'exact_value', variant: v };
          break;
        }
      }
    }
    // Pass 2: normalized (case/space-insensitive) variant match.
    if (!match) {
      for (const v of variants) {
        const candidates = valueIndex.get(normalizeForCompare(v)) ?? [];
        const unclaimed = candidates.filter((c) => !claimed.has(c.tabGuid));
        if (unclaimed.length) {
          match = {
            tab: unclaimed[0],
            method: v === f.valueSample ? 'normalized_value' : 'format_variant',
            variant: v,
          };
          break;
        }
      }
    }
    // Pass 3: prefix — rendered value is a *prefix* of the JSON value (or
    // vice versa) for strings >= 8 chars.  DocuSign tabs sometimes truncate
    // long values to fit the visible tab width.
    if (!match && f.valueSample.length >= 8 && (f.typeHint === 'string' || f.typeHint === 'url' || f.typeHint === 'email')) {
      const needle = normalizeForCompare(f.valueSample);
      for (const [key, tabs] of valueIndex) {
        if (key.length < 8) continue;
        const unclaimed = tabs.filter((c) => !claimed.has(c.tabGuid));
        if (!unclaimed.length) continue;
        if (needle.startsWith(key) || key.startsWith(needle)) {
          match = { tab: unclaimed[0], method: 'format_variant', variant: f.valueSample };
          break;
        }
      }
    }
    // Pass 4: substring — only for long string values to avoid false positives.
    if (!match && f.valueSample.length >= 6 && f.typeHint !== 'boolean' && f.typeHint !== 'enum') {
      const needle = normalizeForCompare(f.valueSample);
      for (const [key, tabs] of valueIndex) {
        if (key.length < needle.length) continue;
        if (!key.includes(needle)) continue;
        const unclaimed = tabs.filter((c) => !claimed.has(c.tabGuid));
        if (unclaimed.length) {
          match = { tab: unclaimed[0], method: 'substring', variant: f.valueSample };
          break;
        }
      }
    }

    const layout = layoutByJsonKey.get(f.keyPath) ?? null;
    if (!match && layout) {
      const layoutTab = mhtml.tabs.find((tab) => tab.tabGuid === layout.tabGuid) ?? null;
      if (layoutTab && !claimed.has(layoutTab.tabGuid)) {
        match = { tab: layoutTab, method: 'layout_cell', variant: layout.fieldLabel };
      }
    }

    if (match) {
      claimed.add(match.tab.tabGuid);
      const decFamily = decoratorFamily(match.tab.dataType);
      const conf: 'high' | 'medium' | 'low' =
        match.method === 'exact_value' || match.method === 'layout_cell'
          ? 'high'
          : match.method === 'substring'
            ? 'low'
            : 'medium';
      rows.push({
        jsonKeyPath: f.keyPath,
        jsonFieldFamily: f.businessSection,
        jsonValueSample: f.valueSample,
        jsonTypeHint: f.typeHint,
        matchedTabGuid: match.tab.tabGuid,
        matchedRenderedValue: match.tab.renderedValue,
        candidateRenderedPrompt: match.tab.decoratorLabel,
        candidateDocuSignFieldFamily: match.tab.dataType,
        tabPageIndex: match.tab.pageIndex,
        tabOrdinalOnPage: match.tab.ordinalOnPage,
        tabLeft: match.tab.left,
        tabTop: match.tab.top,
        layoutSectionHeader: layout?.sectionHeader ?? null,
        layoutFieldLabel: layout?.fieldLabel ?? null,
        layoutEvidenceSource: layout?.evidenceSource ?? null,
        layoutValueShape: layout?.layoutValueShape ?? null,
        layoutNeighboringLabels: layout?.neighboringLabels ?? [],
        layoutEditability: layout?.editability ?? null,
        businessSection: decFamily ?? f.businessSection,
        confidence: conf,
        matchingMethod: match.method,
        notes:
          match.method === 'layout_cell'
            ? `matched using PDF/MHTML field-cell evidence (${layout?.sectionHeader ?? 'unknown section'} > ${layout?.fieldLabel ?? 'unknown field'})`
            : f.valueSource === 'pdf_confirmed_mhtml'
            ? 'matched using a PDF-confirmed MHTML value for a redacted JSON field'
            : match.method === 'substring'
              ? 'substring of rendered value'
              : '',
      });
    } else {
      rows.push({
        jsonKeyPath: f.keyPath,
        jsonFieldFamily: f.businessSection,
        jsonValueSample: f.valueSample,
        jsonTypeHint: f.typeHint,
        matchedTabGuid: null,
        matchedRenderedValue: null,
        candidateRenderedPrompt: null,
        candidateDocuSignFieldFamily: null,
        tabPageIndex: null,
        tabOrdinalOnPage: null,
        tabLeft: null,
        tabTop: null,
        layoutSectionHeader: layout?.sectionHeader ?? null,
        layoutFieldLabel: layout?.fieldLabel ?? null,
        layoutEvidenceSource: layout?.evidenceSource ?? null,
        layoutValueShape: layout?.layoutValueShape ?? null,
        layoutNeighboringLabels: layout?.neighboringLabels ?? [],
        layoutEditability: layout?.editability ?? null,
        businessSection: f.businessSection,
        confidence: 'none',
        matchingMethod: 'unmatched',
        notes:
          f.valueSource === 'pdf_confirmed_mhtml'
            ? 'no rendered value matched after applying a PDF-confirmed MHTML fallback'
            : 'no rendered value matched any variant',
      });
    }
  }

  // Rendered values with no JSON claim.
  const unmatchedRenderedValues = mhtml.tabs
    .filter((t) => t.renderedValue && !claimed.has(t.tabGuid))
    .map((t) => ({
      tabGuid: t.tabGuid,
      dataType: t.dataType,
      renderedValue: t.renderedValue!,
      pageIndex: t.pageIndex,
      ordinalOnPage: t.ordinalOnPage,
    }));

  const matched = rows.filter((r) => r.matchingMethod !== 'unmatched');
  const totals = {
    jsonFields: jsonFields.length,
    matchedFields: matched.length,
    unmatchedJsonFields: jsonFields.length - matched.length,
    unmatchedRenderedValues: unmatchedRenderedValues.length,
    highConfidence: rows.filter((r) => r.confidence === 'high').length,
    mediumConfidence: rows.filter((r) => r.confidence === 'medium').length,
    lowConfidence: rows.filter((r) => r.confidence === 'low').length,
  };

  // Reviewer nudges.
  const recommendedManualConfirmations: string[] = [];
  for (const r of rows) {
    if (r.confidence === 'low') {
      recommendedManualConfirmations.push(
        `Confirm ${r.jsonKeyPath} -> tab ${r.matchedTabGuid?.slice(0, 8)}... (${r.candidateDocuSignFieldFamily}) by substring`,
      );
    }
  }
  if (unmatchedRenderedValues.length) {
    recommendedManualConfirmations.push(
      `Review ${unmatchedRenderedValues.length} rendered tab value(s) with no JSON field to classify vendor-added fields`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    source: {
      jsonPath: opts.jsonPath,
      mhtmlPath: opts.mhtmlPath,
      mhtmlSubject: mhtml.subject,
      mhtmlSnapshotRedacted: mhtml.snapshotLocationRedacted,
      mhtmlPageCount: mhtml.pageCount,
      mhtmlTabCount: mhtml.tabs.length,
      mhtmlCountsByType: mhtml.countsByType,
    },
    totals,
    rows,
    layoutEvidence,
    unmatchedRenderedValues,
    recommendedManualConfirmations,
  };
}

// ---------------------------------------------------------------------------
// 4. Markdown rendering
// ---------------------------------------------------------------------------

function truncate(s: string | null, n: number): string {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

export function renderAlignmentMarkdown(report: AlignmentReport): string {
  const { totals, rows, unmatchedRenderedValues, source } = report;
  const lines: string[] = [];
  lines.push('# Sample field alignment (offline, SAFE MODE)');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Source JSON: \`${source.jsonPath}\``);
  lines.push(`Source MHTML: \`${source.mhtmlPath}\``);
  if (source.mhtmlSubject) lines.push(`Snapshot subject: ${source.mhtmlSubject}`);
  if (source.mhtmlSnapshotRedacted) lines.push(`Snapshot URL (redacted): \`${source.mhtmlSnapshotRedacted}\``);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- JSON fields inventoried: ${totals.jsonFields}`);
  lines.push(`- Matched: ${totals.matchedFields}`);
  lines.push(`- Unmatched JSON fields: ${totals.unmatchedJsonFields}`);
  lines.push(`- Unmatched rendered values: ${totals.unmatchedRenderedValues}`);
  lines.push(`- Confidence: high=${totals.highConfidence}, medium=${totals.mediumConfidence}, low=${totals.lowConfidence}`);
  lines.push('');
  lines.push(`- MHTML pages: ${source.mhtmlPageCount}`);
  lines.push(`- MHTML tabs: ${source.mhtmlTabCount}`);
  const typeRow = Object.entries(source.mhtmlCountsByType)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  lines.push(`- MHTML tabs by type: ${typeRow}`);
  lines.push('');

  lines.push('## Matched fields');
  lines.push('');
  lines.push('| JSON key | Section | Type | Value | Tab family | Page | Tab GUID | Decorator | Confidence | Method |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (r.matchingMethod === 'unmatched') continue;
    lines.push(
      `| \`${r.jsonKeyPath}\` | ${r.businessSection} | ${r.jsonTypeHint} | ${truncate(r.jsonValueSample, 40)} | ${r.candidateDocuSignFieldFamily ?? ''} | ${r.tabPageIndex ?? ''} | \`${r.matchedTabGuid?.slice(0, 8) ?? ''}…\` | ${truncate(r.candidateRenderedPrompt, 40)} | ${r.confidence} | ${r.matchingMethod} |`,
    );
  }
  lines.push('');

  lines.push('## Highest-confidence mappings (reviewer shortlist)');
  lines.push('');
  const highs = rows.filter((r) => r.confidence === 'high');
  if (!highs.length) {
    lines.push('_(none)_');
  } else {
    for (const r of highs) {
      lines.push(
        `- \`${r.jsonKeyPath}\` (${r.businessSection}) → page ${r.tabPageIndex}, ${r.candidateDocuSignFieldFamily}, value \`${truncate(r.jsonValueSample, 40)}\``,
      );
    }
  }
  lines.push('');

  lines.push('## Unmatched JSON fields');
  lines.push('');
  const unmatchedFields = rows.filter((r) => r.matchingMethod === 'unmatched');
  if (!unmatchedFields.length) {
    lines.push('_(none)_');
  } else {
    lines.push('| JSON key | Section | Type | Value | Notes |');
    lines.push('|---|---|---|---|---|');
    for (const r of unmatchedFields) {
      lines.push(
        `| \`${r.jsonKeyPath}\` | ${r.businessSection} | ${r.jsonTypeHint} | ${truncate(r.jsonValueSample, 40)} | ${r.notes} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Unmatched rendered values');
  lines.push('');
  if (!unmatchedRenderedValues.length) {
    lines.push('_(none)_');
  } else {
    lines.push('| Page | Ordinal | Type | Rendered value | Tab GUID |');
    lines.push('|---|---|---|---|---|');
    for (const u of unmatchedRenderedValues) {
      lines.push(
        `| ${u.pageIndex ?? ''} | ${u.ordinalOnPage} | ${u.dataType} | ${truncate(u.renderedValue, 60)} | \`${u.tabGuid.slice(0, 8)}…\` |`,
      );
    }
  }
  lines.push('');

  if (report.recommendedManualConfirmations.length) {
    lines.push('## Recommended manual confirmations');
    lines.push('');
    for (const r of report.recommendedManualConfirmations) lines.push(`- ${r}`);
    lines.push('');
  }

  if (report.layoutEvidence.length) {
    lines.push('## Field-cell layout evidence');
    lines.push('');
    lines.push('| JSON key | Layout section | Field label | Page | Ordinal | Coordinates | Shape | Source |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const evidence of report.layoutEvidence) {
      const jsonKey = evidence.jsonKeyPath ?? '';
      lines.push(
        `| ${jsonKey} | ${evidence.sectionHeader ?? ''} | ${evidence.fieldLabel} | ${evidence.pageIndex ?? ''} | ${evidence.ordinalOnPage ?? ''} | ${evidence.tabLeft ?? ''},${evidence.tabTop ?? ''} | ${evidence.layoutValueShape} | ${evidence.evidenceSource} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 5. Live-report enrichment seam
// ---------------------------------------------------------------------------

/**
 * Compact, stable record that future live-discovery code can consume to
 * enrich a report with real business labels and sections.  Keyed by the
 * tab GUID that live DocuSign pages expose on `tab-form-element-{guid}`
 * inputs — plus a positional fingerprint for template-level reuse.
 */
export interface EnrichmentRecord {
  tabGuid: string;
  positionalFingerprint: string; // `page:pageIndex|type|ord:ordinalOnPage`
  tabLeft: number | null;
  tabTop: number | null;
  jsonKeyPath: string;
  jsonFieldFamily: BusinessSection;
  jsonTypeHint: NormalizedTypeHint;
  docusignFieldFamily: MhtmlTabType | null;
  confidence: 'high' | 'medium' | 'low';
  suggestedDisplayName: string;
  suggestedBusinessSection: BusinessSection;
  layoutSectionHeader?: string | null;
  layoutFieldLabel?: string | null;
  layoutValueShape?: string | null;
  layoutEvidenceSource?: string | null;
  layoutNeighboringLabels?: string[];
  layoutEditability?: string | null;
}

export interface EnrichmentBundle {
  schemaVersion: 1;
  generatedAt: string;
  sourceJson: string;
  sourceMhtml: string;
  records: EnrichmentRecord[];
}

export function buildEnrichmentBundle(report: AlignmentReport): EnrichmentBundle {
  const records: EnrichmentRecord[] = [];
  for (const r of report.rows) {
    if (!r.matchedTabGuid || r.confidence === 'none') continue;
    const fingerprint = `page:${r.tabPageIndex ?? '?'}|${r.candidateDocuSignFieldFamily ?? 'Unknown'}|ord:${r.tabOrdinalOnPage ?? '?'}`;
    records.push({
      tabGuid: r.matchedTabGuid,
      positionalFingerprint: fingerprint,
      tabLeft: r.tabLeft,
      tabTop: r.tabTop,
      jsonKeyPath: r.jsonKeyPath,
      jsonFieldFamily: r.jsonFieldFamily,
      jsonTypeHint: r.jsonTypeHint,
      docusignFieldFamily: r.candidateDocuSignFieldFamily,
      confidence: r.confidence as 'high' | 'medium' | 'low',
      suggestedDisplayName: r.layoutFieldLabel
        ? displayNameFromLayout(r.jsonKeyPath, r.layoutFieldLabel, r.layoutSectionHeader)
        : keyPathToDisplayName(r.jsonKeyPath),
      suggestedBusinessSection: r.businessSection,
      layoutSectionHeader: r.layoutSectionHeader,
      layoutFieldLabel: r.layoutFieldLabel,
      layoutValueShape: r.layoutValueShape,
      layoutEvidenceSource: r.layoutEvidenceSource,
      layoutNeighboringLabels: r.layoutNeighboringLabels,
      layoutEditability: r.layoutEditability,
    });
  }
  return {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    sourceJson: report.source.jsonPath,
    sourceMhtml: report.source.mhtmlPath,
    records,
  };
}

function displayNameFromLayout(keyPath: string, fieldLabel: string, sectionHeader: string | null): string {
  const label = fieldLabel.replace(/\s*\(optional\)\s*$/i, '').trim();
  if (/^zip$/i.test(label) && sectionHeader) return `${sectionHeader} ZIP`;
  return label || keyPathToDisplayName(keyPath);
}

function keyPathToDisplayName(keyPath: string): string {
  // Strip "merchantData." prefix and array index noise; humanize camelCase.
  const cleaned = keyPath.replace(/^merchantData\./, '').replace(/\[(\d+)\]/g, ' #$1');
  const parts = cleaned.split('.');
  const last = parts[parts.length - 1] ?? cleaned;
  const humanized = last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bEin\b/g, 'EIN')
    .replace(/\bDba\b/g, 'DBA')
    .replace(/\bMcc\b/g, 'MCC')
    .replace(/\bNaics\b/g, 'NAICS');
  const prefix = parts.slice(0, -1).join(' › ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return prefix ? `${prefix} › ${humanized.charAt(0).toUpperCase() + humanized.slice(1)}` : humanized.charAt(0).toUpperCase() + humanized.slice(1);
}
