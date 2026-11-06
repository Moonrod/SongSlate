import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from './theme';

export function Button({
  title,
  onPress,
  variant = 'default',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.accent, borderColor: colors.accent },
        variant === 'danger' && { borderColor: colors.accent },
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, variant === 'danger' && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  bigStep,
  format = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  bigStep?: number;
  format?: (v: number) => string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn = (label: string, delta: number) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'Increase' : 'Decrease'} by ${Math.abs(delta)}`}
      onPress={() => onChange(clamp(value + delta))}
      style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.stepBtnText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {bigStep ? btn(`−${bigStep}`, -bigStep) : null}
      {btn('−', -step)}
      <Text style={styles.stepValue}>{format(value)}</Text>
      {btn('+', step)}
      {bigStep ? btn(`+${bigStep}`, bigStep) : null}
    </View>
  );
}

export function Section({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segment: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 40, justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.accent },
  segmentText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  segmentTextSelected: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    minWidth: 44,
    minHeight: 40,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 17, fontWeight: '700' },
  stepValue: { color: colors.text, fontSize: 17, fontWeight: '700', minWidth: 64, textAlign: 'center' },
  section: { marginBottom: 22 },
  sectionTitle: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  sectionBody: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  sectionFooter: { color: colors.textDim, fontSize: 13, marginTop: 6, marginHorizontal: 4, lineHeight: 18 },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  rowLabel: { color: colors.text, fontSize: 16, fontWeight: '500' },
  rowControl: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
});
