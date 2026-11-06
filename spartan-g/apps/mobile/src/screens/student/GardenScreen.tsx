import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore, gardenService, assessmentService } from '@spartan-g/shared-services';
import { StudentGardenDocument, AssessmentAttemptDocument, AssessmentDefinitionDocument, StudentMobileStackParamList } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';
import { GardenAtmosphere, GardenAmbient } from './components/GardenAtmosphere';
import { GardenHeroScene } from './components/GardenHeroScene';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { isGardenBackendEnabled, getGardenOperations } from '@spartan-g/shared-services/src/services/garden-backend';
import { GardenRewardStatus } from '../../garden/GardenRewardStatus';
import { clientGardenRewardsAvailable, gardenUnavailableMessage } from '@spartan-g/shared-services/src/config/garden-capabilities';

export function GardenScreen() {
  const { width: screenWidth, fontScale } = useWindowDimensions();
  const session = useAuthStore((s) => s.session);
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const [garden, setGarden] = useState<(StudentGardenDocument & { id: string }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<(AssessmentAttemptDocument & { id: string }) | null>(null);
  const [assessmentDef, setAssessmentDef] = useState<(AssessmentDefinitionDocument & { id: string }) | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(true);

  const [gardenEmpty, setGardenEmpty] = useState(false);
  const [attemptError, setAttemptError] = useState(false);
  const [dataSession, setDataSession] = useState<typeof session>(null);
  const gardenRequest = useRef(0);
  const attemptRequest = useRef(0);

  const loadGarden = useCallback(async () => {
    const request = ++gardenRequest.current;
    setDataSession(session);
    if (!session || session.role !== 'student') {
      setGarden(null); setGardenEmpty(false); setIsLoading(false); setIsRefreshing(false);
      setError('Sign in with your Student account to open Garden.');
      return;
    }
    const current = () => request === gardenRequest.current && useAuthStore.getState().session === session;
    setIsLoading(true); setError(null); setGarden(null); setGardenEmpty(false);
    try {
      const result = await gardenService.loadGarden(session.uid);
      if (!current()) return;
      if (result.status === 'ready') setGarden(result.garden);
      else if (result.status === 'empty') setGardenEmpty(true);
      else setError(result.message);
    } catch {
      if (current()) setError('Garden could not be loaded. Please try again. Your saved progress has not been changed.');
    } finally {
      if (current()) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [session]);

  // Only confirmed check-ins represent saved progress. Drafts remain in Assessments.
  const loadAttempt = useCallback(async () => {
    const request = ++attemptRequest.current;
    if (!session || session.role !== 'student') { setAttempt(null); setAssessmentDef(null); setAttemptLoading(false); return; }
    const current = () => request === attemptRequest.current && useAuthStore.getState().session === session;
    setAttemptLoading(true); setAttemptError(false); setAttempt(null); setAssessmentDef(null);
    try {
      const submittedAttempts = await assessmentService.getAttemptsByStudent(session.uid);
      const chosen = submittedAttempts[0] ?? null;
      if (chosen) {
        if (chosen.studentId !== session.uid || !['submitted', 'graded'].includes(chosen.status) || !Array.isArray(chosen.answers) || chosen.answers.some(a => !a || typeof a.questionId !== 'string' || typeof a.value !== 'string')) throw Error('Invalid check-in');
        const def = await assessmentService.getAssessmentDefinition(chosen.assessmentId);
        if (!current()) return;
        if (!def || !Array.isArray(def.questions)) throw Error('Invalid definition');
        setAttempt(chosen); setAssessmentDef(def);
      }
    } catch {
      if (current()) setAttemptError(true);
    } finally {
      if (current()) setAttemptLoading(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => {
    loadGarden(); loadAttempt();
    return () => { gardenRequest.current++; attemptRequest.current++; };
  }, [loadGarden, loadAttempt]));

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadGarden();
    loadAttempt();
  }, [loadGarden, loadAttempt]);

  // ─── Daily watering (hero card) ─────────────────────────────
  const [waterToast, setWaterToast] = useState<string | null>(null);
  const waterToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wateringFlight = useRef(false);
  const [wateringBusy, setWateringBusy] = useState(false);
  const [wateringPending, setWateringPending] = useState(false);
  useEffect(() => {
    if (!isGardenBackendEnabled() || !session) return;
    const client = getGardenOperations();
    const show = () => {
      const status = client.getStatus(session.uid);
      setWateringPending(status.wateringPending);
      setWaterToast(status.waterMessage || null);
    };
    show();
    const unsubscribe = client.subscribe(show);
    client.hydrate(session.uid).catch(() => setWaterToast('Saved watering requests could not be read. They were not reset.'));
    return unsubscribe;
  }, [session]);
  useEffect(() => () => { if (waterToastTimer.current) clearTimeout(waterToastTimer.current); }, []);

  const handleWaterPress = useCallback(async () => {
    if (!session) return;
    if (!isGardenBackendEnabled() && !clientGardenRewardsAvailable) {
      setWaterToast(gardenUnavailableMessage);
      return;
    }
    if (isGardenBackendEnabled()) {
      if (wateringFlight.current) return;
      wateringFlight.current = true; setWateringBusy(true);
      try {
        const result = await getGardenOperations().water(session.uid);
        setWaterToast(result.message);
        await loadGarden();
      } finally { wateringFlight.current = false; setWateringBusy(false); }
      return;
    }
    const result = await gardenService.waterGarden(session.uid);
    let message: string;
    if (result === 'rewarded') {
      message = 'Watered! 💧 (+2 XP)';
    } else if (result === 'already') {
      message = 'Already watered today 🌱';
    } else if (result === 'unavailable') {
      message = gardenUnavailableMessage;
    } else {
      message = 'Couldn’t water right now';
    }
    setWaterToast(message);
    if (waterToastTimer.current) clearTimeout(waterToastTimer.current);
    waterToastTimer.current = setTimeout(() => setWaterToast(null), 2000);
    // Refresh XP/level display (watering feeds the existing level system).
    loadGarden();
  }, [session, loadGarden]);

  // ─── Loading state ──────────────────────────────────────
  const loading = isLoading || (!!session && dataSession !== session);
  if (loading || error || !garden) {
    return <View style={styles.container}><GardenAtmosphere /><View style={styles.stateCard}>
      {loading ? <ActivityIndicator color="#356E40" size="large" /> : <Feather name={gardenEmpty ? 'feather' : 'alert-circle'} color="#356E40" size={32} />}
      <Text style={styles.stateTitle}>{loading ? 'Loading your garden...' : gardenEmpty ? 'Your Garden is ready for its first record' : 'Unable to Load Garden'}</Text>
      {!loading && <Text style={styles.stateMessage}>{gardenEmpty ? 'No saved Garden record was found. Your confirmed check-ins remain available in My Forest. No progress or rewards have been added.' : error}</Text>}
      {!loading && <TouchableOpacity testID="garden-retry" accessibilityRole="button" onPress={handleRefresh}><Text style={styles.stateTitle}>Try again</Text></TouchableOpacity>}
      {!loading && <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Forest')}><Text style={styles.stateMessage}>Open My Forest</Text></TouchableOpacity>}
    </View></View>;
  }
  const xpNeededForNextLevel = garden.level * 50;
  const xpProgressPercent = Math.min(Math.round((garden.xp / xpNeededForNextLevel) * 100), 100);
  const totalQuestions = assessmentDef?.questions?.length ?? 0;
  const answeredCount = attempt ? attempt.answers.filter(a => a.value !== undefined && a.value !== '').length : 0;

  return <View style={styles.container}>
    <GardenAtmosphere /><GardenAmbient />
    <ScrollView contentContainerStyle={styles.contentContainer} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#FFFFFF" />}>
      <View style={styles.header}>
        <View style={styles.headerBacking}><Text style={styles.title} accessibilityRole="header">My Garden</Text><Text style={styles.subtitle}>Your growth journey — keep watering!</Text></View>
        {screenWidth >= 360 && fontScale < 1.2 && <View style={styles.inspiration} pointerEvents="none"><Text style={styles.inspirationText}>A Healthier You,{'\n'}A Stronger Spartan</Text></View>}
      </View>
      <TouchableOpacity testID="garden-forest-shortcut" style={styles.forestButton} activeOpacity={0.8} onPress={() => navigation.navigate('Forest')} accessibilityRole="button" accessibilityLabel="Open My Forest">
        <View style={styles.forestIcon}><MaterialCommunityIcons name="tree" size={30} color="#3B8443" /></View>
        <View style={styles.flexCopy}><Text style={styles.forestLabel}>My Forest</Text><Text style={styles.forestHint}>See every check-in you've planted</Text></View><Feather name="chevron-right" size={23} color="#50725A" />
      </TouchableOpacity>
      <View style={styles.treeCard}>
        <View style={styles.sceneFrame}>
          <GardenHeroScene level={garden.level} backgroundSource={require('../../../assets/garden-forest-scenery-v1.jpg')} onWaterPress={handleWaterPress} wateringDisabled={wateringBusy || (!isGardenBackendEnabled() && !clientGardenRewardsAvailable)} />
          <GardenAtmosphere frame />
          <View style={styles.levelSign} pointerEvents="none"><Text style={styles.levelSignText}>Level {garden.level}</Text><Text style={styles.levelSignCaption}>Tree</Text></View>
        </View>
        <View style={styles.heroFooter}>
          <View style={styles.xpTrack} accessibilityRole="progressbar" accessibilityLabel="Garden XP progress toward the existing level threshold" accessibilityValue={{min:0,max:100,now:xpProgressPercent}}><View style={[styles.xpFill,{width:`${xpProgressPercent}%`}]} /></View>
          <Text style={styles.progressCaption}>{garden.xp} / {xpNeededForNextLevel} XP</Text>
          <View style={styles.growthHint}><Feather name="feather" color="#C6E190" size={17} /><Text style={styles.growthText}>Keep checking in to help your tree grow!</Text></View>
        </View>
        {waterToast && !isGardenBackendEnabled() && <View style={styles.waterToast} pointerEvents="none"><Text style={styles.waterToastText}>{waterToast}</Text></View>}
      </View>
      {isGardenBackendEnabled() && <View style={styles.notice} accessibilityLiveRegion="polite">
        {wateringBusy ? <Text>Confirming watering...</Text> : waterToast ? <Text>{waterToast}</Text> : null}
        {wateringPending && !wateringBusy && <TouchableOpacity onPress={handleWaterPress} accessibilityRole="button"><Text style={{color:'#356E40',paddingVertical:12}}>Retry saved watering</Text></TouchableOpacity>}
        <GardenRewardStatus />
      </View>}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard,styles.xpCard]}><View style={[styles.statIcon,{backgroundColor:'#FCE1E0'}]}><Feather name="feather" size={29} color="#BF3C4D" /></View><View style={styles.flexCopy}><Text style={styles.statValue}>{garden.xp}</Text><Text style={styles.statLabel}>XP</Text><Text style={styles.statHint}>Your current points</Text></View></View>
        <View style={[styles.statCard,styles.streakCard]}><View style={[styles.statIcon,{backgroundColor:'#FFF0D4'}]}><MaterialCommunityIcons name="fire" size={31} color="#D77720" /></View><View style={styles.flexCopy}><Text style={[styles.statValue,{color:'#A3441D'}]}>{garden.streakCount}</Text><Text style={styles.statLabel}>Day streak</Text><Text style={styles.statHint}>Consecutive check-in days</Text></View></View>
      </View>
      <View style={styles.levelCard}><View style={styles.forestIcon}><Feather name="git-branch" size={30} color="#41834D" /></View><View style={styles.flexCopy}><Text style={styles.levelTitle}>Level {garden.level}</Text><Text style={styles.statHint}>Keep going! More growth awaits.</Text></View></View>
      {!isGardenBackendEnabled() && !clientGardenRewardsAvailable && <View style={styles.notice} accessibilityLiveRegion="polite"><View style={styles.bulb}><Feather name="sun" size={30} color="#B06A08" /></View><View style={styles.flexCopy}><Text style={styles.noticeTitle}>Your Well-being Matters</Text><GardenRewardStatus /></View></View>}
      <Text style={styles.checkInCaption}>{attemptLoading ? 'Loading confirmed check-ins...' : attemptError ? 'Confirmed check-ins could not be loaded. Pull down to retry.' : attempt ? `Last confirmed check-in: ${attempt.submittedAt?.toDate?.().toLocaleDateString() ?? 'Date unavailable'} ? ${answeredCount} of ${totalQuestions} questions answered` : 'No confirmed check-ins yet'}</Text>
      <View style={styles.comingSoon} pointerEvents="none"><Feather name="droplet" size={19} color="#FFF0CE" /><Text style={styles.comingSoonText}>More features coming soon!</Text><Feather name="feather" size={15} color="#CBE391" /></View>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:'#EAF0D3'},contentContainer:{padding:18,paddingTop:23,gap:14,paddingBottom:128},
  header:{flexDirection:'row',alignItems:'center',gap:9,paddingTop:13,paddingBottom:5},headerBacking:{flex:1,minWidth:0,borderRadius:20,paddingVertical:11,paddingHorizontal:12,backgroundColor:'rgba(13,59,38,0.76)'},
  title:{fontSize:32,fontWeight:'800',color:'#FFFFFF',letterSpacing:-0.5},subtitle:{fontSize:14,lineHeight:21,color:'#F8FFE8',marginTop:5},
  inspiration:{maxWidth:100,backgroundColor:'#775534',borderRadius:8,paddingHorizontal:9,paddingVertical:7,transform:[{rotate:'-3deg'}],borderWidth:1,borderColor:'#AD8957'},inspirationText:{fontSize:10,lineHeight:15,color:'#FFF0D5',fontStyle:'italic',textAlign:'center'},
  forestButton:{flexDirection:'row',gap:11,alignItems:'center',backgroundColor:'rgba(255,255,242,0.96)',borderWidth:1,borderColor:'#FFFFFF',borderRadius:25,padding:13,shadowColor:'#163C23',shadowOpacity:0.12,shadowRadius:9,shadowOffset:{width:0,height:4},elevation:3},
  forestIcon:{width:47,height:49,borderRadius:16,backgroundColor:'#DFF0D7',justifyContent:'center',alignItems:'center'},flexCopy:{flex:1,minWidth:0},forestLabel:{fontSize:18,fontWeight:'700',color:'#143C2D'},forestHint:{fontSize:12,lineHeight:18,color:'#4D6D60',marginTop:3},
  treeCard:{backgroundColor:'#2B4C35',borderWidth:3,borderColor:'#FFFFEF',borderRadius:25,overflow:'hidden',shadowColor:'#193C26',shadowOpacity:0.12,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:3},
  sceneFrame:{position:'relative'},levelSign:{position:'absolute',right:9,bottom:13,paddingHorizontal:13,paddingVertical:8,backgroundColor:'#815A33',borderWidth:1,borderColor:'#BC965B',borderRadius:7,transform:[{rotate:'-5deg'}]},levelSignText:{fontSize:17,fontWeight:'700',color:'#FFF3DA'},levelSignCaption:{color:'#FFF3DA',fontSize:12,textAlign:'center',marginTop:1},
  heroFooter:{paddingHorizontal:18,paddingBottom:13,paddingTop:9,backgroundColor:'#31533B'},xpTrack:{height:13,borderRadius:8,backgroundColor:'#F4EDC8',borderWidth:2,borderColor:'#FFFFE8',overflow:'hidden'},xpFill:{height:'100%',borderRadius:8,backgroundColor:'#83BF4E'},progressCaption:{fontSize:11,color:'#F6F3D8',textAlign:'center',marginTop:4},growthHint:{flexDirection:'row',justifyContent:'center',gap:8,alignItems:'center',marginTop:8},growthText:{fontSize:12,lineHeight:18,color:'#FFFFFF',flexShrink:1},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},statCard:{flex:1,minWidth:145,flexDirection:'row',alignItems:'center',gap:10,borderRadius:23,padding:13,borderWidth:1,borderColor:'#FFFFFF',shadowColor:'#486242',shadowOpacity:0.08,shadowRadius:7,shadowOffset:{width:0,height:3},elevation:2},xpCard:{backgroundColor:'#FFF3F2'},streakCard:{backgroundColor:'#FFF7EB'},statIcon:{width:42,height:46,borderRadius:14,alignItems:'center',justifyContent:'center'},statValue:{fontSize:27,fontWeight:'700',color:'#AF3038'},statLabel:{fontSize:14,fontWeight:'600',color:'#172C30',marginTop:3},statHint:{fontSize:12,lineHeight:18,color:'#5D6E6C',marginTop:3},
  levelCard:{flexDirection:'row',alignItems:'center',gap:12,padding:15,backgroundColor:'#FFFFF7',borderRadius:23,borderWidth:1,borderColor:'#FFFFFF'},levelTitle:{fontSize:19,fontWeight:'700',color:'#19372C'},
  notice:{flexDirection:'row',alignItems:'center',gap:12,padding:16,borderRadius:24,backgroundColor:'#FFF6DF',borderWidth:1,borderColor:'#FFFDF2'},noticeTitle:{fontSize:16,fontWeight:'700',color:'#91421F',marginBottom:6},bulb:{width:44,height:53,alignItems:'center',justifyContent:'center',backgroundColor:'#FFF0CE',borderRadius:16},
  comingSoon:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:9,backgroundColor:'#78562F',borderRadius:9,paddingHorizontal:18,paddingVertical:12,borderWidth:1,borderColor:'#A3814F'},comingSoonText:{fontSize:12,color:'#FFF2D4'},checkInCaption:{fontSize:12,lineHeight:18,color:'#39563D',textAlign:'center',backgroundColor:'rgba(255,255,238,0.88)',borderRadius:14,padding:10},
  waterToast:{position:'absolute',top:12,left:12,right:12,borderRadius:16,padding:12,backgroundColor:'rgba(13,46,30,0.93)'},waterToastText:{color:'#FFFFFF',fontSize:13,textAlign:'center'},
  stateCard:{margin:24,padding:28,backgroundColor:'#FFFCEE',borderRadius:24,gap:14,alignItems:'center',marginTop:85},stateTitle:{fontSize:20,fontWeight:'700',color:'#214D35'},stateMessage:{fontSize:14,lineHeight:21,color:'#52654F',textAlign:'center'},
});
