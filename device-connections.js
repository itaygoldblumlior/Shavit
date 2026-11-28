import { Capacitor, registerPlugin } from '@capacitor/core';
import { dateKey, shiftDate } from './helper-model.js';
import {
  isoSeconds,
  localCalendarItems,
  eventFingerprint,
  eventKey,
  importCalendarEvent,
  applyCalendarEvent,
  removeLocalCalendarItem,
} from './calendar-model.js';
export const Device = registerPlugin('ShavitDevice');
export const isIPhone = () => Capacitor.getPlatform() === 'ios';
export async function reconcileCalendar(state, device = Device, today = dateKey()) {
  const config = state.calendar;
  if (!config?.enabled) return false;
  const from = shiftDate(today, -30),
    to = shiftDate(today, 91),
    start = isoSeconds(new Date(from + 'T00:00:00')),
    end = isoSeconds(new Date(to + 'T00:00:00'));
  const result = await device.calendarSnapshot({ calendarId: config.id, start, end });
  if (!Array.isArray(result.events))
    throw new Error('Calendar did not return a complete event list.');
  config.links ??= {};
  config.ignored ??= [];
  config.ignoredLocal ??= [];
  config.pending = [];
  let items = localCalendarItems(state, from, to),
    changed = false;
  const seen = new Set();
  const bind = (item, event, oldId) => {
    if (oldId && oldId !== item.localId) delete config.links[oldId];
    config.links[item.localId] = {
      item: {
        localId: item.localId,
        kind: item.kind,
        taskId: item.taskId,
        activityId: item.activityId,
        date: item.date,
      },
      event,
      localFingerprint: eventFingerprint(item),
      remoteFingerprint: eventFingerprint(event),
    };
    seen.add(eventKey(event));
    changed = true;
  };
  const save = async (item, event) =>
    device.saveEvent({
      calendarId: config.id,
      ...(event ? { id: event.id, originalStart: event.start } : {}),
      localId: item.localId,
      title: item.title,
      start: item.start,
      end: item.end,
      allDay: item.allDay,
    });
  for (const [localId, link] of Object.entries(config.links)) {
    if (link.event.start < start || link.event.start >= end) continue;
    const item = items.find((i) => i.localId === localId);
    const exact = result.events.find((e) => e.id === link.event.id && e.start === link.event.start);
    const candidates = result.events.filter((e) => e.id === link.event.id);
    const urlMatch = result.events.find((e) => e.url && e.url === link.event.url);
    const remote = exact ?? (candidates.length === 1 ? candidates[0] : null) ?? urlMatch;
    if (remote) seen.add(eventKey(remote));
    if (!item) {
      if (remote) config.pending.push({ kind: 'local-delete', localId, label: link.event.title });
      else {
        delete config.links[localId];
        changed = true;
      }
      continue;
    }
    if (!remote) {
      config.pending.push({ kind: 'remote-delete', localId, label: item.title });
      continue;
    }
    const localChanged = eventFingerprint(item) !== link.localFingerprint,
      remoteChanged = eventFingerprint(remote) !== link.remoteFingerprint;
    if (localChanged && remoteChanged && eventFingerprint(item) !== eventFingerprint(remote)) {
      config.pending.push({ kind: 'conflict', localId, label: item.title, remote });
      continue;
    }
    if (localChanged && !remoteChanged) {
      const saved = await save(item, remote);
      bind(item, saved);
    } else if (remoteChanged) {
      try {
        const ref = applyCalendarEvent(state, item, remote);
        items = localCalendarItems(state, from, to);
        const fresh = items.find((i) => i.localId === ref.localId);
        if (fresh) bind(fresh, remote, localId);
      } catch {
        config.pending.push({ kind: 'protected', localId, label: item.title, remote });
      }
    }
  }
  items = localCalendarItems(state, from, to);
  // Import the main calendar only. No notes, guests, locations, or other calendars are read into Shavit.
  for (const event of result.events) {
    if (seen.has(eventKey(event)) || config.ignored.includes(eventKey(event))) continue;
    const recovered = items.find((i) => {
      try {
        return new URL(event.url).searchParams.get('item') === i.localId;
      } catch {
        return false;
      }
    });
    if (recovered) {
      bind(recovered, event);
      continue;
    }
    const restored = state.tasks.find(
      (t) =>
        t.calendarEventStart === event.start &&
        (t.calendarEventId === event.id ||
          (event.externalId && t.calendarExternalId === event.externalId)),
    );
    const ref = restored ? { localId: 'task:' + restored.id } : importCalendarEvent(state, event);
    const fresh = localCalendarItems(state, from, to).find((i) => i.localId === ref.localId);
    if (fresh) bind(fresh, event);
  }
  items = localCalendarItems(state, from, to);
  // New Shavit plans go to Calendar for the next 30 days. Each sync advances this window.
  for (const item of items) {
    if (
      config.links[item.localId] ||
      config.ignoredLocal.includes(item.localId) ||
      item.date < today ||
      item.date > shiftDate(today, 30)
    )
      continue;
    bind(item, await save(item));
  }
  config.lastSync = new Date().toISOString();
  return changed;
}
export async function resolveCalendarChange(state, pending, choice, device = Device) {
  const config = state.calendar,
    link = config.links[pending.localId];
  if (!link) return;
  const item = localCalendarItems(state, shiftDate(dateKey(), -30), shiftDate(dateKey(), 91)).find(
    (i) => i.localId === pending.localId,
  );
  if (pending.kind === 'local-delete') {
    if (choice === 'delete')
      await device.deleteEvent({
        calendarId: config.id,
        id: link.event.id,
        originalStart: link.event.start,
      });
    else config.ignored.push(eventKey(link.event));
    delete config.links[pending.localId];
  } else if (pending.kind === 'remote-delete') {
    if (choice === 'delete') {
      removeLocalCalendarItem(state, link.item);
      delete config.links[pending.localId];
    } else if (item) {
      const event = await device.saveEvent({
        calendarId: config.id,
        localId: item.localId,
        ...item,
      });
      config.links[pending.localId] = {
        item: link.item,
        event,
        localFingerprint: eventFingerprint(item),
        remoteFingerprint: eventFingerprint(event),
      };
    }
  } else if (pending.kind === 'conflict') {
    if (choice === 'calendar') {
      const ref = applyCalendarEvent(state, item, pending.remote),
        fresh = localCalendarItems(state, shiftDate(dateKey(), -30), shiftDate(dateKey(), 91)).find(
          (i) => i.localId === ref.localId,
        );
      delete config.links[pending.localId];
      config.links[ref.localId] = {
        item: ref,
        event: pending.remote,
        localFingerprint: eventFingerprint(fresh),
        remoteFingerprint: eventFingerprint(pending.remote),
      };
    } else {
      const event = await device.saveEvent({
        calendarId: config.id,
        id: pending.remote.id,
        originalStart: pending.remote.start,
        ...item,
      });
      config.links[pending.localId] = {
        ...link,
        event,
        localFingerprint: eventFingerprint(item),
        remoteFingerprint: eventFingerprint(event),
      };
    }
  } else {
    config.ignored.push(eventKey(pending.remote ?? link.event));
    config.ignoredLocal ??= [];
    config.ignoredLocal.push(pending.localId);
    delete config.links[pending.localId];
  }
  config.pending = config.pending.filter((p) => p.localId !== pending.localId);
}
