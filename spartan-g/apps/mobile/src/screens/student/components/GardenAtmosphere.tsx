import { useState, useEffect, useRef } from 'react';
import { View, Image, Animated, AccessibilityInfo, AppState, Easing, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path, Ellipse, Circle, G } from 'react-native-svg';

function Frond({ x, y, rotation=0, scale=1 }: { x:number; y:number; rotation?:number; scale?:number }) {
  return <G transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}>
    <Path d="M0 105Q12 51 58 0" fill="none" stroke="#496C26" strokeWidth="3" />
    {[0,1,2,3,4].map(i=><G key={i} transform={`translate(${i*9} ${82-i*17})`}>
      <Path d="M0 0Q-31 -4 -31 -25Q-7 -25 0 0Z" fill={i%2?'#5C9637':'#8BBF48'} stroke="#457C32" strokeWidth="0.7" />
      <Path d="M0 0Q24 7 33 -17Q10 -21 0 0Z" fill={i%2?'#9FCA54':'#4E8F3C'} stroke="#457C32" strokeWidth="0.7" />
    </G>)}
  </G>;
}

export function GardenAtmosphere({ frame=false }: { frame?:boolean }) {
  return <View testID={frame?'garden-showcase-foliage':'garden-atmosphere'} style={StyleSheet.absoluteFillObject} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {!frame && <Image source={require('../../../../assets/garden-forest-scenery-v1.jpg')} resizeMode="cover" style={[StyleSheet.absoluteFillObject,{opacity:0.48}]} />}
    <Svg width="100%" height="100%" viewBox={frame?'0 0 393 300':'0 0 393 850'} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={frame?'gardenFrameLight':'gardenPageLight'} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#123E2C" stopOpacity={frame?0.15:0.98} /><Stop offset={frame?'0.48':'0.32'} stopColor="#F9F5D8" stopOpacity={frame?0:0.94} /><Stop offset="0.77" stopColor="#EBF0CD" stopOpacity={frame?0:0.9} /><Stop offset="1" stopColor="#154B32" stopOpacity={frame?0.22:0.97} />
        </LinearGradient>
        <RadialGradient id={frame?'gardenRayHalo':'gardenHeaderHalo'} cx="72%" cy="13%" rx="63%" ry="65%"><Stop offset="0" stopColor="#FFF3AD" stopOpacity="0.67" /><Stop offset="1" stopColor="#FFF3AD" stopOpacity="0" /></RadialGradient>
      </Defs>
      <Rect width="393" height={frame?300:850} fill={`url(#${frame?'gardenFrameLight':'gardenPageLight'})`} />
      <Rect width="393" height={frame?300:340} fill={`url(#${frame?'gardenRayHalo':'gardenHeaderHalo'})`} />
      <G fill="#FDF1B4" opacity={0.15}><Path d="M286 0L126 270L214 263Z M302 0L235 250L278 239Z" /></G>
      <G fill="#153E28"><Path d="M0 0H393V24Q349 7 304 36Q248 6 194 31Q126 5 68 45Q22 25 0 65Z" /><Path d="M0 0Q8 72 38 104Q13 76 0 132Z M393 0Q380 64 353 83Q383 55 393 118Z" /></G>
      <Path d="M0 19Q90 45 160 5M393 32Q330 56 306 0" fill="none" stroke="#6A4928" strokeWidth={frame?8:6} />
      <Frond x={9} y={-18} rotation={-40} scale={0.78} /><Frond x={374} y={-13} rotation={38} scale={-0.76} />
      <Frond x={3} y={frame?138:392} rotation={-22} scale={0.58} /><Frond x={390} y={frame?180:489} rotation={22} scale={-0.6} />
      <Frond x={-8} y={frame?250:772} rotation={-24} scale={0.9} /><Frond x={390} y={frame?280:824} rotation={10} scale={-0.9} />
      {frame && <G>{[29,355,63,325].map((x,i)=><G key={x} transform={`translate(${x} ${246+i%2*16})`}><Path d="M0 22V0" stroke="#60823D" strokeWidth="2" />{[0,72,144,216,288].map(a=><Ellipse key={a} cx="0" cy="-5" rx="3.5" ry="6" fill={i%2?'#F7D06D':'#F2A3AC'} transform={`rotate(${a})`} />)}<Circle r="3" fill="#EBD05A" /></G>)}</G>}
      {!frame && <G opacity={0.18} fill="#FAF0CF"><Path d="M187 112H324V150H187Z M181 112L256 91L330 112Z M247 79H267V143H247Z M242 79L257 65L272 79Z" /><Circle cx="257" cy="91" r="5" fill="#567949" /></G>}
    </Svg>
  </View>;
}

/** One slow native-driven loop; static until accessibility preference is known. */
export function GardenAmbient() {
  const focused=useIsFocused();
  const [reduced,setReduced]=useState(true);
  const [foreground,setForeground]=useState(AppState.currentState==='active');
  const progress=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    let alive=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value);}).catch(()=>{});
    const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    const state=AppState.addEventListener('change',value=>setForeground(value==='active'));
    return()=>{alive=false;motion.remove();state.remove();};
  },[]);
  useEffect(()=>{
    progress.setValue(0);
    if(!focused||reduced||!foreground)return;
    const loop=Animated.loop(Animated.sequence([
      Animated.timing(progress,{toValue:1,duration:7000,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
      Animated.timing(progress,{toValue:0,duration:7000,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
    ]));
    loop.start();
    return()=>{loop.stop();progress.stopAnimation();progress.setValue(0);};
  },[focused,reduced,foreground,progress]);
  return <Animated.View testID="garden-ambient-leaf" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.drifter,{opacity:progress.interpolate({inputRange:[0,1],outputRange:[0.28,0.55]}),transform:[{translateY:progress.interpolate({inputRange:[0,1],outputRange:[0,22]})},{translateX:progress.interpolate({inputRange:[0,1],outputRange:[0,11]})},{rotate:progress.interpolate({inputRange:[0,1],outputRange:['-18deg','12deg']})}]}]}>
    <Svg width="26" height="39" viewBox="0 0 26 39"><Path d="M4 35Q-6 13 23 2Q29 25 4 35Z" fill="#B7D76A" /><Path d="M3 37L21 5" stroke="#5C873D" fill="none" /></Svg>
  </Animated.View>;
}

const styles=StyleSheet.create({drifter:{position:'absolute',left:'7%',top:'36%',width:26,height:39}});
