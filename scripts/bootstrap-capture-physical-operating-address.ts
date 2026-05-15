/**
 * Safe email-bootstrap entry point for the Physical Operating Address
 * capture-only runner.
 *
 * This reuses the same Bead resend, Gmail polling, and DocuSign link
 * extraction flow as bootstrap:live, but launches only capture:physical-address.
 * The signer URL is passed to that child process env only; .env is never
 * written and raw signer URLs are never logged.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  formatSafeError,
  runBootstrapEmailScripts,
  type BootstrapEmailRunnerDependencies,
  type ExitReason,
} from '../lib/bootstrap-email-runner';
import {
  buildPhysicalOperatingAddressCaptureOnlyReceipt,
  buildPhysicalOperatingAddressCaptureOnlyReceiptPath,
  formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel,
  parsePhysicalOperatingAddressCaptureOnlyReceiptSentinel,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND,
  readPhysicalOperatingAddressCaptureOnlyReceipt,
  writePhysicalOperatingAddressCaptureOnlyReceipt,
  type PhysicalOperatingAddressCaptureOnlyReceipt,
} from './capture-physical-operating-address';

export const PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND = 'bootstrap:capture:physical-address';
export const PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_SCRIPT_PATH = 'scripts/bootstrap-capture-physical-operating-address.ts';
export const PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS = [
  PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND,
] as const;

const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts');

export type PhysicalOperatingAddressBootstrapCaptureReceiptParseFailure =
  | 'missing-receipt'
  | 'malformed-receipt-line'
  | 'multiple-receipt-lines'
  | 'invalid-receipt-file';

type PhysicalOperatingAddressBootstrapCaptureLineSource = 'stdout' | 'stderr';

type PhysicalOperatingAddressBootstrapCaptureSpawnLike = (
  command: string,
  args: readonly string[],
  options: {
    stdio: ['ignore', 'pipe', 'pipe'];
    env: NodeJS.ProcessEnv;
    shell: false;
  },
) => ChildProcess;

type PhysicalOperatingAddressBootstrapCaptureState = {
  childCommand: string;
  childExitCode: number | null;
  childReceipt: PhysicalOperatingAddressCaptureOnlyReceipt | null;
  receiptParseFailure: PhysicalOperatingAddressBootstrapCaptureReceiptParseFailure | null;
};

export type PhysicalOperatingAddressBootstrapCaptureDependencies = Partial<Omit<BootstrapEmailRunnerDependencies, 'runNpmScript'>> & {
  artifactsDir?: string;
  spawnImpl?: PhysicalOperatingAddressBootstrapCaptureSpawnLike;
  emitChildLine?: (source: PhysicalOperatingAddressBootstrapCaptureLineSource, line: string) => void;
};

function safeMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

export function parsePhysicalOperatingAddressBootstrapCaptureReceiptLines(lines: string[]): {
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt | null;
  failureReason: PhysicalOperatingAddressBootstrapCaptureReceiptParseFailure | null;
} {
  const sentinelLines = lines.filter((line) => line.trimStart().startsWith('PHYSICAL_ADDRESS_CAPTURE_RECEIPT_JSON:'));
  if (sentinelLines.length === 0) {
    return { receipt: null, failureReason: 'missing-receipt' };
  }
  if (sentinelLines.length > 1) {
    return { receipt: null, failureReason: 'multiple-receipt-lines' };
  }

  const receipt = parsePhysicalOperatingAddressCaptureOnlyReceiptSentinel(sentinelLines[0]);
  if (!receipt) {
    return { receipt: null, failureReason: 'malformed-receipt-line' };
  }

  return { receipt, failureReason: null };
}

function createPhysicalOperatingAddressBootstrapCaptureRunner(
  state: PhysicalOperatingAddressBootstrapCaptureState,
  options: {
    artifactsDir: string;
    spawnImpl?: PhysicalOperatingAddressBootstrapCaptureSpawnLike;
    emitChildLine?: (source: PhysicalOperatingAddressBootstrapCaptureLineSource, line: string) => void;
  },
): BootstrapEmailRunnerDependencies['runNpmScript'] {
  const spawnImpl = options.spawnImpl ?? spawn;
  const emitChildLine = options.emitChildLine
    ?? ((source: PhysicalOperatingAddressBootstrapCaptureLineSource, line: string) => {
      if (source === 'stderr') {
        // eslint-disable-next-line no-console
        console.error(line);
      } else {
        // eslint-disable-next-line no-console
        console.log(line);
      }
    });

  return async (script, env) => {
    const receiptPath = buildPhysicalOperatingAddressCaptureOnlyReceiptPath(options.artifactsDir);
    const receiptMtimeBefore = safeMtimeIso(receiptPath);
    const observedLines: string[] = [];
    const isWin = process.platform === 'win32';
    const command = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npm';
    const args = isWin ? ['/d', '/s', '/c', 'npm', 'run', script] : ['run', script];
    const child = spawnImpl(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      shell: false,
    });

    state.childCommand = `npm run ${script}`;

    const stdoutBuffer = { value: '' };
    const stderrBuffer = { value: '' };
    const handleLine = (source: PhysicalOperatingAddressBootstrapCaptureLineSource, line: string) => {
      const safeLine = formatSafeError(line).replace(/\r$/, '').trimEnd();
      if (!safeLine) return;
      observedLines.push(safeLine);
      emitChildLine(source, safeLine);
    };
    const consumeChunk = (
      source: PhysicalOperatingAddressBootstrapCaptureLineSource,
      buffer: { value: string },
      chunk: Buffer | string,
    ) => {
      const text = `${buffer.value}${chunk.toString()}`;
      const parts = text.split(/\r?\n/);
      buffer.value = parts.pop() ?? '';
      for (const part of parts) {
        handleLine(source, part);
      }
    };
    const flushBuffer = (source: PhysicalOperatingAddressBootstrapCaptureLineSource, buffer: { value: string }) => {
      if (!buffer.value) return;
      handleLine(source, buffer.value);
      buffer.value = '';
    };

    child.stdout?.on('data', (chunk) => consumeChunk('stdout', stdoutBuffer, chunk));
    child.stderr?.on('data', (chunk) => consumeChunk('stderr', stderrBuffer, chunk));

    return await new Promise<number>((resolve) => {
      child.on('exit', (code) => {
        flushBuffer('stdout', stdoutBuffer);
        flushBuffer('stderr', stderrBuffer);

        state.childExitCode = code ?? 1;

        let resolution = parsePhysicalOperatingAddressBootstrapCaptureReceiptLines(observedLines);
        if (resolution.failureReason === 'missing-receipt') {
          const receiptMtimeAfter = safeMtimeIso(receiptPath);
          if (receiptMtimeAfter !== receiptMtimeBefore) {
            const fileReceipt = readPhysicalOperatingAddressCaptureOnlyReceipt(receiptPath);
            if (fileReceipt) {
              resolution = { receipt: fileReceipt, failureReason: null };
            } else {
              resolution = { receipt: null, failureReason: 'invalid-receipt-file' };
            }
          }
        }

        state.childReceipt = resolution.receipt;
        state.receiptParseFailure = resolution.failureReason;
        resolve(state.childExitCode);
      });
      child.on('error', () => {
        state.childExitCode = 1;
        state.childReceipt = null;
        state.receiptParseFailure = 'missing-receipt';
        resolve(1);
      });
    });
  };
}

export function finalizePhysicalOperatingAddressBootstrapCaptureResult(input: {
  bootstrapResult: ExitReason;
  state: PhysicalOperatingAddressBootstrapCaptureState;
  artifactsDir?: string;
}): {
  exitReason: ExitReason;
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt;
} {
  const childExitCode = input.state.childExitCode ?? input.bootstrapResult.code;
  let receipt = input.state.childReceipt
    ?? buildPhysicalOperatingAddressCaptureOnlyReceipt({
      result: null,
      childExitCode: childExitCode === 0 ? 3 : childExitCode,
      bootstrapExitCode: input.bootstrapResult.code,
      artifactsDir: input.artifactsDir,
      blockedReasonCategory: 'another bounded reason',
      childCommand: input.state.childCommand,
    });

  let bootstrapExitCode = input.bootstrapResult.code;
  if (bootstrapExitCode === 0 && !receipt.artifactsFresh) {
    bootstrapExitCode = childExitCode !== 0 ? childExitCode : 3;
  }

  receipt = {
    ...receipt,
    childCommand: input.state.childCommand,
    childExitCode,
    bootstrapExitCode,
    blockedReasonCategory: bootstrapExitCode === 0
      ? receipt.blockedReasonCategory
      : receipt.blockedReasonCategory ?? 'another bounded reason',
  };

  if (bootstrapExitCode === 0) {
    return {
      exitReason: { code: 0, reason: 'OK' },
      receipt,
    };
  }

  const failureDetail = input.state.childReceipt
    ? (receipt.blockedReasonCategory ?? 'another bounded reason')
    : `receipt unavailable (${input.state.receiptParseFailure ?? 'missing-receipt'})`;

  return {
    exitReason: {
      code: bootstrapExitCode,
      reason: `BLOCKED: capture:physical-address ${failureDetail}`,
    },
    receipt,
  };
}

export async function runPhysicalOperatingAddressBootstrapCapture(
  dependencies: PhysicalOperatingAddressBootstrapCaptureDependencies = {},
): Promise<ExitReason> {
  const artifactsDir = dependencies.artifactsDir ?? ARTIFACTS_DIR;
  const state: PhysicalOperatingAddressBootstrapCaptureState = {
    childCommand: `npm run ${PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND}`,
    childExitCode: null,
    childReceipt: null,
    receiptParseFailure: null,
  };
  const log = dependencies.log ?? ((line: string) => {
    // eslint-disable-next-line no-console
    console.log(line);
  });

  const bootstrapResult = await runBootstrapEmailScripts({
    label: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND,
    scripts: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS,
    dependencies: {
      ...dependencies,
      log,
      runNpmScript: createPhysicalOperatingAddressBootstrapCaptureRunner(state, {
        artifactsDir,
        spawnImpl: dependencies.spawnImpl,
        emitChildLine: dependencies.emitChildLine,
      }),
    },
  });

  const finalized = finalizePhysicalOperatingAddressBootstrapCaptureResult({
    bootstrapResult,
    state,
    artifactsDir,
  });

  writePhysicalOperatingAddressCaptureOnlyReceipt(finalized.receipt, artifactsDir);
  log(
    `[${PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND}] preserved receipt childExit=${finalized.receipt.childExitCode ?? 'n/a'}; bootstrapExit=${finalized.receipt.bootstrapExitCode ?? 'n/a'}; fresh=${finalized.receipt.artifactsFresh ? 'yes' : 'no'}; blockedReason=${finalized.receipt.blockedReasonCategory ?? 'none'}`,
  );

  return finalized.exitReason;
}

export async function main(): Promise<ExitReason> {
  return await runPhysicalOperatingAddressBootstrapCapture();
}

if (require.main === module) {
  main()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`[${PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND}] done: ${result.reason}`);
      process.exit(result.code);
    })
    .catch((error) => {
      const safe = formatSafeError(error);
      // eslint-disable-next-line no-console
      console.error(`[${PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND}] ERROR: ${safe}`);
      process.exit(1);
    });
}