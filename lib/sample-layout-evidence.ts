import type { MhtmlParseResult, MhtmlTab, MhtmlTabType } from './mhtml-parser';
import { detectValueShape, type ValueShape } from './mapping-calibration';

export type LayoutEvidenceSource = 'positioned-text' | 'pdf-text-sequence';
export type LayoutEditability = 'editable' | 'read_only' | 'unknown';

export interface PositionedLayoutText {
  pageIndex: number | null;
  text: string;
  left: number;
  top: number;
  width?: number | null;
  height?: number | null;
  isSectionHeader?: boolean;
}

export interface FieldCellEvidence {
  tabGuid: string;
  positionalFingerprint: string;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  tabLeft: number | null;
  tabTop: number | null;
  docusignFieldFamily: MhtmlTabType | null;
  jsonKeyPath: string | null;
  jsonTypeHint: string | null;
  businessSection: string | null;
  sectionHeader: string | null;
  fieldLabel: string;
  suggestedDisplayName: string;
  neighboringLabels: string[];
  layoutValueShape: ValueShape;
  editability: LayoutEditability;
  evidenceSource: LayoutEvidenceSource;
  confidence: 'high' | 'medium' | 'low';
}

interface BeadPageOneCellSpec {
  ordinalOnPage: number;
  jsonKeyPath: string;
  jsonTypeHint: string;
  businessSection: string;
  sectionHeader: string;
  fieldLabel: string;
  suggestedDisplayName?: string;
}

const BEAD_PAGE_ONE_FIELD_CELLS: BeadPageOneCellSpec[] = [
  {
    ordinalOnPage: 4,
    jsonKeyPath: 'merchantData.registeredName',
    jsonTypeHint: 'string',
    businessSection: 'Business Details',
    sectionHeader: 'General',
    fieldLabel: 'Registered Name',
  },
  {
    ordinalOnPage: 5,
    jsonKeyPath: 'merchantData.registrationDate',
    jsonTypeHint: 'date',
    businessSection: 'Business Details',
    sectionHeader: 'General',
    fieldLabel: 'Registration Date',
  },
  {
    ordinalOnPage: 6,
    jsonKeyPath: 'merchantData.dbaName',
    jsonTypeHint: 'string',
    businessSection: 'Business Details',
    sectionHeader: 'General',
    fieldLabel: 'DBA Name (optional)',
    suggestedDisplayName: 'DBA Name',
  },
  {
    ordinalOnPage: 7,
    jsonKeyPath: 'merchantData.proofOfBusinessType',
    jsonTypeHint: 'enum',
    businessSection: 'Attachments',
    sectionHeader: 'General',
    fieldLabel: 'Proof of Business Type',
    suggestedDisplayName: 'Proof Of Business Type',
  },
  {
    ordinalOnPage: 8,
    jsonKeyPath: 'merchantData.federalTaxIdType',
    jsonTypeHint: 'enum',
    businessSection: 'Business Details',
    sectionHeader: 'General',
    fieldLabel: 'Federal Tax ID Type',
  },
  {
    ordinalOnPage: 10,
    jsonKeyPath: 'merchantData.legalEntityType',
    jsonTypeHint: 'enum',
    businessSection: 'Business Details',
    sectionHeader: 'General',
    fieldLabel: 'Legal Entity Type',
  },
  {
    ordinalOnPage: 17,
    jsonKeyPath: 'merchantData.businessDescription',
    jsonTypeHint: 'string',
    businessSection: 'Business Details',
    sectionHeader: 'General',
    fieldLabel: 'Business Description',
  },
  {
    ordinalOnPage: 35,
    jsonKeyPath: 'merchantData.registeredLegalAddress.line1',
    jsonTypeHint: 'string',
    businessSection: 'Address',
    sectionHeader: 'Registered Legal Address',
    fieldLabel: 'Address Line 1',
    suggestedDisplayName: 'Registered Legal Address Line 1',
  },
  {
    ordinalOnPage: 37,
    jsonKeyPath: 'merchantData.proofOfAddressType',
    jsonTypeHint: 'enum',
    businessSection: 'Attachments',
    sectionHeader: 'Registered Legal Address',
    fieldLabel: 'Proof of Address Type',
    suggestedDisplayName: 'Proof Of Address Type',
  },
  {
    ordinalOnPage: 39,
    jsonKeyPath: 'merchantData.registeredLegalAddress.city',
    jsonTypeHint: 'string',
    businessSection: 'Address',
    sectionHeader: 'Registered Legal Address',
    fieldLabel: 'City',
    suggestedDisplayName: 'Registered Legal Address City',
  },
  {
    ordinalOnPage: 41,
    jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
    jsonTypeHint: 'postalCode',
    businessSection: 'Address',
    sectionHeader: 'Registered Legal Address',
    fieldLabel: 'ZIP',
    suggestedDisplayName: 'Registered Legal Address ZIP',
  },
  {
    ordinalOnPage: 47,
    jsonKeyPath: 'merchantData.businessMailingAddress.line1',
    jsonTypeHint: 'string',
    businessSection: 'Address',
    sectionHeader: 'Physical Operating Address',
    fieldLabel: 'Address Line 1',
    suggestedDisplayName: 'Physical Operating Address Line 1',
  },
  {
    ordinalOnPage: 49,
    jsonKeyPath: 'merchantData.businessMailingAddress.city',
    jsonTypeHint: 'string',
    businessSection: 'Address',
    sectionHeader: 'Physical Operating Address',
    fieldLabel: 'City',
    suggestedDisplayName: 'Physical Operating Address City',
  },
  {
    ordinalOnPage: 51,
    jsonKeyPath: 'merchantData.businessMailingAddress.postalCode',
    jsonTypeHint: 'postalCode',
    businessSection: 'Address',
    sectionHeader: 'Physical Operating Address',
    fieldLabel: 'ZIP',
    suggestedDisplayName: 'Physical Operating Address ZIP',
  },
  {
    ordinalOnPage: 52,
    jsonKeyPath: 'merchantData.locationName',
    jsonTypeHint: 'string',
    businessSection: 'Business Details',
    sectionHeader: 'Location Details',
    fieldLabel: 'Location Name',
  },
  {
    ordinalOnPage: 53,
    jsonKeyPath: 'merchantData.locationBusinessType',
    jsonTypeHint: 'enum',
    businessSection: 'Business Details',
    sectionHeader: 'Location Details',
    fieldLabel: 'Business Type',
  },
  {
    ordinalOnPage: 61,
    jsonKeyPath: 'merchantData.accountType',
    jsonTypeHint: 'enum',
    businessSection: 'Banking',
    sectionHeader: 'Bank Info',
    fieldLabel: 'Account Type',
    suggestedDisplayName: 'Bank Account Type',
  },
  {
    ordinalOnPage: 62,
    jsonKeyPath: 'merchantData.proofOfBankAccountType',
    jsonTypeHint: 'enum',
    businessSection: 'Attachments',
    sectionHeader: 'Bank Info',
    fieldLabel: 'Proof of Bank Account Type',
    suggestedDisplayName: 'Proof Of Bank Account Type',
  },
  {
    ordinalOnPage: 63,
    jsonKeyPath: 'merchantData.bankAddress.line1',
    jsonTypeHint: 'string',
    businessSection: 'Banking',
    sectionHeader: 'Bank Address',
    fieldLabel: 'Bank Address Line 1',
    suggestedDisplayName: 'Bank Address Line 1',
  },
  {
    ordinalOnPage: 64,
    jsonKeyPath: 'merchantData.bankAddress.city',
    jsonTypeHint: 'string',
    businessSection: 'Banking',
    sectionHeader: 'Bank Address',
    fieldLabel: 'Bank Address City',
    suggestedDisplayName: 'Bank Address City',
  },
  {
    ordinalOnPage: 67,
    jsonKeyPath: 'merchantData.bankAddress.postalCode',
    jsonTypeHint: 'postalCode',
    businessSection: 'Banking',
    sectionHeader: 'Bank Address',
    fieldLabel: 'ZIP',
    suggestedDisplayName: 'Bank Address ZIP',
  },
];

