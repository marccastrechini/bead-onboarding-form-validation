/**
 * Guarded bootstrap orchestrator for disposable-envelope field validation.
 *
 * Requires INTERACTIVE_VALIDATION=1 and DISPOSABLE_ENVELOPE=1 before any
 * Bead/Gmail/DocuSign side effect occurs. The script fetches a fresh signer
 * URL, injects it only into the child test process, and relies on the spec to
 * mutate fields, observe validation, and restore values.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { loadBeadConfig, loadGmailConfig } from '../lib/config';
import { triggerResend } from '../lib/bead-client';
import { pollForSigningEmail } from '../lib/gmail-client';
import { extractSigningUrl } from '../lib/link-extractor';
import { redactUrl } from '../lib/url-sanitize';
import {
  INTERACTIVE_PROGRESS_JSON,
  assertInteractiveValidationGuards,
  type InteractiveProgressArtifact,
} from '../fixtures/interactive-validation';

type ExitReason = { code: number; reason: string };
type SpawnLike = typeof spawn;

export const DEFAULT_INTERACTIVE_RUN_TIMEOUT_MS = 10 * 60_000;
export const INTERACTIVE_TIMEOUT_ARTIFACT_JSON = 'latest-interactive-timeout.json';

const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts');

export interface InteractiveRunTimeoutArtifact {
  schemaVersion: 1;
  timedOutAt: string;
  timeoutMs: number;
  script: string;
  childPid: number | null;
  platform: NodeJS.Platform;
  progress: InteractiveProgressArtifact | null;
  reason: string;
}

type WatchedRunResult = {
  code: number;
  reason: string;
  timedOut: boolean;
  timeoutArtifactPath: string | null;
};

interface RunWatchdogOptions {
  timeoutMs: number;
  cwd?: string;
  platform?: NodeJS.Platform;
  artifactsDir?: string;
  now?: () => Date;
  spawnImpl?: SpawnLike;
  killProcessTree?: (pid: number, platform?: NodeJS.Platform, spawnImpl?: SpawnLike) => Promise<void>;
}

export function parseInteractiveRunTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.INTERACTIVE_RUN_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_INTERACTIVE_RUN_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`INTERACTIVE_RUN_TIMEOUT_MS must be a positive integer, received: ${raw}`);
  }
  return Math.floor(parsed);
}

export function buildWindowsProcessTreeKillCommand(pid: number): { command: string; args: string[] } {
  return {
    command: 'taskkill',
    args: ['/pid', String(pid), '/t', '/f'],
  };
}

async function runKillCommand(command: string, args: string[], spawnImpl: SpawnLike): Promise<void> {
  await new Promise<void>((resolve) => {
    const killer = spawnImpl(command, args, {
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    killer.once('exit', () => resolve());
    killer.once('error', () => resolve());
  });
}

export async function killProcessTree(
  pid: number,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: SpawnLike = spawn,
): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (platform === 'win32') {
    const { command, args } = buildWindowsProcessTreeKillCommand(pid);
    await runKillCommand(command, args, spawnImpl);
    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ignore already-exited children.
    }
  }
}

function readInteractiveProgressArtifact(artifactsDir: string): InteractiveProgressArtifact | null {
  const progressPath = path.join(artifactsDir, INTERACTIVE_PROGRESS_JSON);
  try {
    const parsed = JSON.parse(fs.readFileSync(progressPath, 'utf8')) as InteractiveProgressArtifact;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildInteractiveTimeoutArtifact(input: {
  timedOutAt: string;
  timeoutMs: number;
  script: string;
  childPid: number | null;
  platform: NodeJS.Platform;
  progress: InteractiveProgressArtifact | null;
}): InteractiveRunTimeoutArtifact {
  const progressLabel = input.progress?.concept && input.progress?.validationId && input.progress?.phase
    ? ` lastProgress=${input.progress.concept}/${input.progress.validationId}/${input.progress.phase}`
    : '';
  return {
    schemaVersion: 1,
    timedOutAt: input.timedOutAt,
    timeoutMs: input.timeoutMs,
    script: input.script,
    childPid: input.childPid,
    platform: input.platform,
    progress: input.progress,
    reason:
      `interactive validation exceeded INTERACTIVE_RUN_TIMEOUT_MS=${input.timeoutMs}ms; ` +
      `terminated child process tree for script ${input.script}.${progressLabel}`,
  };
}

function writeInteractiveTimeoutArtifact(
  artifact: InteractiveRunTimeoutArtifact,
  artifactsDir: string,
): string {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const timeoutArtifactPath = path.join(artifactsDir, INTERACTIVE_TIMEOUT_ARTIFACT_JSON);
  fs.writeFileSync(timeoutArtifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  return timeoutArtifactPath;
}

export async function runNpmScriptWithWatchdog(
  script: string,
  extraEnv: NodeJS.ProcessEnv,
  options: RunWatchdogOptions,
): Promise<WatchedRunResult> {
  const spawnImpl = options.spawnImpl ?? spawn;
  const platform = options.platform ?? process.platform;
  const artifactsDir = options.artifactsDir ?? ARTIFACTS_DIR;
  const now = options.now ?? (() => new Date());
  const terminateTree = options.killProcessTree ?? killProcessTree;
  const isWin = platform === 'win32';
  const command = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWin ? ['/d', '/s', '/c', 'npm', 'run', script] : ['run', script];
  const child = spawnImpl(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: false,
    cwd: options.cwd,
    detached: !isWin,
    windowsHide: isWin,
  });

  return await new Promise<WatchedRunResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: WatchedRunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    child.once('exit', (code, signal) => {
      finish({
        code: code ?? 1,
        reason: signal ? `interactive validation exited with signal ${signal}` : `interactive validation exited with code ${code ?? 1}`,
        timedOut: false,
        timeoutArtifactPath: null,
      });
    });

    child.once('error', (error) => {
      finish({
        code: 1,
        reason: `failed to launch interactive validation: ${error.message}`,
        timedOut: false,
        timeoutArtifactPath: null,
      });
    });

    timer = setTimeout(() => {
      const childPid = child.pid ?? null;
      const timedOutAt = now().toISOString();
      void terminateTree(childPid ?? 0, platform, spawnImpl)
        .catch(() => undefined)
        .then(() => {
          const progress = readInteractiveProgressArtifact(artifactsDir);
          const artifact = buildInteractiveTimeoutArtifact({
            timedOutAt,
            timeoutMs: options.timeoutMs,
            script,
            childPid,
            platform,
            progress,
          });
          const timeoutArtifactPath = writeInteractiveTimeoutArtifact(artifact, artifactsDir);
          finish({
            code: 124,
            reason: `${artifact.reason} Timeout artifact: ${timeoutArtifactPath}`,
            timedOut: true,
            timeoutArtifactPath,
          });
        });
    }, options.timeoutMs);
  });
}

async function main(): Promise<ExitReason> {
  assertInteractiveValidationGuards();

  const bead = loadBeadConfig();
  const gmail = loadGmailConfig();

  const resend = await triggerResend(bead);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap:interactive] resend OK (method=${resend.method}, status=${resend.status}) at ${resend.triggeredAt.toISOString()}`);

  let message;
  try {
    message = await pollForSigningEmail(gmail, resend.triggeredAtEpochSec);
  } catch (error) {
    return {
      code: 2,
      reason:
        'BLOCKED: Gmail polling failed/timed out. ' +
        (error instanceof Error ? error.message : String(error)),
    };
  }
  // eslint-disable-next-line no-console
  console.log(`[bootstrap:interactive] email found id=${message.id} (internalDate=${new Date(message.internalDateMs).toISOString()})`);

  const extracted = await extractSigningUrl(message.body);
  if (!extracted) {
    return { code: 3, reason: 'BLOCKED: no DocuSign signing URL found in email body.' };
  }
  // eslint-disable-next-line no-console
  console.log(`[bootstrap:interactive] signing URL extracted via=${extracted.via} target=${extracted.sanitized}`);

  const childEnv: NodeJS.ProcessEnv = {
    DOCUSIGN_SIGNING_URL: extracted.url,
    DESTRUCTIVE_VALIDATION: '',
  };

  // eslint-disable-next-line no-console
  console.log('[bootstrap:interactive] launching: npm run test:interactive');
  const childResult = await runNpmScriptWithWatchdog('test:interactive', childEnv, {
    timeoutMs: parseInteractiveRunTimeoutMs(),
    artifactsDir: ARTIFACTS_DIR,
  });
  if (childResult.code !== 0) {
    return { code: childResult.code, reason: childResult.reason };
  }

  return { code: 0, reason: 'OK' };
}

if (require.main === module) {
  main()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`[bootstrap:interactive] done: ${result.reason}`);
      process.exit(result.code);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const safe = message.replace(/https?:\/\/\S+/g, (url) => redactUrl(url));
      // eslint-disable-next-line no-console
      console.error(`[bootstrap:interactive] ERROR: ${safe}`);
      process.exit(1);
    });
}