import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FRAME_RATES, formatDuration, formatTimecode, parseTimecode } from '../../domain/timecode';
import type { StartMode } from '../../domain/types';
import { deleteCueFile } from '../../services/audioFiles';
import { useAppStore } from '../../state/store';
import { Button, Row, Section, Segmented } from '../../ui/controls';
import { colors, monoDigits } from '../../ui/theme';

export default function EditCueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cue = useAppStore((s) => s.cues.find((c) => c.id === id));
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

  const tcText = tcDraft ?? formatTimecode(cue.startSeconds, frameRate, dropFrame);

  const commitTimecode = () => {
    if (tcDraft == null) return;
    const seconds = parseTimecode(tcDraft, frameRate, dropFrame);
    if (seconds == null) {
      const maxFrame = FRAME_RATES[frameRate].timebase - 1;
      const sep = dropFrame && frameRate === '29.97' ? ';' : ':';
      setTcError(`Use HH:MM:SS${sep}FF (frames 00–${maxFrame}), MM:SS, or seconds.`);
      return;
    }
    if (cue.durationSeconds != null && seconds >= cue.durationSeconds) {
      setTcError(`Start point is past the end of the song (${formatDuration(cue.durationSeconds)}).`);
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
        <Row label="File">
          <Text style={styles.value}>{cue.originalFileName}</Text>
        </Row>
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
          <Segmented<StartMode>
            options={[
              { value: 'full', label: 'FULL SONG' },
              { value: 'timecode', label: 'FROM TIMECODE' },
            ]}
            value={cue.startMode}
            onChange={(startMode) => updateCue(cue.id, { startMode })}
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
              placeholder="00:01:12:00"
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
  error: { color: colors.warn, fontSize: 13, width: '100%' },
});