const REQUIRED_BEAD_LABELS = [
  'General',
  'Registered Name',
  'DBA Name',
  'Business Description',
  'Registered Legal Address',
  'Physical Operating Address',
  'Bank Address',
  'ZIP',
];

export function inferFieldCellEvidenceFromPositionedText(input: {
  tabs: MhtmlTab[];
  textBlocks: PositionedLayoutText[];
  evidenceSource?: LayoutEvidenceSource;
}): FieldCellEvidence[] {
  const evidenceSource = input.evidenceSource ?? 'positioned-text';
  const labels = input.textBlocks.filter((block) => cleanText(block.text) && !block.isSectionHeader);
  const sections = input.textBlocks.filter((block) => cleanText(block.text) && block.isSectionHeader);

  return input.tabs.flatMap((tab) => {
    const label = nearestLabelForTab(tab, labels);
    if (!label) return [];
    const section = nearestSectionForTab(tab, sections);
    return [buildEvidence({
      tab,
      jsonKeyPath: null,
      jsonTypeHint: null,
      businessSection: null,
      sectionHeader: section?.text ?? null,
      fieldLabel: label.text,
      suggestedDisplayName: label.text,
      neighboringLabels: neighboringLabels(label, labels),
      evidenceSource,
      confidence: section ? 'high' : 'medium',
    })];
  });
}

