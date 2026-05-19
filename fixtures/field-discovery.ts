/**
 * Field discovery for the DocuSign signing frame.
 *
 * Walks the signing iframe and returns a structured description of every
 * interactive form control we can see.  Purely read-only – no clicks, no
 * fills – so it is safe to run against a live signing URL.
 */

import type { Locator } from '@playwright/test';
import { inferFieldType, type FieldTypeDefinition } from './validation-rules';
import type { FrameHost } from './signer-helpers';

export type FieldKind = 'textbox' | 'textarea' | 'combobox' | 'checkbox' | 'radio' | 'upload';

export type LocatorConfidence = 'role-with-label' | 'role-only' | 'css-fallback';

/** Where the resolved label came from.  Ordered strongest → weakest. */
export type LabelSource =
  | 'aria-label'
  | 'aria-labelledby'
  | 'label-for'
  | 'wrapping-label'
  | 'id-or-name-key'
  | 'title'
  | 'placeholder'
  | 'described-by'
  | 'row-header'
  | 'positional-prompt'
  | 'preceding-text'
  | 'helper-text'
  | 'section+row'
  | 'container-parent'
  | 'container-grandparent'
  | 'container-section'
  | 'container-preceding'
  | 'container-following'
  | 'docusign-tab-type'
  | 'enrichment-guid'
  | 'enrichment-position'
  | 'enrichment-coordinate'
  | 'none';

export type LabelConfidence = 'high' | 'medium' | 'low' | 'none';

/** Why a candidate was rejected during label resolution. */
export type LabelRejectReason =
  | 'looks-like-value'
  | 'docusign-stub'
  | 'chrome-text'
  | 'equals-field-value'
  | 'generic-docusign-tab-type'
  | 'too-short'
  | 'too-long'
  | 'pure-punctuation'
  | 'pure-digits';

export interface RejectedLabelCandidate {
  source: LabelSource;
  value: string;
  reason: LabelRejectReason;
}

/**
 * How strong the evidence is that a control is an attachment/upload widget.
 *   - `strong`: input[type=file], upload button, or an explicit DocuSign
 *     attachment tab marker on the element itself.
 *   - `weak`:   attachment-ish tokens only on distant ancestors or helper
 *     text – not enough to override a textbox/combobox classification.
 *   - `none`:   no evidence at all.
 */
export type AttachmentEvidence = 'strong' | 'weak' | 'none';

/**
 * How a control fits into the onboarding flow.  The report uses this to
 * stop treating DocuSign chrome / signature / read-only controls as though
 * they were merchant inputs.
 */
export type ControlCategory =
  | 'merchant_input'
  | 'read_only_display'
  | 'docusign_chrome'
  | 'signature_widget'
  | 'date_signed_widget'
  | 'attachment_control'
  | 'acknowledgement_checkbox'
  | 'unknown_control';

export interface LabelCandidate {
  source: LabelSource;
  value: string;
}

export type LayoutProximityDirection =
  | 'above'
  | 'below'
  | 'left'
  | 'right'
  | 'same-row'
  | 'same-column'
  | 'near-group';

export type LayoutProximityDistanceBucket = 'immediate' | 'near' | 'farther';

export type LayoutProximityAssociation = 'closest-radio' | 'multiple-radios' | 'group';

export interface LayoutProximityLabelCandidate {
  direction: LayoutProximityDirection;
  distanceBucket: LayoutProximityDistanceBucket;
  association: LayoutProximityAssociation;
  value: string;
}

export type RadioGroupPatternBucket = 'single' | 'repeated-row-group' | 'repeated-column-group' | 'mixed-group';

export type RadioAlignmentBucket = 'single' | 'horizontal' | 'vertical' | 'mixed';

export type RadioRelativeOrderBucket = 'single' | 'first' | 'middle' | 'last';

export type RadioSpacingBucket = 'tight' | 'normal' | 'far';

export type RadioShapeBucket = 'single-control' | 'compact-group' | 'spread-group';

export type RadioSharedContainerBucket = 'same-parent' | 'same-grandparent' | 'same-section' | 'mixed';

export type RadioLayerBucket = 'document-layer' | 'html-form-layout' | 'mixed';

export type RadioAttributeValueHintBucket =
  | 'address-like-token'
  | 'physical-operating-address-token'
  | 'business-physical-address-token'
  | 'operating-address-token'
  | 'mailing-address-token'
  | 'legal-address-token'
  | 'virtual-address-token'
  | 'same-token'
  | 'different-token'
  | 'yes-token'
  | 'no-token'
  | 'generated-token-pattern'
  | 'empty-value';

export type RadioTokenShapeBucket =
  | 'address-like-token'
  | 'radio-like-token'
  | 'generated-token-pattern'
  | 'docusign-token';

export type RadioWrapperDepthBucket = 'parent' | 'grandparent' | 'form-row';

export type RadioWrapperPatternBucket = 'same-wrapper-pattern' | 'distinct-wrapper-pattern' | 'mixed-wrapper-pattern';

export type RadioAttributePatternBucket = 'same-attribute-pattern' | 'distinct-attribute-pattern' | 'mixed-attribute-pattern';

export type RadioProxyTagBucket = 'label' | 'span' | 'div' | 'svg' | 'canvas' | 'button' | 'role-radio' | 'unknown';

export type RadioProxyRoleBucket = 'radio' | 'button' | 'presentation' | 'none' | 'other';

export type RadioProxyDepthBucket = 'wrapping-label' | 'for-label' | 'parent' | 'grandparent' | 'form-row' | 'association-target';

export type RadioProxyPatternBucket = 'same-proxy-pattern' | 'distinct-proxy-pattern' | 'mixed-proxy-pattern';

export type RadioReferencePatternBucket = 'same-reference-pattern' | 'distinct-reference-pattern' | 'mixed-reference-pattern';

export type RadioGraphicNodeBucket = 'svg' | 'span' | 'div' | 'label' | 'button' | 'pseudo-radio' | 'unknown';

export type RadioGraphicTokenHintBucket =
  | 'radio-like-token'
  | 'selected-token'
  | 'checked-token'
  | 'address-like-token'
  | 'physical-like-token'
  | 'operating-like-token'
  | 'business-like-token'
  | 'mailing-like-token'
  | 'legal-like-token'
  | 'virtual-like-token'
  | 'generated/generic-only-token';

export type RadioWrapperGraphicPatternBucket =
  | 'same-wrapper-graphic-pattern'
  | 'distinct-wrapper-graphic-pattern'
  | 'mixed-wrapper-graphic-pattern';

export type RadioSiblingGraphicPatternBucket =
  | 'same-direct-sibling-graphic-pattern'
  | 'distinct-direct-sibling-graphic-pattern'
  | 'mixed-direct-sibling-graphic-pattern';

export interface RadioWrapperAttributeSurface {
  depthBucket: RadioWrapperDepthBucket;
  tagName: string;
  role: string | null;
  attributeNames: string[];
  attributeNameCount: number;
  attributeNamesTruncated: boolean;
  tokenShapeBuckets: RadioTokenShapeBucket[];
  tokenShapeCount: number;
  tokenShapesTruncated: boolean;
}

export interface RadioDomAttributeSignature {
  radioAttributeNames: string[];
  radioAttributeNameCount: number;
  radioAttributeNamesTruncated: boolean;
  wrapperSurfaces: RadioWrapperAttributeSurface[];
  wrapperSurfacesTruncated: boolean;
  hasIdAttribute: boolean;
  hasNameAttribute: boolean;
  hasAriaLabel: boolean;
  hasAriaLabelledBy: boolean;
  hasAriaDescribedBy: boolean;
  hasDataAttributes: boolean;
  hasDocuSignMetadataAttributes: boolean;
  tokenShapeBuckets: RadioTokenShapeBucket[];
  tokenShapeCount: number;
  tokenShapesTruncated: boolean;
  valueHintBuckets: RadioAttributeValueHintBucket[];
  valueHintCount: number;
  valueHintsTruncated: boolean;
  wrapperPatternBucket: RadioWrapperPatternBucket;
  attributePatternBucket: RadioAttributePatternBucket;
}

export interface RadioProxyReferenceSignature {
  candidateSlot: number;
  inputVisibilityBucket: 'visible-input' | 'zero-size-or-hidden-input';
  visibleProxyCount: number;
  visibleProxyCountTruncated: boolean;
  proxyDepthBuckets: RadioProxyDepthBucket[];
  proxyDepthCount: number;
  proxyDepthsTruncated: boolean;
  proxyTagBuckets: RadioProxyTagBucket[];
  proxyTagCount: number;
  proxyTagsTruncated: boolean;
  proxyRoleBuckets: RadioProxyRoleBucket[];
  proxyRoleCount: number;
  proxyRolesTruncated: boolean;
  hasProxyClassAttribute: boolean;
  hasProxyRoleAttribute: boolean;
  hasProxyAriaLabel: boolean;
  hasProxyAriaLabelledBy: boolean;
  hasProxyAriaDescribedBy: boolean;
  hasProxyAriaControls: boolean;
  hasProxyForAttribute: boolean;
  hasProxyDataAttributes: boolean;
  hasProxyDocuSignMetadataAttributes: boolean;
  hasProxyTabIndex: boolean;
  hasForIdReference: boolean;
  forReferenceTargetExists: boolean;
  forReferenceTargetVisible: boolean;
  hasAriaLabelledByReference: boolean;
  ariaLabelledByTargetExists: boolean;
  ariaLabelledByTargetVisible: boolean;
  hasAriaDescribedByReference: boolean;
  ariaDescribedByTargetExists: boolean;
  ariaDescribedByTargetVisible: boolean;
  hasAriaControlsReference: boolean;
  ariaControlsTargetExists: boolean;
  ariaControlsTargetVisible: boolean;
  hasDataReference: boolean;
  dataReferenceTargetExists: boolean;
  dataReferenceTargetVisible: boolean;
  hasDocuSignReference: boolean;
  docuSignReferenceTargetExists: boolean;
  docuSignReferenceTargetVisible: boolean;
  tokenShapeBuckets: RadioTokenShapeBucket[];
  tokenShapeCount: number;
  tokenShapesTruncated: boolean;
  valueHintBuckets: RadioAttributeValueHintBucket[];
  valueHintCount: number;
  valueHintsTruncated: boolean;
  proxyPatternBucket: RadioProxyPatternBucket;
  referencePatternBucket: RadioReferencePatternBucket;
}

export interface RadioGraphicSignature {
  candidateSlot: number;
  sameWrapperChildTagBuckets: RadioGraphicNodeBucket[];
  sameWrapperChildTagCount: number;
  sameWrapperChildTagsTruncated: boolean;
  previousSiblingTagBuckets: RadioGraphicNodeBucket[];
  previousSiblingTagCount: number;
  previousSiblingTagsTruncated: boolean;
  nextSiblingTagBuckets: RadioGraphicNodeBucket[];
  nextSiblingTagCount: number;
  nextSiblingTagsTruncated: boolean;
  decorativeNodeBuckets: RadioGraphicNodeBucket[];
  decorativeNodeCount: number;
  decorativeNodesTruncated: boolean;
  roleBuckets: RadioProxyRoleBucket[];
  roleCount: number;
  rolesTruncated: boolean;
  tokenHintBuckets: RadioGraphicTokenHintBucket[];
  tokenHintCount: number;
  tokenHintsTruncated: boolean;
  hasSameChoiceCue: boolean;
  hasDifferentChoiceCue: boolean;
  hasYesChoiceCue: boolean;
  hasNoChoiceCue: boolean;
  sameWrapperCommonalityBucket: RadioWrapperGraphicPatternBucket;
  directSiblingCommonalityBucket: RadioSiblingGraphicPatternBucket;
  hasUniqueTokenHintBucket: boolean;
  hasSharedTokenHintBucket: boolean;
}

export interface RadioNonTextLayoutSignature {
  groupMemberCount: number;
  repeatedGroupPattern: boolean;
  groupPatternBucket: RadioGroupPatternBucket;
  sharedContainerBucket: RadioSharedContainerBucket;
  alignmentBucket: RadioAlignmentBucket;
  relativeOrderBucket: RadioRelativeOrderBucket;
  spacingBucket: RadioSpacingBucket;
  shapeBucket: RadioShapeBucket;
  layerBucket: RadioLayerBucket;
  sharedDocumentLayer: boolean;
  metadataSignals: string[];
  metadataSignalCount: number;
  metadataSignalsTruncated: boolean;
}

export type FieldDiscoveryRadioBuilderSkipReason =
  | 'not-radio-like'
  | 'dom-context-extraction-failed';

export interface FieldDiscoveryRadioSurfaceDiagnostics {
  buildersAttempted: boolean;
  buildersSkipped: boolean;
  builderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  hasSafeFieldKey: boolean;
  hasIdOrNameKey: boolean;
  hasInputName: boolean;
  hasGroupName: boolean;
  hasResolvedLabel: boolean;
  hasLabelBucket: boolean;
  hasProxyReference: boolean;
  hasDomAttribute: boolean;
  hasRadioGraphic: boolean;
  hasNonTextLayout: boolean;
  hasContainerContext: boolean;
  hasLayoutProximity: boolean;
  generatedOnly: boolean;
  unsafeOmitted: boolean;
  genericOnly: boolean;
  anyDiagnosticSurface: boolean;
  surfaceEmpty: boolean;
  attachmentGapDetected: boolean;
}

export interface DiscoveredField {
  kind: FieldKind;
  index: number;
  sectionName: string | null;

  /** Back-compat alias for resolvedLabel. */
  label: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  title: string | null;
  describedByText: string | null;
  helperText: string | null;

  resolvedLabel: string | null;
  labelSource: LabelSource;
  labelConfidence: LabelConfidence;
  /** True when the chosen candidate looked like a field value (we still used it, but flagged). */
  labelLooksLikeValue: boolean;
  rawCandidateLabels: LabelCandidate[];
  /** Bounded safe container-context text for radios when local label buckets are empty. */
  containerContextLabels?: LabelCandidate[];
  /** Bounded safe detached visible text near radios, tracked separately from DOM-derived labels. */
  layoutProximityLabels?: LayoutProximityLabelCandidate[];
  /** Bounded non-text structural signature for radio-like controls when text surfaces are empty. */
  nonTextLayoutSignature?: RadioNonTextLayoutSignature | null;
  /** Bounded DOM wrapper and safe attribute-signature inventory for radio-like controls. */
  domAttributeSignature?: RadioDomAttributeSignature | null;
  /** Bounded visible-proxy wrapper and association-reference inventory for radio-like controls. */
  proxyReferenceSignature?: RadioProxyReferenceSignature | null;
  /** Bounded same-wrapper and direct-sibling graphic inventory for radio-like controls. */
  radioGraphicSignature?: RadioGraphicSignature | null;
  /** Bounded radio-surface discovery diagnostics used by downstream summaries. */
  radioSurfaceDiagnostics?: FieldDiscoveryRadioSurfaceDiagnostics | null;
  rejectedLabelCandidates: RejectedLabelCandidate[];
  /** Text near the control that clearly reads as a field value, not a prompt. */
  observedValueLikeTextNearControl: string | null;
  /** Stable key derived from id / name / data-qa when meaningful (e.g. "legalEntityType"). */
  idOrNameKey: string | null;
  /** Strength of attachment/upload evidence used by classifyControl. */
  attachmentEvidence: AttachmentEvidence;
  /** Shared group name for radios/checkboxes (from `name` attribute). */
  groupName: string | null;
  /** Current filled value, used only by label resolution (not serialised). */
  currentValue: string | null;

  type: string | null;
  inputMode: string | null;
  autocomplete: string | null;
  pattern: string | null;
  minLength: number | null;
  maxLength: number | null;
  required: boolean;
  docusignTabType: string | null;

  /** Raw `id` of the underlying control, e.g. `tab-form-element-{GUID}`. */
  elementId: string | null;
  /** DocuSign tab GUID extracted from `elementId`, lowercased.  `null`
   *  when the control isn't a tab-form-element. */
  tabGuid: string | null;
  /** 1-based page index derived from the ancestor `img.page-image` `src`
   *  parameter `p=N`, falling back to document-order page rank.  `null`
   *  when the control isn't inside a page container. */
  pageIndex: number | null;
  /** 1-based document-order ordinal among `.doc-tab` elements on the same
   *  page.  `null` when not a DocuSign tab. */
  ordinalOnPage: number | null;
  /** Inline DocuSign tab coordinates from the enclosing `.doc-tab`, if available. */
  tabLeft: number | null;
  tabTop: number | null;
  tabWidth: number | null;
  tabHeight: number | null;

