import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightColors } from '@spartan-g/shared-ui';

interface SafeScreenProps {
  children: ReactNode;
  /**
   * Background color rendered behind the status bar. Defaults to the app
   * background; pass the header's color (e.g. palette.spartanRedDark) for
   * screens whose colored header should extend behind the status bar.
   */
  backgroundColor?: string;
}

/**
 * Shared screen wrapper that keeps screen content below the phone's status
 * bar / notch / camera cutout using react-native-safe-area-context.
 *
 * Every screen that draws its own header (i.e. renders inside a navigator
 * with `headerShown: false`) should be wrapped in this instead of hardcoding
 * status-bar padding, so spacing adapts to every device.
 */
export function SafeScreen({ children, backgroundColor = lightColors.background }: SafeScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safe, { backgroundColor, paddingTop: insets.top }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});