export function inferBeadSampleFieldCellEvidence(input: {
  mhtml: MhtmlParseResult;
  pdfText?: string | null;
}): FieldCellEvidence[] {
  if (!input.pdfText || !looksLikeBeadPageOne(input.pdfText)) return [];
  const pageOneTabs = input.mhtml.tabs.filter((tab) => tab.pageIndex === 1);

  return BEAD_PAGE_ONE_FIELD_CELLS.flatMap((spec, index) => {
    const tab = pageOneTabs.find((candidate) => candidate.ordinalOnPage === spec.ordinalOnPage) ?? null;
    if (!tab) return [];
    const neighbors = [
      BEAD_PAGE_ONE_FIELD_CELLS[index - 1]?.fieldLabel,
      BEAD_PAGE_ONE_FIELD_CELLS[index + 1]?.fieldLabel,
    ].filter((label): label is string => Boolean(label));
    return [buildEvidence({
      tab,
      jsonKeyPath: spec.jsonKeyPath,
      jsonTypeHint: spec.jsonTypeHint,
      businessSection: spec.businessSection,
      sectionHeader: spec.sectionHeader,
      fieldLabel: spec.fieldLabel,
      suggestedDisplayName: spec.suggestedDisplayName ?? spec.fieldLabel,
      neighboringLabels: neighbors,
      evidenceSource: 'pdf-text-sequence',
      confidence: 'high',
    })];
  });
}

function buildEvidence(input: {
  tab: MhtmlTab;
  jsonKeyPath: string | null;
  jsonTypeHint: string | null;
  businessSection: string | null;
  sectionHeader: string | null;
  fieldLabel: string;
  suggestedDisplayName: string;
  neighboringLabels: string[];
  evidenceSource: LayoutEvidenceSource;
  confidence: 'high' | 'medium' | 'low';
}): FieldCellEvidence {
  return {
    tabGuid: input.tab.tabGuid,
    positionalFingerprint: positionalFingerprint(input.tab),
    pageIndex: input.tab.pageIndex,
    ordinalOnPage: input.tab.ordinalOnPage,
    tabLeft: input.tab.left,
    tabTop: input.tab.top,
    docusignFieldFamily: input.tab.dataType,
    jsonKeyPath: input.jsonKeyPath,
    jsonTypeHint: input.jsonTypeHint,
    businessSection: input.businessSection,
    sectionHeader: input.sectionHeader,
    fieldLabel: cleanText(input.fieldLabel),
    suggestedDisplayName: cleanText(input.suggestedDisplayName),
    neighboringLabels: input.neighboringLabels.map(cleanText).filter(Boolean),
    layoutValueShape: detectValueShape(input.tab.inputValue ?? input.tab.renderedValue ?? null),
    editability: editabilityForTab(input.tab),
    evidenceSource: input.evidenceSource,
    confidence: input.confidence,
  };
}

function nearestLabelForTab(tab: MhtmlTab, labels: PositionedLayoutText[]): PositionedLayoutText | null {
  const samePage = labels.filter((label) => label.pageIndex === tab.pageIndex);
  const candidates = samePage
    .map((label) => {
      const verticalDistance = (tab.top ?? 0) - label.top;
      const width = label.width ?? 160;
      const horizontalMiss = Math.max(label.left - (tab.left ?? 0), (tab.left ?? 0) - (label.left + width));
      return { label, verticalDistance, horizontalMiss: Math.max(0, horizontalMiss) };
    })
    .filter((entry) => entry.verticalDistance >= 0 && entry.verticalDistance <= 40 && entry.horizontalMiss <= 40)
    .sort((a, b) => a.verticalDistance - b.verticalDistance || a.horizontalMiss - b.horizontalMiss);
  return candidates[0]?.label ?? null;
}

function nearestSectionForTab(tab: MhtmlTab, sections: PositionedLayoutText[]): PositionedLayoutText | null {
  return sections
    .filter((section) => section.pageIndex === tab.pageIndex && section.top <= (tab.top ?? Number.NEGATIVE_INFINITY))
    .sort((a, b) => b.top - a.top)[0] ?? null;
}

function neighboringLabels(label: PositionedLayoutText, labels: PositionedLayoutText[]): string[] {
  return labels
    .filter((candidate) => candidate !== label && candidate.pageIndex === label.pageIndex)
    .map((candidate) => ({ candidate, distance: Math.abs(candidate.top - label.top) + Math.abs(candidate.left - label.left) / 10 }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2)
    .map((entry) => entry.candidate.text);
}

function looksLikeBeadPageOne(pdfText: string): boolean {
  const normalized = cleanText(pdfText).toLowerCase();
  return REQUIRED_BEAD_LABELS.every((label) => normalized.includes(label.toLowerCase()));
}

function positionalFingerprint(tab: MhtmlTab): string {
  return `page:${tab.pageIndex ?? '?'}|${tab.dataType ?? 'Unknown'}|ord:${tab.ordinalOnPage ?? '?'}`;
}

function editabilityForTab(tab: MhtmlTab): LayoutEditability {
  if (tab.dataType === 'SignHere' || tab.dataType === 'DateSigned' || tab.dataType === 'FullName') return 'read_only';
  if (tab.dataType === 'SignerAttachment') return 'read_only';
  return tab.ownedBySigner === false ? 'unknown' : 'editable';
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
