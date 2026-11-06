import { useRef, useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { useAuthStore, workHoursService } from '@spartan-g/shared-services';
import { formatWeekRange, startOfWeek, weekKey } from '@spartan-g/shared-types';
import { formatWorkHours } from '@spartan-g/shared-ui';
import { TimePickerDropdown } from '../../components/TimePickerDropdown';
import { useFacilitatorResource } from './useFacilitatorResource';
import { hoursSummary } from './facilitator-presentation';
import { PortalPage, PortalCard, PortalAction, IconTile, StudentPageNotice, portalStyles as s, colors } from './FacilitatorPageDesign';
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export function WorkHoursScreen(){
 const r=useFacilitatorResource(async actor=>{const week=startOfWeek(new Date());const rows=await workHoursService.getSchedule(actor.uid,actor.role,week);if(rows.some(x=>x.facilitatorId!==actor.uid))throw Error('Ownership mismatch');return {week,rows};},'Work hours could not be loaded. Check your staff permissions and connection.');
 const [editingDay,setEditingDay]=useState<number|null>(null),[startTime,setStartTime]=useState('09:00'),[endTime,setEndTime]=useState('17:00');
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),locked=useRef(false);
 const canWrite=()=>r.isCurrent()&&!!r.data&&weekKey(r.data.week)===weekKey(new Date());
 const edit=(day:number)=>{if(!canWrite()||locked.current)return;const old=r.data!.rows.find(x=>x.dayOfWeek===day);setEditingDay(day);setStartTime(old?.startTime||'09:00');setEndTime(old?.endTime||'17:00');setError(null);};
 const mutate=async(day:number,toggle:boolean)=>{
  if(!canWrite()||!r.session||!r.data||locked.current)return;
  const actor=r.session,week=r.data.week,existing=r.data.rows.find(x=>x.dayOfWeek===day);
  if(toggle&&!existing){edit(day);return;}
  if(!toggle&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||startTime>=endTime)){setError('End time must be after start time.');return;}
  locked.current=true;setBusy(true);setError(null);
  try{
   if(toggle&&existing)await workHoursService.toggleSchedule(existing.id,!existing.isActive,actor.role);
   else if(existing)await workHoursService.updateScheduleEntry(existing.id,{startTime,endTime,isActive:true},actor.role);
   else await workHoursService.createScheduleEntry({facilitatorId:actor.uid,dayOfWeek:day,startTime,endTime,weekStartDate:week},actor.role);
   if(useAuthStore.getState().session!==actor)return;
   setEditingDay(null);await r.reload();
  }catch{if(useAuthStore.getState().session===actor)setError('The schedule change could not be confirmed. Reload before retrying; no unsaved availability is displayed.');}
  finally{locked.current=false;setBusy(false);}
 };
 const stats=r.data?hoursSummary(r.data.rows):null;
 return <PortalPage title="Work Hours" subtitle="Set your weekly availability for student bookings.">
  {!r.authorized?<StudentPageNotice title="Sign in with an authorized staff account"/>:r.loading?<StudentPageNotice title="Loading work hours..." loading/>:r.error?<StudentPageNotice title="Work hours unavailable" message={r.error} onRetry={()=>void r.reload()}/>:<>
   <PortalCard art="calendar"><View style={s.row}><IconTile icon="calendar"/><View style={{flex:1}}><Text style={[s.small,{color:colors.crimson,fontWeight:'700'}]}>CURRENT WEEK ONLY</Text><Text style={s.sectionTitle}>{r.data?formatWeekRange(r.data.week):'Week unavailable'}</Text></View></View><View style={s.grid}><View style={[s.row,{flex:1,minWidth:125}]}><IconTile icon="users" tone="green"/><View><Text style={s.small}>ACTIVE DAYS</Text><Text style={s.name}>{stats?.activeDays??'—'}</Text></View></View><View style={[s.row,{flex:1,minWidth:125}]}><IconTile icon="clock" tone="indigo"/><View><Text style={s.small}>TOTAL HOURS</Text><Text style={s.name}>{stats?.hours==null?'Unavailable':stats.hours+' hrs'}</Text></View></View></View></PortalCard>
   <Text style={s.small}>Hours apply only to the displayed Monday–Sunday week. They do not repeat into another week. Your saved availability appears after confirmation.</Text>
   {r.data && !canWrite() && <Text style={s.error}>The week has changed. Reload work hours before editing.</Text>}
   {!!error&&<Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
   {DAYS.map((name,day)=>{const item=r.data?.rows.find(x=>x.dayOfWeek===day),active=item?.isActive===true;return <PortalCard key={day}><View style={[s.row,{flexWrap:'wrap'}]}><Switch testID={'hours-toggle-'+day} accessibilityLabel={name+' availability'} disabled={busy||!canWrite()} value={active} onValueChange={()=>void mutate(day,true)} trackColor={{true:colors.red,false:'#DCE1E8'}} thumbColor="#FFFFFF"/><View style={{flex:1,minWidth:95}}><Text style={s.name}>{name}</Text><Text style={[s.small,!active&&{fontStyle:'italic'}]}>{active&&item?formatWorkHours(item.startTime,item.endTime):'Inactive'}</Text></View><PortalAction testID={'hours-edit-'+day} title={item?'Edit Hours':'Set Hours'} disabled={busy||!canWrite()} onPress={()=>edit(day)} icon="chevron-right"/></View>
    {editingDay===day&&<View style={{gap:10}}><View style={[s.row,{flexWrap:'wrap'}]}><TimePickerDropdown title="Start Time" value={startTime} onChange={setStartTime}/><Text style={s.text}>to</Text><TimePickerDropdown title="End Time" value={endTime} onChange={setEndTime}/></View>{startTime>=endTime&&<Text style={s.error}>End time must be after start time.</Text>}<View style={s.row}><PortalAction testID="hours-save" title={busy?'Saving...':'Save'} disabled={busy||startTime>=endTime} filled onPress={()=>void mutate(day,false)}/><PortalAction title="Cancel" disabled={busy} onPress={()=>setEditingDay(null)}/></View></View>}
   </PortalCard>;})}<PortalAction title="Reload work hours" disabled={busy} icon="refresh-cw" onPress={()=>{setEditingDay(null);void r.reload();}}/>
  </>}
 </PortalPage>;
}
