import { useRef, useState } from 'react';
import { View, Text, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useAuthStore, appointmentService, userService, pushNotificationService } from '@spartan-g/shared-services';
import type { AppointmentDocument } from '@spartan-g/shared-types';
import { useFacilitatorResource } from './useFacilitatorResource';
import { appointmentGroups, recordDate } from './facilitator-presentation';
import { PortalPage, PortalCard, PortalAction, IconTile, SectionHeading, FilterPills, StudentPageNotice, portalStyles as s, colors } from './FacilitatorPageDesign';
type Appointment=AppointmentDocument&{id:string};
const labels:Record<string,string>={requested:'Requested',accepted:'Accepted',completed:'Completed',cancelled:'Cancelled',rejected:'Rejected',no_show:'No Show',reschedule_requested:'Reschedule requested'};
export function AppointmentsScreen(){
 const r=useFacilitatorResource(async actor=>{
  const rows=(await appointmentService.getAppointments(actor.uid,actor.role)).filter(a=>a.facilitatorId===actor.uid),names:Record<string,string>={};
  for(const a of rows){if(useAuthStore.getState().session!==actor)throw Error('Session changed');if(!names[a.studentId])try{const user=await userService.getUser(a.studentId);if(user)names[a.studentId]=user.displayName||'Student';}catch{/* Existing authorized appointment remains visible without a profile lookup. */}}
  return {rows,names};
 },'Appointments could not be loaded. Check your staff permissions and connection.');
 const [filter,setFilter]=useState('All'),[busy,setBusy]=useState(false),[actionError,setActionError]=useState<string|null>(null),locked=useRef(false);
 const [selected,setSelected]=useState<Appointment|null>(null),[selectedOwner,setSelectedOwner]=useState(r.session),[modal,setModal]=useState<'complete'|'notes'|null>(null),[outcomeNotes,setOutcomeNotes]=useState('');
 const open=(a:Appointment,kind:'complete'|'notes')=>{if(!r.isCurrent()||locked.current)return;setSelected(a);setSelectedOwner(r.session);setOutcomeNotes('');setModal(kind);};
 const handleAction=async(action:'accept'|'complete'|'no-show'|'cancel',a:Appointment)=>{
  if(!r.isCurrent()||!r.session||!r.data||locked.current||a.facilitatorId!==r.session.uid||!r.data.rows.some(x=>x.id===a.id))return;
  if(action==='accept'?a.status!=='requested':a.status!=='accepted')return;
  if(action==='complete'&&!outcomeNotes.trim())return;
  const actor=r.session;locked.current=true;setBusy(true);setActionError(null);
  try{
   if(action==='accept')await appointmentService.acceptAppointment(a.id,actor.uid,actor.role);
   else if(action==='complete')await appointmentService.completeAppointment(a.id,actor.uid,outcomeNotes,actor.role);
   else if(action==='no-show')await appointmentService.markNoShow(a.id,actor.uid,actor.role);
   else await appointmentService.cancelAppointment(a.id,actor.role,actor.uid);
   if(useAuthStore.getState().session!==actor)return;
   setModal(null);setSelected(null);setOutcomeNotes('');
   // Preserve the established best-effort push operation after the existing service succeeds.
   const studentName=r.data.names[a.studentId]??'Student';
   const title=action==='accept'?'Appointment Accepted':action==='complete'?'Appointment Completed':action==='no-show'?'Appointment Update':'Appointment Cancelled';
   const body=action==='accept'?'Your appointment with '+studentName+' has been accepted.':action==='complete'?'Your appointment with '+studentName+' has been completed.':action==='no-show'?'You were marked as no-show for your appointment with '+studentName+'.':'Your appointment with '+studentName+' has been cancelled.';
   pushNotificationService.sendPushToRecipient(a.studentId,title,body,{url:'spartan-g://student/home'}).catch(()=>{});
   await r.reload();
  }catch{if(useAuthStore.getState().session===actor)setActionError('The appointment action could not be fully confirmed. It may already have saved. Reload before retrying; check your connection and permissions.');}
  finally{locked.current=false;setBusy(false);}
 };
 const confirm=(action:'no-show'|'cancel',a:Appointment)=>Alert.alert(action==='cancel'?'Cancel appointment?':'Mark as no-show?','Confirm this appointment status change.',[{text:'No',style:'cancel'},{text:'Confirm',style:'destructive',onPress:()=>void handleAction(action,a)}]);
 const groups=r.data?appointmentGroups(r.data.rows):null;
 const card=(a:Appointment)=>{const d=recordDate(a.scheduledAt),end=d?new Date(d.getTime()+a.durationMinutes*60000):null;return <PortalCard key={a.id}><View style={[s.row,{alignItems:'flex-start'}]}><View style={{width:55,borderRadius:15,backgroundColor:'#FFF0F2',padding:8,alignItems:'center',gap:2}}><Text style={{color:colors.crimson,fontSize:12}}>{d?.toLocaleDateString('en-US',{month:'short'}).toUpperCase()||'—'}</Text><Text style={{color:colors.crimson,fontWeight:'800',fontSize:26}}>{d?.getDate()??'—'}</Text><Text style={s.small}>{d?.getFullYear()??''}</Text></View><View style={{flex:1,gap:8}}><Text style={s.name}>{r.data?.names[a.studentId]||'Student'}</Text><Text style={{color:a.status==='accepted'?'#4936CB':a.status==='completed'?'#00833F':colors.crimson,fontWeight:'600',fontSize:13}}>{labels[a.status]||'Status unavailable'}</Text><Text style={s.small}>{d&&end?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' – '+end.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Date unavailable'} ({a.durationMinutes} minutes)</Text></View></View>
  {!!a.notes&&<Text style={s.text}>Note: {a.notes}</Text>}{!!a.outcomeNotes&&<Text style={s.text}>Outcome: {a.outcomeNotes}</Text>}
  <View style={[s.row,{flexWrap:'wrap'}]}>{a.status==='requested'&&<><PortalAction testID={'appointment-accept-'+a.id} title="Accept" disabled={busy} filled onPress={()=>void handleAction('accept',a)}/><PortalAction title="Reject unavailable" disabled onPress={()=>{}}/></>}{a.status==='accepted'&&<><PortalAction testID={'appointment-complete-'+a.id} title="Complete" disabled={busy} filled onPress={()=>open(a,'complete')}/><PortalAction testID={'appointment-noshow-'+a.id} title="No Show" disabled={busy} onPress={()=>confirm('no-show',a)}/><PortalAction testID={'appointment-cancel-'+a.id} title="Cancel" disabled={busy} onPress={()=>confirm('cancel',a)}/></>}<PortalAction testID={'appointment-notes-'+a.id} title="Notes" icon="file-text" disabled={busy} onPress={()=>open(a,'notes')}/></View>
 </PortalCard>;};
 const section=(title:string,items:Appointment[],icon:'users'|'calendar'|'clock')=><PortalCard art={!items.length?'inbox':undefined}><SectionHeading title={title+' ('+items.length+')'} icon={icon}/>{items.length?items.map(card):<Text style={s.text}>{icon==='users'?'No pending appointment requests.':icon==='calendar'?'No upcoming appointments.':'No appointment history.'}</Text>}</PortalCard>;
 return <PortalPage title="Appointments" subtitle="Manage requests, upcoming sessions, and history.">
  {!r.authorized?<StudentPageNotice title="Sign in with an authorized staff account"/>:r.loading?<StudentPageNotice title="Loading appointments..." loading/>:r.error?<StudentPageNotice title="Appointments unavailable" message={r.error} onRetry={()=>void r.reload()}/>:groups&&<>
   <View style={s.grid}>{[{name:'Upcoming',count:groups.upcoming.length,icon:'calendar' as const},{name:'Requests',count:groups.requests.length,icon:'clock' as const},{name:'Completed',count:groups.completed.length,icon:'file-text' as const}].map(x=><View key={x.name} style={[s.card,{flex:1,minWidth:94,padding:10}]}><IconTile icon={x.icon} small/><Text style={s.name}>{x.count}</Text><Text style={s.small}>{x.name}</Text></View>)}</View>
   <FilterPills values={['All','Requests','Upcoming','History']} value={filter} onChange={setFilter}/>
   <Text style={s.small}>Reject is unavailable in this build. Past accepted sessions remain in History.</Text>
   {!!actionError&&<Text style={s.error} accessibilityLiveRegion="polite">{actionError}</Text>}
   {(filter==='All'||filter==='Requests')&&section('Appointment Requests',groups.requests,'users')}
   {(filter==='All'||filter==='Upcoming')&&section('Upcoming',groups.upcoming,'calendar')}
   {(filter==='All'||filter==='History')&&section('History',groups.history,'clock')}
   <PortalAction title="Reload appointments" disabled={busy} icon="refresh-cw" onPress={()=>void r.reload()}/>
  </>}
  <Modal visible={!!modal&&selectedOwner===r.session&&r.authorized} transparent animationType="fade" onRequestClose={()=>{if(!locked.current)setModal(null);}}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,justifyContent:'center',padding:20,backgroundColor:'#20131C77'}}><View style={[s.card,{maxHeight:'85%'}]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:14}}><Text style={s.sectionTitle}>{modal==='complete'?'Complete Appointment':'Recorded Facilitator Notes'}</Text>{modal==='complete'?<TextInput testID="appointment-outcome" accessibilityLabel="Outcome notes" multiline value={outcomeNotes} onChangeText={setOutcomeNotes} placeholder="Enter outcome notes..." style={{minHeight:110,borderWidth:1,borderColor:'#E0D6DD',borderRadius:12,padding:13,color:colors.ink,textAlignVertical:'top'}}/>:<><Text style={s.text}>{selected?.facilitatorNotes||'No saved facilitator notes.'}</Text><Text style={s.small}>Read-only. Changes to facilitator notes cannot be saved in this build.</Text></>}{!!actionError&&<Text style={s.error}>{actionError}</Text>}<View style={[s.row,{flexWrap:'wrap'}]}><PortalAction title={modal==='complete'?'Cancel':'Close'} disabled={busy} onPress={()=>setModal(null)}/>{modal==='complete'&&<PortalAction testID="appointment-confirm-complete" title={busy?'Completing...':'Complete'} disabled={busy||!outcomeNotes.trim()} filled onPress={()=>{if(selected)void handleAction('complete',selected);}}/>}</View></ScrollView></View></KeyboardAvoidingView></Modal>
 </PortalPage>;
}
