import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Image as SvgImage, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
export { SpartanFlag } from './DashboardFlag';

const hidden = { pointerEvents: 'none' as const, accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
const campusLandscape = require('../../../assets/dashboard-journey-campus-v3.png');

/** Bundled decoration only: no remote artwork, user information or network. */
export function DashboardHeaderArt() {
  return <View {...hidden} style={StyleSheet.absoluteFillObject}><Svg width="100%" height="100%" viewBox="0 0 393 225" preserveAspectRatio="xMidYMin slice">
    <Defs><LinearGradient id="dashHeaderRed" x1="0" y1="1" x2="1" y2="0"><Stop stopColor="#FFE7CD" /><Stop offset="0.36" stopColor="#FF907C" /><Stop offset="0.7" stopColor="#EF3448" /><Stop offset="1" stopColor="#920E27" /></LinearGradient><RadialGradient id="dashHeaderLight"><Stop stopColor="#FFF9DA" /><Stop offset="1" stopColor="#FFF9DA" stopOpacity="0" /></RadialGradient></Defs>
    <Path d="M109-25H420V236Q329 219 303 151T241 80Q156 51 109-25Z" fill="#FFE9D7" />
    <Path d="M143-25H420V231Q332 207 309 147T246 77Q171 48 143-25Z" fill="#FFD0B6" />
    <Path d="M175-20H420V215Q326 196 300 132T244 69Q193 44 175-20Z" fill="url(#dashHeaderRed)" />
    <Path d="M208-20Q220 60 275 81T327 150Q348 203 407 205" stroke="#FFF4CE" strokeWidth="2" opacity="0.75" fill="none" />
    <Path d="M264-20Q257 42 314 65T367 125Q382 151 410 151" stroke="#FFBAB0" strokeWidth="1.2" opacity="0.55" fill="none" />
    <Path d="M156-20Q177 50 239 71T301 135Q331 199 407 215" stroke="#FFF6E9" strokeWidth="5" opacity="0.65" fill="none" />
    <Path d="M222-20Q232 39 286 60T346 127Q371 171 407 173" stroke="#FFE0BF" strokeWidth="14" opacity="0.12" fill="none" />
    <Ellipse cx="295" cy="125" rx="83" ry="52" fill="url(#dashHeaderLight)" />
    <Path d="M0 191Q50 202 104 225H0ZM216 225Q286 177 334 196T393 193V225Z" fill="#FFE9D8" opacity="0.65" />
    <G fill="#FFF6CE"><Path d="M327 43l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /><Circle cx="374" cy="100" r="1.8" /><Circle cx="273" cy="21" r="1.3" /></G>
  </Svg></View>;
}

export function StudentAvatarArt() {
  return <Svg width="100%" height="100%" viewBox="0 0 90 90" {...hidden}>
    <Defs><LinearGradient id="dashAvatar" x2="1" y2="1"><Stop stopColor="#FFD2C6" /><Stop offset="1" stopColor="#FFACA4" /></LinearGradient></Defs>
    <Circle cx="45" cy="45" r="45" fill="url(#dashAvatar)" />
    <Path d="M15 92Q16 66 44 66T76 92" fill="#CD2038" /><Path d="M33 67L44 79L56 67" fill="#FA6671" />
    <Path d="M38 57H53V71Q45 78 37 70Z" fill="#F4B391" />
    <Ellipse cx="27" cy="45" rx="5" ry="7" fill="#F8C8A6" /><Ellipse cx="62" cy="45" rx="5" ry="7" fill="#F8C8A6" />
    <Path d="M27 34Q27 17 45 18T63 36L60 55Q56 67 45 67T29 55Z" fill="#FFDBB5" />
    <Path d="M26 45Q16 21 33 17Q35 8 49 14Q63 9 68 24Q72 35 62 46L59 31Q46 35 42 25Q38 36 28 35Z" fill="#35252D" />
    <Path d="M27 27Q34 15 47 19M53 18Q64 18 66 27" fill="none" stroke="#71424A" strokeWidth="3" strokeLinecap="round" />
    <Ellipse cx="36" cy="44" rx="2.2" ry="3" fill="#35252D" /><Ellipse cx="54" cy="44" rx="2.2" ry="3" fill="#35252D" />
    <Path d="M38 55Q45 62 52 55" fill="#FFFFFF" stroke="#D8917E" strokeWidth="1.1" />
  </Svg>;
}

export function JourneyCardColor() {
  return <View {...hidden} style={StyleSheet.absoluteFillObject}><Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 360 350">
    <Defs><LinearGradient id="dashCardRed" x1="0" y1="0" x2="0.8" y2="1"><Stop stopColor="#F24953" /><Stop offset="0.22" stopColor="#B80B2A" /><Stop offset="0.6" stopColor="#FF8F68" /><Stop offset="1" stopColor="#D30D32" /></LinearGradient></Defs>
    <Rect width="360" height="350" fill="url(#dashCardRed)" /><Path d="M225 0Q195 70 278 95T360 134V0Z" fill="#FF9A7D" opacity="0.12" />
  </Svg></View>;
}

export function CrimsonButtonSurface() {
  return <View {...hidden} style={StyleSheet.absoluteFillObject}><Svg width="100%" height="100%" viewBox="0 0 360 56" preserveAspectRatio="none">
    <Defs><LinearGradient id="dashButtonRed" x1="0" y1="0" x2="0.2" y2="1"><Stop stopColor="#EF4658" /><Stop offset="0.45" stopColor="#D00B2D" /><Stop offset="1" stopColor="#AA0025" /></LinearGradient></Defs>
    <Rect width="360" height="56" rx="28" fill="url(#dashButtonRed)" /><Path d="M24 1H336" stroke="#FFB8AB" opacity="0.6" />
  </Svg></View>;
}

export function JourneyLandscape() {
  return <View {...hidden} style={StyleSheet.absoluteFillObject}>
    <Svg width="100%" height="100%" viewBox="0 0 360 328" preserveAspectRatio="xMaxYMid slice">
      <SvgImage testID="dashboard-campus-landscape" href={campusLandscape} x="0" y="0" width="360" height="328" preserveAspectRatio="xMaxYMid slice" />
    </Svg>
  </View>;
}

/** Live milestone path; never baked into the decorative campus image. */
export function JourneyPath() {
  return <Svg {...hidden} width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="none">
    <Path d="M53 151Q115 109 180 141T307 151" fill="none" stroke="#9A4B34" strokeWidth="10" opacity="0.10" />
    <Path d="M53 147Q115 105 180 137T307 147" fill="none" stroke="#FFF9CF" strokeWidth="7" opacity="0.18" />
    <Path d="M53 147Q115 105 180 137T307 147" fill="none" stroke="#FFFEE6" strokeWidth="3.5" strokeDasharray="2 5" strokeLinecap="round" />
  </Svg>;
}

export function CheckpointPlatform({ active }: { active: boolean }) {
  return <Svg {...hidden} width="100%" height="100%" viewBox="0 0 78 40"><Defs><LinearGradient id={active ? 'dashPlatformActive' : 'dashPlatformIdle'} x2="0.8" y2="1"><Stop stopColor={active ? '#FF7D53' : '#FFF8EC'} /><Stop offset="1" stopColor={active ? '#C30B2B' : '#C8B8A9'} /></LinearGradient><RadialGradient id="dashPlatformGlow"><Stop stopColor="#FFF8A2" stopOpacity="0.65" /><Stop offset="1" stopColor="#FFF8A2" stopOpacity="0" /></RadialGradient></Defs>
    {active && <Ellipse cx="39" cy="23" rx="39" ry="17" fill="url(#dashPlatformGlow)" />}
    <Ellipse cx="39" cy="32" rx="36" ry="7" fill="#A44C3F" opacity="0.22" /><Path d="M4 16H74V25C74 40 4 40 4 25Z" fill={`url(#${active ? 'dashPlatformActive' : 'dashPlatformIdle'})`} />
    <Ellipse cx="39" cy="16" rx="35" ry="15" fill={active ? '#F02C38' : '#FFF4E5'} stroke={active ? '#FFE8AA' : '#FFFFFF'} strokeWidth="1.5" />
    {active && <><Ellipse cx="39" cy="16" rx="25" ry="10" fill="#FF6B3F" /><Ellipse cx="39" cy="16" rx="16" ry="6" fill="#FFD780" opacity="0.75" /></>}
  </Svg>;
}

export function CardFoliage({ cool = false }: { cool?: boolean }) {
  return <View {...hidden} style={StyleSheet.absoluteFillObject}><Svg width="100%" height="100%" viewBox="0 0 180 96" preserveAspectRatio="none"><Path d="M118 0Q150 30 180 32V0ZM0 96Q60 70 97 92T180 66V96Z" fill={cool ? '#D1F1E8' : '#FFD4CB'} opacity="0.45" /><G fill={cool ? '#4E8A69' : '#FF8988'} opacity="0.8"><Path d="M155 98Q134 78 141 62Q156 62 159 86Q158 64 171 57Q185 76 167 96Z" /><Path d="M171 96Q167 78 184 74V96Z" /></G></Svg></View>;
}
