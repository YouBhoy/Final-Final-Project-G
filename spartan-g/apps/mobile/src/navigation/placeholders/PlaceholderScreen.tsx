import { View, StyleSheet, Text } from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';

interface PlaceholderScreenProps {
  routeName: string;
}

export function PlaceholderScreen({ routeName }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.caption}>Route placeholder</Text>
      <Text style={styles.title}>{routeName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.background,
  },
  caption: { fontSize: 12, color: lightColors.textMuted },
  title: { fontSize: 20, fontWeight: '600', color: lightColors.text },
});
