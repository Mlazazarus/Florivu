import { useEffect, useState } from 'react';
import { LogEntry, subscribeToLogs } from '../lib/logger';

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function DebugLogPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => subscribeToLogs(setEntries), []);

  return (
    <details className="debug-panel">
      <summary>Debug log</summary>
      <div className="debug-panel__body">
        {entries.length === 0 ? (
          <p className="debug-panel__empty">No log entries yet.</p>
        ) : (
          entries.map((entry) => (
            <article className={`debug-entry debug-entry--${entry.level}`} key={entry.id}>
              <header>
                <strong>{entry.scope}</strong>
                <span>{formatTime(entry.timestamp)}</span>
              </header>
              <p>{entry.message}</p>
              {entry.detail ? <pre>{entry.detail}</pre> : null}
            </article>
          ))
        )}
      </div>
    </details>
  );
}