  visible: boolean;
  editable: boolean;

  controlCategory: ControlCategory;
  inferredType: FieldTypeDefinition;
  locatorConfidence: LocatorConfidence;

  /** Not serialised in the report – used by the spec only. */
  locator: Locator;
}

async function safeAttr(loc: Locator, name: string): Promise<string | null> {
  try {
    return await loc.getAttribute(name, { timeout: 1_000 });
  } catch {
    return null;
  }
}

async function describedByText(loc: Locator, frame: FrameHost): Promise<string | null> {
  const ids = await safeAttr(loc, 'aria-describedby');
  if (!ids) return null;
  const parts: string[] = [];
  for (const id of ids.split(/\s+/).filter(Boolean)) {
    try {
      const txt = await frame.locator(`[id="${id.replace(/"/g, '\\"')}"]`).textContent({ timeout: 1_000 });
      if (txt?.trim()) parts.push(txt.trim());
    } catch {
      /* ignore – id may live in a different frame */
    }
  }
  return parts.length ? parts.join(' | ') : null;
}

async function nearbyHelperText(loc: Locator): Promise<string | null> {
  try {
    return await loc.evaluate((el) => {
      const HELPER_RE = /(tooltip|help|hint|info|description|error|sub-?text|caption)/i;
      const seen = new Set<string>();
      const out: string[] = [];
      const consider = (node: Element | null) => {
        if (!node) return;
        const cls = node.getAttribute('class') || '';
        const role = node.getAttribute('role') || '';
        const dataRole = node.getAttribute('data-role') || '';
        if (!HELPER_RE.test(cls + ' ' + role + ' ' + dataRole)) return;
        const txt = (node.textContent ?? '').trim();
        if (!txt || txt.length > 300 || seen.has(txt)) return;
        seen.add(txt);
        out.push(txt);
      };
      const parent = el.parentElement;
      if (parent) {
        for (const child of Array.from(parent.children)) consider(child);
        const grand = parent.parentElement;
        if (grand) for (const child of Array.from(grand.children)) consider(child);
      }
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        for (const id of labelledby.split(/\s+/).filter(Boolean)) {
          const n = document.getElementById(id);
          if (n) {
            const txt = (n.textContent ?? '').trim();
            if (txt && !seen.has(txt)) {
              seen.add(txt);
              out.push(txt);
            }
          }
        }
      }
      return out.length ? out.join(' | ').slice(0, 400) : null;
    }, { timeout: 1_500 });
  } catch {
    return null;
  }
}

async function nearestSectionName(loc: Locator): Promise<string | null> {
  try {
    const txt = await loc.evaluate((el) => {
      const pattern = /^\s*\d+\.\s+\w/;
      let cur: Element | null = el;
      while (cur) {
        let sib: Element | null = cur.previousElementSibling;
        while (sib) {
          const t = (sib.textContent ?? '').trim();
          const firstLine = t.split('\n')[0].trim();
          if (pattern.test(firstLine)) return firstLine.slice(0, 80);
          sib = sib.previousElementSibling;
        }
        cur = cur.parentElement;
      }
      return null;
    }, { timeout: 1_500 });
    return txt;
  } catch {
    return null;
  }
}

type ExtractedFieldDiscoveryRadioSurfaceBuildDiagnostics = {
  buildersAttempted: boolean;
  buildersSkipped: boolean;
  builderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
};

type ExtractedDomContext = {
  labelledByText: string | null;
  labelForText: string | null;
  wrappingLabelText: string | null;
  rowHeaderText: string | null;
  precedingText: string | null;
  positionalPromptText: string | null;
  sectionHeading: string | null;
  dataTabType: string | null;
  className: string | null;
  ownClassName: string | null;
  dataQa: string | null;
  ownDataTabType: string | null;
  elementId: string | null;
  elementName: string | null;
  groupName: string | null;
  valueLikeNearText: string | null;
  anchorText: string | null;
  currentValue: string | null;
  parentContainerTexts: string[];
  grandparentContainerTexts: string[];
  sectionContainerTexts: string[];
  containerPrecedingTexts: string[];
  containerFollowingTexts: string[];
  layoutProximityTexts: Array<{
    direction: LayoutProximityDirection;
    distanceBucket: LayoutProximityDistanceBucket;
    association: LayoutProximityAssociation;
    value: string;
  }>;
  nonTextLayoutSignature: RadioNonTextLayoutSignature | null;
  domAttributeSignature: RadioDomAttributeSignature | null;
  proxyReferenceSignature: RadioProxyReferenceSignature | null;
  radioGraphicSignature: RadioGraphicSignature | null;
  radioSurfaceBuildDiagnostics: ExtractedFieldDiscoveryRadioSurfaceBuildDiagnostics | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  tabLeft: number | null;
  tabTop: number | null;
  tabWidth: number | null;
  tabHeight: number | null;
};

/**
 * Pull richer label candidates from the DOM in a single evaluate() call.
 */
