import { useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, Switch, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle } from 'react-native-svg';
import { studentPageColors as colors } from '../../components/StudentPageDesign';

export const profileColors = colors;
type Icon = keyof typeof Feather.glyphMap;
export function ProfileHeader({ title, subtitle, back, compact = false, symbol }: { title: string; subtitle?: string; back?: () => void; compact?: boolean; symbol?: 'bell' | 'shield' }) {
  const { width, fontScale } = useWindowDimensions();
  const showSymbol = !!symbol && width >= 350 && fontScale < 1.2;
  return <View testID="profile-campus-header" style={[styles.header, compact && styles.compactHeader]}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFillObject}>
      <Image source={require('../../../assets/bsu cover for app new.png')} resizeMode="cover" style={[StyleSheet.absoluteFillObject, { opacity: 0.65 }]} />
      <Svg width="100%" height="100%" viewBox="0 0 393 220" preserveAspectRatio="none">
        <Defs><LinearGradient id="profileCrimson" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#780C1F" stopOpacity="0.94" /><Stop offset="0.55" stopColor="#B20E2B" stopOpacity="0.50" /><Stop offset="1" stopColor="#EF233C" stopOpacity="0.34" /></LinearGradient></Defs>
        <Rect width="393" height="220" fill="url(#profileCrimson)" />
        <Path d="M230 0Q324 73 393 28V0Z M0 136Q45 144 104 205H142Q68 139 0 116Z" fill="#F88898" opacity={0.17} />
        <Path d="M0 186Q159 250 393 182V220H0Z" fill="#F9DCE2" /><Path d="M0 194Q159 253 393 191V220H0Z" fill="#FFF9FA" />
        <Circle cx="354" cy="39" r="24" fill="#FFFFFF" opacity={0.035} />
      </Svg>
      {symbol && showSymbol && <View style={styles.headerSymbol}><ProfileSymbol symbol={symbol} /></View>}
    </View>
    {back && <Pressable testID="profile-back" onPress={back} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back"><Feather name="arrow-left" size={23} color="#FFFFFF" /></Pressable>}
    <Text accessibilityRole="header" style={[styles.headerTitle, compact && styles.compactTitle]}>{title}</Text>
    {!!subtitle && <Text style={[styles.subtitle, showSymbol && { maxWidth: width - 148 }]}>{subtitle}</Text>}
  </View>;
}
function ProfileSymbol({ symbol }: { symbol: 'bell' | 'shield' }) {
  return <Svg width="78" height="89" viewBox="0 0 84 96"><Defs><LinearGradient id="profileSymbolRose" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFE5E6" /><Stop offset="0.48" stopColor="#ED9DAA" /><Stop offset="1" stopColor="#BC354F" /></LinearGradient></Defs>
    {symbol === 'shield' ? <><Path d="M42 5Q59 17 76 19L73 56Q69 79 42 91Q15 78 11 56L8 19Q26 17 42 5Z" fill="url(#profileSymbolRose)" stroke="#FFE2E5" strokeWidth="1.5" /><Path d="M42 13Q56 22 68 24L66 54Q63 72 42 83Q21 72 18 54L16 24Z" fill="none" stroke="#FAD0D5" strokeWidth="1" opacity={0.7} /><Rect x="28" y="43" width="29" height="24" rx="5" fill="#FFE4E6" /><Path d="M33 43V36Q33 23 43 23Q53 23 53 36V43" fill="none" stroke="#FFE4E6" strokeWidth="4" /><Circle cx="43" cy="53" r="3" fill="#B52D47" /><Path d="M43 54V60" stroke="#B52D47" strokeWidth="2.5" /></> : <><Path d="M18 68Q25 56 24 39Q23 16 42 13Q62 15 61 39Q61 57 70 68Q46 80 18 68Z" fill="url(#profileSymbolRose)" stroke="#FAD6DC" strokeWidth="1.5" /><Path d="M34 77Q42 91 50 77" fill="#F9BEC9" /><Circle cx="42" cy="12" r="5" fill="#F8D6DA" /><Path d="M14 27L7 22M72 26L79 22M7 61L15 59" stroke="#F9C6D0" strokeWidth="4" strokeLinecap="round" /></>}
  </Svg>;
}

