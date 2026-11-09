import { Alert, ScrollView, StyleSheet, Switch, Text } from 'react-native';

import { FRAME_RATE_IDS } from '../domain/timecode';
import type { FrameRateId, OrientationSetting, StopGesture } from '../domain/types';
import { DEFAULT_SETTINGS, selectActiveSession, useAppStore } from '../state/store';
import { Button, Row, Section, Segmented, Stepper } from '../ui/controls';
import { colors } from '../ui/theme';

export default function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const nextTake = useAppStore((s) => selectActiveSession(s)?.nextTake ?? 1);
  const { updateSettings, setNextTake } = useAppStore.getState();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Section title="Slate">
        <Row label="Countdown">
          <Stepper
            value={settings.countdownSeconds}
            min={0}
            max={10}
            onChange={(countdownSeconds) => updateSettings({ countdownSeconds })}
            format={(v) => `${v} s`}
          />
        </Row>
        <Row label="Stop playback with">
          <Segmented<StopGesture>
            options={[
              { value: 'tap', label: 'TAP' },
              { value: 'longPress', label: 'LONG-PRESS' },
            ]}
            value={settings.stopGesture}
            onChange={(stopGesture) => updateSettings({ stopGesture })}
          />
        </Row>
        <Row label="2-pop beep at green flip">
          <Switch value={settings.twoPop} onValueChange={(twoPop) => updateSettings({ twoPop })} />
          <Text style={styles.help}>
            Plays a short beep, one frame long, the instant the screen turns green. It gives your editor a sync point
            to hear in the camera audio, and it’s how you set the latency offset below.
          </Text>
        </Row>
        <Row label="Orientation">
          <Segmented<OrientationSetting>
            options={[
              { value: 'portrait', label: 'PORTRAIT' },
              { value: 'landscape', label: 'LANDSCAPE' },
            ]}
            value={settings.orientation}
            onChange={(orientation) => updateSettings({ orientation })}
          />
        </Row>
      </Section>

      <Section
        title="Timecode"
        footer="23.976 and 29.97 count frames at 24/30 per timecode-second but run at real NTSC speed, matching an NTSC timeline in your NLE."
      >
        <Row label="Frame rate">
          <Segmented<FrameRateId>
            options={FRAME_RATE_IDS.map((id) => ({ value: id, label: id }))}
            value={settings.frameRate}
            onChange={(frameRate) => updateSettings({ frameRate })}
          />
        </Row>
        {settings.frameRate === '29.97' ? (
          <Row label="Drop-frame (HH:MM:SS;FF)">
            <Switch value={settings.dropFrame} onValueChange={(dropFrame) => updateSettings({ dropFrame })} />
          </Row>
        ) : null}
      </Section>

      <Section
        title="Sync calibration"
        footer={
          'Positive values delay the green flip; negative values make it earlier.\n' +
          'Calibrate: film the slate with the 2-pop on, then in your editor compare the frame where the screen turns green with the start of the beep. ' +
          'If the beep starts AFTER the green frame, increase the offset by that difference (1 frame ≈ 42 ms at 24 fps, 33 ms at 30 fps).'
        }
      >
        <Row label="Latency offset">
          <Stepper
            value={settings.latencyOffsetMs}
            min={-500}
            max={500}
            step={1}
            bigStep={10}
            onChange={(latencyOffsetMs) => updateSettings({ latencyOffsetMs })}
            format={(v) => `${v > 0 ? '+' : ''}${v} ms`}
          />
        </Row>
      </Section>

      <Section title="Takes" footer="The take number is per session and increments after every take.">
        <Row label={`Next take: ${nextTake}`}>
          <Button title="Reset to 1" onPress={() => setNextTake(1)} />
          <Stepper value={nextTake} min={1} max={9999} onChange={setNextTake} />
        </Row>
      </Section>

      <Button
        title="Replay the guided tour"
        onPress={() => useAppStore.getState().setTourDone(false)}
        style={{ marginBottom: 10 }}
      />
      <Button
        title="Restore default settings"
        variant="danger"
        onPress={() =>
          Alert.alert('Restore defaults?', 'Cues and sessions are not affected.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Restore', style: 'destructive', onPress: () => updateSettings(DEFAULT_SETTINGS) },
          ])
        }
      />
      <Text style={styles.version}>SyncSlate 1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  version: { color: colors.textDim, textAlign: 'center', marginTop: 24, fontSize: 13 },
  help: { color: colors.textDim, fontSize: 13, lineHeight: 18, width: '100%' },
});
