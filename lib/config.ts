/**
 * Centralised, typed env loader for the live-bootstrap flow.
 *
 * All sensitive values are read from process.env.  Nothing is logged here,
 * and no defaults are baked in for host/path/auth so that the tool is
 * deployable to any environment without code changes.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import dotenv from 'dotenv';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  loaded = true;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v || !v.trim()) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Env var ${name} must be numeric`);
  }
  return n;
}

export type BeadConfig = {
  baseUrl: string;
  resendPath: string;
  authHeaderName: string;
  authHeaderValue: string;
  applicationId: string;
};

export type GmailConfig = {
  address: string;
  credentialsPath: string;
  tokenPath: string;
  queryFrom: string;
  querySubjectContains: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
};

export function loadBeadConfig(): BeadConfig {
  loadEnv();
  return {
    baseUrl: required('BEAD_API_BASE_URL').replace(/\/+$/, ''),
    resendPath: required('BEAD_ONBOARDING_RESEND_PATH'),
    authHeaderName: required('BEAD_AUTH_HEADER_NAME'),
    authHeaderValue: required('BEAD_AUTH_HEADER_VALUE'),
    applicationId: required('BEAD_APPLICATION_ID'),
  };
}

export function loadGmailConfig(): GmailConfig {
  loadEnv();
  return {
    address: required('BEAD_GMAIL_ADDRESS'),
    credentialsPath: path.resolve(required('GMAIL_CREDENTIALS_PATH')),
    tokenPath: path.resolve(required('GMAIL_TOKEN_PATH')),
    queryFrom: optional('GMAIL_QUERY_FROM', 'dse@docusign.net'),
    querySubjectContains: optional('GMAIL_QUERY_SUBJECT_CONTAINS', 'Please DocuSign'),
    pollTimeoutMs: optionalNumber('GMAIL_POLL_TIMEOUT_MS', 180_000),
    pollIntervalMs: optionalNumber('GMAIL_POLL_INTERVAL_MS', 5_000),
  };
}
