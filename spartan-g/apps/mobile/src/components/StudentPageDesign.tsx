import type { ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from 'react-native-svg';

// Screen-local visual tokens; shared application/navigation colours are unchanged.
export const studentPageColors = {
  crimson: '#991B1B', red: '#DC2626', accent: '#EF233C', rose: '#FCE8EA',
  background: '#FFF3F4', white: '#FFFFFF', ink: '#101A32', slate: '#66748C',
};

/** Original, non-identifying campus illustration, not a university seal or photograph. */
function CampusSilhouette() {
  return (
    <G fill="#FFFFFF" opacity={0.13}>
      <Path d="M176 129H358V177H176Z M170 129L267 101L364 129Z M249 86H279V173H249Z M244 87L264 70L284 87Z M261 53H267V72H261Z" />
      <Circle cx="264" cy="100" r="8" fill="#991B1B" />
      {[187, 211, 235, 287, 311, 335].map(x => <Rect key={x} x={x} y="139" width="8" height="30" fill="#991B1B" />)}
      <Path d="M148 179V142 M126 153Q113 126 138 120Q134 99 152 100Q172 96 178 118Q198 135 170 154Z M376 180V143 M356 152Q343 125 367 120Q371 100 388 114Q410 134 387 155Z" />
    </G>
  );
}

export function StudentPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header} testID="student-page-header">
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFillObject}>
        <Svg width="100%" height="100%" viewBox="0 0 393 220" preserveAspectRatio="none">
          <Defs><LinearGradient id="studentHeader" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#991B1B" /><Stop offset="0.56" stopColor="#DF1737" /><Stop offset="1" stopColor="#FF7683" /></LinearGradient></Defs>
          <Rect width="393" height="220" fill="url(#studentHeader)" />
          <Path d="M126 0Q219 74 393 24V0Z" fill="#FFFFFF" opacity={0.055} />
          <Path d="M210 0Q272 69 393 52V0Z" fill="#FFFFFF" opacity={0.06} />
          <CampusSilhouette />
          <Path d="M0 180Q78 145 180 184T393 173V220H0Z" fill="#FFB2BB" opacity={0.65} />
          <Path d="M0 188Q77 154 191 194T393 185V220H0Z" fill="#FCE8EA" opacity={0.94} />
          <Path d="M0 207Q82 166 198 205T393 195V220H0Z" fill={studentPageColors.background} />
        </Svg>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

/** Absolute decoration never participates in layout or intercepts taps. */
export function StudentPageBackground({ chat = false }: { chat?: boolean }) {
  return (
    <View testID="student-page-decoration" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFillObject}>
      {chat && <View style={styles.chatWash} />}
      <View style={styles.footerArt}>
        <Svg width="100%" height="100%" viewBox="0 0 393 210" preserveAspectRatio="none">
          <Path d="M0 63C65 12 105 124 191 89S316 65 393 8V210H0Z" fill="#FBD1D8" opacity={0.8} />
          <Path d="M0 87C77 32 125 150 222 112S320 100 393 44V210H0Z" fill="#F6B4C0" opacity={0.48} />
          <Path d="M0 112C82 62 116 173 238 133S330 130 393 92V210H0Z" fill="#FBE0E5" />
          <Path d="M0 89C76 41 118 157 222 116" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity={0.65} />
          {[24, 43, 62, 81].flatMap(x => [136, 154, 172].map(y => <Circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#EE7F95" opacity={0.5} />))}
        </Svg>
      </View>
    </View>
  );
}

export function StudentSearchField({ value, onChangeText, placeholder, label }: {
  value: string; onChangeText: (value: string) => void; placeholder: string; label: string;
}) {
  return (
    <View style={styles.search}>
      <Feather name="search" size={19} color={studentPageColors.slate} />
      <TextInput accessibilityLabel={label} style={styles.searchInput} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={studentPageColors.slate} returnKeyType="search" autoCapitalize="none" autoCorrect={false} />
      {!!value && <TouchableOpacity onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} style={styles.clear}><Feather name="x" size={17} color={studentPageColors.slate} /></TouchableOpacity>}
    </View>
  );
}

export function StudentPageNotice({ title, message, loading, onRetry }: {
  title: string; message?: string; loading?: boolean; onRetry?: () => void;
}) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      {loading ? <ActivityIndicator color={studentPageColors.red} size="large" /> : <Feather name={onRetry ? 'alert-circle' : 'inbox'} size={30} color={studentPageColors.red} />}
      <Text style={styles.noticeTitle}>{title}</Text>
      {!!message && <Text style={styles.noticeMessage}>{message}</Text>}
      {onRetry && <TouchableOpacity style={styles.retry} accessibilityRole="button" onPress={onRetry}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>}
    </View>
  );
}

export function StudentTag({ icon, children }: { icon: keyof typeof Feather.glyphMap; children: ReactNode }) {
  return <View style={styles.tag}><Feather name={icon} size={12} color={studentPageColors.crimson} /><Text style={styles.tagText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 208, paddingHorizontal: 22, paddingTop: 30, paddingBottom: 64, justifyContent: 'center', overflow: 'hidden', backgroundColor: studentPageColors.crimson },
  title: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6 },
  subtitle: { fontSize: 14, lineHeight: 21, color: '#FFFFFF', marginTop: 6, maxWidth: '78%' },
  footerArt: { position: 'absolute', bottom: 0, width: '100%', height: 210 },
  chatWash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFF7F4' },
  search: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 26, paddingLeft: 15, paddingRight: 6, backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: 1.5, borderColor: '#FFFFFF', shadowColor: '#991B1B', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 0, color: studentPageColors.ink, fontSize: 13 },
  clear: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  notice: { padding: 24, borderRadius: 22, gap: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.96)' },
  noticeTitle: { color: studentPageColors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  noticeMessage: { color: studentPageColors.slate, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 22, backgroundColor: studentPageColors.rose },
  retryText: { color: studentPageColors.crimson, fontWeight: '700', fontSize: 14 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#FFE5E9', borderRadius: 12 },
  tagText: { color: studentPageColors.crimson, fontSize: 11 },
});
