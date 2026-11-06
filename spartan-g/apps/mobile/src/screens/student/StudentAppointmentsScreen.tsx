import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, appointmentService, userService } from '@spartan-g/shared-services';
import type { AppointmentDocument } from '@spartan-g/shared-types';
import { lightColors, palette, formatDateTime } from '@spartan-g/shared-ui';

import { Feather } from '@expo/vector-icons';
import { StudentPageNotice, studentPageColors as colors } from '../../components/StudentPageDesign';
import { AppointmentsHeader } from '../../components/PortalIllustrations';
import { appointmentDateParts, appointmentTimeLabel } from './portal-presentation';

const STATUS_ORDER = ['requested', 'accepted', 'completed', 'cancelled', 'rejected', 'no_show'];

/* Status filter — same chip pattern as the campus filter on FindFacilitatorScreen */
const STATUS_FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all', label: 'All', statuses: STATUS_ORDER },
  { key: 'pending', label: 'Pending', statuses: ['requested'] },
  { key: 'approved', label: 'Approved', statuses: ['accepted'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'canceled', label: 'Canceled', statuses: ['cancelled', 'rejected'] },
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'requested': return '#92400E';
    case 'accepted': return '#4338CA';
    case 'completed': return '#16A34A';
    case 'cancelled': return '#B91C1C';
    case 'rejected': return '#475569';
    case 'no_show': return '#6D28D9';
    default: return lightColors.textSecondary;
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'requested': return '#FEF3C7';
    case 'accepted': return '#EEF2FF';
    case 'completed': return '#DCFCE7';
    case 'cancelled': return '#FEE2E2';
    case 'rejected': return '#F1F5F9';
    case 'no_show': return '#F3E8FF';
    default: return lightColors.neutralBackground;
  }
}

