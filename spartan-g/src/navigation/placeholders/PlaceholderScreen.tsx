/**
 * Temporary route placeholder — replace with real screens in Phase 2.
 * Exists only to wire navigation structure; not a product screen.
 */
import { View, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

interface PlaceholderScreenProps {
  routeName: string;
}

export function PlaceholderScreen({ routeName }: PlaceholderScreenProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="caption" color="muted">
        Route placeholder
      </Text>
      <Text variant="h3">{routeName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
