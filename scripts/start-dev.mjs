import { runViteWithRotatingLogs } from './vite-with-logs.mjs';

runViteWithRotatingLogs({
  defaultPort: 8081,
  logLabel: 'FlorivuDev',
  requireBuild: false,
  stderrLogName: '.vite-server.err.log',
  stdoutLogName: '.vite-server.log',
  viteCommand: 'dev',
});
