/**
 * Gmail API client + polling.
 *
 * Uses the official `googleapis` package with a local desktop OAuth2 flow:
 *   - credentials.json: downloaded from Google Cloud Console (OAuth client
 *     ID for a Desktop app)
 *   - token.json: created on first run (see scripts/gmail-auth.ts)
 *
 * Nothing in this module prints message bodies, subjects, or tokens.
 */

import * as fs from 'node:fs';
import * as readline from 'node:readline';
import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { loadGmailConfig, type GmailConfig } from './config';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function formatSearchValue(value: string): string {
  const trimmed = value.trim();
  return /[\s:()"]/.test(trimmed)
    ? `"${trimmed.replace(/(["\\])/g, '\\$1')}"`
    : trimmed;
}

type InstalledCreds = {
  installed?: { client_id: string; client_secret: string; redirect_uris: string[] };
  web?: { client_id: string; client_secret: string; redirect_uris: string[] };
};

export function createOAuth2Client(cfg: GmailConfig): OAuth2Client {
  if (!fs.existsSync(cfg.credentialsPath)) {
    throw new Error(`Gmail credentials.json not found at ${cfg.credentialsPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(cfg.credentialsPath, 'utf8')) as InstalledCreds;
  const creds = raw.installed ?? raw.web;
  if (!creds) throw new Error('credentials.json missing "installed" or "web" section');
  const redirect = creds.redirect_uris?.[0] ?? 'urn:ietf:wg:oauth:2.0:oob';
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirect);
}

export async function authorize(cfg: GmailConfig = loadGmailConfig()): Promise<OAuth2Client> {
  const client = createOAuth2Client(cfg);
  if (!fs.existsSync(cfg.tokenPath)) {
    throw new Error(
      `Gmail token.json not found at ${cfg.tokenPath}.\n` +
        'Run: npm run bootstrap:gmail-auth',
    );
  }
  const token = JSON.parse(fs.readFileSync(cfg.tokenPath, 'utf8'));
  client.setCredentials(token);
  return client;
}

/** Interactive first-time token creation.  Called by scripts/gmail-auth.ts. */
export async function runInteractiveAuth(cfg: GmailConfig = loadGmailConfig()): Promise<void> {
  const client = createOAuth2Client(cfg);
  const authUrl = client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
  // eslint-disable-next-line no-console
  console.log('\nOpen this URL in your browser and complete consent:\n\n' + authUrl + '\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code: string = await new Promise((resolve) => rl.question('Paste the auth code here: ', (a) => { rl.close(); resolve(a.trim()); }));

  const { tokens } = await client.getToken(code);
  fs.writeFileSync(cfg.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  // eslint-disable-next-line no-console
  console.log(`Token written to ${cfg.tokenPath}`);
}

/**
 * Build a Gmail search query that restricts to messages newer than the
 * resend trigger.  Gmail's `after:` uses epoch seconds.
 */
export function buildSearchQuery(
  cfg: Pick<GmailConfig, 'address' | 'queryFrom' | 'querySubjectContains'>,
  afterEpochSec: number,
): string {
  const parts: string[] = [];
  if (cfg.queryFrom) parts.push(`from:${formatSearchValue(cfg.queryFrom)}`);
  if (cfg.querySubjectContains) parts.push(`subject:${formatSearchValue(cfg.querySubjectContains)}`);
  // Use after: with a 30s skew to tolerate clock drift.
  const skewed = Math.max(0, afterEpochSec - 30);
  parts.push(`after:${skewed}`);
  parts.push('newer_than:1d');
  return parts.join(' ');
}

function normalizeMailboxAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at).split('+')[0];
  const domain = trimmed.slice(at + 1);
  return `${local}@${domain}`;
}

export function messageTargetsAddress(
  headers: HeaderLike[] | undefined,
  configuredAddress: string,
): boolean {
  const expected = normalizeMailboxAddress(configuredAddress);
  if (!expected) return true;

  const recipients = [getHeader(headers, 'to'), getHeader(headers, 'delivered-to')]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (recipients.length === 0) return true;

  return recipients.some((recipient) => {
    const match = recipient.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? normalizeMailboxAddress(match[0]) === expected : false;
  });
}

type HeaderLike = gmail_v1.Schema$MessagePartHeader;

function getHeader(headers: HeaderLike[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => (x.name ?? '').toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

/** Depth-first walk, concatenating text/plain and text/html part bodies. */
export function extractBody(msg: gmail_v1.Schema$Message): string {
  const chunks: string[] = [];
  const walk = (part?: gmail_v1.Schema$MessagePart | null) => {
    if (!part) return;
    const data = part.body?.data;
    if (data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')) {
      chunks.push(Buffer.from(data, 'base64url').toString('utf8'));
    }
    part.parts?.forEach(walk);
  };
  walk(msg.payload);
  return chunks.join('\n');
}

export type SelectedMessage = {
  id: string;
  internalDateMs: number;
  body: string;
};

/** Given a list of message metadata, select the newest after the start. */
export function selectFreshestMessage(
  messages: Array<Pick<gmail_v1.Schema$Message, 'id' | 'internalDate'>>,
  afterEpochMs: number,
): { id: string; internalDateMs: number } | null {
  let best: { id: string; internalDateMs: number } | null = null;
  for (const m of messages) {
    if (!m.id || !m.internalDate) continue;
    const t = Number(m.internalDate);
    if (!Number.isFinite(t) || t < afterEpochMs) continue;
    if (!best || t > best.internalDateMs) best = { id: m.id, internalDateMs: t };
  }
  return best;
}

export function selectMailboxMessage(
  messages: gmail_v1.Schema$Message[],
  configuredAddress: string,
  afterEpochMs: number,
): { id: string; internalDateMs: number } | null {
  const matching = messages.filter((msg) =>
    messageTargetsAddress(msg.payload?.headers, configuredAddress),
  );

  if (matching.length > 0) {
    return selectFreshestMessage(matching, afterEpochMs);
  }

  // Some tenants deliver to aliases/forwarded addresses that differ from the
  // configured mailbox, but the Gmail query already scopes to the authenticated
  // inbox plus sender/subject/time. In that case prefer the freshest result.
  return selectFreshestMessage(messages, afterEpochMs);
}

export async function pollForSigningEmail(
  cfg: GmailConfig = loadGmailConfig(),
  afterEpochSec: number = Math.floor(Date.now() / 1000),
): Promise<SelectedMessage> {
  const auth = await authorize(cfg);
  const gmail = google.gmail({ version: 'v1', auth });
  const q = buildSearchQuery(cfg, afterEpochSec);
  const afterEpochMs = afterEpochSec * 1000;
  const deadline = Date.now() + cfg.pollTimeoutMs;

  // eslint-disable-next-line no-console
  console.log(`[gmail] polling (timeout=${cfg.pollTimeoutMs}ms, interval=${cfg.pollIntervalMs}ms)`);

  while (Date.now() < deadline) {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 10,
    });
    const ids = list.data.messages ?? [];
    if (ids.length > 0) {
      // Fetch metadata to get internalDate; then pick the freshest.
      const metas = await Promise.all(
        ids.map((m) =>
          gmail.users.messages.get({
            userId: 'me',
            id: m.id!,
            format: 'metadata',
            metadataHeaders: ['To', 'Delivered-To', 'Subject', 'From'],
          })
            .then((r) => r.data),
        ),
      );
      const pick = selectMailboxMessage(metas, cfg.address, afterEpochMs);
      if (pick) {
        const full = await gmail.users.messages.get({ userId: 'me', id: pick.id, format: 'full' });
        return {
          id: pick.id,
          internalDateMs: pick.internalDateMs,
          body: extractBody(full.data),
        };
      }
    }
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }

  throw new Error(
    `Gmail polling timed out after ${cfg.pollTimeoutMs}ms. ` +
      'Check GMAIL_QUERY_FROM / GMAIL_QUERY_SUBJECT_CONTAINS or extend GMAIL_POLL_TIMEOUT_MS.',
  );
}
