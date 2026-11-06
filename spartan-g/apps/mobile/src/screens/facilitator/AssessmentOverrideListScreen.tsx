import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, facilitatorStudentsService, facilitatorStudentsErrorMessage } from '@spartan-g/shared-services';
import { Feather } from '@expo/vector-icons';
import { historyActivity, filterStudents } from './facilitator-presentation';
import { PortalPage, PortalCard, PortalAction, FilterPills, StudentSearchField, StudentPageNotice, portalStyles as s, colors } from './FacilitatorPageDesign';
interface StudentWithAttempts { id:string;displayName:string;email:string;attemptCount:number;assessmentId:string|null;assessmentTitle:string;historyUnavailable?:boolean;attention:boolean|null;recentAt:number }
export function AssessmentOverrideListScreen(){
 const navigation=useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>(),session=useAuthStore(s=>s.session),authStatus=useAuthStore(s=>s.status);
 const [dataOwner,setDataOwner]=useState<typeof session>(null),requestRef=useRef(0),[students,setStudents]=useState<StudentWithAttempts[]>([]),[isLoading,setIsLoading]=useState(true),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<'All'|'Needs Attention'|'Recent'>('All');
 const loadStudents=useCallback(async()=>{
  const request=++requestRef.current,current=()=>requestRef.current===request&&useAuthStore.getState().session===session&&useAuthStore.getState().status==='authenticated';
  setIsLoading(true);setError(null);setNotice(null);setDataOwner(null);setStudents([]);
  try{
   if(!session||authStatus!=='authenticated'||!['facilitator','super_admin'].includes(session.role))throw Error('Staff permission required');
   const assigned=await facilitatorStudentsService.listStudents();if(!current())return;
   if(assigned.unavailableCount)setNotice('Some accepted links are unavailable or inactive. No wider student search was made.');
   const data:StudentWithAttempts[]=[];
   for(const student of assigned.students){if(!current())return;const row={id:student.id,displayName:student.displayName||'Student',email:student.email};
    try{const history=await facilitatorStudentsService.getStudentHistory(student.id);if(!current())return;const ids=[...new Set(history.attempts.map(a=>a.assessmentId))];
     if(!ids.length)data.push({...row,attemptCount:0,assessmentId:null,assessmentTitle:'No submitted or graded assessment history',attention:false,recentAt:0});
     for(const id of ids){const activity=historyActivity(history.attempts.filter(a=>a.assessmentId===id));data.push({...row,attemptCount:activity.count,assessmentId:id,assessmentTitle:history.metadata[id]?.title||'Assessment name unavailable',attention:activity.attention,recentAt:activity.recentAt});}
    }catch{if(!current())return;data.push({...row,attemptCount:0,assessmentId:null,assessmentTitle:'Assessment history unavailable. Open to retry authorized access.',historyUnavailable:true,attention:null,recentAt:0});}
   }if(current())setStudents(data);
  }catch(e){if(current())setError(facilitatorStudentsErrorMessage(e));}finally{if(current()){setDataOwner(session);setIsLoading(false);}}
 },[session,authStatus]);
 useEffect(()=>{void loadStudents();return()=>{requestRef.current++;};},[loadStudents]);
 const handleStudentPress=(id:string,assessmentId:string|null)=>{if(assessmentId)navigation.navigate('StudentDetail',{studentId:id,assessmentId});else navigation.navigate('FacilitatorStudentsList',{studentId:id});};
 const authorized=authStatus==='authenticated'&&session&&['facilitator','super_admin'].includes(session.role),ready=authorized&&dataOwner===session&&!isLoading,rows=ready?filterStudents(students,search,filter):[];
 return <PortalPage title="Students" subtitle="View assigned students and their assessment activity." tagline>
  <StudentSearchField value={search} onChangeText={setSearch} placeholder="Search students by name..." label="Search assigned students"/>
  <FilterPills values={['All','Needs Attention','Recent']} value={filter} onChange={v=>setFilter(v as typeof filter)}/>
  {!authorized?<StudentPageNotice title="Sign in with an authorized staff account to view assigned students."/>:!ready?<StudentPageNotice title="Loading students..." loading/>:error?<StudentPageNotice title="Students unavailable" message={error} onRetry={()=>void loadStudents()}/>:<>
   {!!notice&&<Text style={s.small}>{notice}</Text>}<Text style={s.small}>{new Set(students.map(x=>x.id)).size} assigned students · Recent means submitted within the last 7 days.</Text>
   {students.some(x=>x.attention===null)&&<Text style={s.small}>Some risk classifications are UNKNOWN or unavailable. They are excluded from Needs Attention; multiple attempts alone are not an alert.</Text>}
   {!rows.length?<StudentPageNotice title={students.length?'No matching students':'No assigned active students'} message={students.length?'Change the search or filter.':'An accepted facilitator-student assignment is required. Ask an administrator to review a missing relationship.'}/>:rows.map(student=><PortalCard key={student.id+'_'+student.assessmentId} testID={'student-open-'+student.id} onPress={()=>handleStudentPress(student.id,student.assessmentId)}><View style={s.row}><View style={s.avatar}><Text style={s.avatarText}>{student.displayName.charAt(0).toUpperCase()}</Text></View><View style={{flex:1,gap:5}}><Text style={s.name}>{student.displayName}</Text><Text style={s.text}>{student.assessmentTitle}</Text><Text style={s.small}>{student.historyUnavailable?'Attempts unavailable':student.attemptCount+' submitted attempts'}</Text></View><Feather name="chevron-right" size={22} color={colors.slate}/></View><View style={s.muted}><Text style={[s.small,{color:student.attention?colors.crimson:colors.slate}]}>{student.attention===true?'Needs Attention · recorded high/critical classification':student.attention===null?'Risk classification unavailable':student.attemptCount?'Recorded assessment activity':'No recent submissions'}</Text></View></PortalCard>)}
   <PortalAction title="Refresh" icon="refresh-cw" onPress={()=>void loadStudents()}/>
  </>}
 </PortalPage>;
}
