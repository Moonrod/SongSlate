/**
 * Web (browser preview) implementation of audioFiles.ts.
 *
 * Imported audio is kept in the browser's IndexedDB so it survives a reload,
 * and served to the audio engine as blob: URLs.
 */
import type { Cue } from '../domain/types';
import { makeId } from '../utils/id';

export const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'aif', 'aiff', 'aifc', 'm4a', 'mp4', 'aac'];

/** Earlier previews added a demo click track; it's removed on load (see PreviewApp). */
export const LEGACY_DEMO_STORED_NAME = 'demo:click-120bpm';

const DB_NAME = 'syncslate-audio';
const STORE = 'files';

/** storedFileName → blob: URL for this page load. */
const urls = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Load previously imported files into memory. Call once before rendering. */
export async function initWebAudioFiles(): Promise<void> {
  try {
    const keys = (await withStore('readonly', (s) => s.getAllKeys())) as string[];
    for (const key of keys) {
      const blob = (await withStore('readonly', (s) => s.get(key))) as Blob | undefined;
      if (blob) urls.set(key, URL.createObjectURL(blob));
    }
  } catch {
    // Storage blocked (private window etc.): imports work until the page is closed.
  }
}

export function cueFileUri(cue: Pick<Cue, 'storedFileName'>): string {
  return urls.get(cue.storedFileName) ?? '';
}

export function cueFileExists(cue: Pick<Cue, 'storedFileName'>): boolean {
  return urls.has(cue.storedFileName);
}

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim() || name;
}

export interface ImportResult {
  cues: Cue[];
  skipped: string[];
}

function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.wav,.aif,.aiff,.aifc,.m4a';
    input.style.display = 'none';
    input.onchange = () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    };
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click(); // must run inside the tap that called us
  });
}

export async function pickAndImportAudio(): Promise<ImportResult> {
  const files = await pickFiles();
  const cues: Cue[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      skipped.push(file.name);
      continue;
    }
    const id = makeId('c_');
    const storedFileName = `${id}.${ext}`;
    try {
      await withStore('readwrite', (s) => s.put(file, storedFileName));
    } catch {
      // Not persisted, but still usable for this visit.
    }
    urls.set(storedFileName, URL.createObjectURL(file));
    cues.push({
      id,
      name: titleFromFileName(file.name),
      storedFileName,
      originalFileName: file.name,
      durationSeconds: null,
      startMode: 'full',
      startSeconds: 0,
    });
  }
  return { cues, skipped };
}

/** Save audio the app generated (e.g. a section). Returns the stored file name. */
export async function saveGeneratedAudio(bytes: Uint8Array, ext = 'wav'): Promise<string> {
  const storedFileName = `${makeId('g_')}.${ext}`;
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: ext === 'wav' ? 'audio/wav' : 'application/octet-stream' });
  try {
    await withStore('readwrite', (s) => s.put(blob, storedFileName));
  } catch {
    // Not persisted, but still usable for this visit.
  }
  urls.set(storedFileName, URL.createObjectURL(blob));
  return storedFileName;
}

export function deleteCueFile(cue: Pick<Cue, 'storedFileName'>) {
  const url = urls.get(cue.storedFileName);
  if (url) URL.revokeObjectURL(url);
  urls.delete(cue.storedFileName);
  void withStore('readwrite', (s) => s.delete(cue.storedFileName)).catch(() => {});
}
