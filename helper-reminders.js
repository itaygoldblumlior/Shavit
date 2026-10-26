import {LocalNotifications} from '@capacitor/local-notifications';
import {isNative} from './helper-store.js';
export async function setReminder(enabled){
 if(!isNative&&enabled)throw new Error('Daily background reminders work in the installed iPhone app. Open its Settings to enable them.');
 if(!isNative)return;
 if(enabled){const permission=await LocalNotifications.requestPermissions();if(permission.display!=='granted')throw new Error('Notifications are off. Allow them in iPhone Settings, then try again.');}
 await LocalNotifications.cancel({notifications:[{id:9001}]});
 if(enabled)await LocalNotifications.schedule({notifications:[{id:9001,title:'Good morning from Shavit ☺',body:'Your day is ready. Check your schedule, workout and tasks.',schedule:{on:{hour:9,minute:0},repeats:true},sound:'default'}]});
}
