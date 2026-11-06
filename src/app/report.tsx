import { useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { describeEvent, END_REASON_LABELS, formatWallClock, startPointLabel } from '../domain/report';
import { formatDuration, formatTimecode } from '../domain/timecode';
import type { Session, TakeLog } from '../domain/types';
import { exportCsv, exportPdf } from '../services/exportReport';
import { defaultSessionName, selectActiveSession, useAppStore } from '../state/store';
import { Button } from '../ui/controls';
import { colors, monoDigits } from '../ui/theme';

function TakeRow({ take }: { take: TakeLog }) {
  const tc = (s: number) => formatTimecode(s, take.frameRate, take.dropFrame);
  const flagged = take.endReason === 'interrupted' || take.endReason === 'error';
  return (
    <View style={[styles.take, flagged && { borderColor: colors.warn }]}>
      <View style={styles.takeHeader}>
        <Text style={styles.takeNumber}>TAKE {take.takeNumber}</Text>
        <Text style={styles.takeCue} numberOfLines={1}>
          {take.cueName}
        </Text>
      </View>
      <Text style={[styles.takeLine, monoDigits]}>Flip  {formatWallClock(take.flipEpochMs)}</Text>
      <Text style={[styles.takeLine, monoDigits]}>
        {startPointLabel(take) === 'FULL SONG' ? 'FULL SONG  ' : ''}
        {tc(take.startSeconds)} → {tc(take.stopSeconds)}  ({formatDuration(take.durationSeconds)})
      </Text>
      <Text style={[styles.takeLine, flagged && { color: colors.warn }]}>{END_REASON_LABELS[take.endReason]}</Text>
      {take.events.map((e, i) => (
        <Text key={i} style={styles.eventLine}>
          ⚠︎ {formatWallClock(e.at).slice(11)} {describeEvent(e)}
        </Text>
      ))}
    </View>
  );
}

export default function ReportScreen() {
  const sessions = useAppStore((s) => s.sessions);
  const active = useAppStore(selectActiveSession);
  const { newSession, renameSession, setActiveSession, deleteSession } = useAppStore.getState();
  const [showSessions, setShowSessions] = useState(false);
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const doExport = async (kind: 'csv' | 'pdf', session: Session) => {
    setBusy(kind);
    try {
      if (kind === 'csv') await exportCsv(session);
      else await exportPdf(session);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const promptNewSession = () => {
    setShowSessions(false);
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'New session',
        'Name it e.g. "Artist – Song – Date".',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create', onPress: (name?: string) => newSession(name) },
        ],
        'plain-text',
        defaultSessionName(),
      );
    } else {
      // Android has no text prompt; the session name is editable inline above.
      newSession();
    }
  };

  if (!active) {
    return (
      <View style={[styles.container, { padding: 16 }]}>
        <Button title="Start a session" variant="primary" onPress={() => newSession()} />
      </View>
    );
  }

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View style={styles.sessionCard}>
        <Text style={styles.label}>SESSION</Text>
        <TextInput
          value={nameDraft ?? active.name}
          onChangeText={setNameDraft}
          onBlur={() => {
            if (nameDraft != null) renameSession(active.id, nameDraft);
            setNameDraft(null);
          }}
          style={styles.sessionName}
          placeholder="Artist – Song – Date"
          placeholderTextColor={colors.textDim}
          returnKeyType="done"
        />
        <Text style={styles.sessionMeta}>
          Started {formatWallClock(active.createdAt).slice(0, 16)} · {active.takes.length} take(s) · next take{' '}
          {active.nextTake}
        </Text>
        <View style={styles.buttonRow}>
          <Button
            title={busy === 'csv' ? 'Exporting…' : 'Export CSV'}
            onPress={() => doExport('csv', active)}
            disabled={busy != null}
            style={{ flex: 1 }}
          />
          <Button
            title={busy === 'pdf' ? 'Exporting…' : 'Export PDF'}
            onPress={() => doExport('pdf', active)}
            disabled={busy != null}
            style={{ flex: 1 }}
          />
        </View>
        <View style={styles.buttonRow}>
          <Button title="New session" variant="primary" onPress={promptNewSession} style={{ flex: 1 }} />
          <Button
            title={showSessions ? 'Hide sessions' : `All sessions (${sessions.length})`}
            onPress={() => setShowSessions((v) => !v)}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      {showSessions ? (
        <View style={styles.sessionList}>
          {sessions.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.sessionItem, s.id === active.id && { borderColor: colors.accent }]}
              onPress={() => {
                setActiveSession(s.id);
                setShowSessions(false);
              }}
              onLongPress={() =>
                Alert.alert('Delete session?', `"${s.name}" and its ${s.takes.length} take(s) will be deleted.`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deleteSession(s.id) },
                ])
              }
            >
              <Text style={styles.sessionItemName} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={styles.sessionMeta}>
                {formatWallClock(s.createdAt).slice(0, 10)} · {s.takes.length} take(s)
                {s.id === active.id ? ' · ACTIVE' : ''}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.hint}>Tap to make a session active. Long-press to delete.</Text>
        </View>
      ) : null}

      {active.events.length ? (
        <View style={styles.sessionCard}>
          <Text style={styles.label}>SESSION EVENTS</Text>
          {active.events.slice(-10).map((e, i) => (
            <Text key={i} style={styles.eventLine}>
              {formatWallClock(e.at).slice(11)} {describeEvent(e)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={active.takes}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        renderItem={({ item }) => <TakeRow take={item} />}
        ListEmptyComponent={<Text style={styles.hint}>No takes yet. Every playback on the slate is logged here.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  sessionName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionMeta: { color: colors.textDim, fontSize: 13 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  sessionList: { gap: 6 },
  sessionItem: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionItemName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 8 },
  take: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  takeHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 2 },
  takeNumber: { color: colors.accent, fontSize: 16, fontWeight: '900' },
  takeCue: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  takeLine: { color: colors.text, fontSize: 14 },
  eventLine: { color: colors.warn, fontSize: 13 },
});
