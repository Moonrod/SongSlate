import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { getAudioDuration } from 'react-native-audio-api';

import type { Cue } from '../domain/types';
import { makeId } from '../utils/id';

export const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'aif', 'aiff', 'aifc', 'm4a', 'mp4', 'aac'];

const PICKER_TYPES = [
  'audio/*',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/mp4',
  'audio/x-m4a',
];

/**
 * Audio is copied into <Documents>/audio. We persist only the file *name*, never
 * an absolute path: on iOS the app container path changes across updates/reinstalls.
 */
function audioDir(): Directory {
  const dir = new Directory(Paths.document, 'audio');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function cueFileUri(cue: Pick<Cue, 'storedFileName'>): string {
  return new File(audioDir(), cue.storedFileName).uri;
}

export function cueFileExists(cue: Pick<Cue, 'storedFileName'>): boolean {
  return new File(audioDir(), cue.storedFileName).exists;
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

export async function pickAndImportAudio(): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: PICKER_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { cues: [], skipped: [] };

  const cues: Cue[] = [];
  const skipped: string[] = [];
  const dir = audioDir();

  for (const asset of result.assets) {
    const name = asset.name ?? 'audio';
    const ext = extensionOf(name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      skipped.push(name);
      continue;
    }
    const id = makeId('c_');
    const storedFileName = `${id}.${ext}`;
    const dest = new File(dir, storedFileName);
    try {
      await new File(asset.uri).copy(dest);
    } catch {
      skipped.push(name);
      continue;
    }

    let durationSeconds: number | null = null;
    try {
      const d = await getAudioDuration(dest.uri);
      durationSeconds = Number.isFinite(d) && d > 0 ? d : null;
    } catch {
      // Duration is filled in when the cue is first decoded.
    }

    cues.push({
      id,
      name: titleFromFileName(name),
      storedFileName,
      originalFileName: name,
      durationSeconds,
      startMode: 'full',
      startSeconds: 0,
    });
  }
  return { cues, skipped };
}

/** Save audio the app generated (e.g. a section). Returns the stored file name. */
export async function saveGeneratedAudio(bytes: Uint8Array, ext = 'wav'): Promise<string> {
  const storedFileName = `${makeId('g_')}.${ext}`;
  const file = new File(audioDir(), storedFileName);
  file.create();
  await file.write(bytes);
  return storedFileName;
}

export function deleteCueFile(cue: Pick<Cue, 'storedFileName'>) {
  try {
    const f = new File(audioDir(), cue.storedFileName);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}