async function extractDomContext(loc: Locator): Promise<ExtractedDomContext> {
  const fallback = {
    labelledByText: null,
    labelForText: null,
    wrappingLabelText: null,
    rowHeaderText: null,
    precedingText: null,
    positionalPromptText: null,
    sectionHeading: null,
    dataTabType: null,
    className: null,
    ownClassName: null,
    dataQa: null,
    ownDataTabType: null,
    elementId: null,
    elementName: null,
    groupName: null,
    valueLikeNearText: null,
    anchorText: null,
    currentValue: null,
    parentContainerTexts: [],
    grandparentContainerTexts: [],
    sectionContainerTexts: [],
    containerPrecedingTexts: [],
    containerFollowingTexts: [],
    layoutProximityTexts: [],
    nonTextLayoutSignature: null,
    domAttributeSignature: null,
    proxyReferenceSignature: null,
    radioGraphicSignature: null,
    radioSurfaceBuildDiagnostics: null,
    pageIndex: null,
    ordinalOnPage: null,
    tabLeft: null,
    tabTop: null,
    tabWidth: null,
    tabHeight: null,
  };
  try {
    return await loc.evaluate((el) => {
      const clean = (s: string | null | undefined): string | null =>
        (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || null;

      const getIdsText = (ids: string | null): string | null => {
        if (!ids) return null;
        const parts: string[] = [];
        for (const id of ids.split(/\s+/).filter(Boolean)) {
          const node = document.getElementById(id);
          const t = clean(node?.textContent);
          if (t) parts.push(t);
        }
        return parts.length ? parts.join(' | ').slice(0, 240) : null;
      };

      const labelledByText = getIdsText(el.getAttribute('aria-labelledby'));

      let labelForText: string | null = null;
      const id = el.getAttribute('id');
      if (id) {
        try {
          const sel = `label[for="${id.replace(/"/g, '\\"')}"]`;
          const lbl = document.querySelector(sel);
          labelForText = clean(lbl?.textContent);
        } catch {
          labelForText = null;
        }
      }

      let wrappingLabelText: string | null = null;
      let walk: Element | null = el.parentElement;
      while (walk && walk !== document.body) {
        if (walk.tagName.toLowerCase() === 'label') {
          wrappingLabelText = clean(walk.textContent);
          break;
        }
        walk = walk.parentElement;
      }

      let rowHeaderText: string | null = null;
      const row: Element | null = el.closest('tr, [role="row"]');
      if (row) {
        const header =
          row.querySelector('th, [role="rowheader"]') ||
          row.querySelector('td:first-child, [role="gridcell"]:first-child');
        if (header && !header.contains(el)) {
          rowHeaderText = clean(header.textContent);
        }
      }

      const isInteractive = (n: Element) =>
        n.matches(
          'input, select, textarea, button, [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"]',
        );

      const VALUE_RE = /^(\$?\s*-?\d{1,3}(,\d{3})*(\.\d+)?\s*%?|\$?\s*-?\d+(\.\d+)?\s*%?|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/;
      const CHROME_RE = /(this\s*link\s*will\s*open|select\s*to\s*load|click\s*here|loading\.{3}|page\s*\d+\s*of|see\s*instructions|drag\s*and\s*drop)/i;
      // Compound DocuSign decoration strings seen in PDF tab labels.
      const STUB_RE =
        /signer\s*attachment|attachment\s*(required|optional)|(required|optional)\s*[-–]\s*(attachment|signhere|signature|datesigned|[a-z][a-zA-Z0-9]{2,}$)|^-{1,3}\s*select\s*-{1,3}/i;
      const looksValueOrChrome = (t: string | null): boolean =>
        !!t && (VALUE_RE.test(t) || CHROME_RE.test(t) || STUB_RE.test(t));
      const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
      const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
      const TOKEN_RE = /\b(?:[A-F0-9]{16,}|[A-Z0-9_-]{24,})\b/i;
      const STATIC_CONTAINER_TAG_RE = /^(span|div|label|p|strong|b|em|legend|header|h1|h2|h3|h4|h5|h6|th|td|li)$/i;

      const safeStaticText = (value: string | null | undefined): string | null => {
        const text = clean(value);
        if (!text) return null;
        if (text.length < 2 || text.length > 120) return null;
        if (looksValueOrChrome(text)) return null;
        if (URL_RE.test(text) || EMAIL_RE.test(text) || TOKEN_RE.test(text)) return null;
        if (/^[^A-Za-z0-9]+$/.test(text) || /^\d+$/.test(text)) return null;
        return text;
      };

      const collectStaticContextTexts = (root: Element | null, limit: number): string[] => {
        if (!root || limit <= 0) return [];

        const texts: string[] = [];
        const seen = new Set<string>();
        const consider = (node: Element) => {
          if (node.contains(el)) return;
          if (isInteractive(node)) return;
          if (!STATIC_CONTAINER_TAG_RE.test(node.tagName)) return;
          if (node.children.length > 8) return;
          const rect = (node as HTMLElement).getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const text = safeStaticText(node.textContent);
          if (!text || seen.has(text)) return;
          seen.add(text);
          texts.push(text);
        };

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node: Node | null = walker.currentNode;
        let steps = 0;
        while (texts.length < limit && steps < 200) {
          if (node instanceof Element) consider(node);
          node = walker.nextNode();
          steps += 1;
          if (!node) break;
        }

        return texts;
      };

      const branchChildWithin = (container: Element, target: Element): Element | null => {
        let node: Element | null = target;
        while (node && node.parentElement !== container) node = node.parentElement;
        return node;
      };

      const collectContainerSiblingTexts = (
        container: Element | null,
        target: Element,
        direction: 'all' | 'before' | 'after',
        limit: number,
      ): string[] => {
        if (!container || limit <= 0) return [];

        const branch = branchChildWithin(container, target);
        if (!branch) return [];

        const texts: string[] = [];
        const seen = new Set<string>();
        const children = Array.from(container.children);
        const branchIndex = children.indexOf(branch);
        if (branchIndex < 0) return texts;

        for (const [index, child] of children.entries()) {
          if (index === branchIndex) continue;
          if (direction === 'before' && index > branchIndex) continue;
          if (direction === 'after' && index < branchIndex) continue;

          for (const text of collectStaticContextTexts(child, limit - texts.length)) {
            if (seen.has(text)) continue;
            seen.add(text);
            texts.push(text);
            if (texts.length >= limit) break;
          }

          if (texts.length >= limit) break;
        }

        return texts;
      };

      let precedingText: string | null = null;
      let valueLikeNearText: string | null = null;
      {
        let node: Element | null = el;
        let up = 0;
        while (node && up < 4) {
          let sib: Element | null = node.previousElementSibling;
          while (sib) {
            if (!isInteractive(sib)) {
              const t = clean(sib.textContent);
              if (t && t.length >= 2 && t.length <= 120) {
                if (looksValueOrChrome(t)) {
                  if (!valueLikeNearText) valueLikeNearText = t;
                } else if (!precedingText) {
                  precedingText = t;
                }
                if (precedingText) break;
              }
            }
            sib = sib.previousElementSibling;
          }
          if (precedingText) break;
          node = node.parentElement;
          up++;
        }
      }

      // Section heading: walk ancestors looking for any preceding heading
      // (numbered or not), legend, or DocuSign page anchor text.
      let sectionHeading: string | null = null;
      let anchorText: string | null = null;
      {
        const HEADING_RE = /^(h1|h2|h3|h4|h5|h6|legend)$/i;
        const NUMBERED_RE = /^\s*\d+\.\s+\w/;
        let cur: Element | null = el;
        outer: while (cur) {
          const fieldset = cur.closest?.('fieldset');
          if (fieldset) {
            const legend = fieldset.querySelector('legend');
            if (legend) {
              const t = clean(legend.textContent);
              if (t) {
                sectionHeading = t;
                break outer;
              }
            }
          }
          let sib: Element | null = cur.previousElementSibling;
          while (sib) {
            if (HEADING_RE.test(sib.tagName)) {
              const t = clean(sib.textContent);
              if (t) {
                sectionHeading = t;
                break outer;
              }
            }
            // Numbered section convention (e.g. "1. Business Details")
            const line = (sib.textContent ?? '').trim().split('\n')[0].trim();
            if (NUMBERED_RE.test(line)) {
              sectionHeading = line.slice(0, 80);
              break outer;
            }
            sib = sib.previousElementSibling;
          }
          cur = cur.parentElement;
        }

        // DocuSign page anchor: nearest [data-page], [data-anchor], or
        // aria-label on a page container.
        const pageContainer = el.closest(
          '[data-page-number], [data-page], [data-anchor], [aria-label*="page" i]',
        );
        if (pageContainer) {
          anchorText =
            clean(pageContainer.getAttribute('aria-label')) ||
            clean(pageContainer.getAttribute('data-anchor')) ||
            null;
        }
      }

      const closestTab = el.closest('[data-tabtype], [data-tab-type], .doc-tab[data-type]');
      const dataTabType =
        el.getAttribute('data-tabtype') ||
        el.getAttribute('data-tab-type') ||
        el.getAttribute('data-type') ||
        closestTab?.getAttribute('data-tabtype') ||
        closestTab?.getAttribute('data-tab-type') ||
        closestTab?.getAttribute('data-type') ||
        null;
      const ownDataTabType =
        el.getAttribute('data-tabtype') || el.getAttribute('data-tab-type') || el.getAttribute('data-type') || null;

      const closestQa = el.closest('[data-qa]');
      const dataQa = el.getAttribute('data-qa') || closestQa?.getAttribute('data-qa') || null;

      const className = el.getAttribute('class');
      // "own" vs "ancestor" — own class only.
      const ownClassName = className;

      // Radios and checkboxes may share a group name via `name` attribute,
      // or a role=radiogroup ancestor with aria-label.
      const elementName = el.getAttribute('name');
      let groupName: string | null = elementName || null;
      if (!groupName) {
        const group = el.closest('[role="radiogroup"], [role="group"]');
        if (group) {
          groupName = clean(group.getAttribute('aria-label')) || null;
        }
      }

      const elementId = el.getAttribute('id');

      // --- Positional prompt scan -----------------------------------------
      // DocuSign PDF envelopes render tabs on top of a rasterised PDF.  The
      // real prompt ("Legal Business Name") sits in a neighbouring <span>
      // that is NOT the element's previousElementSibling in DOM order —
      // position-wise it is ABOVE or to the LEFT of the tab.  Scan siblings
      // of a handful of ancestors, pick non-interactive text whose bounding
      // box is above / level-left of the tab, and is neither a value nor
      // chrome text.
      let positionalPromptText: string | null = null;
      try {
        const inputEl = el as HTMLElement;
        const rect = inputEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          type Cand = { text: string; dy: number; dx: number };
          const candidates: Cand[] = [];
          const seenTexts = new Set<string>();
          const pushCand = (text: string, r: DOMRect) => {
            if (!text || text.length < 2 || text.length > 120) return;
            if (seenTexts.has(text)) return;
            if (VALUE_RE.test(text) || CHROME_RE.test(text) || STUB_RE.test(text)) return;
            // Prompt typically sits directly above the input, close in Y,
            // and left edge roughly aligned.  Widened slightly to pick up
            // PDF-form prompts that sit 60-80px above the tab row.
            const verticalGap = rect.top - r.bottom;
            if (verticalGap < -6 || verticalGap > 90) return;
            const horizontalGap = r.left - rect.left;
            if (horizontalGap < -300 || horizontalGap > 320) return;
            seenTexts.add(text);
            candidates.push({ text, dy: verticalGap, dx: Math.abs(horizontalGap) });
          };
          // Walk up a few ancestors and inspect their descendant non-interactive
          // elements whose text is short and prompt-shaped.
          const PROMPT_TAG_RE = /^(span|div|label|p|strong|b|em)$/i;
          // DocuSign renders filled tab values as sibling elements — we must
          // NOT treat those as prompts.  Rejects anything whose id / class
          // marks it as a tab value / display layer.
          const isTabValueElement = (n: Element): boolean => {
            const id = n.id ?? '';
            if (/^tab-form-element-/i.test(id)) return true;
            const cls = n.getAttribute('class') ?? '';
            if (
              /\btab[-_]?value\b|\btab[-_]?input\b|\btab[-_]?display\b|\btextdisplay\b|\btab[-_]?content\b|\bsigner[-_]?tab\b|\bfield[-_]?value\b/i.test(
                cls,
              )
            ) {
              return true;
            }
            if (
              /\btab[-_]?value\b|\btab[-_]?input\b|\btab[-_]?display\b|\btextdisplay\b/i.test(
                n.getAttribute('data-tabtype') ?? '',
              )
            ) {
              return true;
            }
            // Skip direct parents of form controls (leaf wrappers only) —
            // but do NOT skip larger ancestor layout nodes.
            if (
              n.children.length <= 3 &&
              n.querySelector(':scope > input, :scope > textarea, :scope > select, :scope > button, :scope > [role="textbox"]')
            ) {
              return true;
            }
            return false;
          };
          let cur: Element | null = inputEl.parentElement;
          let up = 0;
          while (cur && up < 5) {
            const walker = document.createTreeWalker(cur, NodeFilter.SHOW_ELEMENT);
            let node: Node | null = walker.currentNode;
            let steps = 0;
            while (node && steps < 400) {
              steps++;
              node = walker.nextNode();
              if (!node || !(node instanceof Element)) continue;
              if (isInteractive(node)) continue;
              if (isTabValueElement(node)) continue;
              if (!PROMPT_TAG_RE.test(node.tagName)) continue;
              // Skip deeply nested layout wrappers whose textContent is a
              // pile of unrelated text; accept leaf-ish nodes with at most
              // a few element children.
              if (node.children.length > 6) continue;
              const t = clean(node.textContent);
              if (!t) continue;
              const r = (node as HTMLElement).getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              pushCand(t, r);
            }
            cur = cur.parentElement;
            up++;
          }
          // Pick the candidate closest to the input (by dy, then dx).
          candidates.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
          positionalPromptText = candidates[0]?.text ?? null;
        }
      } catch {
        /* ignore */
      }

      // Current filled value of the input (for rejecting candidates that
      // equal the value).
      let currentValue: string | null = null;
      try {
        const inputLike = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const v = inputLike.value;
        if (typeof v === 'string' && v.trim()) currentValue = clean(v);
      } catch {
        /* ignore */
      }

      const parentContainer = el.parentElement;
      const grandparentContainer = parentContainer?.parentElement ?? null;
      const sectionContainer = el.closest(
        '[role="radiogroup"], [role="group"], fieldset, tr, [role="row"], section, article, .card, .doc-tab',
      );
      const distinctSectionContainer = sectionContainer && sectionContainer !== parentContainer && sectionContainer !== grandparentContainer
        ? sectionContainer
        : null;
      const contextContainer = distinctSectionContainer ?? grandparentContainer ?? parentContainer;

      const parentContainerTexts = collectContainerSiblingTexts(parentContainer, el, 'all', 4);
      const grandparentContainerTexts = collectContainerSiblingTexts(grandparentContainer, el, 'all', 4);
      const sectionContainerTexts = collectContainerSiblingTexts(distinctSectionContainer, el, 'all', 4);
      const containerPrecedingTexts = collectContainerSiblingTexts(contextContainer, el, 'before', 4);
      const containerFollowingTexts = collectContainerSiblingTexts(contextContainer, el, 'after', 4);

      const layoutProximityTexts: Array<{
        direction: LayoutProximityDirection;
        distanceBucket: LayoutProximityDistanceBucket;
        association: LayoutProximityAssociation;
        value: string;
      }> = [];
      let nonTextLayoutSignature: RadioNonTextLayoutSignature | null = null;
      let domAttributeSignature: RadioDomAttributeSignature | null = null;
      let proxyReferenceSignature: RadioProxyReferenceSignature | null = null;
      let radioGraphicSignature: RadioGraphicSignature | null = null;
      let radioSurfaceBuildDiagnostics: ExtractedFieldDiscoveryRadioSurfaceBuildDiagnostics | null = null;

      try {
        const inputEl = el as HTMLElement;
        const ownRole = clean(el.getAttribute('role'))?.toLowerCase() ?? null;
        const ownType = clean(el.getAttribute('type'))?.toLowerCase() ?? null;
        const isRadioLike = (el.tagName.toLowerCase() === 'input' && ownType === 'radio') || ownRole === 'radio';
        radioSurfaceBuildDiagnostics = isRadioLike
          ? {
              buildersAttempted: true,
              buildersSkipped: false,
              builderSkipReasons: [],
            }
          : null;

        type RectLike = { left: number; top: number; right: number; bottom: number; width: number; height: number };

        const toRectLike = (rect: DOMRect): RectLike => ({
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });

        const rectGap = (a: RectLike, b: RectLike): number => {
          const dx = a.right < b.left ? b.left - a.right : b.right < a.left ? a.left - b.right : 0;
          const dy = a.bottom < b.top ? b.top - a.bottom : b.bottom < a.top ? a.top - b.bottom : 0;
          return Math.max(dx, dy);
        };

        const centerDistance = (a: RectLike, b: RectLike): number => {
          const ax = (a.left + a.right) / 2;
          const ay = (a.top + a.bottom) / 2;
          const bx = (b.left + b.right) / 2;
          const by = (b.top + b.bottom) / 2;
          return Math.hypot(ax - bx, ay - by);
        };

        const unionRects = (rects: RectLike[]): RectLike | null => {
          if (!rects.length) return null;
          const left = Math.min(...rects.map((rect) => rect.left));
          const top = Math.min(...rects.map((rect) => rect.top));
          const right = Math.max(...rects.map((rect) => rect.right));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));
          return {
            left,
            top,
            right,
            bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
          };
        };

        const asBucket = <T extends string>(value: T): T => value;

        const toMatchableToken = (value: string | null | undefined): string =>
          (value ?? '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_:.>/-]+/g, ' ')
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const sameNode = (nodes: Array<Element | null | undefined>): boolean => {
          const present = nodes.filter((node): node is Element => node instanceof Element);
          return present.length > 0 && present.length === nodes.length && present.every((node) => node === present[0]);
        };

        const summarizeItems = <T extends string>(values: T[], limit: number): { items: T[]; count: number; truncated: boolean } => {
          const unique = Array.from(new Set(values));
          return {
            items: unique.slice(0, limit),
            count: unique.length,
            truncated: unique.length > limit,
          };
        };

        const SAFE_ATTRIBUTE_NAME_RE = /^(id|name|class|type|role|for|aria-[a-z0-9_-]+|data-[a-z0-9_-]+)$/i;
        const DOCUSIGN_ATTRIBUTE_NAME_RE = /^(data-tabtype|data-tab-type|data-type|data-qa|data-page-number|data-page|data-anchor)$/i;
        const DATA_REFERENCE_ATTRIBUTE_NAME_RE = /^data-(?:tab|field|recipient|target|for)(?:[-_][a-z0-9]+)*$/i;
        const DOCUSIGN_REFERENCE_VALUE_RE = /^tab-form-element-[a-z0-9:_-]+$/i;
        const GENERATED_TOKEN_RE = /^(?:tab[-_\s]*form[-_\s]*element[-_\s]*)?[A-F0-9]{12,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        const collectElementAttributeEntries = (node: Element | null): Array<{ name: string; value: string }> => {
          if (!node) return [];
          return Array.from(node.attributes)
            .map((attr) => ({ name: attr.name.toLowerCase(), value: attr.value ?? '' }))
            .filter((attr) => SAFE_ATTRIBUTE_NAME_RE.test(attr.name));
        };

        const isRenderedElement = (node: Element | null): node is HTMLElement => {
          if (!(node instanceof HTMLElement)) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const style = window.getComputedStyle(node);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const escapeAttributeValue = (value: string): string =>
          value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        const toProxyTagBucket = (node: Element): RadioProxyTagBucket => {
          const role = clean(node.getAttribute('role'))?.toLowerCase() ?? null;
          if (role === 'radio') return 'role-radio';
          switch (node.tagName.toLowerCase()) {
            case 'label':
              return 'label';
            case 'span':
              return 'span';
            case 'div':
              return 'div';
            case 'svg':
              return 'svg';
            case 'canvas':
              return 'canvas';
            case 'button':
              return 'button';
            default:
              return 'unknown';
          }
        };

        const toProxyRoleBucket = (node: Element): RadioProxyRoleBucket => {
          const role = clean(node.getAttribute('role'))?.toLowerCase() ?? null;
          if (!role) return 'none';
          if (role === 'radio') return 'radio';
          if (role === 'button') return 'button';
          if (role === 'presentation' || role === 'none') return 'presentation';
          return 'other';
        };

        const toGraphicStructuralTagBucket = (node: Element): Exclude<RadioGraphicNodeBucket, 'pseudo-radio'> => {
          switch (node.tagName.toLowerCase()) {
            case 'label':
              return 'label';
            case 'span':
              return 'span';
            case 'div':
              return 'div';
            case 'svg':
              return 'svg';
            case 'button':
              return 'button';
            default:
              return 'unknown';
          }
        };

        const toGraphicNodeBucket = (node: Element): RadioGraphicNodeBucket => {
          const structuralBucket = toGraphicStructuralTagBucket(node);
          const role = clean(node.getAttribute('role'))?.toLowerCase() ?? null;
          const attributeEntries = collectElementAttributeEntries(node);
          const matchable = toMatchableToken([
            role ?? '',
            ...attributeEntries.map((entry) => entry.name),
            ...attributeEntries.map((entry) => entry.value),
          ].join(' '));

          if (
            role === 'radio'
            || node.hasAttribute('aria-checked')
            || node.hasAttribute('aria-selected')
            || (
              structuralBucket !== 'label'
              && structuralBucket !== 'button'
              && /\b(radio|toggle|choice|option|selected|checked)\b/i.test(matchable)
            )
          ) {
            return 'pseudo-radio';
          }

          return structuralBucket;
        };

        const collectReferenceTokens = (values: Array<string | null | undefined>, limit = 8): string[] => {
          const tokens: string[] = [];
          const seenTokens = new Set<string>();

          for (const value of values) {
            const parts = (value ?? '')
              .split(/[\s,;]+/)
              .map((part) => part.trim())
              .filter(Boolean);
            for (const part of parts) {
              if (part.length > 160 || seenTokens.has(part)) continue;
              seenTokens.add(part);
              tokens.push(part);
              if (tokens.length >= limit) return tokens;
            }
          }

          return tokens;
        };

        const resolveReferenceTargets = (values: Array<string | null | undefined>) => {
          const tokens = collectReferenceTokens(values);
          const nodes: Element[] = [];
          const seenNodes = new Set<Element>();

          for (const token of tokens) {
            const target = document.getElementById(token);
            if (target && !seenNodes.has(target)) {
              seenNodes.add(target);
              nodes.push(target);
            }
          }

          return {
            hasReference: tokens.length > 0,
            targetExists: nodes.length > 0,
            targetVisible: nodes.some((target) => isRenderedElement(target)),
            nodes,
          };
        };

        const collectTokenShapeSummary = (
          values: Array<string | null | undefined>,
          limit = 4,
        ): { items: RadioTokenShapeBucket[]; count: number; truncated: boolean } => {
          const buckets: RadioTokenShapeBucket[] = [];
          for (const rawValue of values) {
            const raw = (rawValue ?? '').trim();
            const matchable = toMatchableToken(raw);
            if (/\b(address|location|physical|operating|mailing|legal|virtual)\b/i.test(matchable)) {
              buckets.push('address-like-token');
            }
            if (/\b(radio|toggle|choice|option|select)\b/i.test(matchable)) {
              buckets.push('radio-like-token');
            }
            if (/\b(docusign|doc tab|tab form element|signer|page image)\b/i.test(matchable)) {
              buckets.push('docusign-token');
            }
            if (GENERATED_TOKEN_RE.test(raw) || /^tab-form-element[-_:\s]/i.test(raw) || /^:r[0-9a-z]+:$/i.test(raw)) {
              buckets.push('generated-token-pattern');
            }
          }
          return summarizeItems(buckets, limit);
        };

        const collectValueHintSummary = (
          values: Array<string | null | undefined>,
          limit = 8,
        ): { items: RadioAttributeValueHintBucket[]; count: number; truncated: boolean } => {
          const buckets: RadioAttributeValueHintBucket[] = [];
          for (const rawValue of values) {
            const raw = (rawValue ?? '').trim();
            if (!raw) {
              buckets.push('empty-value');
              continue;
            }

            const matchable = toMatchableToken(raw);
            if (/\bbusiness\s+physical\s+address\b/i.test(matchable)) {
              buckets.push('business-physical-address-token');
            }
            if (/\bphysical\s+operating\s+address\b/i.test(matchable)) {
              buckets.push('physical-operating-address-token');
            }
            if (/\boperating\s+address\b/i.test(matchable) || /\bis\s+operating\s+address\b/i.test(matchable)) {
              buckets.push('operating-address-token');
            }
            if (/\b(mailing\s+address|business\s+mailing\s+address)\b/i.test(matchable) || /\bis\s+mailing\s+address\b/i.test(matchable)) {
              buckets.push('mailing-address-token');
            }
            if (/\blegal\s+address\b/i.test(matchable) || /\bis\s+legal\s+address\b/i.test(matchable)) {
              buckets.push('legal-address-token');
            }
            if (/\bvirtual\s+address\b/i.test(matchable) || /\bis\s+virtual\s+address\b/i.test(matchable)) {
              buckets.push('virtual-address-token');
            }
            if (/\bsame\b/i.test(matchable)) buckets.push('same-token');
            if (/\bdifferent\b/i.test(matchable)) buckets.push('different-token');
            if (/\byes\b/i.test(matchable)) buckets.push('yes-token');
            if (/\bno\b/i.test(matchable)) buckets.push('no-token');
            if (/\baddress\b/i.test(matchable)) buckets.push('address-like-token');
            if (GENERATED_TOKEN_RE.test(raw) || /^tab-form-element[-_:\s]/i.test(raw) || /^:r[0-9a-z]+:$/i.test(raw)) {
              buckets.push('generated-token-pattern');
            }
          }
          return summarizeItems(buckets, limit);
        };

        const collectGraphicTokenHintSummary = (
          values: Array<string | null | undefined>,
          limit = 8,
        ): {
          items: RadioGraphicTokenHintBucket[];
          count: number;
          truncated: boolean;
          cueState: {
            same: boolean;
            different: boolean;
            yes: boolean;
            no: boolean;
          };
        } => {
          const buckets: RadioGraphicTokenHintBucket[] = [];
          const cueState = {
            same: false,
            different: false,
            yes: false,
            no: false,
          };
          let sawGenericOrGeneratedToken = false;
          let sawAddressMeaning = false;

          for (const rawValue of values) {
            const raw = (rawValue ?? '').trim();
            if (!raw) continue;

            const matchable = toMatchableToken(raw);
            if (/\b(radio|toggle|choice|option|select|ring|bullet|dot)\b/i.test(matchable)) {
              buckets.push('radio-like-token');
              sawGenericOrGeneratedToken = true;
            }
            if (/\bselected\b/i.test(matchable)) buckets.push('selected-token');
            if (/\bchecked\b/i.test(matchable)) buckets.push('checked-token');
            if (/\baddress\b/i.test(matchable)) {
              buckets.push('address-like-token');
              sawAddressMeaning = true;
            }
            if (/\bphysical\b/i.test(matchable)) {
              buckets.push('physical-like-token');
              sawAddressMeaning = true;
            }
            if (/\boperating\b/i.test(matchable)) {
              buckets.push('operating-like-token');
              sawAddressMeaning = true;
            }
            if (/\bbusiness\b/i.test(matchable)) {
              buckets.push('business-like-token');
              sawAddressMeaning = true;
            }
            if (/\bmailing\b/i.test(matchable)) {
              buckets.push('mailing-like-token');
              sawAddressMeaning = true;
            }
            if (/\blegal\b/i.test(matchable)) {
              buckets.push('legal-like-token');
              sawAddressMeaning = true;
            }
            if (/\bvirtual\b/i.test(matchable)) {
              buckets.push('virtual-like-token');
              sawAddressMeaning = true;
            }
            if (/\bsame\b/i.test(matchable)) cueState.same = true;
            if (/\bdifferent\b/i.test(matchable)) cueState.different = true;
            if (/\byes\b/i.test(matchable)) cueState.yes = true;
            if (/\bno\b/i.test(matchable)) cueState.no = true;
            if (
              GENERATED_TOKEN_RE.test(raw)
              || /^tab-form-element[-_:\s]/i.test(raw)
              || /^:r[0-9a-z]+:$/i.test(raw)
              || /\b(choice|option|radio|toggle|select|ring|shell|wrapper|icon|button|label)\b/i.test(matchable)
            ) {
              sawGenericOrGeneratedToken = true;
            }
          }

          if (sawGenericOrGeneratedToken && !sawAddressMeaning) {
            buckets.push('generated/generic-only-token');
          }

          const summary = summarizeItems(buckets, limit);
          return {
            ...summary,
            cueState,
          };
        };

        type RawWrapperSurface = {
          surface: RadioWrapperAttributeSurface;
          rawValues: string[];
          patternKey: string;
        };

        const buildRawWrapperSurface = (
          node: Element | null,
          depthBucket: RadioWrapperDepthBucket,
        ): RawWrapperSurface | null => {
          if (!node) return null;

          const attributeEntries = collectElementAttributeEntries(node);
          const attributeNames = summarizeItems(
            attributeEntries.map((entry) => entry.name),
            8,
          );
          const tokenShapes = collectTokenShapeSummary(attributeEntries.map((entry) => entry.value));
          const tagName = node.tagName.toLowerCase();
          const role = clean(node.getAttribute('role'))?.toLowerCase() ?? null;

          return {
            surface: {
              depthBucket,
              tagName,
              role,
              attributeNames: attributeNames.items,
              attributeNameCount: attributeNames.count,
              attributeNamesTruncated: attributeNames.truncated,
              tokenShapeBuckets: tokenShapes.items,
              tokenShapeCount: tokenShapes.count,
              tokenShapesTruncated: tokenShapes.truncated,
            },
            rawValues: attributeEntries.map((entry) => entry.value),
            patternKey: [
              depthBucket,
              tagName,
              role ?? '',
              attributeNames.items.join(','),
              tokenShapes.items.join(','),
            ].join('|'),
          };
        };

        type RawRadioAttributeSignature = {
          signature: Omit<RadioDomAttributeSignature, 'wrapperPatternBucket' | 'attributePatternBucket'>;
          wrapperPatternKey: string;
          attributePatternKey: string;
        };

        type RawRadioProxyReferenceSignature = {
          signature: Omit<RadioProxyReferenceSignature, 'proxyPatternBucket' | 'referencePatternBucket'>;
          proxyPatternKey: string;
          referencePatternKey: string;
        };

        type RawRadioGraphicSignature = {
          signature: Omit<
            RadioGraphicSignature,
            'sameWrapperCommonalityBucket' | 'directSiblingCommonalityBucket' | 'hasUniqueTokenHintBucket' | 'hasSharedTokenHintBucket'
          >;
          wrapperPatternKey: string;
          siblingPatternKey: string;
          tokenHintSet: Set<RadioGraphicTokenHintBucket>;
        };

        const buildRawRadioAttributeSignature = (node: HTMLElement): RawRadioAttributeSignature => {
          const selfEntries = collectElementAttributeEntries(node);
          const radioAttributeNames = summarizeItems(
            selfEntries.map((entry) => entry.name),
            8,
          );
          const nearestFormRow = node.closest(
            '[role="radiogroup"], [role="group"], fieldset, tr, [role="row"], section, article, .card, .doc-tab',
          );
          const rawWrapperSurfaces: RawWrapperSurface[] = [];
          const seenWrappers = new Set<Element>();

          for (const candidate of [
            { depthBucket: 'parent' as const, node: node.parentElement },
            { depthBucket: 'grandparent' as const, node: node.parentElement?.parentElement ?? null },
            { depthBucket: 'form-row' as const, node: nearestFormRow },
          ]) {
            if (!(candidate.node instanceof Element) || seenWrappers.has(candidate.node)) continue;
            seenWrappers.add(candidate.node);
            const surface = buildRawWrapperSurface(candidate.node, candidate.depthBucket);
            if (surface) rawWrapperSurfaces.push(surface);
          }

          const wrapperValues = rawWrapperSurfaces.flatMap((surface) => surface.rawValues);
          const combinedValues = [...selfEntries.map((entry) => entry.value), ...wrapperValues];
          const tokenShapes = collectTokenShapeSummary(combinedValues);
          const valueHints = collectValueHintSummary(combinedValues);
          const hasDocuSignMetadataAttributes = selfEntries.some((entry) => DOCUSIGN_ATTRIBUTE_NAME_RE.test(entry.name))
            || rawWrapperSurfaces.some((surface) => surface.surface.attributeNames.some((name) => DOCUSIGN_ATTRIBUTE_NAME_RE.test(name)))
            || /^tab-form-element-/i.test(node.getAttribute('id') ?? '');

          return {
            signature: {
              radioAttributeNames: radioAttributeNames.items,
              radioAttributeNameCount: radioAttributeNames.count,
              radioAttributeNamesTruncated: radioAttributeNames.truncated,
              wrapperSurfaces: rawWrapperSurfaces.map((surface) => surface.surface),
              wrapperSurfacesTruncated: false,
              hasIdAttribute: node.hasAttribute('id'),
              hasNameAttribute: node.hasAttribute('name'),
              hasAriaLabel: node.hasAttribute('aria-label'),
              hasAriaLabelledBy: node.hasAttribute('aria-labelledby'),
              hasAriaDescribedBy: node.hasAttribute('aria-describedby'),
              hasDataAttributes: selfEntries.some((entry) => entry.name.startsWith('data-')),
              hasDocuSignMetadataAttributes,
              tokenShapeBuckets: tokenShapes.items,
              tokenShapeCount: tokenShapes.count,
              tokenShapesTruncated: tokenShapes.truncated,
              valueHintBuckets: valueHints.items,
              valueHintCount: valueHints.count,
              valueHintsTruncated: valueHints.truncated,
            },
            wrapperPatternKey: rawWrapperSurfaces.map((surface) => surface.patternKey).join('||') || 'no-wrapper-pattern',
            attributePatternKey: [
              radioAttributeNames.items.join(','),
              node.hasAttribute('id') ? 'id' : '',
              node.hasAttribute('name') ? 'name' : '',
              node.hasAttribute('aria-label') ? 'aria-label' : '',
              node.hasAttribute('aria-labelledby') ? 'aria-labelledby' : '',
              node.hasAttribute('aria-describedby') ? 'aria-describedby' : '',
              selfEntries.some((entry) => entry.name.startsWith('data-')) ? 'data' : '',
              hasDocuSignMetadataAttributes ? 'docusign' : '',
              valueHints.items.join(','),
              tokenShapes.items.join(','),
            ].join('|'),
          };
        };

        const buildRawRadioProxyReferenceSignature = (
          node: HTMLElement,
          candidateSlot: number,
        ): RawRadioProxyReferenceSignature => {
          const inputRect = toRectLike(node.getBoundingClientRect());
          const anchorRect = inputRect.width > 0 && inputRect.height > 0
            ? inputRect
            : toRectLike((node.parentElement ?? node).getBoundingClientRect());
          const nearestFormRow = node.closest(
            '[role="radiogroup"], [role="group"], fieldset, tr, [role="row"], section, article, .card, .doc-tab',
          );

          const proxyCandidates: Array<{
            node: HTMLElement;
            depthBucket: RadioProxyDepthBucket;
          }> = [];
          const seenProxyNodes = new Set<HTMLElement>();

          const addProxyCandidate = (candidate: Element | null, depthBucket: RadioProxyDepthBucket) => {
            if (!(candidate instanceof HTMLElement) || candidate === node || seenProxyNodes.has(candidate)) return;
            if (/^(input|textarea|select|option)$/i.test(candidate.tagName)) return;
            if (!isRenderedElement(candidate)) return;

            const rect = toRectLike(candidate.getBoundingClientRect());
            if (rect.width > 520 || rect.height > 180) return;
            if (
              candidate.tagName.toLowerCase() === 'div'
              && !candidate.hasAttribute('role')
              && !candidate.hasAttribute('class')
              && !candidate.hasAttribute('for')
              && !Array.from(candidate.attributes).some((attr) => attr.name.startsWith('data-'))
              && candidate.children.length > 6
            ) {
              return;
            }

            seenProxyNodes.add(candidate);
            proxyCandidates.push({ node: candidate, depthBucket });
          };

          const addScopedProxyCandidates = (scope: Element | null, depthBucket: RadioProxyDepthBucket) => {
            if (!(scope instanceof Element)) return;

            const candidates = Array.from(scope.querySelectorAll('label, span, div, svg, canvas, button, [role="radio"]'))
              .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
              .filter((candidate) => candidate !== node && !candidate.contains(node))
              .map((candidate) => ({
                candidate,
                rect: toRectLike(candidate.getBoundingClientRect()),
              }))
              .filter(({ candidate, rect }) => {
                if (!isRenderedElement(candidate)) return false;
                const gap = rectGap(anchorRect, rect);
                const distance = centerDistance(anchorRect, rect);
                if (gap > 96 && distance > 140) return false;
                if (candidate.children.length > 8 && candidate.tagName.toLowerCase() === 'div' && !candidate.hasAttribute('role')) {
                  return false;
                }
                return true;
              })
              .sort((a, b) => {
                const gapDelta = rectGap(anchorRect, a.rect) - rectGap(anchorRect, b.rect);
                if (gapDelta !== 0) return gapDelta;
                return centerDistance(anchorRect, a.rect) - centerDistance(anchorRect, b.rect);
              })
              .slice(0, 8);

            for (const { candidate } of candidates) {
              addProxyCandidate(candidate, depthBucket);
            }
          };

          const wrappingLabel = node.closest('label');
          if (wrappingLabel) {
            addProxyCandidate(wrappingLabel, 'wrapping-label');
            addScopedProxyCandidates(wrappingLabel, 'wrapping-label');
          }

          const forLabels = node.id
            ? Array.from(document.querySelectorAll(`label[for="${escapeAttributeValue(node.id)}"]`))
              .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
            : [];
          for (const label of forLabels.slice(0, 4)) {
            addProxyCandidate(label, 'for-label');
            addScopedProxyCandidates(label, 'for-label');
          }

          addScopedProxyCandidates(node.parentElement, 'parent');
          addScopedProxyCandidates(node.parentElement?.parentElement ?? null, 'grandparent');
          addScopedProxyCandidates(nearestFormRow, 'form-row');

          const referenceSourceNodes = [node, ...proxyCandidates.map((entry) => entry.node)];
          const ariaLabelledByState = resolveReferenceTargets(referenceSourceNodes.map((entry) => entry.getAttribute('aria-labelledby')));
          const ariaDescribedByState = resolveReferenceTargets(referenceSourceNodes.map((entry) => entry.getAttribute('aria-describedby')));
          const ariaControlsState = resolveReferenceTargets(referenceSourceNodes.map((entry) => entry.getAttribute('aria-controls')));
          const dataReferenceEntries = referenceSourceNodes.flatMap((entry) =>
            collectElementAttributeEntries(entry).filter((attribute) => DATA_REFERENCE_ATTRIBUTE_NAME_RE.test(attribute.name)),
          );
          const dataReferenceState = resolveReferenceTargets(dataReferenceEntries.map((entry) => entry.value));
          const docuSignReferenceState = resolveReferenceTargets(referenceSourceNodes.flatMap((entry) =>
            collectElementAttributeEntries(entry)
              .filter((attribute) => attribute.name !== 'id' && DOCUSIGN_REFERENCE_VALUE_RE.test((attribute.value ?? '').trim()))
              .map((attribute) => attribute.value),
          ));

          for (const target of [
            ...ariaLabelledByState.nodes,
            ...ariaDescribedByState.nodes,
            ...ariaControlsState.nodes,
            ...dataReferenceState.nodes,
            ...docuSignReferenceState.nodes,
          ]) {
            addProxyCandidate(target, 'association-target');
          }

          const rawProxyEntries = proxyCandidates.map(({ node: proxyNode, depthBucket }) => {
            const attributeEntries = collectElementAttributeEntries(proxyNode);
            const tokenShapes = collectTokenShapeSummary(attributeEntries.map((attribute) => attribute.value));
            const valueHints = collectValueHintSummary(attributeEntries.map((attribute) => attribute.value));
            const tagBucket = toProxyTagBucket(proxyNode);
            const roleBucket = toProxyRoleBucket(proxyNode);

            return {
              node: proxyNode,
              depthBucket,
              tagBucket,
              roleBucket,
              attributeEntries,
              patternKey: [
                depthBucket,
                tagBucket,
                roleBucket,
                proxyNode.hasAttribute('class') ? 'class' : '',
                proxyNode.hasAttribute('role') ? 'role' : '',
                proxyNode.hasAttribute('for') ? 'for' : '',
                proxyNode.hasAttribute('aria-label') ? 'aria-label' : '',
                proxyNode.hasAttribute('aria-labelledby') ? 'aria-labelledby' : '',
                proxyNode.hasAttribute('aria-describedby') ? 'aria-describedby' : '',
                proxyNode.hasAttribute('aria-controls') ? 'aria-controls' : '',
                proxyNode.hasAttribute('tabindex') ? 'tabindex' : '',
                attributeEntries.some((attribute) => attribute.name.startsWith('data-')) ? 'data' : '',
                attributeEntries.some((attribute) => DOCUSIGN_ATTRIBUTE_NAME_RE.test(attribute.name)) ? 'docusign' : '',
                tokenShapes.items.join(','),
                valueHints.items.join(','),
              ].join('|'),
            };
          });

          const proxyDepthBuckets = summarizeItems(rawProxyEntries.map((entry) => entry.depthBucket), 6);
          const proxyTagBuckets = summarizeItems(rawProxyEntries.map((entry) => entry.tagBucket), 8);
          const proxyRoleBuckets = summarizeItems(rawProxyEntries.map((entry) => entry.roleBucket), 5);
          const proxyValues = rawProxyEntries.flatMap((entry) => entry.attributeEntries.map((attribute) => attribute.value));
          const tokenShapes = collectTokenShapeSummary(proxyValues);
          const valueHints = collectValueHintSummary(proxyValues);

          return {
            signature: {
              candidateSlot,
              inputVisibilityBucket: isRenderedElement(node) ? 'visible-input' : 'zero-size-or-hidden-input',
              visibleProxyCount: Math.min(rawProxyEntries.length, 6),
              visibleProxyCountTruncated: rawProxyEntries.length > 6,
              proxyDepthBuckets: proxyDepthBuckets.items,
              proxyDepthCount: proxyDepthBuckets.count,
              proxyDepthsTruncated: proxyDepthBuckets.truncated,
              proxyTagBuckets: proxyTagBuckets.items,
              proxyTagCount: proxyTagBuckets.count,
              proxyTagsTruncated: proxyTagBuckets.truncated,
              proxyRoleBuckets: proxyRoleBuckets.items,
              proxyRoleCount: proxyRoleBuckets.count,
              proxyRolesTruncated: proxyRoleBuckets.truncated,
              hasProxyClassAttribute: rawProxyEntries.some((entry) => entry.node.hasAttribute('class')),
              hasProxyRoleAttribute: rawProxyEntries.some((entry) => entry.node.hasAttribute('role')),
              hasProxyAriaLabel: rawProxyEntries.some((entry) => entry.node.hasAttribute('aria-label')),
              hasProxyAriaLabelledBy: rawProxyEntries.some((entry) => entry.node.hasAttribute('aria-labelledby')),
              hasProxyAriaDescribedBy: rawProxyEntries.some((entry) => entry.node.hasAttribute('aria-describedby')),
              hasProxyAriaControls: rawProxyEntries.some((entry) => entry.node.hasAttribute('aria-controls')),
              hasProxyForAttribute: rawProxyEntries.some((entry) => entry.node.hasAttribute('for')),
              hasProxyDataAttributes: rawProxyEntries.some((entry) => entry.attributeEntries.some((attribute) => attribute.name.startsWith('data-'))),
              hasProxyDocuSignMetadataAttributes: rawProxyEntries.some((entry) => entry.attributeEntries.some((attribute) => DOCUSIGN_ATTRIBUTE_NAME_RE.test(attribute.name))),
              hasProxyTabIndex: rawProxyEntries.some((entry) => entry.node.hasAttribute('tabindex')),
              hasForIdReference: forLabels.length > 0,
              forReferenceTargetExists: forLabels.length > 0,
              forReferenceTargetVisible: forLabels.some((label) => isRenderedElement(label)),
              hasAriaLabelledByReference: ariaLabelledByState.hasReference,
              ariaLabelledByTargetExists: ariaLabelledByState.targetExists,
              ariaLabelledByTargetVisible: ariaLabelledByState.targetVisible,
              hasAriaDescribedByReference: ariaDescribedByState.hasReference,
              ariaDescribedByTargetExists: ariaDescribedByState.targetExists,
              ariaDescribedByTargetVisible: ariaDescribedByState.targetVisible,
              hasAriaControlsReference: ariaControlsState.hasReference,
              ariaControlsTargetExists: ariaControlsState.targetExists,
              ariaControlsTargetVisible: ariaControlsState.targetVisible,
              hasDataReference: dataReferenceState.hasReference,
              dataReferenceTargetExists: dataReferenceState.targetExists,
              dataReferenceTargetVisible: dataReferenceState.targetVisible,
              hasDocuSignReference: docuSignReferenceState.hasReference,
              docuSignReferenceTargetExists: docuSignReferenceState.targetExists,
              docuSignReferenceTargetVisible: docuSignReferenceState.targetVisible,
              tokenShapeBuckets: tokenShapes.items,
              tokenShapeCount: tokenShapes.count,
              tokenShapesTruncated: tokenShapes.truncated,
              valueHintBuckets: valueHints.items,
              valueHintCount: valueHints.count,
              valueHintsTruncated: valueHints.truncated,
            },
            proxyPatternKey: rawProxyEntries.map((entry) => entry.patternKey).join('||') || 'no-proxy-pattern',
            referencePatternKey: [
              forLabels.length > 0 ? 'for' : '',
              ariaLabelledByState.hasReference ? 'aria-labelledby' : '',
              ariaDescribedByState.hasReference ? 'aria-describedby' : '',
              ariaControlsState.hasReference ? 'aria-controls' : '',
              dataReferenceState.hasReference ? 'data-reference' : '',
              docuSignReferenceState.hasReference ? 'docusign-reference' : '',
              valueHints.items.join(','),
              tokenShapes.items.join(','),
            ].join('|'),
          };
        };

        const buildRawRadioGraphicSignature = (
          node: HTMLElement,
          candidateSlot: number,
        ): RawRadioGraphicSignature => {
          const sameWrapperChildren = Array.from(node.parentElement?.children ?? [])
            .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
            .filter((candidate) => candidate !== node)
            .filter((candidate) => isRenderedElement(candidate));
          const previousSibling = node.previousElementSibling instanceof HTMLElement && isRenderedElement(node.previousElementSibling)
            ? [node.previousElementSibling]
            : [];
          const nextSibling = node.nextElementSibling instanceof HTMLElement && isRenderedElement(node.nextElementSibling)
            ? [node.nextElementSibling]
            : [];

          const collectGraphicNodes = (scopeNodes: HTMLElement[]): HTMLElement[] => {
            const graphicNodes: HTMLElement[] = [];
            const seenGraphicNodes = new Set<HTMLElement>();

            const addGraphicNode = (candidate: Element | null) => {
              if (!(candidate instanceof HTMLElement) || candidate === node || seenGraphicNodes.has(candidate)) return;
              if (!isRenderedElement(candidate)) return;

              const attributeEntries = collectElementAttributeEntries(candidate);
              const hintSummary = collectGraphicTokenHintSummary([
                clean(candidate.getAttribute('role')),
                ...attributeEntries.map((entry) => entry.name),
                ...attributeEntries.map((entry) => entry.value),
              ]);
              const graphicBucket = toGraphicNodeBucket(candidate);
              if (graphicBucket === 'unknown' && hintSummary.count === 0) return;

              seenGraphicNodes.add(candidate);
              graphicNodes.push(candidate);
            };

            for (const scopeNode of scopeNodes.slice(0, 6)) {
              addGraphicNode(scopeNode);
              const descendants = Array.from(
                scopeNode.querySelectorAll('svg, span, div, label, button, [role="radio"], [aria-checked], [aria-selected]'),
              )
                .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
                .slice(0, 6);
              for (const candidate of descendants) {
                addGraphicNode(candidate);
              }
            }

            return graphicNodes;
          };

          const wrapperGraphicNodes = collectGraphicNodes(sameWrapperChildren);
          const previousSiblingGraphicNodes = collectGraphicNodes(previousSibling);
          const nextSiblingGraphicNodes = collectGraphicNodes(nextSibling);
          const decorativeNodes = Array.from(new Set([
            ...wrapperGraphicNodes,
            ...previousSiblingGraphicNodes,
            ...nextSiblingGraphicNodes,
          ]));

          const sameWrapperChildTagBuckets = summarizeItems(sameWrapperChildren.map((candidate) => toGraphicStructuralTagBucket(candidate)), 6);
          const previousSiblingTagBuckets = summarizeItems(previousSibling.map((candidate) => toGraphicStructuralTagBucket(candidate)), 2);
          const nextSiblingTagBuckets = summarizeItems(nextSibling.map((candidate) => toGraphicStructuralTagBucket(candidate)), 2);
          const decorativeNodeBuckets = summarizeItems(decorativeNodes.map((candidate) => toGraphicNodeBucket(candidate)), 8);
          const roleBuckets = summarizeItems(decorativeNodes.map((candidate) => toProxyRoleBucket(candidate)), 5);
          const tokenHintSummary = collectGraphicTokenHintSummary(decorativeNodes.flatMap((candidate) => {
            const attributeEntries = collectElementAttributeEntries(candidate);
            return [
              candidate.tagName.toLowerCase(),
              clean(candidate.getAttribute('role')),
              ...attributeEntries.map((entry) => entry.name),
              ...attributeEntries.map((entry) => entry.value),
            ];
          }));
          const wrapperDecorativeBuckets = summarizeItems(wrapperGraphicNodes.map((candidate) => toGraphicNodeBucket(candidate)), 8);
          const wrapperRoleBuckets = summarizeItems(wrapperGraphicNodes.map((candidate) => toProxyRoleBucket(candidate)), 5);
          const siblingDecorativeBuckets = summarizeItems([
            ...previousSiblingGraphicNodes,
            ...nextSiblingGraphicNodes,
          ].map((candidate) => toGraphicNodeBucket(candidate)), 8);
          const siblingRoleBuckets = summarizeItems([
            ...previousSiblingGraphicNodes,
            ...nextSiblingGraphicNodes,
          ].map((candidate) => toProxyRoleBucket(candidate)), 5);

          return {
            signature: {
              candidateSlot,
              sameWrapperChildTagBuckets: sameWrapperChildTagBuckets.items,
              sameWrapperChildTagCount: sameWrapperChildTagBuckets.count,
              sameWrapperChildTagsTruncated: sameWrapperChildTagBuckets.truncated,
              previousSiblingTagBuckets: previousSiblingTagBuckets.items,
              previousSiblingTagCount: previousSiblingTagBuckets.count,
              previousSiblingTagsTruncated: previousSiblingTagBuckets.truncated,
              nextSiblingTagBuckets: nextSiblingTagBuckets.items,
              nextSiblingTagCount: nextSiblingTagBuckets.count,
              nextSiblingTagsTruncated: nextSiblingTagBuckets.truncated,
              decorativeNodeBuckets: decorativeNodeBuckets.items,
              decorativeNodeCount: decorativeNodeBuckets.count,
              decorativeNodesTruncated: decorativeNodeBuckets.truncated,
              roleBuckets: roleBuckets.items,
              roleCount: roleBuckets.count,
              rolesTruncated: roleBuckets.truncated,
              tokenHintBuckets: tokenHintSummary.items,
              tokenHintCount: tokenHintSummary.count,
              tokenHintsTruncated: tokenHintSummary.truncated,
              hasSameChoiceCue: tokenHintSummary.cueState.same,
              hasDifferentChoiceCue: tokenHintSummary.cueState.different,
              hasYesChoiceCue: tokenHintSummary.cueState.yes,
              hasNoChoiceCue: tokenHintSummary.cueState.no,
            },
            wrapperPatternKey: [
              sameWrapperChildTagBuckets.items.join(','),
              wrapperDecorativeBuckets.items.join(','),
              wrapperRoleBuckets.items.join(','),
            ].join('|') || 'no-wrapper-graphics',
            siblingPatternKey: [
              previousSiblingTagBuckets.items.join(','),
              nextSiblingTagBuckets.items.join(','),
              siblingDecorativeBuckets.items.join(','),
              siblingRoleBuckets.items.join(','),
            ].join('|') || 'no-direct-sibling-graphics',
            tokenHintSet: new Set(tokenHintSummary.items),
          };
        };

        const bucketPatternCommonality = <T extends string>(
          keys: string[],
          sameBucket: T,
          distinctBucket: T,
          mixedBucket: T,
        ): T => {
          const uniqueCount = new Set(keys).size;
          if (keys.length <= 1 || uniqueCount <= 1) return sameBucket;
          if (uniqueCount === keys.length) return distinctBucket;
          return mixedBucket;
        };

        const bucketSpacing = (gap: number): RadioSpacingBucket => {
          if (gap <= 16) return asBucket('tight');
          if (gap <= 56) return asBucket('normal');
          return asBucket('far');
        };

        const directionBucketFor = (target: RectLike, candidate: RectLike): LayoutProximityDirection | null => {
          const horizontalOverlap = candidate.right >= target.left && candidate.left <= target.right;
          const verticalOverlap = candidate.bottom >= target.top && candidate.top <= target.bottom;
          const centerDx = ((candidate.left + candidate.right) / 2) - ((target.left + target.right) / 2);
          const centerDy = ((candidate.top + candidate.bottom) / 2) - ((target.top + target.bottom) / 2);
          const rowThreshold = Math.max(28, Math.max(target.height, candidate.height));
          const columnThreshold = Math.max(28, Math.max(target.width, candidate.width));

          if (candidate.bottom <= target.top && horizontalOverlap) return 'above';
          if (candidate.top >= target.bottom && horizontalOverlap) return 'below';
          if (candidate.right <= target.left && verticalOverlap) return 'left';
          if (candidate.left >= target.right && verticalOverlap) return 'right';
          if (Math.abs(centerDy) <= rowThreshold) return 'same-row';
          if (Math.abs(centerDx) <= columnThreshold) return 'same-column';

          if (Math.abs(centerDy) >= Math.abs(centerDx)) {
            return centerDy < 0 ? 'above' : 'below';
          }
          return centerDx < 0 ? 'left' : 'right';
        };

        const distanceBucketFor = (gap: number): LayoutProximityDistanceBucket => {
          if (gap <= 20) return 'immediate';
          if (gap <= 72) return 'near';
          return 'farther';
        };

        if (isRadioLike) {
          const inputRect = toRectLike(inputEl.getBoundingClientRect());
          const radioElements = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'))
            .filter((node): node is HTMLElement => node instanceof HTMLElement)
            .filter((node) => {
              if (node === inputEl) return true;

              const rect = node.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;

              const sameNamedInput = ownType === 'radio'
                && node.tagName.toLowerCase() === 'input'
                && node.getAttribute('type')?.toLowerCase() === 'radio'
                && node.getAttribute('name')
                && node.getAttribute('name') === elementName;
              if (sameNamedInput) return true;

              const currentGroup = el.closest('[role="radiogroup"], [role="group"], fieldset');
              return Boolean(currentGroup && currentGroup.contains(node));
            });

          const radioRects = radioElements.map((node, index) => ({
            index,
            isCurrent: node === inputEl,
            node,
            rect: toRectLike(node.getBoundingClientRect()),
          }));
          const currentRadio = radioRects.find((entry) => entry.isCurrent) ?? {
            index: 0,
            isCurrent: true,
            node: inputEl,
            rect: inputRect,
          };
          const rawAttributeSignatures = radioRects.map((entry) => ({
            isCurrent: entry.isCurrent,
            ...buildRawRadioAttributeSignature(entry.node),
          }));
          const currentAttributeSignature = rawAttributeSignatures.find((entry) => entry.isCurrent) ?? null;

          if (currentAttributeSignature) {
            domAttributeSignature = {
              ...currentAttributeSignature.signature,
              wrapperPatternBucket: bucketPatternCommonality(
                rawAttributeSignatures.map((entry) => entry.wrapperPatternKey),
                'same-wrapper-pattern',
                'distinct-wrapper-pattern',
                'mixed-wrapper-pattern',
              ),
              attributePatternBucket: bucketPatternCommonality(
                rawAttributeSignatures.map((entry) => entry.attributePatternKey),
                'same-attribute-pattern',
                'distinct-attribute-pattern',
                'mixed-attribute-pattern',
              ),
            };
          }

          const rawProxySignatures = radioRects.map((entry) => ({
            isCurrent: entry.isCurrent,
            ...buildRawRadioProxyReferenceSignature(entry.node, entry.index + 1),
          }));
          const currentProxySignature = rawProxySignatures.find((entry) => entry.isCurrent) ?? null;

          if (currentProxySignature) {
            proxyReferenceSignature = {
              ...currentProxySignature.signature,
              proxyPatternBucket: bucketPatternCommonality(
                rawProxySignatures.map((entry) => entry.proxyPatternKey),
                'same-proxy-pattern',
                'distinct-proxy-pattern',
                'mixed-proxy-pattern',
              ),
              referencePatternBucket: bucketPatternCommonality(
                rawProxySignatures.map((entry) => entry.referencePatternKey),
                'same-reference-pattern',
                'distinct-reference-pattern',
                'mixed-reference-pattern',
              ),
            };
          }

          const rawGraphicSignatures = radioRects.map((entry) => ({
            isCurrent: entry.isCurrent,
            ...buildRawRadioGraphicSignature(entry.node, entry.index + 1),
          }));
          const currentGraphicSignature = rawGraphicSignatures.find((entry) => entry.isCurrent) ?? null;

          if (currentGraphicSignature) {
            const otherTokenHintSets = rawGraphicSignatures
              .filter((entry) => !entry.isCurrent)
              .map((entry) => entry.tokenHintSet);
            const currentTokenHints = [...currentGraphicSignature.tokenHintSet];

            radioGraphicSignature = {
              ...currentGraphicSignature.signature,
              sameWrapperCommonalityBucket: bucketPatternCommonality(
                rawGraphicSignatures.map((entry) => entry.wrapperPatternKey),
                'same-wrapper-graphic-pattern',
                'distinct-wrapper-graphic-pattern',
                'mixed-wrapper-graphic-pattern',
              ),
              directSiblingCommonalityBucket: bucketPatternCommonality(
                rawGraphicSignatures.map((entry) => entry.siblingPatternKey),
                'same-direct-sibling-graphic-pattern',
                'distinct-direct-sibling-graphic-pattern',
                'mixed-direct-sibling-graphic-pattern',
              ),
              hasUniqueTokenHintBucket: otherTokenHintSets.length > 0
                && currentTokenHints.some((bucket) => otherTokenHintSets.every((set) => !set.has(bucket))),
              hasSharedTokenHintBucket: otherTokenHintSets.length > 0
                && currentTokenHints.some((bucket) => otherTokenHintSets.some((set) => set.has(bucket))),
            };
          }

          if (inputRect.width > 0 && inputRect.height > 0) {
            const visibleRadioRects = radioRects.filter((entry) => entry.rect.width > 0 && entry.rect.height > 0);
            const currentVisibleRadio = visibleRadioRects.find((entry) => entry.isCurrent) ?? currentRadio;
            const groupRect = unionRects(visibleRadioRects.map((entry) => entry.rect)) ?? inputRect;

            const centers = visibleRadioRects.map((entry) => ({
              x: (entry.rect.left + entry.rect.right) / 2,
              y: (entry.rect.top + entry.rect.bottom) / 2,
            }));
            const maxCenterDx = centers.length > 1 ? Math.max(...centers.map((entry) => entry.x)) - Math.min(...centers.map((entry) => entry.x)) : 0;
            const maxCenterDy = centers.length > 1 ? Math.max(...centers.map((entry) => entry.y)) - Math.min(...centers.map((entry) => entry.y)) : 0;
            const avgWidth = visibleRadioRects.reduce((sum, entry) => sum + entry.rect.width, 0) / visibleRadioRects.length;
            const avgHeight = visibleRadioRects.reduce((sum, entry) => sum + entry.rect.height, 0) / visibleRadioRects.length;
            const rowTolerance = Math.max(18, avgHeight * 1.25);
            const columnTolerance = Math.max(18, avgWidth * 1.25);

            let alignmentBucket: RadioAlignmentBucket = 'single';
            if (visibleRadioRects.length > 1) {
              const rowAligned = maxCenterDy <= rowTolerance;
              const columnAligned = maxCenterDx <= columnTolerance;
              if (rowAligned && !columnAligned) alignmentBucket = 'horizontal';
              else if (columnAligned && !rowAligned) alignmentBucket = 'vertical';
              else alignmentBucket = 'mixed';
            }

            let groupPatternBucket: RadioGroupPatternBucket = 'single';
            let repeatedGroupPattern = false;
            if (visibleRadioRects.length > 1) {
              if (alignmentBucket === 'horizontal') {
                groupPatternBucket = 'repeated-row-group';
                repeatedGroupPattern = visibleRadioRects.length >= 3;
              } else if (alignmentBucket === 'vertical') {
                groupPatternBucket = 'repeated-column-group';
                repeatedGroupPattern = visibleRadioRects.length >= 3;
              } else {
                groupPatternBucket = 'mixed-group';
              }
            }

            const sortRects = (entries: typeof visibleRadioRects) => {
              if (alignmentBucket === 'horizontal') {
                return [...entries].sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);
              }
              if (alignmentBucket === 'vertical') {
                return [...entries].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
              }
              return [...entries].sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
            };

            const sortedRects = sortRects(visibleRadioRects);
            const currentOrderIndex = sortedRects.findIndex((entry) => entry.isCurrent);
            let relativeOrderBucket: RadioRelativeOrderBucket = 'single';
            if (sortedRects.length > 1) {
              if (currentOrderIndex <= 0) relativeOrderBucket = 'first';
              else if (currentOrderIndex >= sortedRects.length - 1) relativeOrderBucket = 'last';
              else relativeOrderBucket = 'middle';
            }

            const axisGaps = sortedRects.slice(1).map((entry, index) => {
              const prior = sortedRects[index];
              if (alignmentBucket === 'vertical') return Math.max(0, entry.rect.top - prior.rect.bottom);
              return Math.max(0, entry.rect.left - prior.rect.right);
            });
            const averageGap = axisGaps.length
              ? axisGaps.reduce((sum, gap) => sum + gap, 0) / axisGaps.length
              : 0;
            const spacingBucket = bucketSpacing(averageGap);

            let shapeBucket: RadioShapeBucket = 'single-control';
            if (visibleRadioRects.length > 1) {
              shapeBucket = (groupRect.width <= 180 && groupRect.height <= 96)
                ? 'compact-group'
                : 'spread-group';
            }

            const parentNodes = visibleRadioRects.map((entry) => entry.node.parentElement);
            const grandparentNodes = parentNodes.map((node) => node?.parentElement ?? null);
            const sectionNodes = visibleRadioRects.map((entry) => entry.node.closest(
              '[role="radiogroup"], [role="group"], fieldset, tr, [role="row"], section, article, .card, .doc-tab',
            ));
            let sharedContainerBucket: RadioSharedContainerBucket = 'mixed';
            if (sameNode(parentNodes)) sharedContainerBucket = 'same-parent';
            else if (sameNode(grandparentNodes)) sharedContainerBucket = 'same-grandparent';
            else if (sameNode(sectionNodes)) sharedContainerBucket = 'same-section';

            const documentLayerFlags = visibleRadioRects.map((entry) => {
              const node = entry.node;
              return Boolean(
                node.closest('.doc-tab, [data-tabtype], [data-tab-type], [data-type]')
                || node.closest('[data-page-number], [data-page], [data-anchor], [aria-label*="page" i]')
                || /^tab-form-element-/i.test(node.getAttribute('id') ?? ''),
              );
            });
            const layerBucket: RadioLayerBucket = documentLayerFlags.every(Boolean)
              ? 'document-layer'
              : documentLayerFlags.some(Boolean)
                ? 'mixed'
                : 'html-form-layout';

            const pageLayerNodes = visibleRadioRects.map((entry) => {
              let walker: HTMLElement | null = entry.node;
              let up = 0;
              while (walker && up < 12) {
                if (walker.querySelector(':scope > img.page-image, :scope img.page-image')) return walker;
                walker = walker.parentElement;
                up += 1;
              }
              return null;
            });

            const metadataSignals = Array.from(new Set([
              el.hasAttribute('role') ? 'role' : null,
              el.hasAttribute('name') ? 'name' : null,
              el.hasAttribute('aria-label') ? 'aria-label' : null,
              el.hasAttribute('aria-labelledby') ? 'aria-labelledby' : null,
              el.hasAttribute('aria-describedby') ? 'aria-describedby' : null,
              el.hasAttribute('aria-required') ? 'aria-required' : null,
              el.hasAttribute('data-qa') || el.closest('[data-qa]') ? 'data-qa' : null,
              el.hasAttribute('data-tabtype') || el.hasAttribute('data-tab-type') || el.hasAttribute('data-type') || el.closest('[data-tabtype], [data-tab-type], [data-type]')
                ? 'data-tab-type'
                : null,
              /^tab-form-element-/i.test(el.getAttribute('id') ?? '') ? 'tab-guid' : null,
              layerBucket === 'document-layer' ? 'document-layer' : null,
              pageLayerNodes.some((node) => node) ? 'page-index' : null,
              pageLayerNodes.some((node) => node) ? 'ordinal-on-page' : null,
            ].filter((value): value is string => Boolean(value))));

            nonTextLayoutSignature = {
              groupMemberCount: Math.min(visibleRadioRects.length, 6),
              repeatedGroupPattern,
              groupPatternBucket,
              sharedContainerBucket,
              alignmentBucket,
              relativeOrderBucket,
              spacingBucket,
              shapeBucket,
              layerBucket,
              sharedDocumentLayer: layerBucket === 'document-layer' && sameNode(pageLayerNodes),
              metadataSignals: metadataSignals.slice(0, 8),
              metadataSignalCount: metadataSignals.length,
              metadataSignalsTruncated: metadataSignals.length > 8,
            };

            const candidateElements = Array.from(document.querySelectorAll('span, div, label, p, strong, b, em, legend, header, h1, h2, h3, h4, h5, h6, th, td, li'))
              .filter((node): node is Element => node instanceof Element);
            const seen = new Set<string>();
            const ranked: Array<{
              direction: LayoutProximityDirection;
              distanceBucket: LayoutProximityDistanceBucket;
              association: LayoutProximityAssociation;
              value: string;
              score: number;
            }> = [];

            for (const node of candidateElements) {
              if (node === el || node === inputEl) continue;
              if (node.contains(el) || el.contains(node)) continue;
              if (isInteractive(node)) continue;
              if (node.children.length > 6) continue;

              const text = safeStaticText(node.textContent);
              if (!text) continue;

              const rect = toRectLike((node as HTMLElement).getBoundingClientRect());
              if (rect.width === 0 || rect.height === 0) continue;
              if (rect.width > 420 || rect.height > 120) continue;

              const currentGap = rectGap(currentRadio.rect, rect);
              const groupGap = rectGap(groupRect, rect);
              if (Math.min(currentGap, groupGap) > 160) continue;

              const radioDistances = visibleRadioRects
                .map((entry) => ({ index: entry.index, isCurrent: entry.isCurrent, gap: rectGap(entry.rect, rect), center: centerDistance(entry.rect, rect) }))
                .sort((a, b) => a.gap - b.gap || a.center - b.center);

              const closest = radioDistances[0];
              const second = radioDistances[1] ?? null;
              const closePeerCount = radioDistances.filter((entry) => entry.gap <= closest.gap + 20).length;
              const spansGroupHorizontally = rect.left <= groupRect.right && rect.right >= groupRect.left;
              const spansGroupVertically = rect.top <= groupRect.bottom && rect.bottom >= groupRect.top;

              let association: LayoutProximityAssociation | null = null;
              if (radioDistances.length > 1 && groupGap <= 120 && (spansGroupHorizontally || spansGroupVertically)) {
                association = 'group';
              } else if (closest.isCurrent && (!second || second.gap - closest.gap > 20)) {
                association = 'closest-radio';
              } else if (closePeerCount >= 2) {
                association = 'multiple-radios';
              } else if (closest.isCurrent) {
                association = 'closest-radio';
              }

              if (!association) continue;
              if (association === 'closest-radio' && !closest.isCurrent) continue;

              const direction = association === 'group' ? 'near-group' : directionBucketFor(currentVisibleRadio.rect, rect);
              if (!direction) continue;

              const gap = association === 'group' ? groupGap : currentGap;
              const distanceBucket = distanceBucketFor(gap);
              const key = `${direction}|${distanceBucket}|${association}|${text}`;
              if (seen.has(key)) continue;
              seen.add(key);

              ranked.push({
                direction,
                distanceBucket,
                association,
                value: text,
                score: gap + (association === 'closest-radio' ? 0 : association === 'group' ? 8 : 12),
              });
            }

            ranked
              .sort((a, b) => a.score - b.score || a.value.length - b.value.length)
              .slice(0, 6)
              .forEach(({ direction, distanceBucket, association, value }) => {
                layoutProximityTexts.push({ direction, distanceBucket, association, value });
              });
          }
        }
      } catch {
        /* ignore */
      }

      // --- Page index + ordinal-on-page -----------------------------------
      // Used by the optional enrichment seam to match tabs to the offline
      // sample-field-enrichment bundle by positional fingerprint.
      let pageIndex: number | null = null;
      let ordinalOnPage: number | null = null;
      let tabLeft: number | null = null;
      let tabTop: number | null = null;
      let tabWidth: number | null = null;
      let tabHeight: number | null = null;
      try {
        // Locate the enclosing DocuSign tab div (data-type lives here) and
        // the enclosing page container (which owns the `img.page-image`).
        const tabDiv = (el.closest('.doc-tab[data-type]') ?? el.closest('.doc-tab')) as HTMLElement | null;
        const px = (prop: string): number | null => {
          const style = tabDiv?.getAttribute('style') ?? '';
          const match = new RegExp(`${prop}\\s*:\\s*([0-9.]+)px`, 'i').exec(style);
          if (!match) return null;
          const n = Number(match[1]);
          return Number.isFinite(n) ? n : null;
        };
        tabLeft = px('left');
        tabTop = px('top');
        tabWidth = px('width');
        tabHeight = px('height');

        // Walk up to the nearest container that includes an `img.page-image`.
        let pageContainer: HTMLElement | null = null;
        let walker: HTMLElement | null = (tabDiv ?? el) as HTMLElement | null;
        let up = 0;
        while (walker && up < 12) {
          if (walker.querySelector(':scope > img.page-image, :scope img.page-image')) {
            pageContainer = walker;
            break;
          }
          walker = walker.parentElement;
          up++;
        }

        if (pageContainer) {
          // Preferred: read `p=N` from the image's src.
          const img = pageContainer.querySelector('img.page-image') as HTMLImageElement | null;
          const src = img?.getAttribute('src') ?? '';
          const pMatch = /[?&]p=(\d+)\b/.exec(src);
          if (pMatch) {
            pageIndex = parseInt(pMatch[1], 10);
          } else {
            // Fallback: document-order rank among all page-image elements.
            const allPages = Array.from(document.querySelectorAll('img.page-image'));
            const idx = img ? allPages.indexOf(img) : -1;
            if (idx >= 0) pageIndex = idx + 1;
          }

          if (tabDiv) {
            const pageTabs = Array.from(pageContainer.querySelectorAll('.doc-tab'));
            const idx = pageTabs.indexOf(tabDiv);
            if (idx >= 0) ordinalOnPage = idx + 1;
          }
        }
      } catch {
        /* ignore — enrichment is best-effort */
      }

      return {
        labelledByText,
        labelForText,
        wrappingLabelText,
        rowHeaderText,
        precedingText,
        positionalPromptText,
        sectionHeading,
        dataTabType,
        className,
        ownClassName,
        dataQa,
        ownDataTabType,
        elementId,
        elementName,
        groupName,
        valueLikeNearText,
        anchorText,
        currentValue,
        parentContainerTexts,
        grandparentContainerTexts,
        sectionContainerTexts,
        containerPrecedingTexts,
        containerFollowingTexts,
        layoutProximityTexts,
        nonTextLayoutSignature,
        domAttributeSignature,
        proxyReferenceSignature,
        radioGraphicSignature,
        radioSurfaceBuildDiagnostics,
        pageIndex,
        ordinalOnPage,
        tabLeft,
        tabTop,
        tabWidth,
        tabHeight,
      };
    }, { timeout: 1_500 });
  } catch {
    return fallback;
  }
}

function parseIntOrNull(s: string | null): number | null {
  if (s === null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function hasSafeFieldDiscoveryText(value: string | null | undefined): boolean {
  const normalized = (value ?? '').trim();
  if (!normalized || normalized.length > 160) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) return false;
  if (/^[0-9a-f]{24,}$/i.test(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  return true;
}

function collectFieldDiscoveryRadioHintBuckets(input: {
  domAttributeSignature: RadioDomAttributeSignature | null;
  proxyReferenceSignature: RadioProxyReferenceSignature | null;
  radioGraphicSignature: RadioGraphicSignature | null;
}): string[] {
  return [
    ...(input.domAttributeSignature?.tokenShapeBuckets ?? []),
    ...(input.domAttributeSignature?.valueHintBuckets ?? []),
    ...(input.proxyReferenceSignature?.tokenShapeBuckets ?? []),
    ...(input.proxyReferenceSignature?.valueHintBuckets ?? []),
    ...(input.radioGraphicSignature?.tokenHintBuckets ?? []),
  ];
}

function hasNonGenericFieldDiscoveryRadioHintBucket(bucket: string): boolean {
  return bucket === 'business-physical-address-token'
    || bucket === 'physical-operating-address-token'
    || bucket === 'operating-address-token'
    || bucket === 'mailing-address-token'
    || bucket === 'legal-address-token'
    || bucket === 'virtual-address-token';
}

function buildFieldDiscoveryRadioSurfaceDiagnostics(input: {
  kind: FieldKind;
  domCtx: ExtractedDomContext;
  idOrNameKey: string | null;
  resolvedLabel: string | null;
  rawCandidateLabels: LabelCandidate[];
  containerContextLabels: LabelCandidate[];
  layoutProximityLabels: LayoutProximityLabelCandidate[];
  nonTextLayoutSignature: RadioNonTextLayoutSignature | null;
  domAttributeSignature: RadioDomAttributeSignature | null;
  proxyReferenceSignature: RadioProxyReferenceSignature | null;
  radioGraphicSignature: RadioGraphicSignature | null;
  rejectedLabelCandidates: RejectedLabelCandidate[];
}): FieldDiscoveryRadioSurfaceDiagnostics | null {
  if (input.kind !== 'radio') return null;

  const buildDiagnostics = input.domCtx.radioSurfaceBuildDiagnostics ?? {
    buildersAttempted: false,
    buildersSkipped: true,
    builderSkipReasons: ['dom-context-extraction-failed'] as FieldDiscoveryRadioBuilderSkipReason[],
  };
  const hasIdOrNameKey = Boolean(input.idOrNameKey);
  const hasSafeFieldKey = Boolean(input.idOrNameKey && !isGenericDocusignIdKey(input.idOrNameKey));
  const hasInputName = hasSafeFieldDiscoveryText(input.domCtx.elementName);
  const hasGroupName = hasSafeFieldDiscoveryText(input.domCtx.groupName);
  const hasResolvedLabel = Boolean((input.resolvedLabel ?? '').trim());
  const hasContainerContext = input.containerContextLabels.length > 0;
  const hasLayoutProximity = input.layoutProximityLabels.length > 0;
  const hasLabelBucket = input.rawCandidateLabels.length > 0 || hasResolvedLabel || hasContainerContext || hasLayoutProximity;
  const hasProxyReference = Boolean(input.proxyReferenceSignature);
  const hasDomAttribute = Boolean(input.domAttributeSignature);
  const hasRadioGraphic = Boolean(input.radioGraphicSignature);
  const hasNonTextLayout = Boolean(input.nonTextLayoutSignature);
  const anyDiagnosticSurface = hasSafeFieldKey
    || hasIdOrNameKey
    || hasInputName
    || hasGroupName
    || hasResolvedLabel
    || hasLabelBucket
    || hasProxyReference
    || hasDomAttribute
    || hasRadioGraphic
    || hasNonTextLayout
    || hasContainerContext
    || hasLayoutProximity;
  const surfaceEmpty = !anyDiagnosticSurface;
  const hintBuckets = collectFieldDiscoveryRadioHintBuckets({
    domAttributeSignature: input.domAttributeSignature,
    proxyReferenceSignature: input.proxyReferenceSignature,
    radioGraphicSignature: input.radioGraphicSignature,
  });
  const hasGeneratedHint = hintBuckets.some((bucket) => bucket === 'generated-token-pattern' || bucket === 'generated/generic-only-token');
  const hasNonGenericHint = hintBuckets.some(hasNonGenericFieldDiscoveryRadioHintBucket);
  const generatedOnly = surfaceEmpty && hasGeneratedHint && !hasNonGenericHint;
  const genericOnly = surfaceEmpty && hintBuckets.length > 0 && !hasGeneratedHint && !hasNonGenericHint;
  const unsafeOmitted = surfaceEmpty && (
    input.rejectedLabelCandidates.length > 0
    || Boolean(input.domCtx.elementId)
    || Boolean(input.domCtx.elementName)
    || Boolean(input.domCtx.dataQa)
    || Boolean(input.domCtx.groupName)
  );
  const attachmentGapDetected = buildDiagnostics.buildersAttempted
    && !buildDiagnostics.buildersSkipped
    && (
      (input.domCtx.nonTextLayoutSignature !== null && input.nonTextLayoutSignature === null)
      || (input.domCtx.domAttributeSignature !== null && input.domAttributeSignature === null)
      || (input.domCtx.proxyReferenceSignature !== null && input.proxyReferenceSignature === null)
      || (input.domCtx.radioGraphicSignature !== null && input.radioGraphicSignature === null)
      || (((input.domCtx.parentContainerTexts.length
        + input.domCtx.grandparentContainerTexts.length
        + input.domCtx.sectionContainerTexts.length
        + input.domCtx.containerPrecedingTexts.length
        + input.domCtx.containerFollowingTexts.length) > 0)
        && !hasContainerContext)
      || (input.domCtx.layoutProximityTexts.length > 0 && !hasLayoutProximity)
      || (hasSafeFieldDiscoveryText(input.domCtx.elementName) && !hasInputName)
      || (hasSafeFieldDiscoveryText(input.domCtx.groupName) && !hasGroupName)
    );

  return {
    buildersAttempted: buildDiagnostics.buildersAttempted,
    buildersSkipped: buildDiagnostics.buildersSkipped,
    builderSkipReasons: buildDiagnostics.builderSkipReasons,
    hasSafeFieldKey,
    hasIdOrNameKey,
    hasInputName,
    hasGroupName,
    hasResolvedLabel,
    hasLabelBucket,
    hasProxyReference,
    hasDomAttribute,
    hasRadioGraphic,
    hasNonTextLayout,
    hasContainerContext,
    hasLayoutProximity,
    generatedOnly,
    unsafeOmitted,
    genericOnly,
    anyDiagnosticSurface,
    surfaceEmpty,
    attachmentGapDetected,
  };
}

/**
 * Chrome / instructional phrases that DocuSign renders near tab inputs.
 * These are NOT field labels — treat as rejectable.
 */
const CHROME_TEXT_RE =
  /(this\s*link\s*will\s*open|select\s*to\s*load|click\s*here|loading\.{3}|please\s*wait|page\s*\d+\s*of|view\s*all\s*fields|required\s*field|optional\s*field|see\s*instructions|drag\s*and\s*drop)/i;

/**
 * Return true when a string looks like a VALUE (currency, number, email,
 * URL, phone, date, GUID, bare digits) rather than a prompt.  We accept
 * values as fallback labels only when nothing else is available.
 */
export function looksLikeValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  // Currency / formatted number: "4,013,394.00", "$1,200", "1815.00", "605"
  if (/^\$?\s*-?\d{1,3}(,\d{3})*(\.\d+)?\s*%?$/.test(v)) return true;
  if (/^\$?\s*-?\d+(\.\d+)?\s*%?$/.test(v)) return true;
  // Email
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(v)) return true;
  // URL
  if (/^(https?:\/\/|www\.)\S+$/i.test(v)) return true;
  // Phone
  if (/^[\s()+\-.]*\d[\s()+\-.\d]{6,}$/.test(v) && /\d{7,}/.test(v.replace(/\D/g, ''))) return true;
  // Date-ish
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)) return true;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v)) return true;
  // GUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  // SSN/EIN-shaped
  if (/^\d{3}-\d{2}-\d{4}$/.test(v) || /^\d{2}-\d{7}$/.test(v)) return true;
  // Corporate registration / state filing ids: 1-3 letters followed by 5+
  // digits (e.g. "NC1023126", "DL1234567").  Not a prompt.
  if (/^[A-Z]{1,3}\d{5,}$/.test(v)) return true;
  return false;
}

