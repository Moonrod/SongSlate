import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { audioEngine } from '../audio/SlateAudioEngine';
import { cueDotEmoji, MAX_CUES } from '../domain/dots';
import { realSeconds, SPEEDS, speedLabel, type CueSpeed } from '../domain/speed';
import {
  applySectionBuffer,
  cueTimecodeBase,
  nextSectionIndex,
  SECTION_BUFFER_SECONDS,
  sectionName,
  validateSection,
} from '../domain/section';
import {
  FRAME_RATES,
  formatDuration,
  formatSlateTimecode,
  framesToParts,
  framesToSeconds,
  secondsToFrames,
} from '../domain/timecode';
import { cueFileUri } from '../services/audioFiles';
import { createSection } from '../services/sections';
import { useAppStore } from '../state/store';
import { Button, Section } from '../ui/controls';
import { ScrubBar } from '../ui/ScrubBar';
import { colors, monoDigits } from '../ui/theme';

type LengthChoice = 15 | 30 | 45 | 60 | 'custom';
const LENGTHS: { value: LengthChoice; label: string }[] = [
  { value: 15, label: ':15' },
  { value: 30, label: ':30' },
  { value: 45, label: ':45' },
  { value: 60, label: '1:00' },
  { value: 'custom', label: 'Custom' },
];

/**
 * Cut part of an imported song into a new, named audio file that becomes its own cue.
 * Pick the start by dragging along the song, then tap a length (or set a custom end).
 * Used by the New Section screen (with a song picker) and inline in the cue editor.
 */
