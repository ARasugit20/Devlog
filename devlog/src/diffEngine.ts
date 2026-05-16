import * as fs from 'fs/promises';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';
import picomatch from 'picomatch';
import type { ChangeType, DevLogConfig, FileChange } from './types';

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.wav',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.wasm',
  '.exe',
  '.dll',
  '.dylib',
]);

function compileMatchers(globs: string[]): Array<(value: string) => boolean> {
  return globs
    .map((globPattern) => globPattern.trim())
    .filter(Boolean)
    .map((globPattern) => picomatch(globPattern, { dot: true }));
}

function toRelativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath) || path.basename(filePath);
}

async function readFileBuffer(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

function isLikelyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

function toText(buffer: Buffer): string {
  return buffer.toString('utf8');
}

function summarizeLargeChange(filePath: string, reason: string): string {
  return `Diff omitted for ${filePath}: ${reason}.`;
}

function truncateDiff(diff: string, maxDiffChars: number): { value: string; truncated: boolean } {
  if (diff.length <= maxDiffChars) {
    return { value: diff, truncated: false };
  }

  const clipped = diff.slice(0, maxDiffChars);
  return {
    value: `${clipped}\n\n... diff truncated after ${maxDiffChars} characters ...`,
    truncated: true,
  };
}

export class DiffEngine {
  private readonly previousContent = new Map<string, string>();
  private readonly excludeMatchers: Array<(value: string) => boolean>;
  private readonly maxFileSizeBytes: number;

  constructor(private readonly config: DevLogConfig) {
    this.excludeMatchers = compileMatchers(config.excludeGlobs);
    this.maxFileSizeBytes = config.maxFileSizeKb * 1024;
  }

  clear(): void {
    this.previousContent.clear();
  }

  private isExcluded(relativePath: string): boolean {
    return this.excludeMatchers.some((matcher) => matcher(relativePath));
  }

  async seedWorkspaceBaseline(workspacePaths: string[]): Promise<void> {
    await Promise.all(workspacePaths.map((workspacePath) => this.seedPath(workspacePath, workspacePath)));
  }

  private async seedPath(rootPath: string, targetPath: string): Promise<void> {
    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats) {
      return;
    }

    if (stats.isDirectory()) {
      const entries = await fs.readdir(targetPath, { withFileTypes: true }).catch(() => []);
      await Promise.all(
        entries.map((entry) => this.seedPath(rootPath, path.join(targetPath, entry.name)))
      );
      return;
    }

    const relativePath = toRelativePath(rootPath, targetPath);
    if (this.isExcluded(relativePath)) {
      return;
    }
    if (stats.size > this.maxFileSizeBytes) {
      return;
    }
    if (BINARY_EXTENSIONS.has(path.extname(targetPath).toLowerCase())) {
      return;
    }

    const buffer = await readFileBuffer(targetPath);
    if (!buffer || isLikelyBinary(buffer)) {
      return;
    }
    this.previousContent.set(targetPath, toText(buffer));
  }

  async buildChange(
    workspacePath: string,
    filePath: string,
    changeType: ChangeType
  ): Promise<FileChange | null> {
    const relativePath = toRelativePath(workspacePath, filePath);
    if (this.isExcluded(relativePath)) {
      return null;
    }

    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      return {
        filename: relativePath,
        absolutePath: filePath,
        changeType,
        diff: summarizeLargeChange(relativePath, 'binary file type'),
        skipped: true,
        skipReason: 'binary file type',
      };
    }

    const buffer = changeType === 'deleted' ? null : await readFileBuffer(filePath);
    const fileSize = buffer?.byteLength ?? 0;

    if (buffer && isLikelyBinary(buffer)) {
      return {
        filename: relativePath,
        absolutePath: filePath,
        changeType,
        diff: summarizeLargeChange(relativePath, 'binary content'),
        skipped: true,
        skipReason: 'binary content',
      };
    }

    if (fileSize > this.maxFileSizeBytes) {
      return {
        filename: relativePath,
        absolutePath: filePath,
        changeType,
        diff: summarizeLargeChange(
          relativePath,
          `file exceeds ${this.config.maxFileSizeKb} KB limit`
        ),
        skipped: true,
        skipReason: 'file too large',
      };
    }

    const before = this.previousContent.get(filePath) ?? '';
    const after = changeType === 'deleted' ? '' : toText(buffer ?? Buffer.from(''));
    const patch = createTwoFilesPatch(relativePath, relativePath, before, after, '', '', {
      context: 3,
    }).trim();
    const limited = truncateDiff(patch || '(no textual changes)', this.config.maxDiffChars);

    if (changeType === 'deleted') {
      this.previousContent.delete(filePath);
    } else {
      this.previousContent.set(filePath, after);
    }

    return {
      filename: relativePath,
      absolutePath: filePath,
      changeType,
      diff: limited.value,
      skipped: limited.truncated,
      skipReason: limited.truncated ? 'diff truncated to max length' : undefined,
    };
  }
}
