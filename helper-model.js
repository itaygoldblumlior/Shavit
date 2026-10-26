export const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const uid=()=>crypto.randomUUID();
export function dateKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export const localDate=key=>new Date(key+'T12:00:00');
export function shiftDate(key,days){const d=localDate(key);d.setDate(d.getDate()+days);return dateKey(d);}
export function emptyState(){return {version:2,onboarded:false,start:dateKey(),schedule:Array.from({length:7},()=>[]),dayPlans:{},templates:[],sessions:{},tasks:[],reminder:false};}
export const sessionKey=(date,id)=>date+'|'+id;
export function migrateState(value){
 if(!value||value.version===2)return value;
 if(value.version!==1)throw new Error('Unsupported backup version.');
 const state=structuredClone(value);state.version=2;state.dayPlans={};
 const activity=name=>({id:'legacy-'+name.toLowerCase().replace(/[^a-z0-9]/g,'-'),name,type:'lift'});
 state.schedule=state.schedule.map(name=>name==='Rest'?[]:[activity(name)]);
 state.sessions={};
 for(const session of Object.values(value.sessions)){
  const a=activity(session.plan);
  if(session.plan==='Rest'){state.dayPlans[session.date]=[];continue;}
  state.sessions[sessionKey(session.date,a.id)]={...session,activityId:a.id,type:'lift'};
  state.dayPlans[session.date]=[a];
 }
 return state;
}
export function activitiesOn(state,date){return state.dayPlans?.[date]??state.schedule[localDate(date).getDay()];}
export function dayComplete(state,date){const activities=activitiesOn(state,date);return activities.length>0&&activities.every(a=>state.sessions[sessionKey(date,a.id)]?.completed);}
export function parseWorkout(text,name,date){
 const exercises=[];let current=null;
 for(const line of text.split(/\n/).map(s=>s.trim()).filter(Boolean)){
  const matches=[...line.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)/gi)];
  if(!matches.length){if(current)current.note=[current.note,line].filter(Boolean).join(' ');continue;}
  const title=line.slice(0,matches[0].index).trim();
  if(title){current={id:uid(),name:title,note:'',sets:[]};exercises.push(current);}
  if(!current)throw new Error('Put an exercise name before its sets.');
  for(const m of matches)current.sets.push({kind:current.sets.length?'working':'warmup',kg:Number(m[1]),reps:Number(m[2]),done:false});
  const tail=line.slice(matches.at(-1).index+matches.at(-1)[0].length).trim();if(tail)current.note=[current.note,tail].filter(Boolean).join(' ');
 }
 if(!exercises.length)throw new Error('Use one exercise per line, like: Bench press 40x8 60x6 60x6.');
 return {id:uid(),name:name.trim(),date,exercises};
}
export function previousExercise(state,name,before){
 return Object.values(state.sessions).filter(s=>s.date<before&&s.completed).sort((a,b)=>b.date.localeCompare(a.date)).flatMap(s=>s.exercises.map(e=>({...e,date:s.date}))).find(e=>e.name.trim().toLowerCase()===name.trim().toLowerCase());
}
export function streakStats(state,today=dateKey()){
 let current=0,best=0,total=Object.values(state.sessions).filter(s=>s.completed).length,missed=0;
 for(let key=state.start;key<=today;key=shiftDate(key,1)){
  const activities=activitiesOn(state,key);
  if(!activities.length)continue;
  if(dayComplete(state,key)){current++;best=Math.max(best,current);}else if(key<today){current=0;missed++;}
 }
 return {current,best,total,missed};
}
export function tasksOn(state,key){return state.tasks.filter(t=>t.date===key||(!t.date&&t.days.includes(localDate(key).getDay())&&key>=t.start));}
export function validateBackup(value){
 if(!value||![1,2].includes(value.version)||!Array.isArray(value.schedule)||value.schedule.length!==7||!Array.isArray(value.templates)||!Array.isArray(value.tasks)||typeof value.sessions!=='object'||!value.sessions)throw new Error('This is not a Shavit helper backup.');
 const validActivities=items=>Array.isArray(items)&&items.length<=10&&new Set(items.map(a=>a.id)).size===items.length&&items.every(a=>typeof a.id==='string'&&a.id.length<=150&&typeof a.name==='string'&&a.name.trim()&&a.name.length<=80&&['lift','run'].includes(a.type));
 const validKey=k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&dateKey(localDate(k))===k;
 if(!validKey(value.start)||(value.version===1?value.schedule.some(x=>typeof x!=='string'||x.length>80):value.schedule.some(day=>!validActivities(day))))throw new Error('Invalid schedule.');
 const checkExercises=items=>Array.isArray(items)&&items.length<=100&&items.every(e=>typeof e.name==='string'&&e.name.length<=150&&Array.isArray(e.sets)&&e.sets.length<=50&&e.sets.every(s=>['warmup','working'].includes(s.kind)&&Number.isFinite(s.kg)&&s.kg>=0&&s.kg<=2000&&Number.isInteger(s.reps)&&s.reps>=0&&s.reps<=1000));
 if(value.templates.some(t=>typeof t.name!=='string'||!checkExercises(t.exercises))||Object.entries(value.sessions).some(([key,s])=>!validKey(s.date)||(value.version===1?s.date!==key:(!['lift','run'].includes(s.type)||typeof s.activityId!=='string'||key!==sessionKey(s.date,s.activityId)))||typeof s.plan!=='string'||!checkExercises(s.exercises)||(s.type==='run'&&(!Number.isFinite(s.km??0)||s.km<0||s.km>1000||!Number.isFinite(s.minutes??0)||s.minutes<0||s.minutes>10000||(s.durationSeconds!==undefined&&(!Number.isInteger(s.durationSeconds)||s.durationSeconds<0||s.durationSeconds>600000))))))throw new Error('Invalid workout data.');
 if(value.tasks.some(t=>typeof t.id!=='string'||typeof t.name!=='string'||!Array.isArray(t.days)||t.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!validKey(t.start)||!Array.isArray(t.done)||t.done.some(d=>!validKey(d))||(t.date&&!validKey(t.date))))throw new Error('Invalid tasks.');
 if(value.version===2&&(!value.dayPlans||Object.entries(value.dayPlans).some(([key,items])=>!validKey(key)||!validActivities(items))))throw new Error('Invalid daily schedule.');
 return migrateState(structuredClone(value));
}