export function SectionCutter({
  initialSourceId,
  showSongPicker = true,
}: {
  initialSourceId?: string;
  /** Hide the song list when the song is already decided (cue editor). */
  showSongPicker?: boolean;
}) {
  const sourceId = initialSourceId;
  const cues = useAppStore((s) => s.cues);
  const { frameRate, dropFrame } = useAppStore((s) => s.settings);

  const [selectedId, setSelectedId] = useState<string | null>(sourceId ?? cues[0]?.id ?? null);
  const [start, setStart] = useState(0);
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>(30);
  const [customEnd, setCustomEnd] = useState(30);
  const [name, setName] = useState('');
  const [withBuffer, setWithBuffer] = useState(false);
  const [speed, setSpeed] = useState<CueSpeed>(1);
  const [busy, setBusy] = useState(false);
  const [unreadableId, setUnreadableId] = useState<string | null>(null);

  const source = cues.find((c) => c.id === selectedId) ?? null;
  const base = source ? cueTimecodeBase(source) : 0;
  const songEnd = source?.durationSeconds != null ? base + source.durationSeconds : null;
  const unreadable = source != null && unreadableId === source.id;
  const measuring = source != null && songEnd == null && !unreadable;

  // The song's length is needed to draw the bar. Read it if it isn't known yet.
  useEffect(() => {
    if (!source || source.durationSeconds != null) return;
    let cancelled = false;
    audioEngine
      .getDuration(cueFileUri(source), source.originalFileName)
      .then((d) => {
        if (!cancelled) useAppStore.getState().updateCue(source.id, { durationSeconds: d });
      })
      .catch(() => {
        if (!cancelled) setUnreadableId(source.id);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Timecode helpers at the project frame rate.
  const tc = (s: number) => formatSlateTimecode(s, frameRate, dropFrame);
  const frame = framesToSeconds(1, frameRate);
  const tcSeconds = (n: number) => framesToSeconds(FRAME_RATES[frameRate].timebase * n, frameRate);
  /** Snap to a whole timecode second (dragging), or to a frame (nudges). */
  const snapSecond = (s: number) =>
    tcSeconds(Math.round(secondsToFrames(s + frame / 2, frameRate) / FRAME_RATES[frameRate].timebase));
  const snapFrame = (s: number) => framesToSeconds(Math.round(s / frame), frameRate);
  const clampTo = (s: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, s));

  const lastStart = songEnd != null ? songEnd - 0.5 : base;
  const startClamped = clampTo(start, base, lastStart);
  const wantedEnd = lengthChoice === 'custom' ? customEnd : startClamped + tcSeconds(lengthChoice);
  const end = songEnd != null ? Math.min(wantedEnd, songEnd) : wantedEnd;
  const shortened = lengthChoice !== 'custom' && songEnd != null && wantedEnd > songEnd;
  const length = end - startClamped;
  // With the buffer on, the file also includes up to 5 s before and after (never past the song).
  const buffered = applySectionBuffer(startClamped, end, withBuffer ? tcSeconds(SECTION_BUFFER_SECONDS) : 0, base, songEnd);
  const outerRegion = source != null && songEnd != null && withBuffer ? { start: buffered.fileStart, end: buffered.fileEnd } : undefined;
  const error = !source ? 'Pick a song.' : validateSection(startClamped, end, songEnd);
  // Suggested name shows where the file starts in the song (buffer included), e.g. "(1:20)".
  const startParts = framesToParts(secondsToFrames(buffered.fileStart, frameRate), frameRate, dropFrame);
  const placeholder = sectionName(
    nextSectionIndex(cues),
    (startParts.hours * 60 + startParts.minutes) * 60 + startParts.seconds,
  );

  const pickSource = (id: string) => {
    setSelectedId(id);
    const c = cues.find((x) => x.id === id);
    const b = c ? cueTimecodeBase(c) : 0;
    setStart(b);
    setCustomEnd(b + tcSeconds(30));
  };

  const setStartTo = (s: number) => {
    const next = clampTo(s, base, lastStart);
    setStart(next);
    if (lengthChoice === 'custom' && customEnd <= next) setCustomEnd(Math.min(songEnd ?? next + 30, next + tcSeconds(30)));
  };
  const setEndTo = (s: number) => setCustomEnd(clampTo(s, startClamped + 0.5, songEnd ?? s));

  const full = cues.length >= MAX_CUES;

  const onCreate = async () => {
    if (full) {
      Alert.alert('Cue list is full', `The list holds ${MAX_CUES} cues. Delete some cues to cut a new section.`);
      return;
    }
    if (error || !source) {
      Alert.alert('Check the section', error ?? 'Pick a song.');
      return;
    }
    setBusy(true);
    try {
      const finalName = name.trim() || placeholder;
      const cue = await createSection({
        source,
        startSeconds: startClamped,
        endSeconds: end,
        name: finalName,
        bufferSeconds: withBuffer ? tcSeconds(SECTION_BUFFER_SECONDS) : 0,
        speed,
      });
      const store = useAppStore.getState();
      store.insertCueAfter(source.id, cue);
      // The new snippet is ready to shoot: arm it on the slate straight away.
      if (useAppStore.getState().cues.some((c) => c.id === cue.id)) store.armCue(cue.id);
      router.dismissTo('/cues');
      Alert.alert(
        'Section created and armed',
        `"${finalName}" (${formatDuration(cue.durationSeconds ?? 0)}) is armed on the slate and in your cue list after "${source.name}". ` +
          `When it plays, the slate counter starts at ${tc(cue.section!.startSeconds)}, matching "${cue.section!.sourceName}".`,
      );
    } catch (e: any) {
      Alert.alert('Could not create the section', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const nudges = (onNudge: (delta: number) => void, label: string) => (
    <View style={styles.nudges} accessibilityLabel={label}>
      {[
        { t: '−1s', d: -tcSeconds(1) },
        { t: '−1f', d: -frame },
        { t: '+1f', d: frame },
        { t: '+1s', d: tcSeconds(1) },
      ].map((n) => (
        <Pressable
          key={n.t}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${n.t}`}
          onPress={() => onNudge(n.d)}
          style={({ pressed }) => [styles.nudge, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.nudgeText, monoDigits]}>{n.t}</Text>
        </Pressable>
      ))}
    </View>
  );

  const ready = source != null && songEnd != null;

  return (
    <View>
      {showSongPicker ? (
        <Section title="Song">
          {cues.length === 0 ? (
            <Text style={styles.empty}>Import a song first (Cue List → + Import).</Text>
          ) : (
            cues.map((c, i) => {
              const selected = c.id === selectedId;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => pickSource(c.id)}
                  style={({ pressed }) => [styles.songRow, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={styles.songName} numberOfLines={1}>
                    {`${cueDotEmoji(c)} ${c.name}`}
                  </Text>
                  <Text style={[styles.songMeta, monoDigits]}>
                    {c.durationSeconds != null ? formatDuration(c.durationSeconds).replace(/\.\d+$/, '') : ''}
                  </Text>
                </Pressable>
              );
            })
          )}
        </Section>
      ) : null}

      <Section title="Start" footer="Drag along the song (snaps to whole seconds), then fine-tune by frames.">
        <View style={styles.block}>
          <Text style={[styles.bigTc, monoDigits]}>{tc(startClamped)}</Text>
          <ScrubBar
            min={base}
            max={songEnd ?? base + 1}
            value={startClamped}
            region={ready ? { start: startClamped, end } : undefined}
            outerRegion={outerRegion}
            onChange={(v) => setStartTo(snapSecond(v))}
            disabled={!ready}
            accessibilityLabel="Section start in the song"
          />
          <View style={styles.scale}>
            <Text style={[styles.scaleText, monoDigits]}>{tc(base)}</Text>
            <Text style={[styles.scaleText, unreadable && { color: colors.warn }]}>
              {measuring ? 'Reading song length…' : unreadable ? 'Couldn’t read this file' : ''}
            </Text>
            <Text style={[styles.scaleText, monoDigits]}>{songEnd != null ? tc(songEnd) : '—'}</Text>
          </View>
          {nudges((d) => setStartTo(snapFrame(startClamped + d)), 'Start')}
        </View>
      </Section>

      <Section title="Length">
        <View style={styles.block}>
          <View style={styles.chips}>
            {LENGTHS.map((l) => {
              const on = l.value === lengthChoice;
              return (
                <Pressable
                  key={String(l.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    if (l.value === 'custom') setCustomEnd(end);
                    setLengthChoice(l.value);
                  }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn, monoDigits]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {lengthChoice === 'custom' ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>END</Text>
              <Text style={[styles.bigTc, monoDigits]}>{tc(end)}</Text>
              <ScrubBar
                min={base}
                max={songEnd ?? base + 1}
                value={end}
                region={ready ? { start: startClamped, end } : undefined}
            outerRegion={outerRegion}
                onChange={(v) => setEndTo(snapSecond(v))}
                disabled={!ready}
                accessibilityLabel="Section end in the song"
              />
              {nudges((d) => setEndTo(snapFrame(end + d)), 'End')}
            </View>
          ) : null}
          <View style={styles.readouts}>
            {[
              ['START', tc(startClamped)],
              ['END', tc(end)],
              ['LENGTH', length > 0 ? tc(length) : '—'],
            ].map(([k, v]) => (
              <View key={k} style={styles.readout}>
                <Text style={styles.label}>{k}</Text>
                <Text style={[styles.readoutValue, monoDigits, k === 'LENGTH' && { color: colors.slateGreen }]}>{v}</Text>
              </View>
            ))}
          </View>
          {shortened ? <Text style={styles.note}>Shortened to the end of the song.</Text> : null}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: withBuffer }}
            onPress={() => setWithBuffer((v) => !v)}
            style={({ pressed }) => [styles.bufferBtn, withBuffer && styles.bufferBtnOn, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.check, withBuffer && styles.checkOn]}>
              {withBuffer ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={[styles.bufferText, withBuffer && { color: colors.slateGreen }]}>
              +{SECTION_BUFFER_SECONDS}s BUFFER BEFORE & AFTER
            </Text>
          </Pressable>
          {withBuffer && ready ? (
            <View style={{ gap: 2 }}>
              <Text style={[styles.fileLine, monoDigits]}>
                {`File: ${tc(buffered.fileStart)} → ${tc(buffered.fileEnd)}  (${tc(buffered.fileEnd - buffered.fileStart)} long)`}
              </Text>
              {buffered.before < tcSeconds(SECTION_BUFFER_SECONDS) - 0.001 ? (
                <Text style={styles.note}>
                  {`Only ${Math.round(buffered.before * 10) / 10}s before: the song starts there.`}
                </Text>
              ) : null}
              {buffered.after < tcSeconds(SECTION_BUFFER_SECONDS) - 0.001 ? (
                <Text style={styles.note}>
                  {`Only ${Math.round(buffered.after * 10) / 10}s after: the song ends there.`}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Section>

      <Section
        title="Speed"
        footer="Varispeed, like a tape machine: pitch follows speed. The slate shows the badge next to the timecode, and the counter stays in song time."
      >
        <View style={styles.block}>
          <View style={styles.chips}>
            {SPEEDS.map((sp) => {
              const on = sp.value === speed;
              return (
                <Pressable
                  key={sp.label}
                  accessibilityRole="radio"
                  accessibilityLabel={sp.description}
                  accessibilityState={{ selected: on }}
                  onPress={() => setSpeed(sp.value)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{sp.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {speed !== 1 && length > 0 ? (
            <Text style={[styles.fileLine, monoDigits]}>
              {`${speedLabel(speed)}: plays for ${formatDuration(
                realSeconds((withBuffer ? buffered.fileEnd - buffered.fileStart : length), speed),
              ).replace(/\.\d+$/, '')} on set`}
            </Text>
          ) : null}
        </View>
      </Section>

      <Section title="Name" footer="Leave it empty to use the suggested name.">
        <View style={styles.block}>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textDim}
            autoCorrect={false}
            returnKeyType="done"
            accessibilityLabel="New file name"
          />
        </View>
      </Section>

      {source && error && ready ? <Text style={styles.error}>{error}</Text> : null}
      {full ? (
        <Text style={styles.error}>{`The cue list is full (${MAX_CUES} cues). Delete some cues to cut a new section.`}</Text>
      ) : null}
      <Button
        title={busy ? 'Creating…' : 'Create section'}
        variant="primary"
        disabled={busy || !ready || !!error || full}
        onPress={onCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.textDim, fontSize: 15, paddingVertical: 14 },
  block: { paddingVertical: 14, gap: 10 },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  songName: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  songMeta: { color: colors.textDim, fontSize: 13 },
  bigTc: { color: colors.text, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { color: colors.textDim, fontSize: 12 },
  nudges: { flexDirection: 'row', gap: 6 },
  nudge: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexGrow: 1,
    minWidth: 56,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chipOn: { borderColor: colors.slateGreen },
  chipText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chipTextOn: { color: colors.slateGreen },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  readouts: { flexDirection: 'row', gap: 6 },
  readout: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 4 },
  readoutValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  note: { color: colors.warn, fontSize: 13 },
  bufferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  bufferBtnOn: { borderColor: colors.slateGreen },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.slateGreen, backgroundColor: colors.slateGreen },
  checkMark: { color: '#04140a', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  bufferText: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.5, flexShrink: 1 },
  fileLine: { color: colors.textDim, fontSize: 13 },
  input: {
    color: colors.text,
    fontSize: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { color: colors.warn, fontSize: 14, marginBottom: 12, marginHorizontal: 4 },
});