export function ProfileAvatar({ name, uri, small = false }: { name: string; uri?: string; small?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const source = uri && /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(uri) && failed !== uri ? uri : null;
  return <View testID="profile-avatar" style={[styles.avatar, small && styles.smallAvatar]}>
    {source ? <Image accessibilityLabel="Your profile photo" source={{ uri: source }} onError={() => setFailed(source)} style={styles.photo} /> : <Text style={[styles.initial, small && { fontSize: 29 }]}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>}
  </View>;
}

export function ProfileRow({ title, subtitle, icon, onPress, children, testID, disabled = false }: { title: string; subtitle?: string; icon: Icon; onPress?: () => void; children?: ReactNode; testID?: string; disabled?: boolean }) {
  const content = <><View style={styles.icon}><Feather name={icon} size={22} color={colors.crimson} /></View><View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text>{!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}</View>{children || (onPress && <Feather name="chevron-right" size={19} color={colors.ink} />)}</>;
  return onPress ? <Pressable testID={testID} style={({ pressed }) => [styles.row, (pressed || disabled) && { opacity: 0.75 }]} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}>{content}</Pressable> : <View testID={testID} style={styles.row}>{content}</View>;
}
export function ProfileToggle({ title, subtitle, icon, value, disabled, onChange, testID }: { title: string; subtitle: string; icon: Icon; value: boolean; disabled: boolean; onChange: (value: boolean) => void; testID: string }) {
  return <ProfileRow title={title} subtitle={subtitle} icon={icon}><Switch testID={testID} accessibilityLabel={title} accessibilityHint={subtitle} accessibilityState={{ checked: value, disabled }} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: '#D5D9E0', true: colors.red }} thumbColor="#FFFFFF" /></ProfileRow>;
}
export function ProfileInfo({ label, value, icon }: { label: string; value?: string | null; icon: Icon }) {
  return <View style={styles.row}><View style={styles.icon}><Feather name={icon} size={22} color={colors.crimson} /></View><View style={styles.copy}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={styles.infoValue}>{value?.trim() || 'Not provided'}</Text></View></View>;
}
export const profileStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF9FA' }, scroll: { flex: 1 }, content: { paddingBottom: 128 },
  body: { paddingHorizontal: 18, gap: 13 }, identity: { alignItems: 'center', marginTop: -56, paddingBottom: 19, paddingHorizontal: 20, gap: 6 },
  name: { fontSize: 23, fontWeight: '700', color: colors.ink, textAlign: 'center', marginTop: 5 }, email: { fontSize: 14, lineHeight: 21, color: colors.slate, textAlign: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 16, borderRadius: 23, backgroundColor: '#FFFFFF', marginTop: -30, marginBottom: 7, shadowColor: '#7A3847', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 2 },
  summaryCopy: { flex: 1, minWidth: 0 }, summaryName: { fontSize: 18, fontWeight: '700', color: colors.ink }, summaryEmail: { color: colors.slate, fontSize: 13, lineHeight: 19, marginTop: 5 },
  section: { color: colors.slate, fontSize: 12, fontWeight: '700', letterSpacing: 0.7, marginTop: 7, marginBottom: 1 },
  notice: { backgroundColor: '#FFF0F3', borderRadius: 17, padding: 14 }, noticeText: { fontSize: 13, lineHeight: 20, color: '#734552' },
  error: { color: '#A51F37', fontSize: 13, lineHeight: 20 }, neutral: { color: colors.slate, fontSize: 13, lineHeight: 20 }, status: { fontSize: 11, color: colors.slate, maxWidth: 83, textAlign: 'right' },
  action: { minHeight: 46, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFF0F3' }, actionText: { fontWeight: '600', color: colors.crimson },
});
const styles = StyleSheet.create({
  header: { minHeight: 220, paddingTop: 27, paddingBottom: 73, paddingHorizontal: 23, backgroundColor: '#991B1B', overflow: 'hidden' }, compactHeader: { minHeight: 135, paddingBottom: 38, paddingTop: 23 },
  headerTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '700', lineHeight: 36, marginTop: 5 }, compactTitle: { fontSize: 24, lineHeight: 31 }, subtitle: { color: '#FFE2E8', fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 270 },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -8, marginBottom: 3, paddingLeft: 8 }, headerSymbol: { position: 'absolute', right: 22, bottom: 8, transform: [{ rotate: '13deg' }], opacity: 0.7 },
  avatar: { width: 116, height: 116, borderRadius: 58, borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: '#DB1837', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', elevation: 4, shadowColor: '#7F1D35', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, smallAvatar: { width: 73, height: 73, borderRadius: 37, borderWidth: 3 }, initial: { fontSize: 48, fontWeight: '600', color: '#FFFFFF' }, photo: { width: '100%', height: '100%', borderRadius: 58 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: '#FFFFFF', borderRadius: 19, shadowColor: '#865063', shadowOpacity: 0.045, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 1 },
  icon: { width: 45, height: 47, borderRadius: 13, backgroundColor: '#FFF0F3', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, copy: { flex: 1, minWidth: 0 }, rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '600', lineHeight: 21 }, rowSubtitle: { color: colors.slate, fontSize: 12, lineHeight: 18, marginTop: 3 }, infoLabel: { fontSize: 12, lineHeight: 18, color: colors.slate }, infoValue: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600', marginTop: 2 },
});