export function scheduleProgress(state,date){
 const activities=activitiesOn(state,date),tasks=tasksOn(state,date);
 const total=activities.length+tasks.length;
 const completed=activities.filter(a=>state.sessions[sessionKey(date,a.id)]?.completed).length+tasks.filter(t=>t.done.includes(date)).length;
 return {total,completed,left:total-completed,percent:total?Math.round(completed/total*100):0};
}
export function parseRunTime(value){
 const text=String(value).trim();if(!/^\d{1,4}(?::[0-5]\d)?$/.test(text))throw new Error('Enter minutes:seconds, like 14:30, or whole minutes, like 15.');
 const [minutes,seconds='0']=text.split(':');const total=Number(minutes)*60+Number(seconds);if(total<=0||total>600000)throw new Error('Enter a running time greater than zero.');return total;
}
export const runSeconds=run=>Number.isFinite(run.durationSeconds)?run.durationSeconds:Math.round((run.minutes??0)*60);
export function formatRunTime(seconds){const whole=Math.round(Math.max(0,seconds));return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0');}
export const runPace=run=>run.km>0&&runSeconds(run)>0?formatRunTime(runSeconds(run)/run.km)+' /km':'—';
export function previousRuns(state,run){return Object.values(state.sessions).filter(s=>s.type==='run'&&s.completed&&s.date<run.date&&s.km>0&&runSeconds(s)>0&&Math.round(s.km*100)===Math.round(run.km*100)).sort((a,b)=>b.date.localeCompare(a.date));}
