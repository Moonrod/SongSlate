import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { SectionCutter } from '../sections/SectionCutter';
import { colors } from '../ui/theme';

/** New Section screen (from the cue list): pick any song and cut a section from it. */
export default function NewSectionScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <SectionCutter initialSourceId={sourceId} />
    </ScrollView>
  );
}
