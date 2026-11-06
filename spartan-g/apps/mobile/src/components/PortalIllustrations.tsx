import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from 'react-native-svg';
import { studentPageColors as colors } from './StudentPageDesign';

export function CampusFooter() {
  return <View testID="campus-footer" style={styles.footer} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 393 230" preserveAspectRatio="none">
      <Defs><LinearGradient id="campusFooterRose" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFBFC9" /><Stop offset="1" stopColor="#EE536B" /></LinearGradient></Defs>
      <Path d="M0 64Q76 26 145 80T278 71T393 49V230H0Z" fill="#FFE0E5" />
      <G fill="#F5B1BE" opacity={0.65}>
        <Path d="M75 144H309V195H75Z M67 145L193 112L317 145Z M177 95H209V187H177Z M171 95L193 77L215 95Z M190 62H196V78H190Z" />
        <Circle cx="193" cy="111" r="7" fill="#FFF0F2" />
        {[88,112,136,158,222,246,270,293].map(x=><Rect key={x} x={x} y="153" width="8" height="30" fill="#FFF0F2" />)}
        <Path d="M34 187V148M13 160Q1 143 18 131Q15 109 34 111Q49 101 60 122Q75 145 52 162Z M352 186V145M332 159Q318 143 337 127Q337 108 354 111Q370 103 379 129Q393 148 370 162Z" />
      </G>
      <Path d="M0 154C73 111 119 214 202 183S314 148 393 111V230H0Z" fill="url(#campusFooterRose)" opacity={0.82} />
      <Path d="M0 183C84 142 132 231 241 201S334 194 393 155V230H0Z" fill="#F58A9C" opacity={0.6} />
      <Path d="M0 155C73 111 119 214 202 183S314 148 393 111" fill="none" stroke="#FFFFFF" opacity={0.8} strokeWidth="1.5" />
    </Svg>
  </View>;
}

export function AppointmentsHeader() {
  const { width, fontScale } = useWindowDimensions();
  const showCalendar = width >= 350 && fontScale < 1.2;
  return <View style={styles.header} testID="appointments-art-header">
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 393 190" preserveAspectRatio="none">
        <Defs><LinearGradient id="appointmentBlush" x1="0" y1="1" x2="1" y2="0"><Stop offset="0" stopColor="#FFF9F6" /><Stop offset="1" stopColor="#FFC7D0" /></LinearGradient><LinearGradient id="calendarRed" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FF6275" /><Stop offset="1" stopColor="#DC1735" /></LinearGradient></Defs>
        <Rect width="393" height="190" fill="url(#appointmentBlush)" />
        <Path d="M145 0Q237 50 285 64T393 158V0Z" fill="#F8B1BD" opacity={0.23} />
        <Circle cx="350" cy="66" r="55" fill="#FF9EAC" opacity={0.24} /><Circle cx="298" cy="36" r="19" fill="#FF8197" opacity={0.18} />
        {showCalendar && <G testID="appointment-calendar-art" transform="translate(290 34) rotate(12 40 40)" opacity={0.86}>
          <Rect x="0" y="5" width="74" height="78" rx="13" fill="#FFFFFF" /><Path d="M0 20Q0 5 13 5H61Q74 5 74 20V30H0Z" fill="url(#calendarRed)" />
          <Path d="M18 0V15M55 0V15" stroke="#C31235" strokeWidth="7" strokeLinecap="round" />
          {[12,31,50].flatMap(x=>[39,56].map(y=><Rect key={`${x}-${y}`} x={x} y={y} width="12" height="12" rx="3" fill="#FFD3DA" />))}
          <Circle cx="69" cy="75" r="23" fill="#FFFFFF" stroke="#DC263D" strokeWidth="5" /><Path d="M69 61V75L77 82" fill="none" stroke="#DC263D" strokeWidth="4" strokeLinecap="round" />
        </G>}
      </Svg>
    </View>
    <Text accessibilityRole="header" style={styles.title}>My Appointments</Text>
    <Text style={styles.subtitle}>Manage your appointments with facilitators.</Text>
  </View>;
}

const styles=StyleSheet.create({
  footer:{position:'absolute',bottom:0,left:0,right:0,height:230},
  header:{minHeight:184,paddingHorizontal:20,paddingTop:28,paddingBottom:28,justifyContent:'center',backgroundColor:colors.background,overflow:'hidden'},
  title:{fontSize:29,fontWeight:'800',letterSpacing:-0.6,color:colors.ink},
  subtitle:{fontSize:15,lineHeight:22,color:'#52617A',marginTop:8,maxWidth:'68%'},
});
