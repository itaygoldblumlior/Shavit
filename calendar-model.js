import {
  uid,
  dateKey,
  localDate,
  shiftDate,
  tasksOn,
  activitiesOn,
  moveWorkout,
} from './helper-model.js';
// iOS's ISO8601DateFormatter rejects fractional seconds ("…00.000Z"), so dates
// sent to the native calendar bridge must be whole seconds ("…00Z").
export const isoSeconds = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const eventFingerprint = (e) => JSON.stringify([e.title, e.start, e.end, !!e.allDay]);
export const eventKey = (e) => e.id + '|' + e.start;
export function eventDates(date, time, duration = 30, allDay = false) {
  const start = localDate(date);
  start.setHours(...(time ? time.split(':').map(Number) : [0, 0]), 0, 0);
  const end = new Date(start.getTime() + duration * 60000);
  if (allDay)
    end.setTime(
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + Math.max(1, Math.round(duration / 1440)),
      ).getTime(),
    );
  return { start: isoSeconds(start), end: isoSeconds(end), allDay };
}
export function localCalendarItems(state, from, to) {
  const result = [];
  for (let date = from; date < to; date = shiftDate(date, 1)) {
    for (const task of tasksOn(state, date)) {
      if (!task.time && !task.calendarAllDay) continue;
      result.push({
        localId: 'task:' + task.id + (task.date ? '' : ':' + date),
        kind: 'task',
        taskId: task.id,
        date,
        title: task.name,
        ...eventDates(
          date,
          task.time,
          task.duration ?? task.calendarDuration ?? 30,
          task.calendarAllDay && !task.time,
        ),
      });
    }
    for (const activity of activitiesOn(state, date)) {
      const timing = activity.calendarUid && state.workoutTimes?.[activity.calendarUid];
      if (!timing?.time) continue;
      result.push({
        localId: 'workout:' + activity.calendarUid,
        kind: 'workout',
        activityId: activity.id,
        date,
        title: activity.calendarTitle ?? activity.name,
        ...eventDates(date, timing.time, timing.duration ?? 60),
      });
    }
  }
  return result;
}
export function importCalendarEvent(state, event) {
  const start = new Date(event.start),
    id = uid(),
    date = dateKey(start);
  const task = {
    id,
    name: event.title,
    time: event.allDay
      ? ''
      : String(start.getHours()).padStart(2, '0') +
        ':' +
        String(start.getMinutes()).padStart(2, '0'),
    date,
    days: [],
    start: date,
    done: [],
    notify: false,
    calendarOrigin: true,
    calendarEventId: event.id,
    calendarEventStart: event.start,
    calendarExternalId: event.externalId ?? '',
    calendarAllDay: !!event.allDay,
    calendarDuration: Math.max(1, Math.round((new Date(event.end) - start) / 60000)),
    kind: event.allDay ? 'task' : 'event',
    duration: Math.max(1, Math.round((new Date(event.end) - start) / 60000)),
  };
  state.tasks.push(task);
  return { localId: 'task:' + id, kind: 'task', taskId: id, date, ...event };
}
export function applyCalendarEvent(state, item, event) {
  const start = new Date(event.start),
    date = dateKey(start),
    time = event.allDay
      ? ''
      : String(start.getHours()).padStart(2, '0') +
        ':' +
        String(start.getMinutes()).padStart(2, '0'),
    duration = Math.max(1, Math.round((new Date(event.end) - start) / 60000));
  if (item.kind === 'task') {
    let task = state.tasks.find((t) => t.id === item.taskId);
    if (!task) throw new Error('Task was removed. Sync again.');
    if (!task.date) {
      task.excludedDates = [...new Set([...(task.excludedDates ?? []), item.date])];
      task = {
        ...structuredClone(task),
        id: uid(),
        date,
        days: [],
        excludedDates: [],
        done: task.done.filter((d) => d === item.date).map(() => date),
      };
      state.tasks.push(task);
      item = { ...item, localId: 'task:' + task.id, taskId: task.id };
    }
    task.calendarEventId = event.id;
    task.calendarEventStart = event.start;
    task.calendarExternalId = event.externalId ?? '';
    task.name = event.title;
    task.date = date;
    task.time = time;
    task.calendarAllDay = event.allDay;
    task.calendarDuration = duration;
    if (task.kind === 'event' || !event.allDay) task.duration = duration;
    return { ...item, date };
  }
  const current = activitiesOn(state, item.date).find((a) => a.id === item.activityId);
  if (!current) throw new Error('Workout was removed. Sync again.');
  let activity = current;
  if (date !== item.date) {
    activity = moveWorkout(state, item.date, date, current.id, 'alongside', null, '0000');
  }
  const list = structuredClone(activitiesOn(state, date));
  const a = list.find((a) => a.id === activity.id);
  a.calendarTitle = event.title;
  state.dayPlans[date] = list;
  state.workoutTimes ??= {};
  state.workoutTimes[a.calendarUid] = { time: time || '09:00', duration };
  return { ...item, date, activityId: a.id };
}
export function removeLocalCalendarItem(state, item) {
  if (item.kind === 'task') {
    const t = state.tasks.find((t) => t.id === item.taskId);
    if (!t) return;
    if (t.date) state.tasks = state.tasks.filter((t) => t.id !== item.taskId);
    else t.excludedDates = [...new Set([...(t.excludedDates ?? []), item.date])];
  } else {
    state.dayPlans[item.date] = structuredClone(activitiesOn(state, item.date)).filter(
      (a) => a.id !== item.activityId,
    );
  }
}
