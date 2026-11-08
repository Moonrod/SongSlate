import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { cueDotEmoji } from '../domain/dots';
import { cueTimecodeBase } from '../domain/section';
import { formatDuration, formatTimecode } from '../domain/timecode';
import { pickAndImportAudio } from '../services/audioFiles';
import { useAppStore } from '../state/store';
import { Button } from '../ui/controls';
import { colors, monoDigits } from '../ui/theme';

export default function CueListScreen() {
  const cues = useAppStore((s) => s.cues);
  const armedCueId = useAppStore((s) => s.armedCueId);
  const settings = useAppStore((s) => s.settings);
  const { addCues, armCue, moveCue } = useAppStore.getState();
  const [importing, setImporting] = useState(false);

  const onImport = async () => {
    setImporting(true);
    try {
      const { cues: added, skipped } = await pickAndImportAudio();
      if (added.length) addCues(added);
      if (skipped.length) {
        Alert.alert('Some files were skipped', `Unsupported or unreadable:\n${skipped.join('\n')}`);
      }
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={onImport} disabled={importing} hitSlop={10} accessibilityRole="button">
              <Text style={styles.headerAction}>{importing ? 'Importing…' : '+ Import'}</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={cues}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No cues yet</Text>
            <Text style={styles.emptyText}>Import MP3, WAV, AIFF or M4A files from the Files app.</Text>
            <Button title="Import audio" variant="primary" onPress={onImport} disabled={importing} />
          </View>
        }
        ListFooterComponent={
          cues.length ? (
            <Button
              title="✂︎ New section from a song"
              onPress={() => router.push('/section')}
              style={{ marginTop: 8 }}
            />
          ) : undefined
        }
        renderItem={({ item, index }) => {
          const armed = item.id === armedCueId;
          const base = cueTimecodeBase(item);
          const tc = (s: number) => formatTimecode(s, settings.frameRate, settings.dropFrame);
          const start = item.section
            ? `SECTION ${tc(item.section.startSeconds)}–${tc(item.section.endSeconds)}${
                item.startMode === 'timecode' ? `, from ${tc(base + item.startSeconds)}` : ''
              }`
            : item.startMode === 'full'
              ? 'FULL SONG'
              : `from ${tc(item.startSeconds)}`;
          return (
            <View style={[styles.row, armed && styles.rowArmed]}>
              <Pressable
                style={styles.rowMain}
                onPress={() => router.push({ pathname: '/cue/[id]', params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityHint="Edit cue"
              >
                <Text style={styles.index}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {`${cueDotEmoji(item, index)} ${item.name}`}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    <Text style={monoDigits}>{start}</Text>
                    {item.durationSeconds ? `  ·  ${formatDuration(item.durationSeconds).replace(/\.\d+$/, '')}` : ''}
                    {item.section ? `  ·  of ${item.section.sourceName}` : `  ·  ${item.originalFileName}`}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => moveCue(item.id, -1)}
                  disabled={index === 0}
                  style={[styles.iconBtn, index === 0 && styles.disabled]}
                  accessibilityLabel="Move up"
                >
                  <Text style={styles.iconText}>▲</Text>
                </Pressable>
                <Pressable
                  onPress={() => moveCue(item.id, 1)}
                  disabled={index === cues.length - 1}
                  style={[styles.iconBtn, index === cues.length - 1 && styles.disabled]}
                  accessibilityLabel="Move down"
                >
                  <Text style={styles.iconText}>▼</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    armCue(item.id);
                    router.back();
                  }}
                  style={[styles.armBtn, armed && styles.armBtnActive]}
                  accessibilityLabel={armed ? 'Armed' : 'Arm this cue'}
                >
                  <Text style={styles.armText}>{armed ? 'ARMED' : 'ARM'}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerAction: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 12, marginTop: 80, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    paddingRight: 8,
  },
  rowArmed: { borderColor: colors.accent },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  index: { color: colors.textDim, fontSize: 18, fontWeight: '800', width: 26, textAlign: 'center' },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  meta: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: colors.text, fontSize: 14 },
  disabled: { opacity: 0.3 },
  armBtn: {
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armBtnActive: { backgroundColor: colors.accent },
  armText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
});