function looksLikeChromeText(value: string): boolean {
  return CHROME_TEXT_RE.test(value);
}

function isGenericDocusignTabTypeLabel(value: string): boolean {
  return /^(text|list|checkbox|radio|date|signhere|signerattachment|datesigned|fullname|email|formula|unknown)$/i.test(
    value.trim(),
  );
}

/**
 * Classify a candidate label.  Returns either { ok: true } or a rejection
 * reason.  Separated from looksLikeRealLabel so callers can collect the
 * rejection diagnostics.
 */
function classifyLabelCandidate(
  value: string | null | undefined,
  ctx?: { fieldValue?: string | null; knownFieldValues?: ReadonlySet<string> },
): { ok: true } | { ok: false; reason: LabelRejectReason } {
  if (!value) return { ok: false, reason: 'too-short' };
  const v = value.trim();
  if (v.length < 2) return { ok: false, reason: 'too-short' };
  if (v.length > 120) return { ok: false, reason: 'too-long' };
  // Candidate equals the field's own current value -> it's the value, not a label.
  const fv = ctx?.fieldValue?.trim();
  if (fv && fv.length >= 2 && v === fv) {
    return { ok: false, reason: 'equals-field-value' };
  }
  // Candidate equals some OTHER input's value, or contains one as a long
  // enough substring.  DocuSign PDF renders each filled-in tab as a sibling
  // span so preceding-text often picks up the business name entered a few
  // fields earlier, sometimes concatenated with "Required"/"Optional".
  if (ctx?.knownFieldValues && ctx.knownFieldValues.size) {
    if (ctx.knownFieldValues.has(v)) {
      return { ok: false, reason: 'equals-field-value' };
    }
    // Strip trailing "Required"/"Optional" decoration and retest.
    const stripped = v.replace(/\s*\b(required|optional)\b\s*$/i, '').trim();
    if (stripped && stripped !== v && ctx.knownFieldValues.has(stripped)) {
      return { ok: false, reason: 'equals-field-value' };
    }
    for (const known of ctx.knownFieldValues) {
      if (known.length < 4) continue;
      if (v.includes(known)) return { ok: false, reason: 'equals-field-value' };
    }
  }
  // Classic DocuSign stubs at the start.
  if (
    /^(required\s*[-–]?\s*)?(attachment|signhere|signature|datesigned|full\s*name|initial\s*here|initials|optional\s*signature|signer\s*attachment)(\s*[-–]\s*.+)?$/i.test(
      v,
    )
  ) {
    return { ok: false, reason: 'docusign-stub' };
  }
  if (isGenericDocusignTabTypeLabel(v)) {
    return { ok: false, reason: 'generic-docusign-tab-type' };
  }
  if (/^(required|optional)$/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  if (
    /^(required|optional)\s*[-–]?\s*(date|number|text|name|initial|address|addressoptions|checkbox|dropdown|list|ssn|ein|zip|email|phone|state|attachment|signhere|signature|signer\s*attachment)\b/i.test(
      v,
    )
  ) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // "Required - federalTaxIdType", "Required - stakeholder1IdType",
  // "Required - legalState": DocuSign field-identifier decoration.
  if (/^(required|optional)\s*[-–]\s*[a-z][a-zA-Z0-9]{2,}\s*$/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // Combobox accessible name that starts with "-- Select --".
  if (/^-{1,3}\s*select\s*-{1,3}/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // "100 Required", "1 Required - ..."
  if (/^\d+\s+(required|optional)\b/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  // Compound DocuSign decoration strings that can appear ANYWHERE in the text,
  // e.g. "Required-AttachmentRequired-Attachment - SignerAttachmentOptional".
  if (/signer\s*attachment/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  if (/attachment\s*(required|optional)/i.test(v)) return { ok: false, reason: 'docusign-stub' };
  if (/(required|optional)\s*[-–]?\s*attachment/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // "Required - Select at least 1 field", "Select at least 2 fields"
  if (/select\s+at\s+least\s+\d+\s+field/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  // Bare "Required" / "Optional" on their own aren't labels.
  if (/^(required|optional)\s*$/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  if (/^(attachment|signhere|datesigned|fullname|formula|readonly)(tab)?$/i.test(v)) {
    return { ok: false, reason: 'docusign-stub' };
  }
  if (/^[\s\-_|•·:;,]+$/.test(v)) return { ok: false, reason: 'pure-punctuation' };
  if (/^\d+$/.test(v)) return { ok: false, reason: 'pure-digits' };
  if (looksLikeChromeText(v)) return { ok: false, reason: 'chrome-text' };
  if (looksLikeValue(v)) return { ok: false, reason: 'looks-like-value' };
  return { ok: true };
}

function looksLikeRealLabel(
  value: string | null | undefined,
  ctx?: { fieldValue?: string | null; knownFieldValues?: ReadonlySet<string> },
): value is string {
  return classifyLabelCandidate(value, ctx).ok;
}

function pickLabel(
  candidates: LabelCandidate[],
  ctx?: { fieldValue?: string | null; knownFieldValues?: ReadonlySet<string> },
): {
  resolvedLabel: string | null;
  labelSource: LabelSource;
  labelConfidence: LabelConfidence;
  labelLooksLikeValue: boolean;
  rejected: RejectedLabelCandidate[];
} {
  const order: Array<{ source: LabelSource; confidence: LabelConfidence }> = [
    { source: 'aria-label', confidence: 'high' },
    { source: 'aria-labelledby', confidence: 'high' },
    { source: 'label-for', confidence: 'high' },
    { source: 'wrapping-label', confidence: 'high' },
    { source: 'id-or-name-key', confidence: 'high' },
    { source: 'positional-prompt', confidence: 'medium' },
    { source: 'row-header', confidence: 'medium' },
    { source: 'title', confidence: 'medium' },
    { source: 'placeholder', confidence: 'medium' },
    { source: 'preceding-text', confidence: 'medium' },
    { source: 'section+row', confidence: 'low' },
    { source: 'described-by', confidence: 'low' },
    { source: 'helper-text', confidence: 'low' },
    { source: 'docusign-tab-type', confidence: 'low' },
  ];

  const rejected: RejectedLabelCandidate[] = [];
  for (const c of candidates) {
    const result = classifyLabelCandidate(c.value, ctx);
    if (!result.ok) rejected.push({ source: c.source, value: c.value, reason: result.reason });
  }

  for (const o of order) {
    const hit = candidates.find(
      (c) => c.source === o.source && looksLikeRealLabel(c.value, ctx),
    );
    if (hit) {
      return {
        resolvedLabel: hit.value.trim(),
        labelSource: o.source,
        labelConfidence: o.confidence,
        labelLooksLikeValue: false,
        rejected,
      };
    }
  }

  return {
    resolvedLabel: null,
    labelSource: 'none',
    labelConfidence: 'none',
    labelLooksLikeValue: false,
    rejected,
  };
}

/**
 * Strength of evidence that a control is truly an attachment/upload widget.
 * Strong = the element ITSELF is a file input / upload button / explicit
 * DocuSign attachment tab. Weak = attachment tokens only appear on distant
 * ancestors or helper text — insufficient to reclassify a textbox/combobox.
 */
function attachmentEvidenceStrength(args: {
  kind: FieldKind;
  ownDataTabType: string | null;
  ownClassName: string | null;
  dataQa: string | null;
  resolvedLabel: string | null;
  ariaLabel: string | null;
  title: string | null;
  idOrNameKey: string | null;
}): AttachmentEvidence {
  const own = [args.ownDataTabType, args.ownClassName, args.dataQa]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // Strong: element-level DocuSign attachment markers
  if (/\bsignerattachment(tab)?\b|\battachment[-_]?tab\b|\battachment[-_]?widget\b/.test(own)) {
    return 'strong';
  }
  if (args.kind === 'upload') return 'strong';

  // Strong: id/name/label that explicitly indicates proof/document upload
  const keyHay = [args.idOrNameKey, args.resolvedLabel, args.ariaLabel, args.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (
    /(^|[_\- ])(proof|document|doc|attachment|upload|voided[-_]?check|bank[-_]?statement|id[-_]?front|id[-_]?back|w9|ein[-_]?letter)([_\- ]|$)/.test(
      keyHay,
    )
  ) {
    return 'strong';
  }
  if (/(upload|attach).*(file|document|image)/.test(keyHay)) return 'strong';

  return 'none';
}

/**
 * Derive a stable, meaningful key from id / name / data-qa.  Filters out
 * auto-generated GUID-ish DocuSign ids so callers don't match rule
 * signals against random tab ids.
 */
function deriveIdOrNameKey(
  elementId: string | null,
  elementName: string | null,
  dataQa: string | null,
): string | null {
  const candidates = [elementId, elementName, dataQa].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  for (const c of candidates) {
    const v = c.trim();
    // Reject pure GUID/hash ids
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) continue;
    if (/^[0-9a-f]{24,}$/i.test(v)) continue;
    if (/^\d+$/.test(v)) continue;
    // Accept as an inference signal (may still be a DocuSign descriptor;
    // whether it becomes a label candidate is decided separately).
    if (/[A-Za-z]/.test(v) && v.length <= 160) return v;
  }
  return null;
}

/**
 * Return true when an id/name key is just a generic DocuSign tab descriptor
 * (e.g. "text single input tab <guid>", "tab form element ...").  Such keys
 * are fine as inference signals but must NOT be used as labels.
 */
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
 * Classify the control into merchant_input vs DocuSign chrome / signature /
 * read-only / attachment / acknowledgement.
 */
function classifyControl(args: {
  kind: FieldKind;
  editable: boolean;
  visible: boolean;
  resolvedLabel: string | null;
  ariaLabel: string | null;
  title: string | null;
  ownDataTabType: string | null;
  ancestorDataTabType: string | null;
  ownClassName: string | null;
  dataQa: string | null;
  helperText: string | null;
  attachmentEvidence: AttachmentEvidence;
}): ControlCategory {
  const {
    kind,
    editable,
    visible,
    resolvedLabel,
    ariaLabel,
    title,
    ownDataTabType,
    ancestorDataTabType,
    ownClassName,
    helperText,
    attachmentEvidence,
  } = args;

  // Chrome/widget signals: include ancestor data-tabtype too, because
  // DocuSign renders signature/date-signed tabs as nested buttons whose
  // own element lacks the tab type attribute.
  const widgetHay = [ownDataTabType, ancestorDataTabType, ownClassName, ariaLabel, title, resolvedLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // OWN-element signals only for generic chrome / read-only classification.
  const ownHay = [ownDataTabType, ownClassName, ariaLabel, title, resolvedLabel]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const helperHay = (helperText ?? '').toLowerCase();

  if (/signhere|\bsign[_-]?here\b|signaturetab|signature\s*tab|adoptsignature|signature\s*widget/.test(widgetHay)) {
    return 'signature_widget';
  }

  if (/datesigned|date[_-]?signed|signedon/.test(widgetHay)) {
    return 'date_signed_widget';
  }

  // STRICT attachment classification: only strong evidence flips a control
  // to attachment_control.  Weak evidence (ancestor class / helper text)
  // is ignored – a business-name textbox should never become "attachment"
  // because some distant ancestor mentions "signer attachment".
  if (attachmentEvidence === 'strong') {
    return 'attachment_control';
  }

  if (kind === 'checkbox' && /acknowledge|agree|consent|certif|terms|authoriz/.test(ownHay + ' ' + helperHay)) {
    return 'acknowledgement_checkbox';
  }

  if (/docusign[-_]?chrome|chrome[-_]?bar|toolbar|docusign-ribbon|envelope[-_]?toolbar/.test(ownHay)) {
    return 'docusign_chrome';
  }

  if (/readonlytab|read[-_]?only|\bfull\s*name\s*tab\b|formuladata|formula\s*tab|textdisplaytab/.test(ownHay)) {
    return 'read_only_display';
  }

  if (!editable && (kind === 'textbox' || kind === 'textarea' || kind === 'combobox')) {
    return 'read_only_display';
  }

  if (!visible && !editable) return 'unknown_control';

  if (editable) return 'merchant_input';

  return 'unknown_control';
}

async function describe(
  loc: Locator,
  kind: FieldKind,
  index: number,
  frame: FrameHost,
  knownFieldValues?: ReadonlySet<string>,
): Promise<DiscoveredField> {
  const [
    ariaLabel,
    placeholder,
    title,
    type,
    inputMode,
    autocomplete,
    pattern,
    minLength,
    maxLength,
    ariaRequired,
    requiredAttr,
    visible,
    editable,
    describedBy,
    sectionName,
    helperText,
    domCtx,
  ] = await Promise.all([
    safeAttr(loc, 'aria-label'),
    safeAttr(loc, 'placeholder'),
    safeAttr(loc, 'title'),
    safeAttr(loc, 'type'),
    safeAttr(loc, 'inputmode'),
    safeAttr(loc, 'autocomplete'),
    safeAttr(loc, 'pattern'),
    safeAttr(loc, 'minlength'),
    safeAttr(loc, 'maxlength'),
    safeAttr(loc, 'aria-required'),
    safeAttr(loc, 'required'),
    loc.isVisible().catch(() => false),
    loc.isEditable().catch(() => false),
    describedByText(loc, frame),
    nearestSectionName(loc),
    nearbyHelperText(loc),
    extractDomContext(loc),
  ]);

  const idOrNameKey = deriveIdOrNameKey(domCtx.elementId, domCtx.elementName, domCtx.dataQa);

  const rawCandidateLabels: LabelCandidate[] = [];
  const containerContextLabels: LabelCandidate[] = [];
  const layoutProximityLabels = (domCtx.layoutProximityTexts ?? []).map((entry) => ({
    direction: entry.direction,
    distanceBucket: entry.distanceBucket,
    association: entry.association,
    value: entry.value.trim(),
  }));
  const nonTextLayoutSignature = domCtx.nonTextLayoutSignature
    ? {
        ...domCtx.nonTextLayoutSignature,
        metadataSignals: [...domCtx.nonTextLayoutSignature.metadataSignals],
      }
    : null;
  const domAttributeSignature = domCtx.domAttributeSignature
    ? {
        ...domCtx.domAttributeSignature,
        radioAttributeNames: [...domCtx.domAttributeSignature.radioAttributeNames],
        wrapperSurfaces: domCtx.domAttributeSignature.wrapperSurfaces.map((surface) => ({
          ...surface,
          attributeNames: [...surface.attributeNames],
          tokenShapeBuckets: [...surface.tokenShapeBuckets],
        })),
        tokenShapeBuckets: [...domCtx.domAttributeSignature.tokenShapeBuckets],
        valueHintBuckets: [...domCtx.domAttributeSignature.valueHintBuckets],
      }
    : null;
  const proxyReferenceSignature = domCtx.proxyReferenceSignature
    ? {
        ...domCtx.proxyReferenceSignature,
        proxyDepthBuckets: [...domCtx.proxyReferenceSignature.proxyDepthBuckets],
        proxyTagBuckets: [...domCtx.proxyReferenceSignature.proxyTagBuckets],
        proxyRoleBuckets: [...domCtx.proxyReferenceSignature.proxyRoleBuckets],
        tokenShapeBuckets: [...domCtx.proxyReferenceSignature.tokenShapeBuckets],
        valueHintBuckets: [...domCtx.proxyReferenceSignature.valueHintBuckets],
      }
    : null;
  const radioGraphicSignature = domCtx.radioGraphicSignature
    ? {
        ...domCtx.radioGraphicSignature,
        sameWrapperChildTagBuckets: [...domCtx.radioGraphicSignature.sameWrapperChildTagBuckets],
        previousSiblingTagBuckets: [...domCtx.radioGraphicSignature.previousSiblingTagBuckets],
        nextSiblingTagBuckets: [...domCtx.radioGraphicSignature.nextSiblingTagBuckets],
        decorativeNodeBuckets: [...domCtx.radioGraphicSignature.decorativeNodeBuckets],
        roleBuckets: [...domCtx.radioGraphicSignature.roleBuckets],
        tokenHintBuckets: [...domCtx.radioGraphicSignature.tokenHintBuckets],
      }
    : null;
  const push = (source: LabelSource, value: string | null | undefined) => {
    if (value && value.trim()) rawCandidateLabels.push({ source, value: value.trim() });
  };
  const pushContainer = (source: LabelSource, values: string[] | null | undefined) => {
    if (!values?.length) return;
    for (const value of values) {
      if (value && value.trim()) containerContextLabels.push({ source, value: value.trim() });
    }
  };
  push('aria-label', ariaLabel);
  push('aria-labelledby', domCtx.labelledByText);
  push('label-for', domCtx.labelForText);
  push('wrapping-label', domCtx.wrappingLabelText);
  // Humanize camelCase/snake_case id keys like "legalEntityType" → "legal Entity Type".
  // Only push as a LABEL candidate when the id isn't a generic DocuSign tab
  // descriptor — those are useful for type inference but noise as labels.
  if (idOrNameKey && !isGenericDocusignIdKey(idOrNameKey)) {
    const humanized = idOrNameKey
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (humanized && /[A-Za-z]{3,}/.test(humanized)) {
      push('id-or-name-key', humanized);
    }
  }
  push('title', title);
  push('placeholder', placeholder);
  push('row-header', domCtx.rowHeaderText);
  push('positional-prompt', domCtx.positionalPromptText);
  push('preceding-text', domCtx.precedingText);
  push('described-by', describedBy);
  push('helper-text', helperText);
  const effectiveSection = sectionName ?? domCtx.sectionHeading;
  if (effectiveSection && domCtx.precedingText) {
    push('section+row', `${effectiveSection} › ${domCtx.precedingText}`);
  }
  if (domCtx.dataTabType) push('docusign-tab-type', domCtx.dataTabType);
  pushContainer('container-parent', domCtx.parentContainerTexts);
  pushContainer('container-grandparent', domCtx.grandparentContainerTexts);
  pushContainer('container-section', domCtx.sectionContainerTexts);
  pushContainer('container-preceding', domCtx.containerPrecedingTexts);
  pushContainer('container-following', domCtx.containerFollowingTexts);

  const labelResult = pickLabel(rawCandidateLabels, {
    fieldValue: domCtx.currentValue,
    knownFieldValues,
  });
  const { resolvedLabel, labelSource, labelConfidence } = labelResult;

  const required = ariaRequired === 'true' || requiredAttr !== null;

  const attachmentEvidence = attachmentEvidenceStrength({
    kind,
    ownDataTabType: domCtx.ownDataTabType,
    ownClassName: domCtx.ownClassName,
    dataQa: domCtx.dataQa,
    resolvedLabel,
    ariaLabel,
    title,
    idOrNameKey,
  });

  const controlCategory = classifyControl({
    kind,
    editable,
    visible,
    resolvedLabel,
    ariaLabel,
    title,
    ownDataTabType: domCtx.ownDataTabType,
    ancestorDataTabType: domCtx.dataTabType,
    ownClassName: domCtx.ownClassName,
    dataQa: domCtx.dataQa,
    helperText,
    attachmentEvidence,
  });

  const inferredType = inferFieldType(
    resolvedLabel,
    ariaLabel,
    domCtx.labelForText,
    domCtx.labelledByText,
    domCtx.wrappingLabelText,
    domCtx.rowHeaderText,
    title,
    placeholder,
    domCtx.precedingText,
    effectiveSection,
    helperText,
    describedBy,
    domCtx.dataQa,
    domCtx.dataTabType,
    idOrNameKey,
    domCtx.groupName,
    type,
    autocomplete,
    inputMode,
  );

  const locatorConfidence: LocatorConfidence =
    kind === 'upload'
      ? resolvedLabel
        ? 'role-with-label'
        : 'css-fallback'
      : resolvedLabel
        ? 'role-with-label'
        : 'role-only';

  const radioSurfaceDiagnostics = buildFieldDiscoveryRadioSurfaceDiagnostics({
    kind,
    domCtx,
    idOrNameKey,
    resolvedLabel,
    rawCandidateLabels,
    containerContextLabels,
    layoutProximityLabels,
    nonTextLayoutSignature,
    domAttributeSignature,
    proxyReferenceSignature,
    radioGraphicSignature,
    rejectedLabelCandidates: labelResult.rejected,
  });

  return {
    kind,
    index,
    sectionName: effectiveSection,
    label: resolvedLabel,
    placeholder,
    ariaLabel,
    title,
    describedByText: describedBy,
    helperText,
    resolvedLabel,
    labelSource,
    labelConfidence,
    labelLooksLikeValue: labelResult.labelLooksLikeValue,
    rawCandidateLabels,
    containerContextLabels,
    layoutProximityLabels,
    nonTextLayoutSignature,
    domAttributeSignature,
    proxyReferenceSignature,
    radioGraphicSignature,
    radioSurfaceDiagnostics,
    rejectedLabelCandidates: labelResult.rejected,
    observedValueLikeTextNearControl: domCtx.valueLikeNearText,
    idOrNameKey,
    attachmentEvidence,
    groupName: domCtx.groupName,
    currentValue: domCtx.currentValue,
    type,
    inputMode,
    autocomplete,
    pattern,
    minLength: parseIntOrNull(minLength),
    maxLength: parseIntOrNull(maxLength),
    required,
    docusignTabType: domCtx.dataTabType,
    elementId: domCtx.elementId,
    tabGuid: tabGuidFromElementId(domCtx.elementId),
    pageIndex: domCtx.pageIndex,
    ordinalOnPage: domCtx.ordinalOnPage,
    tabLeft: domCtx.tabLeft,
    tabTop: domCtx.tabTop,
    tabWidth: domCtx.tabWidth,
    tabHeight: domCtx.tabHeight,
    visible,
    editable,
    controlCategory,
    inferredType,
    locatorConfidence,
    locator: loc,
  };
}

/** Extract the lowercase GUID from a `tab-form-element-{GUID}` id. */
function tabGuidFromElementId(elementId: string | null): string | null {
  if (!elementId) return null;
  const m = /^tab-form-element-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    elementId.trim(),
  );
  return m ? m[1].toLowerCase() : null;
}

async function locatorDomIdentityKey(loc: Locator): Promise<string | null> {
  try {
    return await loc.evaluate((el) => {
      const tab = el.closest('.doc-tab');
      const pathParts: string[] = [];
      let cur: Element | null = el;
      let depth = 0;
      while (cur && cur.parentElement && depth < 5) {
        const parent = cur.parentElement;
        const siblings = Array.from(parent.children).filter((candidate) => candidate.tagName === cur!.tagName);
        const ordinal = siblings.indexOf(cur) + 1;
        pathParts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${ordinal})`);
        cur = parent;
        depth++;
      }

      return [
        el.tagName.toLowerCase(),
        el.getAttribute('id') ?? '',
        el.getAttribute('name') ?? '',
        el.getAttribute('data-qa') ?? '',
        el.getAttribute('role') ?? '',
        tab?.getAttribute('id') ?? '',
        tab?.getAttribute('data-id') ?? '',
        tab?.getAttribute('data-type') ?? '',
        pathParts.join('>'),
      ].join('|');
    }, { timeout: 1_000 });
  } catch {
    return null;
  }
}

async function dedupeLocators(locators: Locator[]): Promise<Locator[]> {
  const seen = new Set<string>();
  const unique: Locator[] = [];

  for (const loc of locators) {
    const key = await locatorDomIdentityKey(loc);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(loc);
  }

  return unique;
}

/**
 * Discover up to `maxPerKind` controls of each kind.  The cap prevents a
 * pathological DocuSign layout from producing a 500-field sweep.
 */
export async function discoverFields(
  frame: FrameHost,
  maxPerKind = 60,
): Promise<DiscoveredField[]> {
  const fields: DiscoveredField[] = [];

  const textareaAll = await frame.locator('textarea').all();
  const textboxAll = await frame.getByRole('textbox').all();
  const textboxOnly: Locator[] = [];
  for (const l of textboxAll) {
    try {
      const tag = await l.evaluate((el) => el.tagName.toLowerCase(), { timeout: 1_000 });
      if (tag !== 'textarea') textboxOnly.push(l);
    } catch {
      textboxOnly.push(l);
    }
  }

  const comboboxLocators = await dedupeLocators([
    ...(await frame.getByRole('combobox').all()),
    ...(await frame.locator('.doc-tab[data-type="List"] select, select.main-list-tab-select').all()),
  ]);

  const kinds: Array<{ kind: FieldKind; list: Locator[] }> = [
    { kind: 'textbox', list: textboxOnly },
    { kind: 'textarea', list: textareaAll },
    { kind: 'combobox', list: comboboxLocators },
    { kind: 'checkbox', list: await frame.getByRole('checkbox').all() },
    { kind: 'radio', list: await frame.getByRole('radio').all() },
    { kind: 'upload', list: await frame.locator('input[type="file"]').all() },
    {
      kind: 'upload',
      list: await frame
        .getByRole('button', { name: /upload|attach|choose\s*file|add\s*file|browse/i })
        .all(),
    },
  ];

  for (const { kind, list } of kinds) {
    const slice = list.slice(0, maxPerKind);
    for (let i = 0; i < slice.length; i++) {
      // Keep one 1-based discovery index across all control kinds so the
      // planner and runtime can key the same live field.
      fields.push(await describe(slice[i], kind, fields.length + 1, frame));
    }
  }

  // Collect the set of filled input values to reject as label candidates
  // (DocuSign PDF-form renders sibling tabs' values inline, so one tab's
  // business name frequently sits above the next tab as pseudo-prompt text).
  const knownFieldValues = new Set<string>();
  for (const f of fields) {
    const v = f.currentValue?.trim();
    if (v && v.length >= 2 && v.length <= 120) knownFieldValues.add(v);
  }

  // Re-run label resolution with knownFieldValues in scope so the
  // substring / equals-field-value filter applies globally.
  for (const f of fields) {
    const relabelled = pickLabel(f.rawCandidateLabels, {
      fieldValue: f.currentValue,
      knownFieldValues,
    });
    if (
      relabelled.resolvedLabel !== f.resolvedLabel ||
      relabelled.labelSource !== f.labelSource
    ) {
      f.resolvedLabel = relabelled.resolvedLabel;
      f.label = relabelled.resolvedLabel;
      f.labelSource = relabelled.labelSource;
      f.labelConfidence = relabelled.labelConfidence;
      f.labelLooksLikeValue = relabelled.labelLooksLikeValue;
    }
    // Always refresh rejected list so reason stats reflect the full filter.
    f.rejectedLabelCandidates = relabelled.rejected;
  }

  return fields;
}

/** Priority order used by the report's "top findings" section. */
export const SECTION_PRIORITY = [
  /business\s*details/i,
  /stakeholder/i,
  /acknowledg/i,
];

export function sectionPriorityRank(section: string | null): number {
  if (!section) return 99;
  for (let i = 0; i < SECTION_PRIORITY.length; i++) {
    if (SECTION_PRIORITY[i].test(section)) return i;
  }
  return 50;
}