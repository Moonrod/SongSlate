import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cueDotEmoji } from '../domain/dots';
import { cueTimecodeBase } from '../domain/section';
import { formatDuration, formatTimecode } from '../domain/timecode';
import { deleteCueFile, pickAndImportAudio } from '../services/audioFiles';
import { useAppStore } from '../state/store';
import { Button } from '../ui/controls';
import { colors, monoDigits } from '../ui/theme';

export default function CueListScreen() {
  const cues = useAppStore((s) => s.cues);
  const armedCueId = useAppStore((s) => s.armedCueId);
  const settings = useAppStore((s) => s.settings);
  const { addCues, armCue, moveCue, removeCues } = useAppStore.getState();
  const [importing, setImporting] = useState(false);
  const insets = useSafeAreaInsets();
  /** Select mode: tap cues to tick them, then delete the ticked ones. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Ignore ids of cues that no longer exist.
  const ticked = cues.filter((c) => selected.has(c.id));
  const allTicked = cues.length > 0 && ticked.length === cues.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const onDeleteSelected = () => {
    if (!ticked.length) return;
    const names = ticked.slice(0, 5).map((c) => `• ${c.name}`).join('\n') + (ticked.length > 5 ? `\n…and ${ticked.length - 5} more` : '');
    Alert.alert(
      ticked.length === 1 ? 'Delete 1 cue?' : `Delete ${ticked.length} cues?`,
      `${names}\n\nTheir audio files are removed from the app. Takes already in the report stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeCues(ticked.map((c) => c.id));
            ticked.forEach((c) => deleteCueFile(c));
            exitSelect();
          },
        },
      ],
    );
  };

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
          headerRight: () =>
            selecting ? (
              <Pressable onPress={exitSelect} hitSlop={10} accessibilityRole="button">
                <Text style={styles.headerAction}>Done</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onImport} disabled={importing} hitSlop={10} accessibilityRole="button">
                <Text style={styles.headerAction}>{importing ? 'Importing…' : '+ Import'}</Text>
              </Pressable>
            ),
        }}
      />
      <FlatList
        data={cues}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 12, paddingBottom: selecting ? 100 : 40 }}
        ListHeaderComponent={
          cues.length ? (
            <View style={styles.listTop}>
              <Text style={styles.listTopText}>
                {selecting ? `${ticked.length} selected` : `${cues.length} cue${cues.length === 1 ? '' : 's'}`}
              </Text>
              {!selecting ? (
                <Pressable
                  onPress={() => setSelecting(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.selectBtn, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.selectBtnText}>Select</Text>
                </Pressable>
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No cues yet</Text>
            <Text style={styles.emptyText}>Import MP3, WAV, AIFF or M4A files from the Files app.</Text>
            <Button title="Import audio" variant="primary" onPress={onImport} disabled={importing} />
          </View>
        }
        ListFooterComponent={
          cues.length && !selecting ? (
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
                item.section.bufferBefore || item.section.bufferAfter ? ' incl. buffer' : ''
              }${
                item.startMode === 'timecode' ? `, from ${tc(base + item.startSeconds)}` : ''
              }`
            : item.startMode === 'full'
              ? 'FULL SONG'
              : `from ${tc(item.startSeconds)}`;
          const isTicked = selected.has(item.id);
          return (
            <View style={[styles.row, armed && !selecting && styles.rowArmed, isTicked && styles.rowTicked]}>
              <Pressable
                style={styles.rowMain}
                onPress={() =>
                  selecting ? toggle(item.id) : router.push({ pathname: '/cue/[id]', params: { id: item.id } })
                }
                accessibilityRole={selecting ? 'checkbox' : 'button'}
                accessibilityState={selecting ? { checked: isTicked } : undefined}
                accessibilityHint={selecting ? 'Select for deleting' : 'Edit cue'}
              >
                {selecting ? (
                  <View style={[styles.check, isTicked && styles.checkOn]}>
                    {isTicked ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                ) : (
                  <Text style={styles.index}>{index + 1}</Text>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {`${cueDotEmoji(item)} ${item.name}`}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    <Text style={monoDigits}>{start}</Text>
                    {item.durationSeconds ? `  ·  ${formatDuration(item.durationSeconds).replace(/\.\d+$/, '')}` : ''}
                    {item.section ? `  ·  of ${item.section.sourceName}` : `  ·  ${item.originalFileName}`}
                  </Text>
                </View>
              </Pressable>
              <View style={[styles.actions, selecting && { display: 'none' }]}>
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
      {selecting ? (
        <View style={[styles.selectBar, { paddingBottom: 12 + insets.bottom }]}>
          <Pressable
            onPress={() => setSelected(allTicked ? new Set() : new Set(cues.map((c) => c.id)))}
            accessibilityRole="button"
            style={({ pressed }) => [styles.barBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.barBtnText}>{allTicked ? 'Deselect all' : 'Select all'}</Text>
          </Pressable>
          <Pressable
            onPress={onDeleteSelected}
            disabled={!ticked.length}
            accessibilityRole="button"
            style={({ pressed }) => [styles.barBtn, styles.deleteBtn, !ticked.length && { opacity: 0.35 }, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.barBtnText, { color: '#fff' }]}>
              {ticked.length ? `Delete (${ticked.length})` : 'Delete'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerAction: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  listTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  listTopText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  selectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surfaceAlt, minHeight: 36, justifyContent: 'center' },
  selectBtnText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowTicked: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteBtn: { backgroundColor: '#B3261E', borderColor: '#B3261E' },
  barBtnText: { color: colors.text, fontSize: 16, fontWeight: '700' },
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
