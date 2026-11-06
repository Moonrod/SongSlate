import { formatDuration, formatTimecode } from './timecode';
import type { EndReason, LogEvent, LogEventType, Session, TakeLog } from './types';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Local wall-clock time with milliseconds, e.g. "2026-11-06 14:03:27.415". */
export function formatWallClock(epochMs: number): string {
  const d = new Date(epochMs);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  );
}

/** Local UTC offset for a moment, e.g. "+01:00". */
export function formatUtcOffset(epochMs: number): string {
  const offset = -new Date(epochMs).getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export const END_REASON_LABELS: Record<EndReason, string> = {
  stopped: 'Stopped manually',
  ended: 'Played to end',
  interrupted: 'Interrupted',
  error: 'Playback error',
};

export const EVENT_LABELS: Record<LogEventType, string> = {
  'interruption-began': 'Audio interruption began',
  'interruption-ended': 'Audio interruption ended',
  'output-disconnected': 'Audio output disconnected (headphones unplugged?)',
  'output-connected': 'Audio output connected',
  'route-change': 'Audio route changed',
  'app-background': 'App went to background',
  'app-foreground': 'App returned to foreground',
  'audio-error': 'Audio error',
};

export function describeEvent(e: LogEvent): string {
  const label = EVENT_LABELS[e.type];
  return e.detail ? `${label} (${e.detail})` : label;
}

export function startPointLabel(take: TakeLog): string {
  return take.startMode === 'full'
    ? 'FULL SONG'
    : formatTimecode(take.startSeconds, take.frameRate, take.dropFrame);
}

export interface ReportRow {
  take: string;
  cue: string;
  file: string;
  startPoint: string;
  flipTime: string;
  flipUtc: string;
  startTc: string;
  stopTc: string;
  duration: string;
  durationSeconds: string;
  ended: string;
  frameRate: string;
  latencyOffsetMs: string;
  notes: string;
}

export const REPORT_COLUMNS: { key: keyof ReportRow; title: string }[] = [
  { key: 'take', title: 'Take' },
  { key: 'cue', title: 'Cue' },
  { key: 'file', title: 'File' },
  { key: 'startPoint', title: 'Start Point' },
  { key: 'flipTime', title: 'Green Flip (local)' },
  { key: 'flipUtc', title: 'Green Flip (UTC ISO)' },
  { key: 'startTc', title: 'Start TC' },
  { key: 'stopTc', title: 'Stop TC' },
  { key: 'duration', title: 'Duration' },
  { key: 'durationSeconds', title: 'Duration (s)' },
  { key: 'ended', title: 'Ended' },
  { key: 'frameRate', title: 'Frame Rate' },
  { key: 'latencyOffsetMs', title: 'Latency Offset (ms)' },
  { key: 'notes', title: 'Notes' },
];

export function takeToRow(take: TakeLog): ReportRow {
  const tc = (s: number) => formatTimecode(s, take.frameRate, take.dropFrame);
  const notes = [
    take.twoPop ? '2-pop' : '',
    ...take.events.map((e) => `${formatWallClock(e.at).slice(11)} ${describeEvent(e)}`),
  ].filter(Boolean);
  return {
    take: String(take.takeNumber),
    cue: take.cueName,
    file: take.fileName,
    startPoint: startPointLabel(take),
    flipTime: `${formatWallClock(take.flipEpochMs)} ${formatUtcOffset(take.flipEpochMs)}`,
    flipUtc: new Date(take.flipEpochMs).toISOString(),
    startTc: tc(take.startSeconds),
    stopTc: tc(take.stopSeconds),
    duration: formatDuration(take.durationSeconds),
    durationSeconds: take.durationSeconds.toFixed(3),
    ended: END_REASON_LABELS[take.endReason],
    frameRate: `${take.frameRate}${take.dropFrame && take.frameRate === '29.97' ? ' DF' : ''}`,
    latencyOffsetMs: String(take.latencyOffsetMs),
    notes: notes.join('; '),
  };
}

/** RFC 4180 quoting. Also neutralises spreadsheet formula injection from file names. */
export function csvEscape(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function sessionToCsv(session: Session): string {
  const lines: string[] = [];
  lines.push(REPORT_COLUMNS.map((c) => csvEscape(c.title)).join(','));
  for (const take of session.takes) {
    const row = takeToRow(take);
    lines.push(REPORT_COLUMNS.map((c) => csvEscape(row[c.key])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PDF_COLUMNS: (keyof ReportRow)[] = [
  'take',
  'cue',
  'startPoint',
  'flipTime',
  'startTc',
  'stopTc',
  'duration',
  'ended',
  'notes',
];

export function sessionToHtml(session: Session, generatedAt: number = Date.now()): string {
  const titleFor = (k: keyof ReportRow) => REPORT_COLUMNS.find((c) => c.key === k)!.title;
  const head = PDF_COLUMNS.map((k) => `<th>${escapeHtml(titleFor(k))}</th>`).join('');
  const body = session.takes.length
    ? session.takes
        .map((t) => {
          const row = takeToRow(t);
          const cls = t.endReason === 'ended' ? '' : ` class="${t.endReason}"`;
          return `<tr${cls}>${PDF_COLUMNS.map((k) => `<td>${escapeHtml(row[k])}</td>`).join('')}</tr>`;
        })
        .join('\n')
    : `<tr><td colspan="${PDF_COLUMNS.length}">No takes recorded.</td></tr>`;

  const first = session.takes[0];
  const settingsLine = first
    ? `Frame rate ${escapeHtml(takeToRow(first).frameRate)} · Latency offset ${first.latencyOffsetMs} ms`
    : '';

  const eventsBlock = session.events.length
    ? `<h2>Session events</h2><ul>${session.events
        .map((e) => `<li>${escapeHtml(formatWallClock(e.at))} — ${escapeHtml(describeEvent(e))}</li>`)
        .join('')}</ul>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(session.name)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; font-size: 10pt; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 12pt; margin: 16px 0 4px; }
  .meta { color: #555; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  td { font-variant-numeric: tabular-nums; }
  tr.stopped td:nth-child(8) { color: #333; }
  tr.interrupted td, tr.error td { background: #fff1f0; }
</style></head>
<body>
<h1>SyncSlate Report — ${escapeHtml(session.name)}</h1>
<div class="meta">Session started ${escapeHtml(formatWallClock(session.createdAt))} ${escapeHtml(
    formatUtcOffset(session.createdAt),
  )} · ${session.takes.length} take(s) · Generated ${escapeHtml(formatWallClock(generatedAt))}${
    settingsLine ? ` · ${settingsLine}` : ''
  }</div>
<table><thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody></table>
${eventsBlock}
</body></html>`;
}

/** File-system-safe base name for exports. */
export function exportFileBaseName(session: Session): string {
  const safe = session.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
  return (safe || 'SyncSlate_Session').slice(0, 80);
}
