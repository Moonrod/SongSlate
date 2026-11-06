import {
  csvEscape,
  exportFileBaseName,
  formatUtcOffset,
  formatWallClock,
  REPORT_COLUMNS,
  sessionToCsv,
  sessionToHtml,
  takeToRow,
} from '../report';
import type { Session, TakeLog } from '../types';

// jest.global-setup.js pins TZ=UTC so local wall-clock formatting is deterministic.
const FLIP = Date.UTC(2026, 10, 6, 14, 3, 27, 415); // 2026-11-06 14:03:27.415 UTC

function makeTake(overrides: Partial<TakeLog> = {}): TakeLog {
  return {
    id: 't1',
    takeNumber: 1,
    cueId: 'c1',
    cueName: 'Midnight Drive',
    fileName: 'midnight_drive_v3.wav',
    startMode: 'full',
    startSeconds: 0,
    stopSeconds: 95.5,
    flipEpochMs: FLIP,
    stopEpochMs: FLIP + 95500,
    durationSeconds: 95.5,
    endReason: 'stopped',
    frameRate: '24',
    dropFrame: false,
    latencyOffsetMs: 12,
    outputLatencyMs: 9,
    twoPop: false,
    events: [],
    ...overrides,
  };
}

function makeSession(takes: TakeLog[]): Session {
  return {
    id: 's1',
    name: 'Nova — Midnight Drive — 6 Nov',
    createdAt: Date.UTC(2026, 10, 6, 9, 0, 0, 0),
    nextTake: takes.length + 1,
    takes,
    events: [],
  };
}

describe('wall clock formatting', () => {
  it('includes milliseconds', () => {
    expect(formatWallClock(FLIP)).toBe('2026-11-06 14:03:27.415');
    expect(formatWallClock(Date.UTC(2026, 0, 2, 3, 4, 5, 6))).toBe('2026-01-02 03:04:05.006');
  });

  it('reports the UTC offset', () => {
    expect(formatUtcOffset(FLIP)).toBe('+00:00');
  });
});

describe('takeToRow', () => {
  it('describes a full-song take', () => {
    const row = takeToRow(makeTake());
    expect(row.take).toBe('1');
    expect(row.startPoint).toBe('FULL SONG');
    expect(row.flipTime).toBe('2026-11-06 14:03:27.415 +00:00');
    expect(row.flipUtc).toBe('2026-11-06T14:03:27.415Z');
    expect(row.startTc).toBe('00:00:00:00');
    expect(row.stopTc).toBe('00:01:35:12');
    expect(row.duration).toBe('1:35.500');
    expect(row.durationSeconds).toBe('95.500');
    expect(row.ended).toBe('Stopped manually');
    expect(row.latencyOffsetMs).toBe('12');
  });

  it('describes a timecode-start take that played to the end', () => {
    const row = takeToRow(
      makeTake({ startMode: 'timecode', startSeconds: 72, stopSeconds: 200, durationSeconds: 128, endReason: 'ended' }),
    );
    expect(row.startPoint).toBe('00:01:12:00');
    expect(row.startTc).toBe('00:01:12:00');
    expect(row.stopTc).toBe('00:03:20:00');
    expect(row.ended).toBe('Played to end');
  });

  it('lists interruptions and the 2-pop in notes', () => {
    const row = takeToRow(
      makeTake({
        twoPop: true,
        endReason: 'interrupted',
        events: [{ at: FLIP + 30000, type: 'interruption-began', takeNumber: 1 }],
      }),
    );
    expect(row.ended).toBe('Interrupted');
    expect(row.notes).toBe('2-pop; 14:03:57.415 Audio interruption began');
  });

  it('labels drop-frame takes', () => {
    expect(takeToRow(makeTake({ frameRate: '29.97', dropFrame: true })).frameRate).toBe('29.97 DF');
    expect(takeToRow(makeTake({ frameRate: '29.97', dropFrame: false })).frameRate).toBe('29.97');
  });
});

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formulas but leaves negative numbers alone', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape('+1+1')).toBe("'+1+1");
    expect(csvEscape('-12')).toBe('-12');
  });

  it('exports a header plus one line per take, in order', () => {
    const csv = sessionToCsv(
      makeSession([
        makeTake(),
        makeTake({ id: 't2', takeNumber: 2, cueName: 'Song, Pt. 2', endReason: 'ended' }),
      ]),
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(REPORT_COLUMNS.map((c) => c.title).join(','));
    expect(lines[1].startsWith('1,Midnight Drive,midnight_drive_v3.wav,FULL SONG,2026-11-06 14:03:27.415 +00:00,')).toBe(
      true,
    );
    expect(lines[2].startsWith('2,"Song, Pt. 2",')).toBe(true);
    expect(lines[2]).toContain('Played to end');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('exports just the header for an empty session', () => {
    expect(sessionToCsv(makeSession([])).trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('html / pdf', () => {
  it('contains every take and escapes user text', () => {
    const html = sessionToHtml(
      makeSession([makeTake({ cueName: '<script>alert(1)</script>' }), makeTake({ id: 't2', takeNumber: 2 })]),
      FLIP,
    );
    expect(html).toContain('SyncSlate Report — Nova — Midnight Drive — 6 Nov');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect((html.match(/<tr[ >]/g) ?? []).length).toBe(3); // header + 2 takes
    expect(html).toContain('2026-11-06 14:03:27.415');
  });

  it('renders an empty session', () => {
    expect(sessionToHtml(makeSession([]))).toContain('No takes recorded.');
  });

  it('includes session-level events', () => {
    const session = makeSession([]);
    session.events.push({ at: FLIP, type: 'output-disconnected' });
    expect(sessionToHtml(session)).toContain('Audio output disconnected');
  });
});

describe('exportFileBaseName', () => {
  it('makes a file-system-safe name', () => {
    expect(exportFileBaseName(makeSession([]))).toBe('Nova_Midnight_Drive_6_Nov');
    expect(exportFileBaseName({ ...makeSession([]), name: '///' })).toBe('SyncSlate_Session');
  });
});
