import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ message, fullScreen = false }: LoadingSpinnerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        fullScreen && { flex: 1, backgroundColor: theme.colors.background },
      ]}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {message && (
        <Text variant="bodySmall" color="secondary" style={{ marginTop: theme.spacing.md }}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 24 },
});
