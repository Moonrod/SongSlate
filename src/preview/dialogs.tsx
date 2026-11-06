/**
 * In-page replacement for Alert.alert / Alert.prompt in the web preview.
 * React Native Web's Alert does nothing, and the hosted preview frame blocks the
 * browser's own alert/confirm/prompt, so confirmations (e.g. "Delete cue?")
 * would silently never happen without this.
 */
import { useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, type AlertButton } from 'react-native';

import { colors } from '../ui/theme';

interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  prompt?: { defaultValue: string };
}

let queue: DialogRequest[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function show(req: Omit<DialogRequest, 'id'>) {
  queue = [...queue, { ...req, id: nextId++ }];
  emit();
}

function close(id: number) {
  queue = queue.filter((d) => d.id !== id);
  emit();
}

export function installPreviewDialogs() {
  Alert.alert = (title, message, buttons) => {
    show({ title: title ?? '', message: message ?? undefined, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
  };
  Alert.prompt = (title, message, callbackOrButtons, _type, defaultValue) => {
    const buttons: AlertButton[] =
      typeof callbackOrButtons === 'function'
        ? [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress: callbackOrButtons as () => void }]
        : (callbackOrButtons ?? [{ text: 'OK' }]);
    show({ title: title ?? '', message: message ?? undefined, buttons, prompt: { defaultValue: defaultValue ?? '' } });
  };
}

export function DialogHost() {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue[0],
  );
  if (!current) return null;
  return <Dialog key={current.id} req={current} />;
}

function Dialog({ req }: { req: DialogRequest }) {
  const [text, setText] = useState(req.prompt?.defaultValue ?? '');
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.title}>{req.title}</Text>
        {req.message ? <Text style={styles.message}>{req.message}</Text> : null}
        {req.prompt ? (
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            style={styles.input}
            placeholderTextColor={colors.textDim}
          />
        ) : null}
        <View style={styles.buttons}>
          {req.buttons.map((b, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              onPress={() => {
                close(req.id);
                (b.onPress as ((value?: string) => void) | undefined)?.(req.prompt ? text : undefined);
              }}
              style={({ pressed }) => [
                styles.button,
                b.style === 'destructive' && styles.destructive,
                b.style !== 'cancel' && b.style !== 'destructive' && styles.primary,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.buttonText}>{b.text ?? 'OK'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  message: { color: colors.textDim, fontSize: 15, lineHeight: 21 },
  input: {
    color: colors.text,
    fontSize: 16,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    minHeight: 40,
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  destructive: { backgroundColor: '#8E1A14' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
