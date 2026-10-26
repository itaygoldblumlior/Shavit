export const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const uid=()=>crypto.randomUUID();
export function dateKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export const localDate=key=>new Date(key+'T12:00:00');
export function shiftDate(key,days){const d=localDate(key);d.setDate(d.getDate()+days);return dateKey(d);}
export function emptyState(){return {version:1,onboarded:false,start:dateKey(),schedule:['Push','Pull','Legs','Push','Pull','Legs','Rest'],templates:[],sessions:{},tasks:[],reminder:false};}
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
  const session=state.sessions[key],plan=session?.plan??state.schedule[localDate(key).getDay()];
  if(plan==='Rest')continue;
  if(session?.completed){current++;best=Math.max(best,current);}else if(key<today){current=0;missed++;}
 }
 return {current,best,total,missed};
}
export function tasksOn(state,key){return state.tasks.filter(t=>t.date===key||(!t.date&&t.days.includes(localDate(key).getDay())&&key>=t.start));}
export function validateBackup(value){
 if(!value||value.version!==1||!Array.isArray(value.schedule)||value.schedule.length!==7||!Array.isArray(value.templates)||!Array.isArray(value.tasks)||typeof value.sessions!=='object'||!value.sessions)throw new Error('This is not a Shavit helper backup.');
 const validKey=k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&dateKey(localDate(k))===k;
 if(!validKey(value.start)||value.schedule.some(x=>typeof x!=='string'||x.length>80))throw new Error('Invalid schedule.');
 const checkExercises=items=>Array.isArray(items)&&items.length<=100&&items.every(e=>typeof e.name==='string'&&e.name.length<=150&&Array.isArray(e.sets)&&e.sets.length<=50&&e.sets.every(s=>['warmup','working'].includes(s.kind)&&Number.isFinite(s.kg)&&s.kg>=0&&s.kg<=2000&&Number.isInteger(s.reps)&&s.reps>=0&&s.reps<=1000));
 if(value.templates.some(t=>typeof t.name!=='string'||!checkExercises(t.exercises))||Object.entries(value.sessions).some(([key,s])=>!validKey(key)||s.date!==key||typeof s.plan!=='string'||!checkExercises(s.exercises)))throw new Error('Invalid workout data.');
 if(value.tasks.some(t=>typeof t.id!=='string'||typeof t.name!=='string'||!Array.isArray(t.days)||t.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!validKey(t.start)||!Array.isArray(t.done)||t.done.some(d=>!validKey(d))||(t.date&&!validKey(t.date))))throw new Error('Invalid tasks.');
 return structuredClone(value);
}
