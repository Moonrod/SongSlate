import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { cueTimecodeBase, nextSectionIndex, sectionName, validateSection } from '../domain/section';
import { FRAME_RATES, formatDuration, formatTimecode, framesToSeconds, parseTimecode } from '../domain/timecode';
import { createSection } from '../services/sections';
import { useAppStore } from '../state/store';
import { Button, Row, Section } from '../ui/controls';
import { colors, monoDigits } from '../ui/theme';

/** Cut part of an imported song into a new, named audio file that becomes its own cue. */
export default function NewSectionScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  const cues = useAppStore((s) => s.cues);
  const { frameRate, dropFrame } = useAppStore((s) => s.settings);

  const [selectedId, setSelectedId] = useState<string | null>(sourceId ?? null);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const source = cues.find((c) => c.id === selectedId) ?? null;
  const base = source ? cueTimecodeBase(source) : 0;
  const songEnd = source?.durationSeconds != null ? base + source.durationSeconds : null;

  const start = startText.trim() ? parseTimecode(startText, frameRate, dropFrame) : null;
  const end = endText.trim() ? parseTimecode(endText, frameRate, dropFrame) : null;
  const length = start != null && end != null && end > start ? end - start : null;

  const tcHelp = `HH:MM:SS${dropFrame && frameRate === '29.97' ? ';' : ':'}FF at ${frameRate} fps (frames 00–${
    FRAME_RATES[frameRate].timebase - 1
  }), MM:SS, or seconds`;

  let error: string | null = null;
  if (!source) error = 'Pick a song.';
  else if (startText.trim() && start == null) error = `Start timecode isn't valid. Use ${tcHelp}.`;
  else if (endText.trim() && end == null) error = `End timecode isn't valid. Use ${tcHelp}.`;
  else if (start != null && start < base) error = `This cue starts at ${formatTimecode(base, frameRate, dropFrame)}.`;
  else error = validateSection(start, end, songEnd);

  // The hint follows the naming convention with the next free number and the real length.
  const placeholder = sectionName(nextSectionIndex(cues), length ?? 30);

  const onCreate = async () => {
    setTouched(true);
    if (error || !source || start == null || end == null) return;
    setBusy(true);
    try {
      const finalName = name.trim() || placeholder;
      const cue = await createSection({ source, startSeconds: start, endSeconds: end, name: finalName });
      useAppStore.getState().insertCueAfter(source.id, cue);
      router.dismissTo('/cues');
      Alert.alert(
        'Section created',
        `"${finalName}" (${formatDuration(cue.durationSeconds ?? 0)}) is in your cue list after "${source.name}". ` +
          `When it plays, the slate counter starts at ${formatTimecode(cue.section!.startSeconds, frameRate, dropFrame)}, ` +
          `matching "${cue.section!.sourceName}".`,
      );
    } catch (e: any) {
      Alert.alert('Could not create the section', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Section title="1. Song">
        {cues.length === 0 ? (
          <Text style={styles.empty}>Import a song first (Cue List → + Import).</Text>
        ) : (
          cues.map((c) => {
            const selected = c.id === selectedId;
            const cBase = cueTimecodeBase(c);
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setSelectedId(c.id)}
                style={({ pressed }) => [styles.songRow, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.songName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[styles.songMeta, monoDigits]} numberOfLines={1}>
                    {c.durationSeconds != null
                      ? `${formatTimecode(cBase, frameRate, dropFrame)} – ${formatTimecode(cBase + c.durationSeconds, frameRate, dropFrame)}`
                      : 'Length unknown until armed or cut'}
                    {`  ·  ${c.originalFileName}`}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </Section>

      <Section title="2. Section" footer={`Song timecode, as on the slate. ${tcHelp}.`}>
        <Row label="Start">
          <TextInput
            value={startText}
            onChangeText={setStartText}
            style={[styles.input, monoDigits]}
            placeholder={formatTimecode(base, frameRate, dropFrame)}
            placeholderTextColor={colors.textDim}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            returnKeyType="next"
          />
        </Row>
        <Row label="End">
          <TextInput
            value={endText}
            onChangeText={setEndText}
            style={[styles.input, monoDigits]}
            placeholder={formatTimecode(
              base + framesToSeconds(FRAME_RATES[frameRate].timebase * 30, frameRate),
              frameRate,
              dropFrame,
            )}
            placeholderTextColor={colors.textDim}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            returnKeyType="next"
          />
        </Row>
        <Row label="Length">
          <Text style={[styles.value, monoDigits]}>
            {length != null ? `${formatTimecode(length, frameRate, dropFrame)}  (${formatDuration(length)})` : '—'}
          </Text>
        </Row>
      </Section>

      <Section title="3. Name" footer="Leave it empty to use the suggested name.">
        <Row label="New file name">
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textDim}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onCreate}
          />
        </Row>
      </Section>

      {touched && error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title={busy ? 'Creating…' : 'Create section'}
        variant="primary"
        disabled={busy || cues.length === 0}
        onPress={onCreate}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  empty: { color: colors.textDim, fontSize: 15, paddingVertical: 14 },
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
  songName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  songMeta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  input: {
    flex: 1,
    minWidth: 200,
    color: colors.text,
    fontSize: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { color: colors.textDim, fontSize: 15 },
  error: { color: colors.warn, fontSize: 14, marginBottom: 12, marginHorizontal: 4 },
});
