import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { cueDotEmoji, DOTS } from '../../domain/dots';
import { cueTimecodeBase } from '../../domain/section';
import { FRAME_RATES, formatDuration, formatTimecode, framesToSeconds, parseTimecode } from '../../domain/timecode';
import type { StartMode } from '../../domain/types';
import { deleteCueFile } from '../../services/audioFiles';
import { useAppStore } from '../../state/store';
import { Button, Row, Section, Segmented } from '../../ui/controls';
import { colors, monoDigits } from '../../ui/theme';

export default function EditCueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cue = useAppStore((s) => s.cues.find((c) => c.id === id));
  const cueIndex = useAppStore((s) => s.cues.findIndex((c) => c.id === id));
  const armedCueId = useAppStore((s) => s.armedCueId);
  const { frameRate, dropFrame } = useAppStore((s) => s.settings);
  const { updateCue, removeCue, armCue } = useAppStore.getState();

  const [name, setName] = useState(cue?.name ?? '');
  /** Text being typed; null shows the stored start point formatted at the current frame rate. */
  const [tcDraft, setTcDraft] = useState<string | null>(null);
  const [tcError, setTcError] = useState<string | null>(null);

  if (!cue) {
    return (
      <View style={styles.container}>
        <Text style={styles.missing}>This cue no longer exists.</Text>
      </View>
    );
  }

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== cue.name) updateCue(cue.id, { name: trimmed });
    else setName(cue.name);
  };

  // Sections show and take the original song's timecode; startSeconds stays file-relative.
  const base = cueTimecodeBase(cue);
  const tcText = tcDraft ?? formatTimecode(base + cue.startSeconds, frameRate, dropFrame);

  const commitTimecode = () => {
    if (tcDraft == null) return;
    const songSeconds = parseTimecode(tcDraft, frameRate, dropFrame);
    if (songSeconds == null) {
      const maxFrame = FRAME_RATES[frameRate].timebase - 1;
      const sep = dropFrame && frameRate === '29.97' ? ';' : ':';
      setTcError(`Use HH:MM:SS${sep}FF (frames 00–${maxFrame}), MM:SS, or seconds.`);
      return;
    }
    const seconds = songSeconds - base;
    if (seconds < 0) {
      setTcError(`This section starts at ${formatTimecode(base, frameRate, dropFrame)}.`);
      return;
    }
    if (cue.durationSeconds != null && seconds >= cue.durationSeconds) {
      setTcError(
        cue.section
          ? `This section ends at ${formatTimecode(cue.section.endSeconds, frameRate, dropFrame)}.`
          : `Start point is past the end of the song (${formatDuration(cue.durationSeconds)}).`,
      );
      return;
    }
    setTcError(null);
    updateCue(cue.id, { startSeconds: seconds });
    setTcDraft(null);
  };

  const onDelete = () => {
    Alert.alert('Delete cue?', `"${cue.name}" will be removed and its audio file deleted from the app.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.back();
          removeCue(cue.id);
          deleteCueFile(cue);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Section title="Cue">
        <Row label="Name">
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={commitName}
            onSubmitEditing={commitName}
            style={styles.input}
            placeholder="Song title"
            placeholderTextColor={colors.textDim}
            returnKeyType="done"
          />
        </Row>
        <Row label="Colour dot (shown before the title on the slate)">
          {DOTS.map((d) => {
            const selected = cueDotEmoji(cue, cueIndex) === d.emoji;
            return (
              <Pressable
                key={d.id}
                accessibilityRole="radio"
                accessibilityLabel={d.label}
                accessibilityState={{ selected }}
                onPress={() => updateCue(cue.id, { dot: d.id })}
                style={[styles.dot, selected && styles.dotSelected]}
              >
                <Text style={styles.dotEmoji}>{d.emoji}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Row label="File">
          <Text style={styles.value}>{cue.originalFileName}</Text>
        </Row>
        {cue.section ? (
          <Row label="Section of">
            <Text style={[styles.value, monoDigits]}>
              {`${cue.section.sourceName}\n${formatTimecode(cue.section.startSeconds, frameRate, dropFrame)} – ${formatTimecode(
                cue.section.endSeconds,
                frameRate,
                dropFrame,
              )}${
                cue.section.bufferBefore || cue.section.bufferAfter
                  ? `\nIncludes ${Math.round((cue.section.bufferBefore ?? 0) * 10) / 10}s before and ${
                      Math.round((cue.section.bufferAfter ?? 0) * 10) / 10
                    }s after the section`
                  : ''
              }`}
            </Text>
          </Row>
        ) : null}
        <Row label="Duration">
          <Text style={[styles.value, monoDigits]}>
            {cue.durationSeconds != null
              ? `${formatTimecode(cue.durationSeconds, frameRate, dropFrame)}  (${formatDuration(cue.durationSeconds)})`
              : 'Unknown until armed'}
          </Text>
        </Row>
      </Section>

      <Section
        title="Start point"
        footer={`Timecode is song position at ${frameRate} fps${dropFrame && frameRate === '29.97' ? ' drop-frame' : ''}. The slate counter starts here at the green flip.`}
      >
        <Row label="Play">
          <Segmented<StartMode | 'cut'>
            stretch
            options={[
              { value: 'full', label: cue.section ? 'WHOLE SECTION' : 'FULL SONG' },
              // Not a play mode: opens New Section with this song picked.
              { value: 'cut', label: '✂︎ CUT A SECTION' },
              { value: 'timecode', label: 'FROM TIMECODE' },
            ]}
            value={cue.startMode}
            onChange={(choice) => {
              if (choice === 'cut') router.push({ pathname: '/section', params: { sourceId: cue.id } });
              else updateCue(cue.id, { startMode: choice });
            }}
          />
        </Row>
        {cue.startMode === 'timecode' ? (
          <Row label="Start timecode">
            <TextInput
              value={tcText}
              onChangeText={(t) => {
                setTcDraft(t);
                setTcError(null);
              }}
              onBlur={commitTimecode}
              onSubmitEditing={commitTimecode}
              style={[styles.input, monoDigits, { fontSize: 22 }]}
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              placeholder={formatTimecode(
                base + framesToSeconds(FRAME_RATES[frameRate].timebase * 72, frameRate),
                frameRate,
                dropFrame,
              )}
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
            />
            {tcError ? <Text style={styles.error}>{tcError}</Text> : null}
          </Row>
        ) : null}
      </Section>

      <View style={{ gap: 10 }}>
        <Button
          title={armedCueId === cue.id ? 'Armed on slate' : 'Arm on slate'}
          variant="primary"
          disabled={armedCueId === cue.id}
          onPress={() => {
            armCue(cue.id);
            router.dismissTo('/');
          }}
        />
        <Button title="Delete cue" variant="danger" onPress={onDelete} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.textDim, padding: 24, fontSize: 16 },
  input: {
    flex: 1,
    minWidth: 200,
    color: colors.text,
    fontSize: 17,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { color: colors.textDim, fontSize: 15 },
  dot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
  },
  dotSelected: { borderColor: colors.text },
  dotEmoji: { fontSize: 24, lineHeight: 30 },
  error: { color: colors.warn, fontSize: 13, width: '100%' },
});
