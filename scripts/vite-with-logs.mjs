import { spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const DEFAULT_LOG_DIR = resolve(process.cwd(), 'logs');
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_ARCHIVES = 9;

function parsePositiveInteger(value, fallbackValue) {
  const parsedValue = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function getArchivePath(filePath, archiveIndex) {
  const extension = extname(filePath);
  const basename = extension ? filePath.slice(0, -extension.length) : filePath;
  return `${basename}.${archiveIndex}${extension}`;
}

function trimLogDirectory(logDirectory, maxTotalBytes) {
  if (!existsSync(logDirectory)) {
    return;
  }

  const entries = readdirSync(logDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
    .map((entry) => {
      const fullPath = resolve(logDirectory, entry.name);
      const stats = statSync(fullPath);
      return {
        fullPath,
        isArchive: /\.\d+\.log$/i.test(entry.name),
        modifiedAt: stats.mtimeMs,
        size: stats.size,
      };
    });

  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes <= maxTotalBytes) {
    return;
  }

  const deletionCandidates = [...entries].sort((left, right) => {
    if (left.isArchive !== right.isArchive) {
      return left.isArchive ? -1 : 1;
    }

    return left.modifiedAt - right.modifiedAt;
  });

  for (const candidate of deletionCandidates) {
    if (totalBytes <= maxTotalBytes) {
      break;
    }

    unlinkSync(candidate.fullPath);
    totalBytes -= candidate.size;
  }
}

class RotatingLogWriter {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.logDirectory = dirname(filePath);
    this.maxArchives = parsePositiveInteger(
      options.maxArchives,
      DEFAULT_MAX_ARCHIVES,
    );
    this.maxFileBytes = parsePositiveInteger(
      options.maxFileBytes,
      DEFAULT_MAX_FILE_BYTES,
    );
    this.maxTotalBytes = parsePositiveInteger(
      options.maxTotalBytes,
      DEFAULT_MAX_TOTAL_BYTES,
    );

    mkdirSync(this.logDirectory, { recursive: true });
    trimLogDirectory(this.logDirectory, this.maxTotalBytes);

    if (existsSync(this.filePath) && statSync(this.filePath).size >= this.maxFileBytes) {
      this.rotateExistingFiles();
    }

    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.size = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
  }

  rotateExistingFiles() {
    const lastArchivePath = getArchivePath(this.filePath, this.maxArchives);
    if (existsSync(lastArchivePath)) {
      unlinkSync(lastArchivePath);
    }

    for (let archiveIndex = this.maxArchives; archiveIndex >= 1; archiveIndex -= 1) {
      const sourcePath =
        archiveIndex === 1 ? this.filePath : getArchivePath(this.filePath, archiveIndex - 1);
      const destinationPath = getArchivePath(this.filePath, archiveIndex);

      if (existsSync(sourcePath)) {
        renameSync(sourcePath, destinationPath);
      }
    }

    trimLogDirectory(this.logDirectory, this.maxTotalBytes);
  }

  rotate() {
    this.stream?.end();
    this.rotateExistingFiles();
    this.stream = createWriteStream(this.filePath, { flags: 'w' });
    this.size = 0;
  }

  write(chunk) {
    if (!chunk || !this.stream) {
      return;
    }

    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (this.size > 0 && this.size + buffer.length > this.maxFileBytes) {
      this.rotate();
    }

    this.stream.write(buffer);
    this.size += buffer.length;
  }

  close() {
    this.stream?.end();
    trimLogDirectory(this.logDirectory, this.maxTotalBytes);
  }
}

function assertExists(path, message) {
  if (!existsSync(path)) {
    console.error(message);
    process.exit(1);
  }
}

export function runViteWithRotatingLogs(options) {
  const {
    defaultPort,
    logLabel,
    stdoutLogName,
    stderrLogName,
    viteCommand,
    requireBuild,
  } = options;
  const logsDirectory = resolve(process.cwd(), process.env.FLORIVU_LOG_DIR ?? DEFAULT_LOG_DIR);
  const requestedPort = parsePositiveInteger(process.env.PORT, defaultPort);
  const viteBinPath = resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');

  if (requireBuild) {
    const distIndexPath = resolve(process.cwd(), 'dist', 'index.html');
    assertExists(
      distIndexPath,
      'Florivu is missing a production build. Run `npm run build` before starting the site.',
    );
  }

  assertExists(viteBinPath, 'Vite is not installed. Run `npm ci` before starting Florivu.');

  const maxArchives = parsePositiveInteger(
    process.env.FLORIVU_LOG_MAX_ARCHIVES,
    DEFAULT_MAX_ARCHIVES,
  );
  const maxFileBytes = parsePositiveInteger(
    process.env.FLORIVU_LOG_MAX_FILE_BYTES,
    DEFAULT_MAX_FILE_BYTES,
  );
  const maxTotalBytes = parsePositiveInteger(
    process.env.FLORIVU_LOG_MAX_TOTAL_BYTES,
    DEFAULT_MAX_TOTAL_BYTES,
  );

  const stdoutWriter = new RotatingLogWriter(resolve(logsDirectory, stdoutLogName), {
    maxArchives,
    maxFileBytes,
    maxTotalBytes,
  });
  const stderrWriter = new RotatingLogWriter(resolve(logsDirectory, stderrLogName), {
    maxArchives,
    maxFileBytes,
    maxTotalBytes,
  });

  const child = spawn(
    process.execPath,
    [viteBinPath, viteCommand, '--host', '0.0.0.0', '--port', String(requestedPort)],
    {
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  );

  const closeWriters = () => {
    stdoutWriter.close();
    stderrWriter.close();
  };

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    stdoutWriter.write(chunk);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    stderrWriter.write(chunk);
  });

  const terminateChild = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', () => terminateChild('SIGINT'));
  process.on('SIGTERM', () => terminateChild('SIGTERM'));

  child.on('error', (error) => {
    console.error(`[${logLabel}] Failed to launch Vite.`, error);
    closeWriters();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    closeWriters();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
