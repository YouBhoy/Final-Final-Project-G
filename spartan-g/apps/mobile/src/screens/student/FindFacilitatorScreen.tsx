import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, userService, workHoursService, profileRepository } from '@spartan-g/shared-services';
import { ALL_CAMPUSES, CAMPUS_SHORT_LABELS, getCampusLabel, type Campus } from '@spartan-g/shared-types';
import { lightColors, palette, formatWorkHours } from '@spartan-g/shared-ui';

import { StudentPageHeader, StudentSearchField, StudentPageNotice, studentPageColors as colors } from '../../components/StudentPageDesign';
import { CampusFooter } from '../../components/PortalIllustrations';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function FindFacilitatorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const authSession = useAuthStore((st) => st.session);

  const [facilitators, setFacilitators] = useState<{ id: string; displayName: string; email: string; campus?: Campus }[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, { bio?: string; campus?: string }>>({});
  const [workHoursMap, setWorkHoursMap] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [selectedFacilitator, setSelectedFacilitator] = useState<string | null>(null);
  const [campusFilter, setCampusFilter] = useState<Campus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount guard: prevents setState after unmount (replaces old `cancelled` flag pattern)
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const loadFacilitators = useCallback(async () => {
    if (!authSession) { setIsLoading(false); setIsRefreshing(false); return; }

    try {
      setError(null);
      setFacilitators([]);
      setProfilesMap({});
      setWorkHoursMap({});

      const users = await userService.listFacilitatorsByCampus(
        authSession.role,
        campusFilter === 'all' ? undefined : campusFilter,
      );
      if (!isMounted.current) return;

      const mapped = users.map((u: any) => ({
        id: u.id,
        displayName: u.displayName || 'Facilitator',
        email: u.email || '',
        campus: u.campus,
      }));
      setFacilitators(mapped);

      const whMap: Record<string, any[]> = {};
      const pMap: Record<string, { bio?: string; campus?: string }> = {};
      await Promise.allSettled(
        mapped.map(async (fac) => {
          try {
            const schedule = await workHoursService.getActiveSchedule(fac.id, authSession.role);
            whMap[fac.id] = schedule;
          } catch {
            whMap[fac.id] = [];
          }
          try {
            const profile = await profileRepository.getById(fac.id);
            if (profile) pMap[fac.id] = { bio: profile.bio, campus: profile.campus };
          } catch {
            // Profile is optional — facilitator may not have created one yet.
          }
        }),
      );
      if (!isMounted.current) return;
      setWorkHoursMap(whMap);
      setProfilesMap(pMap);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load facilitators.');
    } finally {
      if (isMounted.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [authSession, campusFilter]);

  useEffect(() => {
    loadFacilitators();
  }, [loadFacilitators]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadFacilitators();
    setIsRefreshing(false);
  }, [loadFacilitators]);

  const visibleFacilitators=facilitators.filter(fac=>{
    const campus=fac.campus ?? profilesMap[fac.id]?.campus as Campus | undefined;
    return (fac.displayName+' '+fac.email+' '+(campus?getCampusLabel(campus):'')).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });
  return <View style={styles.container}>
    <CampusFooter />
    <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={palette.spartanRed} />}>
      <StudentPageHeader title="Find a Facilitator" subtitle="Connect with guidance facilitators across campuses." />
      <View style={styles.body}>
        <View style={styles.searchRow}>
          <StudentSearchField value={search} onChangeText={setSearch} placeholder="Search facilitator or campus..." label="Search facilitators or campus" />
          <Pressable testID="facilitator-filter-toggle" style={styles.filterToggle} accessibilityRole="button" accessibilityLabel="Show or hide campus filters" accessibilityState={{expanded:filtersVisible}} onPress={()=>setFiltersVisible(value=>!value)}><Feather name="sliders" size={21} color={colors.crimson} /></Pressable>
        </View>
        {filtersVisible && <View style={styles.chipRow}>
          <Pressable testID="campus-all" style={[styles.chip,campusFilter==='all'&&styles.chipActive]} onPress={()=>setCampusFilter('all')} accessibilityRole="button" accessibilityState={{selected:campusFilter==='all'}}><Text style={[styles.chipText,campusFilter==='all'&&styles.chipTextActive]}>All campuses</Text></Pressable>
          {ALL_CAMPUSES.map(c=><Pressable key={c} testID={'campus-'+c} style={[styles.chip,campusFilter===c&&styles.chipActive]} onPress={()=>setCampusFilter(c)} accessibilityRole="button" accessibilityState={{selected:campusFilter===c}}><Text style={[styles.chipText,campusFilter===c&&styles.chipTextActive]}>{CAMPUS_SHORT_LABELS[c]}</Text></Pressable>)}
        </View>}
        {isLoading&&!isRefreshing ? <StudentPageNotice title="Loading facilitators..." loading /> : error ? <StudentPageNotice title="Unable to load facilitators" message={error} onRetry={onRefresh} /> : visibleFacilitators.length===0 ? <StudentPageNotice title={search.trim()?'No matching facilitators':'No facilitators found'} message="Try another search or campus filter." /> : <View style={styles.facilitatorList}>{visibleFacilitators.map((fac,index)=>{
          const schedule=workHoursMap[fac.id]||[];
          const activeDays=schedule.filter((s:any)=>s.isActive).map((s:any)=>DAYS[s.dayOfWeek]??'Unknown');
          const campus=fac.campus ?? profilesMap[fac.id]?.campus as Campus | undefined;
          const isExpanded=selectedFacilitator===fac.id;
          const accent=index%2===0?'#ED536C':'#9484F5';
          return <TouchableOpacity key={fac.id} testID={'facilitator-card-'+fac.id} style={[styles.facilitatorCard,{borderLeftColor:accent}]} activeOpacity={0.85} onPress={()=>setSelectedFacilitator(prev=>prev===fac.id?null:fac.id)} accessibilityRole="button" accessibilityLabel={'View facilitator details: '+fac.displayName} accessibilityState={{expanded:isExpanded}}>
            <View style={styles.facilitatorHeader}>
              <View style={[styles.avatar,{backgroundColor:index%2===0?'#FFE0E5':'#EAE6FF'}]}><Text style={[styles.avatarText,{color:index%2===0?'#D22037':'#6550CC'}]}>{(fac.displayName||'F').charAt(0).toUpperCase()}</Text></View>
              <View style={styles.facilitatorInfo}><Text style={styles.facilitatorName}>{fac.displayName}</Text>
                {!!fac.email&&<View style={styles.infoRow}><Feather name="mail" size={16} color={colors.slate} /><Text style={styles.infoText}>{fac.email}</Text></View>}
                {!!campus&&<View style={styles.infoRow}><Feather name="map-pin" size={16} color={colors.slate} /><Text style={styles.infoText}>{getCampusLabel(campus)}</Text></View>}
              </View>
            </View>
            <View style={styles.cardFooter}><View style={styles.roleBadge}><Feather name="user" size={14} color={colors.crimson} /><Text style={styles.roleText}>Guidance facilitator</Text></View>
              {activeDays.length>0&&<View style={styles.hoursBadge}><Feather name="clock" size={14} color={colors.slate} /><Text style={styles.hoursText}>Office hours listed</Text></View>}
              <View style={styles.detailHint}><Text style={styles.detailHintText}>{isExpanded?'Hide details':'View details'}</Text><Feather name={isExpanded?'chevron-up':'chevron-right'} size={16} color={colors.red} /></View>
            </View>
            {isExpanded&&<View style={styles.expandedSection}>
              <Text style={styles.sectionLabel}>About</Text><Text style={styles.facilitatorBio}>{profilesMap[fac.id]?.bio||'No bio yet.'}</Text>
              <Text style={styles.sectionLabel}>Office hours</Text>
              {activeDays.length===0?<Text style={styles.facilitatorBio}>No availability set</Text>:<View style={styles.scheduleList}>{schedule.filter((s:any)=>s.isActive).map((s:any)=><View key={s.id} style={styles.scheduleRow}><Text style={styles.scheduleDay}>{DAYS[s.dayOfWeek]??'Unknown'}</Text><Text style={styles.scheduleTime}>{formatWorkHours(s.startTime,s.endTime)}</Text></View>)}</View>}
              <TouchableOpacity testID={'book-'+fac.id} onPress={()=>navigation.navigate('BookAppointment',{facilitatorId:fac.id})} style={styles.bookButton} accessibilityRole="button"><Feather name="calendar" size={17} color="#FFFFFF" /><Text style={styles.bookButtonText}>Book Appointment</Text></TouchableOpacity>
            </View>}
          </TouchableOpacity>;
        })}</View>}
      </View>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:colors.background},contentContainer:{flexGrow:1,paddingBottom:128},body:{paddingHorizontal:17,marginTop:-23,gap:16},searchRow:{flexDirection:'row',alignItems:'center',gap:9},filterToggle:{width:48,minHeight:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:'#FFFFFF',elevation:2},
 chipRow:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:44,paddingHorizontal:12,paddingVertical:10,borderRadius:24,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#EDE7EC',justifyContent:'center',shadowColor:'#A85768',shadowOpacity:0.05,shadowOffset:{width:0,height:3},shadowRadius:7,elevation:1},chipActive:{backgroundColor:colors.red,borderColor:colors.red},chipText:{fontSize:12,color:colors.ink,fontWeight:'500'},chipTextActive:{color:'#FFFFFF'},
 facilitatorList:{gap:14},facilitatorCard:{borderRadius:23,borderLeftWidth:5,backgroundColor:'rgba(255,255,255,0.97)',padding:15,shadowColor:'#A56575',shadowOpacity:0.06,shadowOffset:{width:0,height:4},shadowRadius:10,elevation:2},facilitatorHeader:{flexDirection:'row',alignItems:'flex-start',gap:12},avatar:{width:57,height:62,borderRadius:30,borderWidth:4,borderColor:'#FFF2F5',alignItems:'center',justifyContent:'center'},avatarText:{fontSize:29,fontWeight:'700'},facilitatorInfo:{flex:1,minWidth:0},facilitatorName:{fontSize:17,fontWeight:'700',lineHeight:23,color:colors.ink,marginBottom:6},infoRow:{flexDirection:'row',gap:7,alignItems:'flex-start',marginTop:4},infoText:{flex:1,minWidth:0,color:colors.slate,fontSize:13,lineHeight:19},
 cardFooter:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center',marginTop:16},roleBadge:{flexDirection:'row',gap:5,alignItems:'center',paddingHorizontal:9,paddingVertical:6,borderRadius:16,backgroundColor:'#FFF0F3'},roleText:{fontSize:11,color:colors.crimson},hoursBadge:{flexDirection:'row',gap:5,alignItems:'center'},hoursText:{fontSize:11,color:colors.slate},detailHint:{minHeight:36,flexDirection:'row',alignItems:'center',gap:5,borderRadius:20,borderWidth:1,borderColor:colors.red,paddingHorizontal:11,paddingVertical:7,marginLeft:'auto'},detailHintText:{fontSize:12,fontWeight:'600',color:colors.red},
 expandedSection:{borderTopWidth:1,borderTopColor:'#F6E8EC',marginTop:16,paddingTop:12,gap:8},sectionLabel:{fontSize:13,fontWeight:'700',color:colors.ink,marginTop:4},facilitatorBio:{fontSize:13,lineHeight:20,color:colors.slate},scheduleList:{gap:7},scheduleRow:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:6},scheduleDay:{fontSize:13,color:colors.ink},scheduleTime:{fontSize:13,color:colors.slate},bookButton:{minHeight:46,padding:12,borderRadius:22,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:8,backgroundColor:colors.red,marginTop:8},bookButtonText:{fontSize:14,fontWeight:'700',color:'#FFFFFF'},
});
