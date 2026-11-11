'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),ts=require(require.resolve('typescript',{paths:[root+'/apps/mobile']}));
function load(file,imports,extra={}){const m={exports:{}},js=ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(js,{module:m,exports:m.exports,require:name=>{assert.ok(Object.hasOwn(imports,name),'Unmocked port '+name+' from '+file);return imports[name];},console:{error(){},warn(){}},Date,Map,Set,Promise,setTimeout,clearTimeout,__DEV__:false,...extra},{filename:file});return m.exports;}
const campuses=load('packages/shared-types/src/constants/campuses.ts',{}),colors=load('packages/shared-ui/src/theme/colors.ts',{}),forestUtils=load('apps/mobile/src/screens/student/components/forest/forestUtils.ts',{}),forestMocks=load('apps/mobile/src/screens/student/components/forest/forestMocks.ts',{'./forestUtils':forestUtils}),presentation=load('apps/mobile/src/screens/student/portal-presentation.ts',{});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(kind,options={}){
 const slots=[],effects=[],calls=[],subscriptions=[],timers=new Map(),listeners=new Map();let cursor=0,pending=[],tree,disposed=false,focus=true,nextTimer=0,auth={status:'authenticated',session:{uid:'synthetic-student',role:'student'}},route='synthetic-conversation';
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const react={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{if(!disposed)slots[i].value=typeof v==='function'?v(slots[i].value):v;}];},useRef(initial){return slots[cursor++]??={current:initial};},useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:fn,deps};return slots[i].value;},useMemo(fn,deps){return react.useCallback(fn,deps)();},useEffect(fn,deps){const i=cursor++;if(!effects[i]||!same(effects[i].deps,deps))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const jsx=(type,props)=>typeof type==='function'?type(props||{}):({type,props:props||{}});
 const clock={setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
 const native=Object.fromEntries(['View','Text','TextInput','TouchableOpacity','Pressable','ScrollView','ActivityIndicator','Modal','FlatList','RefreshControl','KeyboardAvoidingView'].map(x=>[x,x]));
 Object.assign(native,{StyleSheet:{create:s=>s,absoluteFillObject:{}},Platform:{OS:'android'},Keyboard:{addListener:()=>({remove(){}})},useWindowDimensions:()=>({width:options.width||393,height:851,fontScale:options.fontScale||1}),AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:(name,fn)=>{listeners.set(name,fn);return{remove:()=>listeners.delete(name)};}},Share:{share:async()=>{}},Animated:{View:'Animated.View',Value:class{stopAnimation(){}setValue(){}},timing:()=>({start(){},stop(){}})}});
 const nav={navigate:(...args)=>calls.push(['navigate',...args]),goBack:()=>calls.push(['back']),setOptions:()=>{}};
 const hook=selector=>selector(auth);hook.getState=()=>auth;
 const invoke=async(name,args,fallback)=>{calls.push([name,...args]);return options[name]?options[name](...args):fallback;};
 const garden={id:'synthetic-student',studentId:'synthetic-student',level:4,xp:135,seeds:47,streakCount:8,lastCheckInDate:'2026-10-01',lastWateredDate:''};
 const services={useAuthStore:hook,gardenService:{loadGarden:uid=>invoke('garden',[uid],{status:'ready',garden}),waterGarden:()=>assert.fail('No reward writes')},assessmentService:{getAttemptsByStudent:uid=>invoke('attempts',[uid],[]),getAssessmentDefinition:id=>invoke('definition',[id],{id,questions:[]})},userService:{getUser:id=>invoke('user',[id],{displayName:'Synthetic Facilitator'}),listFacilitatorsByCampus:(...a)=>invoke('facilitators',a,[])},workHoursService:{getActiveSchedule:(...a)=>invoke('hours',a,[])},profileRepository:{getById:id=>invoke('profile',[id],null)},appointmentService:{getStudentAppointments:(...a)=>invoke('appointments',a,[]),cancelAppointment:(...a)=>invoke('cancel',a,undefined),markAllNotificationsRead:(...a)=>invoke('markAll',a,undefined),markNotificationRead:(...a)=>invoke('markOne',a,undefined)},notificationRepository:{subscribeByUserId(uid,success,error){calls.push(['notification-subscribe',uid]);const s={success,error,active:true};subscriptions.push(s);return()=>s.active=false;}},messagingService:{markConversationAsRead:(...a)=>invoke('markConversation',a,undefined),getConversations:(...a)=>invoke('conversations',a,[{id:route,participantIds:['synthetic-student','synthetic-facilitator']}]),subscribeToMessages(id,role,success,error){calls.push(['message-subscribe',id,role]);const s={success,error,active:true};subscriptions.push(s);return()=>s.active=false;},sendMessage:(...a)=>invoke('send',a,undefined)}};
 const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':native,'@react-navigation/native':{useNavigation:()=>nav,useRoute:()=>({params:{conversationId:route}}),useFocusEffect:fn=>react.useEffect(focus?fn:()=>{},[fn,focus])},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})},'@expo/vector-icons':{Feather:'Icon',MaterialCommunityIcons:'Icon'},'@spartan-g/shared-types':campuses,'@spartan-g/shared-services':services,'@spartan-g/shared-ui':{...colors,forestColors:colors.forestColors||{},spacing:{},fontSize:{},borderRadius:{},formatWorkHours:()=>'',formatTimeOnly:()=>''},'react-native-view-shot':{captureRef:async()=>''},'../../security/ScreenCaptureBoundary':{useSensitiveCapture:visible=>visible&&options.captureReady===true}};
 const screenPaths={garden:'student/GardenScreen',forest:'student/ForestScreen',facilitators:'student/FindFacilitatorScreen',appointments:'student/StudentAppointmentsScreen',chat:'messaging/ConversationDetailScreen',notifications:'notifications/NotificationsScreen'};
 Object.assign(imports,{'../../components/StudentPageDesign':{StudentPageBackground:'Decoration',StudentPageHeader:'Header',StudentSearchField:'Search',StudentPageNotice:'Notice',StudentTag:'Tag',studentPageColors:{}},'../../components/PortalIllustrations':{CampusFooter:'CampusFooter'},'./portal-presentation':presentation,'./components/GardenAtmosphere':{GardenAtmosphere:'GardenAtmosphere',GardenAmbient:'GardenAmbient'},'./components/GardenHeroScene':{GardenHeroScene:'GardenHero'},'../../garden/GardenRewardStatus':{GardenRewardStatus:'RewardStatus'},'@spartan-g/shared-services/src/services/garden-backend':{isGardenBackendEnabled:()=>false,getGardenOperations:()=>assert.fail('Trusted rewards disabled')},'@spartan-g/shared-services/src/config/garden-capabilities':{clientGardenRewardsAvailable:false,gardenUnavailableMessage:'Rewards unavailable; saved progress preserved.'},'./components/forest/forestUtils':forestUtils,'./components/forest/forestMocks':forestMocks});
 for(const name of ['ActivityChart','ForestCanvas','ForestIsland','ForestSkeleton','ForestStats','MilestoneToast','PeriodTabs','TreeDetailSheet'])imports['./components/forest/'+name]={[name]:name};
 imports['../../../assets/garden-forest-scenery-v1.jpg']='packaged-scenery';
 if(kind==='book'){
   imports['@spartan-g/shared-types']={...campuses,isSameWeek:()=>true};
   imports['../../components/TimePickerDropdown']={TimePickerDropdown:'TimePicker',TIME_OPTIONS:[{label:'09:00',value:'09:00'}]};
   services.appointmentService.requestAppointment=(...a)=>invoke('book',a,undefined);
 }
 if(kind==='wellness'){
   imports['../components/StudentPageDesign']=imports['../../components/StudentPageDesign'];
   imports['../garden/GardenRewardStatus']={GardenRewardStatus:'RewardStatus'};
   imports['../security/app-lock']={appLock:{subscribe:()=>()=>{}}};
   imports['./core']=load('apps/mobile/src/assessment-finalization/core.ts',{});
   imports['./model']=load('apps/mobile/src/assessment-finalization/model.ts',{});
   imports['./native']={createNativeSubmission:()=>({synchronize(){},stop(){},bindDraft(){calls.push(['bindDraft']);}})};
   services.assessmentService.getAttempt=id=>invoke('attempt',[id],{id,studentId:'synthetic-student',status:'in_progress',assessmentId:'definition-a',answers:[],draftRevision:0});
   services.useAuthStore.subscribe=()=>()=>{};
   imports['@react-navigation/native'].useIsFocused=()=>focus;
   imports['@react-navigation/native'].usePreventRemove=()=>{};
   native.AppState={currentState:'active',addEventListener:()=>({remove(){}})};
 }
 imports['../../components/StudentPageDesign'].StudentPageNotice=props=>jsx('Text',{children:[props.title,props.message]});
 screenPaths.book='student/BookAppointmentScreen';screenPaths.wellness='../assessment-finalization/WellnessAssessmentScreen';
 const file='apps/mobile/src/screens/'+screenPaths[kind]+'.tsx',exports=load(file,imports,clock),component=exports[screenPaths[kind].split('/').at(-1)];
 function render(){cursor=0;tree=component({route:{params:{facilitatorId:'synthetic-facilitator',assessmentId:'synthetic-attempt'}},navigation:nav});const work=pending;pending=[];work.forEach(fn=>fn());return tree;}
 function nodes(n){if(arguments.length===0)n=tree;return Array.isArray(n)?n.flatMap(x=>nodes(x)):!n||typeof n!=='object'?[]:[n,...nodes(n.props?.children??[])];}
 const find=type=>nodes().find(n=>n.type===type),byId=id=>nodes().find(n=>n.props.testID===id),text=()=>nodes().filter(n=>n.type==='Text').flatMap(n=>[n.props.children].flat(Infinity)).filter(x=>typeof x==='string'||typeof x==='number').join(' ').replace(/\s+/g,' ');
 async function settle(){for(let i=0;i<5;i++){for(let j=0;j<15;j++)await Promise.resolve();if(!disposed)render();}}
 return{render,nodes,find,byId,text,calls,subscriptions,services,options,settle,get auth(){return auth;},setAuth(value){auth=value;render();},focus(value){focus=value;render();},route(value){route=value;render();},expireReads(){for(const[id,t]of [...timers])if(t.ms>=12000){timers.delete(id);t.fn();}render();},unmount(){disposed=true;effects.forEach(e=>e?.cleanup?.());timers.clear();}};
}
module.exports={fixture,deferred};