export function StudentAppointmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);

  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [facilitatorNames, setFacilitatorNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredAppointments = useMemo(() => {
    const filter = STATUS_FILTERS.find(f => f.key === statusFilter);
    if (!filter) return appointments;
    return appointments.filter(apt => filter.statuses.includes(apt.status));
  }, [appointments, statusFilter]);

  const loadAppointments = useCallback(async () => {
    if (!session) return;
    try {
      setLoadError(null);
      const data = await appointmentService.getStudentAppointments(session.uid, session.role);
      data.sort((a, b) => {
        const aIdx = STATUS_ORDER.indexOf(a.status);
        const bIdx = STATUS_ORDER.indexOf(b.status);
        if (aIdx !== bIdx) return aIdx - bIdx;
        const aTime = a.scheduledAt?.toDate?.()?.getTime() || 0;
        const bTime = b.scheduledAt?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });
      setAppointments(data);

      const names: Record<string, string> = {};
      for (const apt of data) {
        if (!names[apt.facilitatorId]) {
          try {
            const userDoc = await userService.getUser(apt.facilitatorId);
            if (userDoc) names[apt.facilitatorId] = userDoc.displayName || 'Unknown Facilitator';
          } catch { /* ignore */ }
        }
      }
      setFacilitatorNames(names);
    } catch (error) {
      console.error('Failed to load appointments:', error);
      setLoadError('Check your connection and appointment access, then try again.');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAppointments();
    setIsRefreshing(false);
  }, [loadAppointments]);

  const handleCancel = useCallback(async (appointmentId: string) => {
    if (!session) return;
    setActionLoading(appointmentId);
    try {
      await appointmentService.cancelAppointment(appointmentId, session.role, session.uid);
      await loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
    } finally {
      setActionLoading(null);
    }
  }, [session, loadAppointments]);

  return <View style={styles.container}>
    <ScrollView contentContainerStyle={styles.contentContainer} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={palette.spartanRed} />}>
      <AppointmentsHeader />
      <View style={styles.body}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {STATUS_FILTERS.map(f=><TouchableOpacity key={f.key} testID={'appointment-filter-'+f.key} style={[styles.chip,statusFilter===f.key&&styles.chipActive]} onPress={()=>setStatusFilter(f.key)} accessibilityRole="button" accessibilityState={{selected:statusFilter===f.key}}><Text style={[styles.chipText,statusFilter===f.key&&styles.chipTextActive]}>{f.label}</Text></TouchableOpacity>)}
        </ScrollView>
        {isLoading?<StudentPageNotice title="Loading appointments..." loading />:loadError?<StudentPageNotice title="Unable to load appointments" message={loadError} onRetry={onRefresh} />:appointments.length===0?<View style={styles.emptyCard}><StudentPageNotice title="No Appointments" message="You haven't booked any appointments yet. Browse facilitators to find someone to talk to." /><TouchableOpacity onPress={()=>navigation.navigate('StudentTabs',{screen:'StudentCourses'})} style={styles.findButton} accessibilityRole="button"><Text style={styles.findButtonText}>Find a Facilitator</Text></TouchableOpacity></View>:filteredAppointments.length===0?<StudentPageNotice title={'No '+STATUS_FILTERS.find(f=>f.key===statusFilter)?.label.toLowerCase()+' appointments.'} />:<View style={styles.appointmentList}>{filteredAppointments.map(apt=>{
          const date=appointmentDateParts(apt.scheduledAt);
          const statusText=apt.status==='no_show'?'No Show':apt.status.charAt(0).toUpperCase()+apt.status.slice(1).replace(/_/g,' ');
          return <View key={apt.id} testID={'appointment-card-'+apt.id} style={[styles.appointmentCard,{borderLeftColor:getStatusColor(apt.status)}]}>
            <View style={styles.cardContent}>
              <View style={[styles.dateTile,{backgroundColor:apt.status==='completed'?'#E7F7EE':'#FFF0F2'}]}><Feather name="calendar" size={19} color={getStatusColor(apt.status)} /><Text style={styles.dateMonth}>{date?.month.toUpperCase()??'DATE'}</Text><Text style={[styles.dateDay,{color:getStatusColor(apt.status)}]}>{date?.day??'—'}</Text><Text style={styles.dateYear}>{date?.year??'Unavailable'}</Text></View>
              <View style={styles.appointmentInfo}>
                <View style={styles.nameRow}><Text style={styles.facilitatorName}>{facilitatorNames[apt.facilitatorId]||'Facilitator'}</Text><View style={[styles.statusBadge,{backgroundColor:getStatusBg(apt.status)}]}><Feather name={apt.status==='requested'||apt.status==='reschedule_requested'?'clock':apt.status==='accepted'||apt.status==='completed'?'check-circle':'x-circle'} size={13} color={getStatusColor(apt.status)} /><Text style={[styles.statusText,{color:getStatusColor(apt.status)}]}>{statusText}</Text></View></View>
                <View style={styles.detailRow}><Feather name="clock" size={16} color={colors.slate} /><Text style={styles.detailText}>{appointmentTimeLabel(apt.scheduledAt,apt.durationMinutes)}</Text></View>
                {!!apt.notes&&<View style={styles.detailRow}><Feather name="file-text" size={16} color={colors.slate} /><Text style={[styles.detailText,{fontStyle:'italic'}]}>Note: {apt.notes}</Text></View>}
                {!!apt.outcomeNotes&&apt.status==='completed'&&<View style={styles.detailRow}><Feather name="file-text" size={16} color={colors.slate} /><Text style={styles.detailText}>Outcome: {apt.outcomeNotes}</Text></View>}
              </View>
            </View>
            <View style={styles.actions}>
              {apt.status==='requested'&&<TouchableOpacity testID={'cancel-'+apt.id} onPress={()=>handleCancel(apt.id)} disabled={actionLoading===apt.id} style={styles.cancelButton} accessibilityRole="button" accessibilityLabel="Cancel requested appointment" accessibilityState={{disabled:actionLoading===apt.id}}><Feather name="trash-2" size={16} color={colors.red} /><Text style={styles.cancelText}>{actionLoading===apt.id?'Canceling...':'Cancel'}</Text></TouchableOpacity>}
              <TouchableOpacity testID={'message-'+apt.id} onPress={()=>navigation.navigate('StudentTabs',{screen:'StudentMessages'})} style={styles.messageButton} accessibilityRole="button"><Feather name="message-circle" size={17} color={colors.ink} /><Text style={styles.messageText}>Message</Text></TouchableOpacity>
            </View>
          </View>;
        })}</View>}
      </View>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:colors.background},contentContainer:{paddingBottom:128,flexGrow:1},body:{paddingHorizontal:16,gap:15},chipRow:{gap:8,paddingTop:3,paddingBottom:8},chip:{minHeight:46,paddingHorizontal:18,paddingVertical:12,borderRadius:25,backgroundColor:'#FFFFFF',justifyContent:'center',borderWidth:1,borderColor:'#F4E5E9',elevation:1,shadowColor:'#A36C7A',shadowOpacity:0.06,shadowRadius:7,shadowOffset:{width:0,height:3}},chipActive:{backgroundColor:colors.red,borderColor:colors.red},chipText:{fontSize:14,fontWeight:'500',color:colors.ink},chipTextActive:{color:'#FFFFFF'},
 appointmentList:{gap:14},appointmentCard:{borderLeftWidth:5,borderRadius:23,padding:14,backgroundColor:'#FFFFFF',shadowColor:'#946173',shadowOpacity:0.045,shadowRadius:9,shadowOffset:{width:0,height:4},elevation:2},cardContent:{flexDirection:'row',alignItems:'flex-start',gap:12},dateTile:{width:51,borderRadius:15,alignItems:'center',paddingVertical:11,paddingHorizontal:3,gap:3},dateMonth:{fontSize:10,fontWeight:'600',color:'#8B4C56'},dateDay:{fontSize:27,fontWeight:'700'},dateYear:{fontSize:10,color:colors.slate,textAlign:'center'},appointmentInfo:{flex:1,minWidth:0},nameRow:{gap:7,alignItems:'flex-start',marginBottom:10},facilitatorName:{fontSize:17,fontWeight:'700',lineHeight:23,color:colors.ink},statusBadge:{borderRadius:7,paddingHorizontal:7,paddingVertical:5,flexDirection:'row',alignItems:'center',gap:4,flexShrink:1},statusText:{fontSize:11,fontWeight:'600',flexShrink:1},detailRow:{flexDirection:'row',alignItems:'flex-start',gap:7,marginTop:6},detailText:{flex:1,minWidth:0,fontSize:13,lineHeight:20,color:colors.slate},actions:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-end',gap:8,marginTop:13},cancelButton:{minHeight:44,flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.red,borderRadius:12,paddingHorizontal:12,paddingVertical:9},cancelText:{fontSize:13,fontWeight:'600',color:colors.red},messageButton:{minHeight:44,flexDirection:'row',gap:6,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.ink,borderRadius:12,paddingHorizontal:12,paddingVertical:9},messageText:{fontSize:13,fontWeight:'600',color:colors.ink},emptyCard:{gap:8},findButton:{alignSelf:'center',minHeight:46,padding:13,borderRadius:23,backgroundColor:colors.red},findButtonText:{fontSize:14,fontWeight:'600',color:'#FFFFFF'},
});
