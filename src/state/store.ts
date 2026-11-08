import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { assignUniqueDots } from '../domain/dots';
import type { Cue, LogEvent, Session, Settings, TakeLog } from '../domain/types';
import { makeId } from '../utils/id';

export const DEFAULT_SETTINGS: Settings = {
  countdownSeconds: 3,
  frameRate: '23.976',
  dropFrame: false,
  stopGesture: 'tap',
  twoPop: false,
  latencyOffsetMs: 0,
  orientation: 'portrait',
};

export function defaultSessionName(now = new Date()): string {
  const d = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `Shoot ${d}`;
}

function newSessionObject(name: string): Session {
  return { id: makeId('s_'), name, createdAt: Date.now(), nextTake: 1, takes: [], events: [] };
}

const STORAGE_KEY = 'syncslate-v1';

/**
 * Shoot-day data must never be clobbered. Writes are held back until hydration
 * has finished, so a state change during start-up can't overwrite saved sessions
 * with defaults. If the saved data can't be read, it is copied aside first.
 */
let canPersist = false;
const guardedStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => (canPersist ? AsyncStorage.setItem(key, value) : Promise.resolve()),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

async function backUpUnreadableData() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) await AsyncStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, raw);
  } catch {
    // Nothing more we can do.
  }
}

export interface AppState {
  hydrated: boolean;
  settings: Settings;
  cues: Cue[];
  armedCueId: string | null;
  sessions: Session[];
  activeSessionId: string | null;

  // settings
  updateSettings: (patch: Partial<Settings>) => void;

  // cues
  addCues: (cues: Cue[]) => void;
  /** Insert a cue right after another one (e.g. a section after its song). */
  insertCueAfter: (afterId: string, cue: Cue) => void;
  updateCue: (id: string, patch: Partial<Cue>) => void;
  removeCue: (id: string) => void;
  moveCue: (id: string, delta: -1 | 1) => void;
  armCue: (id: string) => void;
  armRelative: (delta: -1 | 1) => void;

  // sessions
  ensureActiveSession: () => Session;
  newSession: (name?: string) => Session;
  renameSession: (id: string, name: string) => void;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  setNextTake: (n: number) => void;
  recordTake: (take: Omit<TakeLog, 'id'>) => void;
  logSessionEvent: (event: LogEvent) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      settings: DEFAULT_SETTINGS,
      cues: [],
      armedCueId: null,
      sessions: [],
      activeSessionId: null,

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addCues: (cues) =>
        set((s) => ({
          // New cues get the next colour in the rotation unless one was chosen.
          // Every cue gets its own marker (no repeats, no green).
          cues: assignUniqueDots([...s.cues, ...cues]),
          armedCueId: s.armedCueId ?? cues[0]?.id ?? null,
        })),

      insertCueAfter: (afterId, cue) =>
        set((s) => {
          const idx = s.cues.findIndex((c) => c.id === afterId);
          const cues = [...s.cues];
          cues.splice(idx < 0 ? cues.length : idx + 1, 0, cue);
          return { cues: assignUniqueDots(cues), armedCueId: s.armedCueId ?? cue.id };
        }),

      updateCue: (id, patch) =>
        set((s) => {
          // A marker already used by another cue can't be chosen.
          if (patch.dot && s.cues.some((c) => c.id !== id && c.dot === patch.dot)) return {};
          return { cues: s.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
        }),

      removeCue: (id) =>
        set((s) => {
          const idx = s.cues.findIndex((c) => c.id === id);
          const cues = s.cues.filter((c) => c.id !== id);
          let armedCueId = s.armedCueId;
          if (armedCueId === id) {
            armedCueId = cues[Math.min(idx, cues.length - 1)]?.id ?? null;
          }
          return { cues, armedCueId };
        }),

      moveCue: (id, delta) =>
        set((s) => {
          const idx = s.cues.findIndex((c) => c.id === id);
          const target = idx + delta;
          if (idx < 0 || target < 0 || target >= s.cues.length) return {};
          const cues = [...s.cues];
          [cues[idx], cues[target]] = [cues[target], cues[idx]];
          return { cues };
        }),

      armCue: (id) => set({ armedCueId: id }),

      armRelative: (delta) =>
        set((s) => {
          if (s.cues.length === 0) return {};
          const idx = Math.max(
            0,
            s.cues.findIndex((c) => c.id === s.armedCueId),
          );
          const next = Math.min(s.cues.length - 1, Math.max(0, idx + delta));
          return { armedCueId: s.cues[next].id };
        }),

      ensureActiveSession: () => {
        const { sessions, activeSessionId } = get();
        const existing = sessions.find((x) => x.id === activeSessionId);
        if (existing) return existing;
        return get().newSession();
      },

      newSession: (name) => {
        const session = newSessionObject(name?.trim() || defaultSessionName());
        set((s) => ({ sessions: [session, ...s.sessions], activeSessionId: session.id }));
        return session;
      },

      renameSession: (id, name) =>
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)),
        })),

      setActiveSession: (id) => set({ activeSessionId: id }),

      deleteSession: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((x) => x.id !== id);
          const activeSessionId = s.activeSessionId === id ? sessions[0]?.id ?? null : s.activeSessionId;
          return { sessions, activeSessionId };
        }),

      setNextTake: (n) => {
        const session = get().ensureActiveSession();
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === session.id ? { ...x, nextTake: Math.max(1, Math.floor(n)) } : x)),
        }));
      },

      recordTake: (take) => {
        const session = get().ensureActiveSession();
        const full: TakeLog = { ...take, id: makeId('t_') };
        set((s) => ({
          sessions: s.sessions.map((x) =>
            x.id === session.id
              ? { ...x, takes: [...x.takes, full], nextTake: Math.max(x.nextTake, take.takeNumber + 1) }
              : x,
          ),
        }));
      },

      logSessionEvent: (event) => {
        const session = get().ensureActiveSession();
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === session.id ? { ...x, events: [...x.events, event] } : x)),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => guardedStorage),
      partialize: (s) => ({
        settings: s.settings,
        cues: s.cues,
        armedCueId: s.armedCueId,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          // Older saves may have repeated or green dots, or none.
          cues: assignUniqueDots(p.cues ?? []),
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        const finish = () => {
          canPersist = true;
          useAppStore.setState({ hydrated: true });
        };
        if (error) void backUpUnreadableData().finally(finish);
        else finish();
      },
    },
  ),
);

export const selectArmedCue = (s: AppState): Cue | null =>
  s.cues.find((c) => c.id === s.armedCueId) ?? s.cues[0] ?? null;

export const selectActiveSession = (s: AppState): Session | null =>
  s.sessions.find((x) => x.id === s.activeSessionId) ?? null;
