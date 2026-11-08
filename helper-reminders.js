import {LocalNotifications} from '@capacitor/local-notifications';
import {isNative} from './helper-store.js';
export async function setReminder(enabled){
 if(!isNative&&enabled)throw new Error('Daily background reminders work in the installed iPhone app. Open its Settings to enable them.');
 if(!isNative)return;
 if(enabled){const permission=await LocalNotifications.requestPermissions();if(permission.display!=='granted')throw new Error('Notifications are off. Allow them in iPhone Settings, then try again.');}
 await LocalNotifications.cancel({notifications:[{id:9001}]});
 if(enabled)await LocalNotifications.schedule({notifications:[{id:9001,title:'Good morning from Shavit ☺',body:'Your day is ready. Check your schedule, workout and tasks.',schedule:{on:{hour:9,minute:0},repeats:true},sound:'default'}]});
}

let reminderQueue=Promise.resolve(),lastSignature='';
export function syncActivityReminders(state){
 if(!isNative)return Promise.resolve();
 const snapshot=structuredClone(state);
 const work=async()=>{const {activityNotificationPlan}=await import('./reminder-plan.js');const events=activityNotificationPlan(snapshot);const signature=JSON.stringify(events);if(signature===lastSignature)return;
 const permission=await LocalNotifications.checkPermissions();if(permission.display!=='granted')return;
 const pending=await LocalNotifications.getPending();const managed=pending.notifications.filter(n=>n.id>=20000&&n.id<20100);if(managed.length)await LocalNotifications.cancel({notifications:managed.map(n=>({id:n.id}))});
 if(events.length)await LocalNotifications.schedule({notifications:events.map(e=>({id:e.id,title:e.title,body:e.body,schedule:{at:e.at},sound:'default',extra:{shavitEvent:e.key}}))});lastSignature=signature;};
 const result=reminderQueue.catch(()=>{}).then(work);reminderQueue=result;return result;
}
export async function enableActivityReminders(){if(!isNative)throw new Error('Task and gym reminders work in the installed iPhone app.');const p=await LocalNotifications.requestPermissions();if(p.display!=='granted')throw new Error('Allow notifications for Shavit in iPhone Settings, then try again.');}
