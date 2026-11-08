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
  const matches=[...line.matchAll(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/gi)];
  if(!matches.length){if(current)current.note=[current.note,line].filter(Boolean).join(' ');continue;}
  const title=line.slice(0,matches[0].index).trim();
  if(title){current={id:uid(),name:title,note:'',sets:[]};exercises.push(current);}
  if(!current)throw new Error('Put an exercise name before its sets.');
  for(const m of matches){if(!validReps(Number(m[2])))throw new Error('Reps must use whole or half numbers, like 6 or 6.5.');current.sets.push({kind:current.sets.length?'working':'warmup',kg:Number(m[1]),reps:Number(m[2]),done:false});}
  const tail=line.slice(matches.at(-1).index+matches.at(-1)[0].length).trim();if(tail)current.note=[current.note,tail].filter(Boolean).join(' ');
 }
 if(!exercises.length)throw new Error('Use one exercise per line, like: Bench press 40x8 60x6 60x6.');
 return {id:uid(),name:name.trim(),date,exercises};
}
export function previousExercise(state,name,before){
 return Object.values(state.sessions).filter(s=>s.date<before&&s.completed).sort((a,b)=>b.date.localeCompare(a.date)).flatMap(s=>(s.exercises??[]).map(e=>({...e,date:s.date}))).find(e=>e.name.trim().toLowerCase()===name.trim().toLowerCase());
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
export function tasksOn(state,key){return state.tasks.filter(t=>!(t.excludedDates??[]).includes(key)&&(t.date===key||(!t.date&&t.days.includes(localDate(key).getDay())&&key>=t.start)));}
export function validateBackup(value){
 if(!value||![1,2].includes(value.version)||!Array.isArray(value.schedule)||value.schedule.length!==7||!Array.isArray(value.templates)||!Array.isArray(value.tasks)||typeof value.sessions!=='object'||!value.sessions)throw new Error('This is not a Shavit helper backup.');
 const validActivities=items=>Array.isArray(items)&&items.length<=10&&new Set(items.map(a=>a.id)).size===items.length&&items.every(a=>typeof a.id==='string'&&a.id.length<=150&&typeof a.name==='string'&&a.name.trim()&&a.name.length<=80&&['lift','run'].includes(a.type));
 const validKey=k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&dateKey(localDate(k))===k;
 if(!validKey(value.start)||(value.version===1?value.schedule.some(x=>typeof x!=='string'||x.length>80):value.schedule.some(day=>!validActivities(day))))throw new Error('Invalid schedule.');
 const checkExercises=items=>Array.isArray(items)&&items.length<=100&&items.every(e=>typeof e.name==='string'&&e.name.length<=150&&Array.isArray(e.sets)&&e.sets.length<=50&&e.sets.every(s=>['warmup','working'].includes(s.kind)&&Number.isFinite(s.kg)&&s.kg>=0&&s.kg<=2000&&validReps(s.reps)));
 if(value.templates.some(t=>typeof t.name!=='string'||!checkExercises(t.exercises))||Object.entries(value.sessions).some(([key,s])=>!validKey(s.date)||(value.version===1?s.date!==key:(!['lift','run'].includes(s.type)||typeof s.activityId!=='string'||key!==sessionKey(s.date,s.activityId)))||typeof s.plan!=='string'||!checkExercises(s.exercises)||(s.type==='run'&&(!Number.isFinite(s.km??0)||s.km<0||s.km>1000||!Number.isFinite(s.minutes??0)||s.minutes<0||s.minutes>10000||(s.durationSeconds!==undefined&&(!Number.isInteger(s.durationSeconds)||s.durationSeconds<0||s.durationSeconds>600000))))))throw new Error('Invalid workout data.');
 if(value.tasks.some(t=>typeof t.id!=='string'||typeof t.name!=='string'||!Array.isArray(t.days)||t.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!validKey(t.start)||!Array.isArray(t.done)||t.done.some(d=>!validKey(d))||(t.date&&!validKey(t.date))))throw new Error('Invalid tasks.');
 if(value.version===2&&(!value.dayPlans||Object.entries(value.dayPlans).some(([key,items])=>!validKey(key)||!validActivities(items))))throw new Error('Invalid daily schedule.');
 if(value.stepGoal!==undefined&&(!Number.isInteger(value.stepGoal)||value.stepGoal<1||value.stepGoal>100000))throw new Error('Invalid step goal.');
 if(value.tasks.some(t=>(t.excludedDates!==undefined&&(!Array.isArray(t.excludedDates)||t.excludedDates.some(d=>!validKey(d))))||(t.calendarDuration!==undefined&&(!Number.isFinite(t.calendarDuration)||t.calendarDuration<=0))))throw new Error('Invalid calendar task.');
 if(value.activityReminders!==undefined&&typeof value.activityReminders!=='boolean')throw new Error('Invalid reminder setting.');
 if(value.tasks.some(t=>(t.notify!==undefined&&typeof t.notify!=='boolean')||(t.reminderAddedAt!==undefined&&(!Number.isFinite(t.reminderAddedAt)||t.reminderAddedAt<0))||(t.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))))throw new Error('Invalid task reminder.');
 if(value.runGoals!==undefined&&(!Array.isArray(value.runGoals)||value.runGoals.length>100||value.runGoals.some(g=>!validRunGoal(g))))throw new Error('Invalid running goals.');
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
export function addWorkoutToDay(state,date,activity,repeat=true){
 if(!activity.name.trim())throw new Error('Give your workout a name.');
 if(activitiesOn(state,date).length>=10)throw new Error('Up to 10 activities per day.');
 const current=structuredClone(activitiesOn(state,date));
 if(repeat){
  // Keep previous days intact when adding a recurring activity.
  for(let key=state.start;key<date;key=shiftDate(key,1))if(!state.dayPlans[key])state.dayPlans[key]=structuredClone(state.schedule[localDate(key).getDay()]);
  const weekday=localDate(date).getDay();
  if(state.schedule[weekday].length>=10)throw new Error('Up to 10 weekly activities per day.');
  state.schedule[weekday].push(structuredClone(activity));
  for(const key of Object.keys(state.dayPlans))if(key>date&&localDate(key).getDay()===weekday&&!state.dayPlans[key].some(a=>a.id===activity.id))state.dayPlans[key].push(structuredClone(activity));
 }
 state.dayPlans[date]=[...current,structuredClone(activity)];
 if(activity.type==='lift'&&!state.templates.some(t=>t.name===activity.name))state.templates.push({id:uid(),name:activity.name,exercises:[]});
}
export function prepareExercises(state,template,date){
 return structuredClone(template?.exercises??[]).map(exercise=>{
  const last=previousExercise(state,exercise.name,date),positions={warmup:0,working:0};
  exercise.sets=exercise.sets.map(set=>{const index=positions[set.kind]++,previous=last?.sets.filter(s=>s.kind===set.kind)[index];return {...set,kg:previous?.kg??set.kg,reps:previous?.reps??set.reps,done:false};});return exercise;
 });
}
export function createSession(state,date,activity){
 let template=state.templates.find(t=>t.name===activity.name);
 if(activity.type==='lift'&&!template){template={id:uid(),name:activity.name,exercises:[]};state.templates.push(template);}
 return {date,activityId:activity.id,type:activity.type,plan:activity.name,completed:false,syncPlan:activity.type==='lift'&&!template?.exercises.length,exercises:activity.type==='lift'?prepareExercises(state,template,date):[],km:0,minutes:0,note:''};
}
export function changeWeeklySchedule(state,next,today=dateKey()){
 const old=state.schedule;
 for(let key=state.start;key<today;key=shiftDate(key,1))if(!state.dayPlans[key])state.dayPlans[key]=structuredClone(old[localDate(key).getDay()]);
 for(const key of Object.keys(state.dayPlans))if(key>=today){const weekday=localDate(key).getDay(),oldIds=new Set(old[weekday].map(a=>a.id));const extra=state.dayPlans[key].filter(a=>!oldIds.has(a.id));const merged=[...structuredClone(next[weekday]),...extra.filter(a=>!next[weekday].some(n=>n.id===a.id))];if(merged.length>10)throw new Error('A day has more than 10 activities. Keep room for its one-off workouts.');state.dayPlans[key]=merged;}
 state.schedule=structuredClone(next);
}

// Match warm-ups and working sets independently, so adding a warm-up never shifts working-set history.
export function previousSet(exercise,index,previous){
 const set=exercise.sets[index];if(!set||!previous)return null;
 const position=exercise.sets.slice(0,index).filter(s=>s.kind===set.kind).length;
 return previous.sets.filter(s=>s.kind===set.kind)[position]??null;
}
export function weeklyRecap(state,anchor,today=dateKey()){
 const start=shiftDate(anchor,-localDate(anchor).getDay()),end=shiftDate(start,6);
 const until=end<today?end:today;
 const sessions=Object.values(state.sessions).filter(s=>s.completed&&s.date>=start&&s.date<=until);
 const lifts=sessions.filter(s=>s.type!=='run').length,runs=sessions.filter(s=>s.type==='run');
 let tasksDone=0,tasksTotal=0,trainingDone=0,trainingTotal=0;
 const days=Array.from({length:7},(_,i)=>{const date=shiftDate(start,i),future=date>today,beforeStart=date<state.start,activities=activitiesOn(state,date);const tasks=tasksOn(state,date);if(!future&&!beforeStart){tasksTotal+=tasks.length;tasksDone+=tasks.filter(t=>t.done.includes(date)).length;trainingTotal+=activities.length;trainingDone+=activities.filter(a=>state.sessions[sessionKey(date,a.id)]?.completed).length;}return {date,future,beforeStart,rest:activities.length===0,complete:!future&&!beforeStart&&dayComplete(state,date)};});
 const wins=lifts+runs.length+tasksDone;
 const message=wins===0?'A fresh page. One small thing is a good place to start.':trainingTotal>0&&trainingDone===trainingTotal?'You showed up for every planned session. Keep some room for rest, too.':`${wins} little ${wins===1?'win':'wins'} worth remembering. You’re making time for yourself.`;
 return {start,end,partial:end>=today,lifts,runs:runs.length,km:Math.round(runs.reduce((n,s)=>n+(s.km||0),0)*100)/100,tasksDone,tasksTotal,trainingDone,trainingTotal,days,message};
}

export function swapExercise(state,session,index,name,permanent=false){
 const current=session.exercises[index],title=String(name).trim();
 if(!current||session.completed)throw new Error('Reopen the workout before swapping an exercise.');
 if(!title||title.length>150)throw new Error('Enter an exercise name.');
 if(title.toLowerCase()===current.name.trim().toLowerCase())throw new Error('Choose a different exercise.');
 const original=current.routineOriginal??current;
 const known=state.templates.flatMap(t=>t.exercises).find(e=>e.name.trim().toLowerCase()===title.toLowerCase());
 const last=previousExercise(state,title,session.date);
 const base=known??{name:title,note:'',sets:current.sets.map(s=>({kind:s.kind,kg:0,reps:0,done:false}))};
 const replacement=prepareExercises(state,{exercises:[{...structuredClone(base),id:current.id,name:title}]},session.date)[0];
 // A history-only exercise supplies its own set structure, never the replaced exercise's load.
 if(!known&&last){replacement.note=last.note??'';replacement.sets=last.sets.map(s=>({...s,done:false}));}
 delete replacement.routineOriginal;
 const routine=state.templates.find(t=>t.name===session.plan);
 if(permanent){if(routine){const target=routine.exercises.findIndex(e=>e.id===original.id||e.name===original.name);if(target>=0)routine.exercises[target]=structuredClone(replacement);else throw new Error('The original exercise is no longer in this routine. Swap for this day instead.');}}
 else replacement.routineOriginal=structuredClone(original);
 session.exercises[index]=replacement;
 return replacement;
}

export function runComparison(state,run){
 const previous=previousRuns(state,run),last=previous[0]??null;
 const best=previous.reduce((best,r)=>!best||runSeconds(r)<runSeconds(best)?r:best,null);
 return {previous,last,best,deltaLast:last&&runSeconds(run)>0?runSeconds(last)-runSeconds(run):null,deltaBest:best&&runSeconds(run)>0?runSeconds(best)-runSeconds(run):null};
}
export function validRunGoal(goal){return goal&&typeof goal.id==='string'&&Number.isFinite(goal.km)&&goal.km>0&&goal.km<=1000&&(goal.seconds===null||(Number.isInteger(goal.seconds)&&goal.seconds>0&&goal.seconds<=600000));}
export function runGoalResult(state,goal,before=dateKey()){
 const matches=Object.values(state.sessions).filter(r=>r.type==='run'&&r.completed&&r.date<=before&&r.km>0&&runSeconds(r)>0&&(goal.seconds===null||Math.round(r.km*100)===Math.round(goal.km*100)));
 const achieved=matches.filter(r=>goal.seconds===null?r.km>=goal.km:runSeconds(r)<=goal.seconds).sort((a,b)=>b.date.localeCompare(a.date))[0]??null;
 const best=matches.reduce((b,r)=>!b||(goal.seconds===null?r.km>b.km:runSeconds(r)<runSeconds(b))?r:b,null);
 return {achieved,best,remaining:best&&goal.seconds!==null?Math.max(0,runSeconds(best)-goal.seconds):null};
}

export const validReps=n=>Number.isFinite(n)&&n>=0&&n<=1000&&Number.isInteger(n*2);
export function finishLiftingWorkout(state,session){
 if(session.completed||session.type!=='lift'||!session.exercises.length||session.exercises.some(e=>!e.sets.length||e.sets.some(s=>!s.done||!validReps(s.reps)||s.reps<=0||!Number.isFinite(s.kg)||s.kg<0)))throw new Error('Add valid weights and reps and check every set before finishing.');
 const plan=state.templates.find(t=>t.name===session.plan);
 if(plan){for(const exercise of session.exercises){if(exercise.routineOriginal)continue;const target=plan.exercises.find(e=>e.id===exercise.id||e.name.trim().toLowerCase()===exercise.name.trim().toLowerCase());if(!target)continue;const positions={warmup:0,working:0};for(const set of target.sets){const position=positions[set.kind]++,result=exercise.sets.filter(s=>s.kind===set.kind)[position];if(result){set.kg=result.kg;set.reps=result.reps;}set.done=false;}}}
 session.completed=true;
}
export function moveWorkout(state,from,to,activityId,mode='alongside',swapId=null,today=dateKey()){
 if(from===to)throw new Error('Choose a different day.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(to)||dateKey(localDate(to))!==to||to<today)throw new Error('Choose today or a future date.');
 const source=structuredClone(activitiesOn(state,from)),destination=structuredClone(activitiesOn(state,to));
 const activity=source.find(a=>a.id===activityId);if(!activity)throw new Error('Workout not found.');
 const session=state.sessions[sessionKey(from,activityId)];if(session?.completed)throw new Error('Completed workouts stay in your history.');
 const other=mode==='swap'?destination.find(a=>a.id===swapId):null;
 if(mode==='swap'&&!other)throw new Error('Choose the workout to swap with.');
 const otherSession=other&&state.sessions[sessionKey(to,other.id)];if(otherSession?.completed)throw new Error('You cannot swap a completed workout.');
 const left=source.filter(a=>a.id!==activityId),right=other?destination.filter(a=>a.id!==other.id):destination;
 if(right.length>=10)throw new Error('The destination already has 10 activities.');
 const moving={...activity,id:right.some(a=>a.id===activity.id)||state.sessions[sessionKey(to,activity.id)]&&other?.id!==activity.id?uid():activity.id};
 const returning=other?{...other,id:left.some(a=>a.id===other.id)||state.sessions[sessionKey(from,other.id)]&&activityId!==other.id?uid():other.id}:null;
 // All checks finish before mutating either day or any saved results.
 state.dayPlans[from]=returning?[...left,returning]:left;state.dayPlans[to]=[...right,moving];
 if(session)delete state.sessions[sessionKey(from,activityId)];if(otherSession)delete state.sessions[sessionKey(to,other.id)];
 if(session)state.sessions[sessionKey(to,moving.id)]={...session,date:to,activityId:moving.id};
 if(otherSession)state.sessions[sessionKey(from,returning.id)]={...otherSession,date:from,activityId:returning.id};
 return moving;
}
export function taskInvitation(task,date){const label=localDate(date).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});return `Want to do this together?\n${task.name}\n${label}${task.time?' at '+task.time:''}\nPlanned with Shavit ☺`;}
