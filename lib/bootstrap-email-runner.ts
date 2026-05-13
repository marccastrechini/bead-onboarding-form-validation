import { spawn, type ChildProcess } from 'node:child_process';
import { loadBeadConfig, loadGmailConfig, type BeadConfig, type GmailConfig } from './config';
import { triggerResend, type ResendResult } from './bead-client';
import { pollForSigningEmail, type SelectedMessage } from './gmail-client';
import { extractSigningUrl, type ExtractResult } from './link-extractor';
import { redactUrl } from './url-sanitize';

export type ExitReason = { code: number; reason: string };

export type NpmScriptRunner = (
  script: string,
  env: NodeJS.ProcessEnv,
) => Promise<number>;

export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: {
    stdio: 'inherit';
    env: NodeJS.ProcessEnv;
    shell: false;
  },
) => ChildProcess;

export type BootstrapEmailRunnerDependencies = {
  loadBeadConfig: () => BeadConfig;
  loadGmailConfig: () => GmailConfig;
  triggerResend: (config: BeadConfig) => Promise<ResendResult>;
  pollForSigningEmail: (config: GmailConfig, afterEpochSec: number) => Promise<SelectedMessage>;
  extractSigningUrl: (body: string) => Promise<ExtractResult | null>;
  runNpmScript: NpmScriptRunner;
  log: (line: string) => void;
  env: NodeJS.ProcessEnv;
};

export type BootstrapEmailRunnerOptions = {
  label: string;
  scripts: readonly string[];
  dependencies?: Partial<BootstrapEmailRunnerDependencies>;
};

export const DEFAULT_BOOTSTRAP_EMAIL_RUNNER_DEPENDENCIES: BootstrapEmailRunnerDependencies = {
  loadBeadConfig,
  loadGmailConfig,
  triggerResend,
  pollForSigningEmail,
  extractSigningUrl,
  runNpmScript,
  log: (line: string) => {
    // eslint-disable-next-line no-console
    console.log(line);
  },
  env: process.env,
};

export function redactUrlsInText(text: string): string {
  return text.replace(/https?:\/\/\S+/g, (url) => redactUrl(url));
}

export function formatSafeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactUrlsInText(message);
}

export function buildSignerChildEnv(
  signingUrl: string,
  parentEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...parentEnv,
    DOCUSIGN_SIGNING_URL: signingUrl,
    DESTRUCTIVE_VALIDATION: '',
  };
}

export async function runNpmScript(
  script: string,
  extraEnv: NodeJS.ProcessEnv,
  spawnImpl: SpawnLike = spawn,
): Promise<number> {
  const isWin = process.platform === 'win32';
  const command = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWin ? ['/d', '/s', '/c', 'npm', 'run', script] : ['run', script];
  const child = spawnImpl(command, args, {
    stdio: 'inherit',
    env: extraEnv,
    shell: false,
  });

  return await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

export async function runBootstrapEmailScripts(
  options: BootstrapEmailRunnerOptions,
): Promise<ExitReason> {
  const dependencies = {
    ...DEFAULT_BOOTSTRAP_EMAIL_RUNNER_DEPENDENCIES,
    ...options.dependencies,
  };

  const bead = dependencies.loadBeadConfig();
  const gmail = dependencies.loadGmailConfig();

  const resend = await dependencies.triggerResend(bead);
  dependencies.log(
    `[${options.label}] resend OK (method=${resend.method}, status=${resend.status}) at ${resend.triggeredAt.toISOString()}`,
  );

  let message: SelectedMessage;
  try {
    message = await dependencies.pollForSigningEmail(gmail, resend.triggeredAtEpochSec);
  } catch (error) {
    return {
      code: 2,
      reason: `BLOCKED: Gmail polling failed/timed out. ${formatSafeError(error)}`,
    };
  }
  dependencies.log(
    `[${options.label}] email found id=${message.id} (internalDate=${new Date(message.internalDateMs).toISOString()})`,
  );

  const extracted = await dependencies.extractSigningUrl(message.body);
  if (!extracted) {
    return { code: 3, reason: 'BLOCKED: no DocuSign signing URL found in email body.' };
  }
  dependencies.log(
    `[${options.label}] signing URL extracted via=${extracted.via} target=${extracted.sanitized}`,
  );

  const childEnv = buildSignerChildEnv(extracted.url, dependencies.env);

  for (const script of options.scripts) {
    dependencies.log(`[${options.label}] launching: npm run ${script} (SAFE MODE)`);
    const code = await dependencies.runNpmScript(script, childEnv);
    if (code !== 0) {
      return { code, reason: `${script} exited with code ${code}` };
    }
  }

  return { code: 0, reason: 'OK' };
}