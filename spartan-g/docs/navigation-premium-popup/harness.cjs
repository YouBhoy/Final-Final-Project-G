const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),ts=require(require.resolve('typescript',{paths:[path.join(root,'apps/mobile')]}));
function load(file,imports={}){const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports,fetch){'+code+'\n})',{filename:file})(n=>{assert.ok(Object.hasOwn(imports,n),'Unexpected import: '+n);return imports[n];},m,m.exports,()=>assert.fail('Navigation may not access network'));return m.exports;}
const model=load('apps/mobile/src/navigation/expandable-navigation.ts'),theme=load('packages/shared-ui/src/theme/colors.ts');
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function fixture(portal='student',options={}){
 const slots=[],effects=[],animations=[],calls=[],contextChanges=[],listeners=new Map();let cursor=0,pending=[],tree,styles;
 let auth={status:'authenticated',session:{uid:'fictional-'+portal,role:portal}},dimensions={width:393,height:851},contextExpanded=false;
 const insets={top:24,bottom:24,left:0,right:0,...options.insets};dimensions={...dimensions,...options.dimensions};
 const react={useState(value){const i=cursor++;if(!slots[i])slots[i]={value:typeof value==='function'?value():value};return[slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v];},useRef(value){return slots[cursor++]??={current:value};},useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn};return slots[i].value;},useEffect(fn,deps){const i=cursor++;if(!effects[i]||!same(effects[i].deps,deps))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const subscribe=(name,fn)=>{const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set);return{remove:()=>set.delete(fn)};};
 class Value{constructor(value){this.value=value;}setValue(value){this.value=value;}interpolate(config){return{value:this,config};}}
 const Animated={Value,View:'Animated.View',timing(value,config){const a={value,config,done:false,start(cb){a.callback=cb;},stop(){if(!a.done){a.done=true;a.callback?.({finished:false});}},finish(){if(!a.done){a.done=true;value.setValue(config.toValue);a.callback?.({finished:true});}}};animations.push(a);return a;}};
 const native=Object.fromEntries(['View','Text','Pressable','ScrollView','Modal'].map(n=>[n,n]));Object.assign(native,{Animated,StyleSheet:{create:s=>{styles=s;return s;},hairlineWidth:0.5,absoluteFillObject:{position:'absolute',top:0,right:0,bottom:0,left:0}},useWindowDimensions:()=>dimensions,Easing:{cubic:'cubic',out:value=>['out',value],in:value=>['in',value]},AccessibilityInfo:{isReduceMotionEnabled:async()=>!!options.reducedMotion,addEventListener:(name,fn)=>subscribe(name,fn)},Keyboard:{isVisible:()=>!!options.keyboardVisible,dismiss:()=>calls.push(['keyboard-dismiss']),addListener:(name,fn)=>subscribe(name,fn)},AppState:{addEventListener:(name,fn)=>subscribe('app-'+name,fn)},BackHandler:{addEventListener:(name,fn)=>subscribe(name,fn)}});
 const config=model.NAVIGATION_DESTINATIONS[portal],destinations=[...config.primary.filter(Boolean),...config.expanded];let state={key:portal+'-tabs',index:0,routes:destinations.map(d=>({name:d.route,key:d.route+'-key'}))};let prevent=false;
 const navigation={emit:event=>{calls.push(['emit',event]);return{defaultPrevented:prevent};},navigate:(...args)=>calls.push(['navigate',...args])};
 const parentNavigation={addListener:(name,fn)=>{const s=subscribe('parent-'+name,fn);return()=>s.remove();}};
 const setExpanded=value=>{contextExpanded=value;contextChanges.push(value);};
 const jsx=(type,props)=>({type,props:props||{}}),shared={useAuthStore:Object.assign(fn=>fn(auth),{getState:()=>auth})};
 const module=load(options.source || 'apps/mobile/src/navigation/ExpandableTabBar.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':native,'@react-navigation/native':{useNavigation:()=>parentNavigation},'@spartan-g/shared-services':shared,'@spartan-g/shared-ui':theme,'react-native-svg':Object.fromEntries(['default','Defs','LinearGradient','RadialGradient','Rect','Path','Stop'].map(n=>[n,n==='default'?'Svg':'Svg.'+n])),'@expo/vector-icons':{Feather:'Feather'},'./ExpandableNavigationContext':{useExpandableNavigation:()=>({expanded:contextExpanded,setExpanded})},'./expandable-navigation':model});
 function raw(node){if(Array.isArray(node))return node.flatMap(raw);if(!node||typeof node!=='object')return[];return[node,...(node.props?.children===undefined?[]:raw(node.props.children))];}
 const modal=()=>raw(tree).find(n=>n.type==='Modal');
 // Inspect the ENTIRE tree, including content behind overlays. The old harness
 // selected only the modal subtree and missed the duplicated original bar.
 function entries(node){return raw(node===undefined?tree:node);}
 const byId=id=>entries().find(n=>n.props?.testID===id),text=()=>entries().filter(n=>n.type==='Text').flatMap(n=>[n.props.children].flat(Infinity)).filter(n=>typeof n==='string').join(' ');
 function render(){cursor=0;tree=module.ExpandableTabBar({state,navigation,descriptors:{},insets,portal});const jobs=pending;pending=[];jobs.forEach(fn=>fn());return tree;}
 function finish(){animations.filter(a=>!a.done).forEach(a=>a.finish());render();}
 async function settle(){for(let i=0;i<5;i++){await Promise.resolve();render();}}
 async function ready(){render();await settle();}
 function open({complete=true}={}){byId('navigation-more').props.onPress();render();render();if(complete)finish();}
 function emit(name,value){const consumed=[...(listeners.get(name)||[])].map(fn=>fn(value)).some(Boolean);render();return consumed;}
 return{render,ready,settle,open,finish,modal,entries,byId,text,animations,calls,contextChanges,get styles(){return styles;},get expanded(){return contextExpanded;},get state(){return state;},setAuth:next=>{auth=next;},setPrevent:v=>prevent=v,resize:next=>{dimensions={...dimensions,...next};render();},activate:route=>{state={...state,index:state.routes.findIndex(r=>r.name===route)};render();},emit,unmount(){effects.forEach(e=>e?.cleanup?.());},listenerCount:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0)};
}
module.exports={root,ts,load,model,theme,fixture};
