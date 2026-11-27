import {
  dateKey,
  shiftDate,
  localDate,
  tasksOn,
  activitiesOn,
  sessionKey,
} from './helper-model.js';
export function activityNotificationPlan(state, now = new Date()) {
  if (state.activityReminders === false) return [];
  const today = dateKey(now),
    events = [];
  for (let i = 0; i < 14; i++) {
    const key = shiftDate(today, i);
    for (const task of tasksOn(state, key)) {
      if (
        task.notify === false ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.time ?? '') ||
        task.done.includes(key)
      )
        continue;
      const [h, m] = task.time.split(':').map(Number),
        when = localDate(key);
      when.setHours(h, m, 0, 0);
      if (when <= now) continue;
      const normal = when.getTime() - 45 * 60000,
        created = task.reminderAddedAt ?? 0;
      const due = new Date(normal < created ? created + 2 * 60000 : normal);
      if (due <= now) continue;
      const minutes = Math.max(0, Math.round((when - due) / 60000));
      events.push({
        key: `task:${task.id}:${key}`,
        at: due,
        title: 'Hey! A little heads-up ☺',
        body:
          minutes > 0
            ? `Hey! You have “${task.name}” in ${minutes} minutes. Get ready!`
            : `Hey! It’s time for “${task.name}”. Get ready!`,
      });
    }
    const activities = activitiesOn(state, key),
      liftDay = activities.some((a) => a.type === 'lift');
    const trained = Object.values(state.sessions).some(
      (s) => s.date === key && s.completed && (s.type === 'lift' || s.type === 'run'),
    );
    if (liftDay && !trained) {
      const due = localDate(key);
      due.setHours(19, 0, 0, 0);
      const enabledAt = state.activityRemindersSince ?? 0;
      if (due.getTime() < enabledAt && dateKey(new Date(enabledAt)) === key)
        due.setTime(enabledAt + 2 * 60000);
      if (due > now)
        events.push({
          key: `gym:${key}`,
          at: due,
          title: 'Shavit’s checking in ☺',
          body: 'Get yo ass to the gym',
        });
    }
  }
  return events
    .sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
    .slice(0, 60)
    .map((event, i) => ({ ...event, id: 20000 + i }));
}
