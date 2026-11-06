import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, facilitatorStudentsService, appointmentService, notificationRepository } from '@spartan-g/shared-services';
import { Feather } from '@expo/vector-icons';
import { FacilitatorHeader, PortalBackground, PortalCard, IconTile, SectionHeading, PortalAction, StudentPageNotice, colors, portalStyles as s } from './FacilitatorPageDesign';
import { useFacilitatorResource } from './useFacilitatorResource';
import { historyActivity, appointmentGroups, todaysAppointments, recordDate } from './facilitator-presentation';

export function FacilitatorDashboardScreen(){
 const nav=useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>(),{width,fontScale}=useWindowDimensions();
 const r=useFacilitatorResource(async actor=>{
   const [roster,appointments]=await Promise.allSettled([facilitatorStudentsService.listStudents(),appointmentService.getAppointments(actor.uid,actor.role)]);
   let alerts:number|null=0;
   if(roster.status==='fulfilled')for(const student of roster.value.students){
     if(useAuthStore.getState().session!==actor)throw Error('Session changed');
     try{const history=await facilitatorStudentsService.getStudentHistory(student.id),activity=historyActivity(history.attempts);if(activity.attention===null)alerts=null;else if(activity.attention && alerts!==null)alerts++;}catch{alerts=null;}
   }else alerts=null;
   if(roster.status==='fulfilled' && roster.value.unavailableCount)alerts=null;
   return {roster:roster.status==='fulfilled'?roster.value:null,appointments:appointments.status==='fulfilled'?appointments.value.filter(a=>a.facilitatorId===actor.uid):null,alerts};
 },'Dashboard information could not be loaded. Check your staff access and connection.');
 const [badge,setBadge]=useState<{owner:unknown;count:number}|null>(null);
 useEffect(()=>{setBadge(null);if(!r.authorized||!r.session)return;const owner=r.session;let alive=true;const unsub=notificationRepository.subscribeByUserId(owner.uid,docs=>{if(alive&&useAuthStore.getState().session===owner)setBadge({owner,count:docs.filter(n=>!n.isRead).length});});return()=>{alive=false;unsub();};},[r.session,r.authorized]);
 const count=badge?.owner===r.session?badge.count:0,groups=r.data?.appointments?appointmentGroups(r.data.appointments):null,today=r.data?.appointments?todaysAppointments(r.data.appointments):null;
 const go=(screen:'AssessmentOverrides'|'Appointments')=>nav.navigate('FacilitatorTabs',{screen});
 const metrics=[{label:'ASSIGNED STUDENTS',value:r.data?.roster?.students.length,icon:'users' as const,tone:'red' as const,caption:'View your assigned students',route:'AssessmentOverrides' as const},{label:'APPOINTMENT REQUESTS',value:groups?.requests.length,icon:'calendar' as const,tone:'indigo' as const,caption:'Pending requests',route:'Appointments' as const},{label:"TODAY'S SCHEDULE",value:today?.length,icon:'clock' as const,tone:'green' as const,caption:'Accepted sessions today',route:'Appointments' as const},{label:'ASSESSMENT ALERTS',value:r.data?.alerts,icon:'alert-triangle' as const,tone:'red' as const,caption:r.data?.alerts==null?'Classification data unavailable':'Students with recorded high/critical classifications',route:'AssessmentOverrides' as const}];
 return <View style={s.screen}><PortalBackground/><ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={r.loading&&!!r.data} onRefresh={()=>void r.reload()} tintColor={colors.red}/>}>
  <FacilitatorHeader title={'Hello, '+(r.session?.displayName?.trim().split(/\s+/)[0]||'Facilitator')} subtitle="" kicker="FACILITATOR DASHBOARD" tagline>
   <TouchableOpacity testID="facilitator-notification-bell" accessibilityRole="button" accessibilityLabel={`Notifications${count?', '+count+' unread':''}`} onPress={()=>nav.navigate('Notifications')} style={{width:44,height:44,borderRadius:22,backgroundColor:'#FFFFFF19',alignItems:'center',justifyContent:'center'}}><Feather name="bell" size={24} color="#F5C76C"/>{count>0&&<View style={{position:'absolute',top:-3,right:-2,backgroundColor:colors.red,borderRadius:12,paddingHorizontal:5}}><Text style={{color:'white',fontSize:11}}>{count>9?'9+':count}</Text></View>}</TouchableOpacity>
  </FacilitatorHeader>
  <View style={s.body}>
   <PortalCard art="book"><View style={s.row}><IconTile icon="award"/><View style={{flex:1,gap:6}}><Text style={{color:colors.crimson,fontWeight:'700',fontSize:11,letterSpacing:1}}>FACILITATOR PORTAL</Text><Text style={s.sectionTitle}>Support. Guide. Empower.</Text><Text style={s.text}>Access your assigned students, manage appointments, and monitor assessment progress — all in one place.</Text></View></View></PortalCard>
   {!r.authorized?<StudentPageNotice title="Sign in with an authorized staff account"/>:r.loading?<StudentPageNotice title="Loading your dashboard..." loading/>:r.error?<StudentPageNotice title="Dashboard unavailable" message={r.error} onRetry={()=>void r.reload()}/>:<>
    {!!r.data?.roster?.unavailableCount&&<Text style={s.small}>Some assignment records are unavailable. Counts show accessible assigned students only.</Text>}
    <View style={s.grid}>{metrics.map(m=><TouchableOpacity key={m.label} testID={'dashboard-'+m.route+'-'+m.icon} accessibilityRole="button" onPress={()=>go(m.route)} style={[s.card,{width:width<350||fontScale>=1.2?'100%':'48%',flexGrow:1,padding:12}]}><View style={[s.row,{alignItems:'flex-start',gap:10}]}><IconTile icon={m.icon} tone={m.tone}/><View style={{flex:1,gap:3}}><Text style={[s.small,{fontWeight:'700',fontSize:11,lineHeight:14}]}>{m.label}</Text><Text style={{fontSize:27,fontWeight:'800',color:m.icon==='alert-triangle'?colors.crimson:colors.ink}}>{m.value??'\u2014'}</Text><Text style={[s.small,{fontSize:11,lineHeight:16}]}>{m.value==null?'Data unavailable':m.caption}</Text></View></View></TouchableOpacity>)}</View>
    <PortalCard><SectionHeading title="Today's Schedule" icon="calendar" onPress={()=>go('Appointments')}/>{today===null?<StudentPageNotice title="Schedule unavailable" message="Appointment access or connection could not be verified." onRetry={()=>void r.reload()}/>:today.length===0?<View style={{padding:15,gap:9,alignItems:'center'}}><IconTile icon="calendar" tone="indigo"/><Text style={s.name}>No Appointments Today</Text><Text style={[s.text,{textAlign:'center'}]}>You have no accepted appointments scheduled for today.</Text></View>:today.map(a=><View key={a.id} style={s.muted}><Text style={s.name}>{recordDate(a.scheduledAt)?.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {a.durationMinutes} minutes</Text><Text style={s.small}>Accepted appointment</Text><PortalAction title="View appointment" onPress={()=>go('Appointments')}/></View>)}</PortalCard>
    <PortalAction title="Refresh dashboard" icon="refresh-cw" onPress={()=>void r.reload()}/>
   </>}
  </View></ScrollView></View>;
}
