import { runViteWithRotatingLogs } from './vite-with-logs.mjs';

runViteWithRotatingLogs({
  defaultPort: 4173,
  logLabel: 'FlorivuPreview',
  requireBuild: true,
  stderrLogName: '.vite-preview.err.log',
  stdoutLogName: '.vite-preview.log',
  viteCommand: 'preview',
});
