import { showTutorial } from './tutorial.js';
import {
  Device,
  isIPhone,
  reconcileCalendar,
  resolveCalendarChange,
} from './device-connections.js';
import { exerciseProgress, progressExerciseNames, mountWorkoutGraph } from './workout-progress.js';
import { renderWorkoutPhotos } from './workout-photo.js';
import { heroView } from './hero-view.js';
import {
  taskKind,
  eventDuration,
  timelineFor,
  activityTime,
  fromMinutes,
  toMinutes,
  THEMES,
  themeOf,
  weekdays,
  uid,
  dateKey,
  localDate,
  shiftDate,
  emptyState,
  parseWorkout,
  previousExercise,
  streakStats,
  tasksOn,
  validateBackup,
  migrateState,
  activitiesOn,
  dayComplete,
  sessionKey,
  scheduleProgress,
  parseRunTime,
  runSeconds,
  formatRunTime,
  runPace,
  previousRuns,
  addWorkoutToDay,
  createSession,
  changeWeeklySchedule,
  previousSet,
  weeklyRecap,
  swapExercise,
  runComparison,
  runGoalResult,
  finishLiftingWorkout,
  moveWorkout,
  taskInvitation,
} from './helper-model.js';
import { loadState, saveState, isNative } from './helper-store.js';
import { setReminder, syncActivityReminders, enableActivityReminders } from './helper-reminders.js';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
let deviceDirty = true,
  deviceLastRefresh = 0;
let deviceTimer,
  deviceBusy = false,
  deviceError = '',
  stepCount = null,
  stepUpdated = '',
  healthEnabled = false;
let workoutTab = 'routines',
  graphRange = 'month',
  graphMetric = 'kg',
  graphExercise = '',
  disposeGraph = () => {};
let state,
  day = dateKey(),
  view = 'today',
  activeId = null,
  sessionMode = false,
  editorAction,
  toastTimer,
  historyFilter = 'all',
  saveStatus = 'Saved on this device',
  recapAnchor = dateKey();
const face = `<svg class="face" aria-label="Shavit’s smiling face" role="img" viewBox="0 0 100 100"><path d="M79 49c2 23-12 34-32 32S18 69 19 48 32 18 51 19s29 12 28 30Z" stroke="currentColor" stroke-width="4" fill="none"/><path d="m37 41 1 5m24-6 1 5M35 59q16 16 30-1" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
const fmt = (key) => localDate(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plan = (key) =>
  activitiesOn(state, key)
    .map((a) => a.name)
    .join(' + ') || 'Rest';
const activeKey = () => sessionKey(day, activeId);
const activeSession = () => state.sessions[activeKey()];
function toast(text, undo) {
  $('toast').replaceChildren(document.createTextNode(text));
  if (undo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Undo';
    button.onclick = async () => {
      await undo();
      $('toast').style.display = 'none';
    };
    $('toast').append(button);
  }
  $('toast').style.display = 'flex';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').style.display = 'none'), undo ? 9000 : 3500);
}
function updateSaveStatus(text) {
  saveStatus = text;
  document.querySelectorAll('[data-save-status]').forEach((node) => (node.textContent = text));
}
let enablingReminders = false;
async function maybeEnableReminders() {
  if (!isNative || !state.onboarded || state.activityReminders !== undefined || enablingReminders)
    return;
  enablingReminders = true;
  try {
    await enableActivityReminders();
    state.activityReminders = true;
    state.activityRemindersSince = Date.now();
  } catch {
    state.activityReminders = false;
    toast('Enable task & gym reminders in More when you’re ready.');
  } finally {
    await saveState(state);
    enablingReminders = false;
  }
}
async function persist() {
  updateSaveStatus('Saving…');
  try {
    await saveState(state);
    await maybeEnableReminders();
    updateSaveStatus('Saved on this device');
    syncActivityReminders(state).catch(() =>
      toast('Saved. Could not refresh reminders; reopen Shavit to try again.'),
    );
    deviceDirty = true;
    scheduleDeviceRefresh();
  } catch (e) {
    updateSaveStatus('Could not save');
    toast('Could not save. Export a backup before closing.');
    throw e;
  }
}
function keepScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}
function openEditor(title, html, action, save = 'Save') {
  $('editor-content').onclick = null;
  $('editor-content').onchange = null;
  $('editor-title').textContent = title;
  $('editor-content').innerHTML = html;
  $('editor-error').textContent = '';
  $('editor-save').hidden = save === null;
  $('editor-save').textContent = save ?? '';
  $('editor-save').disabled = false;
  editorAction = action;
  if (!$('editor').open) $('editor').showModal();
}
$('close-editor').onclick = () => $('editor').close();
$('editor').addEventListener('close', () => scheduleDeviceRefresh());
$('editor-form').onsubmit = async (e) => {
  e.preventDefault();
  $('editor-save').disabled = true;
  const before = structuredClone(state);
  try {
    await editorAction(new FormData(e.target));
    await persist();
    $('editor').close();
    render();
  } catch (error) {
    state = before;
    $('editor-error').textContent = error.message;
  } finally {
    $('editor-save').disabled = false;
  }
};
const option = (v, selected) =>
  `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`;
const defaultTime = (type) => (type === 'run' ? '07:00' : '17:30');
const timeField = (activity, index) =>
  `<input type="time" data-time required aria-label="${weekdays[index]} ${esc(activity.name || activity.type)} start time" value="${esc(activity.time ?? defaultTime(activity.type))}">`;
function scheduleRow(activity, index) {
  const duration = esc(String(activity.duration ?? (activity.type === 'run' ? 45 : 60)));
  if (activity.type === 'run')
    return `<div class="schedule-activity run-activity" data-row data-id="${esc(activity.id)}" data-duration="${duration}"><input type="hidden" data-type value="run"><input type="hidden" data-name value="Run"><span class="run-label">Run</span>${timeField(activity, index)}<button type="button" data-remove-activity aria-label="Remove Run">×</button></div>`;
  return `<div class="schedule-activity" data-row data-id="${esc(activity.id)}" data-duration="${duration}"><label class="sr-only">Activity type</label><select data-type aria-label="${weekdays[index]} activity type">${option('lift', activity.type)}${option('run', activity.type)}</select><input data-name aria-label="${weekdays[index]} activity name" list="plan-names" required maxlength="80" placeholder="Upper, Lower, Full body…" value="${esc(activity.name)}">${timeField(activity, index)}<button type="button" data-remove-activity aria-label="Remove ${esc(activity.name || 'activity')}">×</button></div>`;
}
function scheduleFields() {
  return `<p class="muted">Your split, your way. Name any workout and add as many activities as you need. Lift and run on the same day. Leave a day empty for rest.</p><datalist id="plan-names">${[...new Set([...state.templates.map((t) => t.name), 'Upper', 'Lower', 'Full body', 'Push', 'Pull', 'Legs', 'Easy run', 'Long run'])].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>${weekdays.map((name, i) => `<section class="schedule-day"><h3>${name}</h3><div data-day-activities="${i}">${state.schedule[i].map((a) => scheduleRow(a, i)).join('')}</div><p class="muted rest-label" ${state.schedule[i].length ? 'hidden' : ''}>Rest day</p><button type="button" class="text-button" data-add-activity="${i}">＋ Add lift</button><button type="button" class="text-button" data-add-run="${i}">＋ Add run</button></section>`).join('')}`;
}
function bindSchedule() {
  $('editor-content').onchange = (event) => {
    if (event.target.matches('select[data-type]') && event.target.value === 'run') {
      const row = event.target.closest('[data-row]'),
        i = Number(row.parentElement.dataset.dayActivities);
      row.outerHTML = scheduleRow({ id: row.dataset.id, name: 'Run', type: 'run' }, i);
    }
  };
  $('editor-content').onclick = (event) => {
    const add = event.target.closest('[data-add-activity], [data-add-run]'),
      remove = event.target.closest('[data-remove-activity]');
    if (add) {
      const i = Number(add.dataset.addActivity ?? add.dataset.addRun),
        list = $('editor-content').querySelector(`[data-day-activities="${i}"]`);
      if (list.children.length >= 10) {
        $('editor-error').textContent = 'Up to 10 activities per day.';
        return;
      }
      list.insertAdjacentHTML(
        'beforeend',
        scheduleRow(
          {
            id: uid(),
            name: add.hasAttribute('data-add-run') ? 'Run' : '',
            type: add.hasAttribute('data-add-run') ? 'run' : 'lift',
          },
          i,
        ),
      );
      list.parentElement.querySelector('.rest-label').hidden = true;
      list.lastElementChild.querySelector('input:not([type=hidden])')?.focus();
    }
    if (remove) {
      const section = remove.closest('.schedule-day');
      remove.closest('[data-row]').remove();
      section.querySelector('.rest-label').hidden =
        section.querySelectorAll('[data-row]').length > 0;
    }
  };
}
function readSchedule() {
  return weekdays.map((_, i) =>
    [...$('editor-content').querySelector(`[data-day-activities="${i}"]`).children].map((row) => ({
      id: row.dataset.id,
      name: row.querySelector('[data-name]').value.trim(),
      type: row.querySelector('[data-type]').value,
      time: row.querySelector('[data-time]').value,
      duration: Number(row.dataset.duration) || 60,
    })),
  );
}
function setup() {
  openEditor(
    'Your week, your way',
    scheduleFields(),
    () => {
      state.schedule = readSchedule();
      if (state.schedule.flat().some((a) => !a.name))
        throw new Error('Name each activity or remove its row.');
      state.start = dateKey();
      state.onboarded = true;
    },
    'Let’s go',
  );
  bindSchedule();
}
function navIcon(id) {
  const paths = {
    today: 'M5 4h14v16H5z M8 2v4 M16 2v4 M5 9h14 M8 13h3 M8 16h6',
    plans: 'M5 9v6 M8 6v12 M16 6v12 M19 9v6 M8 12h8',
    progress: 'M4 19V5 M4 19h16 M7 15l4-4 4 2 5-8',
    settings: 'M5 6h14 M5 12h14 M5 18h14 M9 4v4 M15 10v4 M10 16v4',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[id]}"/></svg>`;
}
function applyTheme() {
  const theme = themeOf(state);
  document.documentElement.dataset.theme = theme;
  const colour = { midnight: '#0c1526', paper: '#f5efe3', coach: '#0d0e10' }[theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colour);
}
function render() {
  applyTheme();
  disposeGraph();
  if (!state.onboarded || new URLSearchParams(location.search).has('welcome')) {
    $('app').innerHTML = heroView(face, state.onboarded);
    if (document.documentElement.classList.contains('qa-sandbox'))
      document.querySelector('.welcome-brand').href = '?sandbox=1&welcome=1';
    const start = () => {
      const params = new URLSearchParams(location.search);
      params.delete('welcome');
      history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
      if (state.onboarded) render();
      else setup();
    };
    $('get-started').onclick = start;
    document.querySelectorAll('[data-welcome-open]').forEach((button) => (button.onclick = start));
    return;
  }
  const today = day === dateKey(),
    stats = streakStats(state),
    start = shiftDate(day, -localDate(day).getDay());
  $('app').innerHTML =
    `<main class="${sessionMode ? 'logging-mode' : ''}"><header class="top"><div><p class="eyebrow">SHAVIT · YOUR COOL FRIEND</p><h1>${view === 'today' ? (today ? 'Today' : weekdays[localDate(day).getDay()]) : view === 'plans' ? 'Your workouts' : view === 'progress' ? 'Look at you go.' : 'Your space'}</h1><span class="subtle">${view === 'today' ? localDate(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Small steps. Kept promises.'}</span></div>${face}</header>${
      view === 'today'
        ? `<div class="datebar planner-bar"><div class="pill"><button id="prev-week" aria-label="Previous week">‹</button><button id="choose-date" aria-label="Choose a date">${localDate(day).toLocaleDateString('en-GB', { month: 'long' })}</button><button id="next-week" aria-label="Next week">›</button></div><div class="pill"><button id="today">${today ? 'Today' : 'Back to today'}</button>${sessionMode ? '' : '<button id="add-task" aria-label="Add a task or event">＋</button>'}</div></div><div class="week">${weekdays
            .map((name, i) => {
              const key = shiftDate(start, i);
              return `<button class="day ${key === day ? 'selected' : ''} ${key === dateKey() ? 'today' : ''} ${dayComplete(state, key) ? 'done' : ''}" data-day="${key}" aria-label="${name} ${fmt(key)}, ${esc(plan(key))}"><small>${name.slice(0, 3)}</small><strong>${dayComplete(state, key) ? '✓' : localDate(key).getDate()}</strong><span class="dot">${plan(key) === 'Rest' ? 'Rest' : activitiesOn(state, key).length > 1 ? activitiesOn(state, key).length + ' plans' : 'Train'}</span></button>`;
            })
            .join('')}</div>${sessionMode ? workoutView() : todayView(stats)}`
        : view === 'plans'
          ? plansView()
          : view === 'progress'
            ? progressView(stats)
            : settingsView()
    }</main><nav class="nav" aria-label="Main navigation">${[
      ['today', '◷', 'Today'],
      ['plans', '▤', 'Workouts'],
      ['progress', '↗', 'Progress'],
      ['settings', '☷', 'More'],
    ]
      .map(
        ([id, icon, name]) =>
          `<button data-view="${id}" class="${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''}><span>${navIcon(id)}</span>${name}</button>`,
      )
      .join('')}</nav>`;
  bind();
  scheduleDeviceRefresh();
  if (!isNative && !state.tutorialVersion) queueMicrotask(startTutorial);
}
function startTutorial() {
  showTutorial(async () => {
    state.tutorialVersion = 1;
    await saveState(state);
  });
}
function stepsView() {
  if (!healthEnabled) return '';
  const goal = state.stepGoal ?? 10000;
  return `<section class="card steps-card" aria-label="Daily steps"><div class="section-head" style="margin-top:0"><h2>A little movement.</h2><button id="step-goal" class="text-button">Goal: ${goal.toLocaleString()}</button></div><p class="steps-total">${stepCount === null ? '—' : stepCount.toLocaleString()} <small>steps today</small></p>${stepCount !== null ? `<progress max="${goal}" value="${Math.min(stepCount, goal)}" aria-label="${stepCount} of ${goal} steps"></progress><p class="muted">${stepCount >= goal ? 'Daily goal reached. Nice one.' : (goal - stepCount).toLocaleString() + ' to go.'} Separate from your schedule.</p>` : `<p class="muted">${healthEnabled ? 'Connect Apple Health to see steps from your iPhone and Apple Watch.' : 'Apple Health is prepared; this test build needs HealthKit signing before it can connect.'}</p>`}<button id="connect-health" class="text-button">${state.healthConnected ? 'Refresh Apple Health' : 'Connect Apple Health'} ↗</button>${stepUpdated ? '<small class="muted">Updated ' + new Date(stepUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</small>' : ''}</section>`;
}
function connectionsView() {
  if (!isIPhone()) return '';
  return `<section class="card"><h2>Your phone, connected.</h2><p class="muted">Optional. Calendar plans stay on this device.</p><h3>Main calendar</h3><p class="muted">${state.calendar?.enabled ? esc(state.calendar.name) : 'Bring events into your day and send timed Shavit plans to your main calendar.'}</p><details class="quiet-details"><summary>How calendar sync works</summary><p class="muted">Syncs while Shavit is open and when you return. New plans sync 30 days ahead. Deletions and conflicting edits ask for your review.</p></details>${state.calendar?.enabled ? `<button class="secondary" id="sync-calendar">Sync now</button><button class="text-button" id="disconnect-calendar">Disconnect calendar</button>${state.calendar.lastSync ? '<p class="muted">Last synced ' + new Date(state.calendar.lastSync).toLocaleString() + '</p>' : ''}` : '<button class="secondary" id="connect-calendar">Connect main calendar</button>'}${deviceError ? `<p class="error">${esc(deviceError)}</p>` : ''}${(state.calendar?.pending ?? []).map((p, i) => `<button class="secondary" data-calendar-review="${i}">Review ${p.kind.includes('delete') ? 'deletion' : 'change'} · ${esc(p.label)}</button>`).join('')}${healthEnabled ? `<h3>Apple Health</h3><p class="muted">Read today’s steps only. Your daily goal stays separate from tasks and training.</p><button class="secondary" id="connect-health">${state.healthConnected ? 'Refresh' : 'Connect'} Apple Health</button><button class="text-button" id="step-goal">Daily step goal · ${(state.stepGoal ?? 10000).toLocaleString()}</button>` : ''}</section>`;
}
const HOUR = 56;
function todayView(stats) {
  const progress = scheduleProgress(state, day),
    { timed, untimed } = timelineFor(state, day),
    now = new Date(),
    nowMin = day === dateKey() ? now.getHours() * 60 + now.getMinutes() : null;
  const block = (i) => {
    const style = `top:${(i.start / 60) * HOUR}px;height:${Math.max(((i.end - i.start) / 60) * HOUR - 3, 34)}px;left:calc(var(--gutter) + (100% - var(--gutter)) * ${i.lane} / ${i.lanes});width:calc((100% - var(--gutter)) / ${i.lanes} - 4px)`;
    if (i.kind === 'event')
      return `<div class="slot slot-event ${i.done ? 'is-done' : ''} ${i.end - i.start < 60 ? 'short' : ''}" style="${style}"><label class="check-hit"><input class="check" type="checkbox" data-task="${esc(i.id)}" aria-label="Complete ${esc(i.name)}" ${i.done ? 'checked' : ''}></label><span class="grow"><strong>${esc(i.name)}</strong><small>${esc(i.time)} – ${fromMinutes(i.end % 1440)}</small></span><button class="text-button" data-edit-task="${esc(i.id)}" aria-label="Edit ${esc(i.name)}">⋯</button></div>`;
    if (i.kind === 'task')
      return `<div class="slot slot-task ${i.done ? 'is-done' : ''}" style="${style}"><label class="check-hit"><input class="check" type="checkbox" data-task="${esc(i.id)}" aria-label="Complete ${esc(i.name)}" ${i.done ? 'checked' : ''}></label><span class="grow">${esc(i.name)}</span><small>${esc(i.time)}</small><button class="text-button" data-edit-task="${esc(i.id)}" aria-label="Edit ${esc(i.name)}">⋯</button></div>`;
    const session = state.sessions[sessionKey(day, i.id)];
    const count = (
      session?.exercises ??
      state.templates.find((t) => t.name === i.name)?.exercises ??
      []
    ).length;
    return `<div class="slot slot-workout ${session?.completed ? 'is-done' : ''} ${i.end - i.start < 60 ? 'short' : ''}" style="${style}"><button class="slot-open" data-open-activity="${esc(i.id)}" aria-label="${session?.completed ? 'View' : 'Open'} ${esc(i.name)} →"><strong>${esc(i.name)}${session?.completed ? ' ✓' : ''}</strong><small>${esc(i.time)} – ${fromMinutes(i.end % 1440)} · ${i.type === 'run' ? 'Run' : count + ' exercises'}</small></button><button class="text-button" data-time-activity="${esc(i.id)}" aria-label="Time for ${esc(i.name)}">⋯</button></div>`;
  };
  return `${stepsView()}<div class="day-summary"><p><strong>${progress.completed}</strong> of ${progress.total} done${stats.current ? ` · <span class="accent">✦ ${stats.current}-day streak</span>` : ''}</p><p class="schedule-caption">${progress.total ? (progress.left ? 'One thing at a time. You’ve got this.' : 'Everything planned, done. Nice work.') : 'A clear day. Tap ＋ to plan something.'}</p></div>${
    untimed.length
      ? `<button class="needs-time" id="place-times"><span>${untimed.length} ${untimed.length === 1 ? 'item needs' : 'items need'} a time</span><span class="accent">Place ${untimed.length === 1 ? 'it' : 'them'} →</span></button>`
      : ''
  }<section class="timeline" id="timeline" aria-label="Day timeline"><div class="timeline-grid" style="height:${24 * HOUR}px">${Array.from(
    { length: 24 },
    (_, h) => `<div class="hour" style="top:${h * HOUR}px"><span>${h}:00</span></div>`,
  ).join(
    '',
  )}${nowMin === null ? '' : `<div class="now-line" style="top:${(nowMin / 60) * HOUR}px" aria-label="Now ${fromMinutes(nowMin)}"></div>`}${timed.map(block).join('')}</div></section>${
    timed.length || untimed.length
      ? ''
      : '<p class="empty">A well-earned rest. Recovery belongs in your plan.</p>'
  }`;
}
function placeTimesEditor() {
  const { untimed } = timelineFor(state, day);
  openEditor(
    'Give everything a time',
    `<p class="muted">Every task and workout lives at a time on your day. Workouts keep their time every week unless you change it.</p>${untimed
      .map(
        (i) =>
          `<div class="fieldgrid"><div><label for="place-${esc(i.id)}">${esc(i.name)}</label><input id="place-${esc(i.id)}" type="time" required name="${i.kind}:${esc(i.id)}" value="${i.kind === 'task' ? '09:00' : defaultTime(i.type)}"></div>${i.kind === 'activity' ? `<div><label for="dur-${esc(i.id)}">Minutes</label><input id="dur-${esc(i.id)}" type="number" min="5" max="600" required name="duration:${esc(i.id)}" value="${i.type === 'run' ? 45 : 60}"></div>` : ''}</div>`,
      )
      .join('')}`,
    (form) => {
      for (const i of untimed) {
        const time = form.get(`${i.kind}:${i.id}`);
        if (i.kind === 'task') state.tasks.find((t) => t.id === i.id).time = time;
        else setActivityTime(i.id, time, Number(form.get(`duration:${i.id}`)), false);
      }
    },
  );
}
function setActivityTime(id, time, duration, onlyToday) {
  if (onlyToday && !state.dayPlans[day])
    state.dayPlans[day] = structuredClone(activitiesOn(state, day));
  const list = state.dayPlans[day] ?? state.schedule[localDate(day).getDay()];
  const a = list.find((a) => a.id === id);
  a.time = time;
  a.duration = duration;
}
function activityTimeEditor(id) {
  const a = activitiesOn(state, day).find((a) => a.id === id),
    t = activityTime(state, a) ?? {
      time: defaultTime(a.type),
      duration: a.type === 'run' ? 45 : 60,
    },
    weekly = !state.dayPlans[day];
  openEditor(
    `${esc(a.name)} · ${fmt(day)}`,
    `<div class="fieldgrid"><div><label for="act-time">Start time</label><input id="act-time" name="time" type="time" required value="${esc(t.time)}"></div><div><label for="act-duration">Minutes</label><input id="act-duration" name="duration" type="number" min="5" max="600" required value="${t.duration}"></div></div>${weekly ? `<label class="repeat-workout"><input type="checkbox" name="only"> Only on ${fmt(day)} (otherwise every ${weekdays[localDate(day).getDay()]})</label>` : ''}<button type="button" class="secondary" id="move-from-time">Move to another day</button>`,
    (form) => setActivityTime(id, form.get('time'), Number(form.get('duration')), form.has('only')),
  );
  $('move-from-time').onclick = () => moveWorkoutEditor(id);
}
function scrollTimeline() {
  const box = $('timeline');
  if (!box || box.dataset.scrolled) return;
  const { timed } = timelineFor(state, day),
    n = new Date(),
    target = day === dateKey() ? n.getHours() * 60 + n.getMinutes() : (timed[0]?.start ?? 8 * 60);
  box.scrollTop = Math.max(0, (target / 60 - 1) * HOUR);
  box.dataset.scrolled = '1';
}
function workoutView() {
  const s = activeSession();
  if (!s) return '';
  if (s.type === 'run') return runView(s);
  const checked = s.exercises.flatMap((e) => e.sets).filter((s) => s.done).length,
    total = s.exercises.reduce((n, e) => n + e.sets.length, 0);
  return `<button class="back" id="back-workout">← Your day</button><div class="section-head"><h2>${esc(s.plan)} · ${fmt(day)}</h2><span class="pill">${checked}/${total} SETS</span></div><p class="save-note" data-save-status>${saveStatus}</p><progress max="${total || 1}" value="${checked}"></progress>${s.exercises
    .map((e, i) => {
      const prev = previousExercise(state, e.name, day);
      return `<section class="card exercise"><div class="section-head" style="margin:0"><h3>${esc(e.name)}</h3><div class="exercise-actions"><button class="text-button" data-exercise-swap="${i}" ${s.completed ? 'disabled' : ''}>Swap</button><button class="text-button" data-exercise-edit="${i}" ${s.completed ? 'disabled' : ''}>Edit</button></div></div>${!s.completed ? `<button class="text-button danger" data-exercise-remove="${i}" aria-label="Remove ${esc(e.name)} from this workout">Remove from this workout</button>` : ''}<p class="previous">${prev ? `Last time · ${fmt(prev.date)} · shown beside each set` : 'Your first logged session. Every rep starts somewhere.'}</p>${e.note ? `<p class="muted">${esc(e.note)}</p>` : ''}<div class="set-head"><span>SET TYPE</span><span>KG</span><span>REPS</span><span>LAST TIME</span><span>DONE</span></div>${e.sets
        .map(
          (set, j) =>
            `<div class="set-row"><select data-kind="${i},${j}" aria-label="${esc(e.name)} set ${j + 1} type" ${s.completed ? 'disabled' : ''}><option value="warmup" ${set.kind === 'warmup' ? 'selected' : ''}>Warm-up</option><option value="working" ${set.kind === 'working' ? 'selected' : ''}>Working</option></select><input data-set="${i},${j},kg" required type="number" inputmode="decimal" min="0" max="2000" step="any" value="${set.kg}" aria-label="${esc(e.name)} set ${j + 1} kg" ${s.completed ? 'disabled' : ''}><input data-set="${i},${j},reps" required type="number" inputmode="decimal" min="0.5" max="1000" step="0.5" placeholder="Reps" value="${set.reps || ''}" aria-label="${esc(e.name)} set ${j + 1} reps" ${s.completed ? 'disabled' : ''}><span class="set-last" aria-label="Previous results for set ${j + 1}">${(() => {
              const last = previousSet(e, j, prev);
              return last ? `${last.kg} kg <span>× ${last.reps}</span>` : '—';
            })()}</span><label class="check-hit"><input class="check" type="checkbox" data-done="${i},${j}" aria-label="Complete ${esc(e.name)} set ${j + 1}" ${set.done ? 'checked' : ''} ${s.completed ? 'disabled' : ''}></label></div>`,
        )
        .join('')}</section>`;
    })
    .join(
      '',
    )}<details class="workout-tools"><summary>Share & routine options</summary><button class="secondary" id="export-workout-photo">Export workout photo ↗</button><button class="secondary" id="save-session-plan">Use these exercises as my plan</button></details><button class="secondary" id="add-exercise" ${s.completed ? 'disabled' : ''}>＋ Add exercise</button>${s.completed ? '<p class="empty">Workout completed ✓</p><button id="reopen-workout" class="secondary">Edit saved results</button>' : `<button class="primary" id="finish-workout" ${total === 0 || checked !== total || day > dateKey() ? 'disabled' : ''}>Finish workout ✓</button><p class="muted">Check every set to finish. Changes save as you go.${day > dateKey() ? ' Future workouts cannot be completed yet.' : ''}</p>`}`;
}
function runSummary(s) {
  const c = runComparison(state, s),
    seconds = runSeconds(s),
    delta = (n) =>
      n === null
        ? 'Add your time to compare.'
        : n > 0
          ? `${formatRunTime(n)} faster`
          : n < 0
            ? `${formatRunTime(-n)} slower`
            : 'Same time';
  return `<div class="run-metrics"><div><small>YOUR TIME</small><strong>${seconds ? formatRunTime(seconds) : '—'}</strong></div><div><small>PACE / KM</small><strong>${runPace(s)}</strong></div></div>${
    c.last
      ? `<div class="run-compare-grid">${[
          ['Last time', c.last, c.deltaLast],
          ['Previous best', c.best, c.deltaBest],
        ]
          .map(
            ([label, r, d]) =>
              `<div class="previous"><small>${label} · ${fmt(r.date)}</small><b>${formatRunTime(runSeconds(r))}</b><span>${runPace(r)}</span><p class="run-comparison ${d < 0 ? 'run-slower' : ''}">${delta(d)}</p></div>`,
          )
          .join(
            '',
          )}</div><p class="muted run-scope">Compared over the same ${s.km} km.${c.deltaBest > 0 ? (s.completed ? ' A new best for this run.' : ' A new best—finish this run to save it.') : ''}</p>`
      : `<p class="muted">${s.km > 0 ? 'No earlier completed ' + s.km + ' km runs yet. Your next one will have a comparison.' : 'Enter a distance to compare runs over the same distance.'}</p>`
  }${c.previous.length ? `<details class="run-history"><summary>Your ${s.km} km history (${c.previous.length})</summary>${c.previous.map((r) => `<div class="row"><span class="time">${fmt(r.date)}</span><b class="grow">${formatRunTime(runSeconds(r))}</b><span class="muted">${runPace(r)}</span></div>`).join('')}</details>` : ''}<div class="run-linked-goals">${(
    state.runGoals ?? []
  )
    .filter((g) => Math.round(g.km * 100) === Math.round(s.km * 100))
    .map((g) => {
      const target =
        g.seconds === null ? `${g.km} km` : `${g.km} km in ${formatRunTime(g.seconds)}`;
      const met = seconds > 0 && (g.seconds === null || seconds <= g.seconds);
      return `<p class="previous">Your goal · ${target}<br>${met ? (s.completed ? 'Goal reached ✓' : 'On target—finish the run to save it.') : g.seconds && seconds ? formatRunTime(seconds - g.seconds) + ' away from your target time.' : 'Your next little challenge.'}</p>`;
    })
    .join('')}</div>`;
}
function runningGoalsView() {
  return `<section class="card running-goals"><div class="section-head" style="margin-top:0"><h2>A little further.</h2><button id="add-run-goal" class="text-button">＋ Goal</button></div><p class="muted">Choose a distance, or a time to aim for over that distance.</p>${(
    state.runGoals ?? []
  )
    .map((g) => {
      const r = runGoalResult(state, g);
      return `<div class="row"><div class="grow"><b>${g.km} km${g.seconds ? ' in ' + formatRunTime(g.seconds) : ''}</b><p class="muted">${r.achieved ? 'Reached · ' + fmt(r.achieved.date) + ' ✓' : r.best ? (g.seconds ? `Best ${formatRunTime(runSeconds(r.best))} · ${formatRunTime(r.remaining)} to go` : `Longest ${r.best.km} km`) : 'A fresh goal. Your completed runs will count here.'}</p></div><button class="text-button" data-edit-run-goal="${esc(g.id)}" aria-label="Edit ${g.km} km goal">Edit</button></div>`;
    })
    .join('')}</section>`;
}
function runGoalEditor(id) {
  const goal = (state.runGoals ?? []).find((g) => g.id === id);
  openEditor(
    goal ? 'Your running goal' : 'A new running goal',
    `<label for="goal-km">Distance (km)</label><input id="goal-km" name="km" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" required value="${goal?.km ?? activeSession()?.km ?? ''}"><label for="goal-time">Target time (optional, minutes:seconds)</label><input id="goal-time" name="time" inputmode="text" placeholder="14:30" value="${goal?.seconds ? formatRunTime(goal.seconds) : ''}"><p class="muted">Leave time blank to aim for completing this distance or further. Time goals compare completed runs at exactly this distance. Your existing runs count, too.</p>${goal ? '<button id="remove-run-goal" type="button" class="text-button danger">Remove goal</button>' : ''}`,
    (form) => {
      const km = Number(form.get('km')),
        seconds = form.get('time').trim() ? parseRunTime(form.get('time')) : null;
      if (!Number.isFinite(km) || km <= 0 || km > 1000) throw new Error('Enter a valid distance.');
      state.runGoals ??= [];
      if (!goal && state.runGoals.length >= 100) throw new Error('Keep up to 100 running goals.');
      const next = { id: goal?.id ?? uid(), km, seconds };
      state.runGoals = goal
        ? state.runGoals.map((g) => (g.id === goal.id ? next : g))
        : [...state.runGoals, next];
    },
  );
  if (goal)
    $('remove-run-goal').onclick = async () => {
      state.runGoals = state.runGoals.filter((g) => g.id !== goal.id);
      await persist();
      $('editor').close();
      render();
      toast('Goal removed.', async () => {
        state.runGoals.push(goal);
        await persist();
        keepScroll();
      });
    };
}
function runView(s) {
  return `<button class="back" id="back-workout">← Your day</button><section class="card"><p class="eyebrow">RUN · ${fmt(day)}</p><h2>A little fresh air.</h2><p class="muted">No numbers to fill in. Just show up for yourself.</p>${s.completed ? '<p>Run done ✓</p><button id="reopen-workout" class="secondary">Mark as not done</button>' : `<button class="primary" id="finish-run" ${day > dateKey() ? 'disabled' : ''}>Mark run as done ✓</button>`}</section>`;
}

function plansView() {
  const names = progressExerciseNames(state);
  if (!names.includes(graphExercise)) graphExercise = names[0] ?? '';
  const points = exerciseProgress(state, graphExercise, graphRange),
    last = points.at(-1),
    first = points[0];
  return `<div class="workout-tabs" role="group" aria-label="Workout view"><button data-workout-tab="routines" aria-pressed="${workoutTab === 'routines'}">Your routines</button><button data-workout-tab="chart" aria-pressed="${workoutTab === 'chart'}">Exercise progress</button></div>${
    workoutTab === 'routines'
      ? routinesView()
      : `<label for="graph-exercise">Exercise</label><select id="graph-exercise">${names.map((n) => option(n, graphExercise)).join('')}</select><div class="graph-ranges" role="group" aria-label="Time range">${[
          ['week', 'Week'],
          ['month', 'Month'],
          ['all', 'All time'],
        ]
          .map(
            ([key, name]) =>
              `<button data-graph-range="${key}" aria-pressed="${graphRange === key}">${name}</button>`,
          )
          .join(
            '',
          )}</div><div class="graph-metrics" role="group" aria-label="Progress measure"><button data-graph-metric="kg" aria-pressed="${graphMetric === 'kg'}">Weight</button><button data-graph-metric="reps" aria-pressed="${graphMetric === 'reps'}">Reps</button></div>${last ? `<p class="graph-latest">${last[graphMetric]} <small>${graphMetric === 'kg' ? 'kg' : 'reps'} · latest</small></p><p class="muted">${last[graphMetric] - first[graphMetric] >= 0 ? '+' : ''}${last[graphMetric] - first[graphMetric]} ${graphMetric === 'kg' ? 'kg' : 'reps'} since ${fmt(first.date)}</p><p class="muted">${graphMetric === 'kg' ? 'Heaviest working set per session' : 'Reps in the heaviest working set'} · warm-ups excluded</p><div id="workout-graph"><div class="workout-plot"><svg role="img" aria-label="Exercise progress"></svg><button data-chart-tap aria-label="Tap the graph or use arrow keys to inspect a session"></button></div><div class="graph-selection"><button data-point-prev aria-label="Previous session">←</button><span data-chart-detail aria-live="polite"></span><button data-point-next aria-label="Next session">→</button></div></div><p class="graph-note">Look at you showing up.</p>` : '<p class="empty">No completed working sets in this period. Log a workout or choose another range to see your progress.</p>'}`
  }`;
}
function routinesView() {
  return `<p class="muted">Reusable routines, ready for your next session.</p><div class="plan-actions"><button class="primary" id="add-plan">＋ Create plan</button><button class="secondary" id="notes-plan">Import note</button></div>${state.templates.length ? '<label class="sr-only" for="plan-search">Search workout plans</label><input type="search" id="plan-search" placeholder="Find a plan or exercise…" autocomplete="off">' : ''}${state.templates.map((t) => `<section class="card plan-card" data-plan-card data-search="${esc((t.name + ' ' + t.exercises.map((e) => e.name).join(' ')).toLowerCase())}"><div class="section-head" style="margin:0"><h2>${esc(t.name)}</h2><button class="text-button" data-plan="${esc(t.id)}" aria-label="Edit ${esc(t.name)} plan">Edit plan</button></div><p class="muted">${t.exercises.length} ${t.exercises.length === 1 ? 'exercise' : 'exercises'} · ${t.exercises.reduce((n, e) => n + e.sets.length, 0)} sets</p>${t.exercises.length ? `<details><summary>Exercises</summary>${t.exercises.map((e, index) => `<button class="plan-exercise" data-template-exercise="${esc(t.id)}" data-index="${index}"><span>${esc(e.name)}<small>${e.sets.length} sets · ${e.sets.filter((s) => s.kind === 'warmup').length} warm-up</small></span><span>↗</span></button>`).join('')}</details>` : '<p class="muted">Add your first exercise below. Choose sets and warm-ups as you go.</p>'}<button class="secondary" data-template-add="${esc(t.id)}">＋ Add exercise</button></section>`).join('') || '<p class="empty">Create a plan, add exercises, then use its name in your schedule.</p>'}<p id="no-plans-found" class="empty" hidden>No matching plans. Try another name.</p>`;
}
function recapView() {
  const r = weeklyRecap(state, recapAnchor);
  return `<section class="card weekly-recap" aria-label="Weekly recap"><div class="recap-heading"><div><p class="eyebrow">${r.partial ? 'YOUR WEEK SO FAR' : 'A WEEK TO REMEMBER'}</p><h2>Little wins, added up.</h2></div>${face}</div><div class="recap-picker"><button id="recap-prev" class="text-button" aria-label="Previous recap week">←</button><span>${fmt(r.start)} – ${fmt(r.end)} · ${localDate(r.end).getFullYear()}</span><button id="recap-next" class="text-button" aria-label="Next recap week" ${r.end >= dateKey() ? 'disabled' : ''}>→</button></div><div class="recap-days">${r.days.map((d, i) => `<div class="${d.future || d.beforeStart ? 'recap-future' : ''}"><small>${weekdays[i].slice(0, 1)}</small><span aria-label="${weekdays[i]}: ${d.future ? 'upcoming' : d.beforeStart ? 'before tracking started' : d.complete ? 'training complete' : d.rest ? 'rest day' : 'not completed'}">${d.future || d.beforeStart ? '·' : d.complete ? '✓' : d.rest ? '—' : '○'}</span></div>`).join('')}</div><p class="recap-legend">✓ Training complete · — Rest day</p><div class="recap-numbers"><div><strong>${r.lifts}</strong><span>Lifting sessions</span></div><div><strong>${r.runs}</strong><span>Runs completed</span></div><div><strong>${r.tasksDone}<small> / ${r.tasksTotal}</small></strong><span>Tasks completed</span></div></div><p class="subtle recap-scope">${r.partial ? 'Through today' : 'For this week'} · ${r.trainingDone} of ${r.trainingTotal} scheduled activities completed. Rest days stay safe.</p><p class="recap-message">“${esc(r.message)}” <span>— Shavit</span></p></section>`;
}
function progressView(stats) {
  return `${recapView()}<div class="stats">${[
    [stats.current, 'Training-day streak'],
    [stats.best, 'Best streak'],
    [stats.total, 'Workouts logged'],
    [stats.missed, 'Scheduled days missed'],
  ]
    .map(
      ([n, l]) =>
        `<section class="card"><strong>${n}</strong><small class="muted">${l}</small></section>`,
    )
    .join(
      '',
    )}</div><p class="muted">Streaks count days with all scheduled activities completed from ${fmt(state.start)}. Rest days never break them. Today isn’t missed until the day ends.</p><div class="section-head"><h2>Your history</h2></div><div class="history-filters" role="group" aria-label="Filter history">${[
    ['all', 'All'],
    ['lift', 'Lifting'],
    ['run', 'Runs'],
  ]
    .map(
      ([key, label]) =>
        `<button data-history-filter="${key}" aria-pressed="${historyFilter === key}">${label}</button>`,
    )
    .join('')}</div>${
    Object.values(state.sessions)
      .filter((s) => s.completed && (historyFilter === 'all' || s.type === historyFilter))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (s) =>
          `<button class="card row" style="width:100%;text-align:left" data-history="${esc(sessionKey(s.date, s.activityId))}"><span class="time">${fmt(s.date)}</span><div class="grow"><b>${esc(s.plan)}</b><p class="muted">${s.type === 'run' ? 'Completed ✓' : `${s.exercises.length} exercises · ${s.exercises.reduce((n, e) => n + e.sets.filter((s) => s.kind === 'working').length, 0)} working sets`}</p></div><span>↗</span></button>`,
      )
      .join('') ||
    '<p class="empty">No ' +
      (historyFilter === 'all'
        ? 'workouts'
        : historyFilter === 'run'
          ? 'runs'
          : 'lifting sessions') +
      ' logged here yet.</p>'
  }`;
}
function settingsView() {
  return `${connectionsView()}<section class="card"><h2>Your rhythm</h2><p class="muted">Sunday-start weeks · weights in kg</p><button class="secondary" id="edit-schedule">Edit weekly schedule</button>${isNative ? `<button class="secondary" id="activity-reminders">${state.activityReminders === false ? 'Enable' : 'Turn off'} task & gym reminders</button><details class="quiet-details"><summary>When reminders arrive</summary><p class="muted">Tasks: 45 minutes before, or about 2 minutes after adding a last-minute task. Gym: 19:00 on lifting days if no training is completed. Open Shavit regularly to refresh reminders.</p></details><button class="secondary" id="reminder">${state.reminder ? 'Turn off' : 'Enable'} 9:00 AM reminder</button><p class="muted">${isNative ? 'A daily nudge, scheduled on your phone.' : 'Daily background reminders are available in the installed iPhone app.'}</p>` : '<p class="muted">Calendar sync and background reminders are available in the iPhone app. Browser plans save here automatically.</p>'}</section><section class="card"><h2>Your look</h2><p class="muted">Pick a theme. It changes on this device only.</p><div class="theme-picks" role="group" aria-label="Theme">${THEMES.map((t) => `<button class="secondary theme-pick" data-theme-pick="${t.id}" aria-pressed="${themeOf(state) === t.id}"><span class="theme-swatch theme-swatch-${t.id}" aria-hidden="true"></span><span>${t.name}<small>${t.note}</small></span></button>`).join('')}</div></section><section class="card"><h2>Only on your device.</h2><p class="muted">No account and no cloud sync. Keep a backup before changing phones or clearing browser data. Your website and installed app store data separately.</p><button class="secondary" id="export">Export backup</button><button class="secondary" id="import">Import backup / workout file</button></section><section class="card"><h2>Hey, I’m still Shavit.</h2><button id="tutorial" class="secondary">Show me the basics</button><button id="meet-helper" class="secondary">Meet Shavit</button><p class="muted">Your day, your training, your cool friend.</p><details class="patch-notes"><summary>What’s new · 15 November</summary><ul><li>The planner and workouts are back on the website, with a first-time tutorial.</li><li>A calmer workout screen, searchable exercise swaps and unfinished tasks shown first.</li><li>Exercise progress graphs in Workouts, with weight, reps and time-range views.</li><li>Optional main-calendar sync with deletion and conflict reviews.</li><li>Move a workout for one day; choose to combine or swap when the destination is busy.</li><li>Half reps, task sharing, and task / evening gym reminders.</li><li>Completed workouts update the weights and reps in your routine.</li><li>Runs are now a simple done button.</li><li>Saved exercises appear as quick choices when swapping.</li><li>Swap an exercise just for this day, or update your saved routine.</li><li>Export your workout as a Notes-style image, with Shavit’s smile.</li><li>Previous kg and reps beside each set, matched by warm-up or working set.</li><li>A weekly recap in Progress, with runs, lifts, tasks and a note from Shavit.</li><li>A fresh Midnight notebook look: warm text, softer blues and journal-style headings.</li><li>Build workout plans one exercise at a time.</li><li>Previous weights and reps fill your next session.</li><li>Quick calendar jump, plan search and history filters.</li><li>Easier run time entry and larger phone controls.</li><li>Weekly edits keep one-off workouts in place.</li></ul></details><a href="/privacy.html">Privacy</a> · <a href="/support.html">Help</a></section>`;
}
function suggestedTime() {
  if (day !== dateKey()) return '09:00';
  const n = new Date(),
    m = Math.min(Math.ceil((n.getHours() * 60 + n.getMinutes() + 1) / 30) * 30, 23 * 60 + 30);
  return fromMinutes(m);
}
function addChooser() {
  openEditor(
    'What are you adding?',
    `<div class="add-choice"><button type="button" class="secondary" id="add-kind-task"><strong>Task</strong><small>A to-do at a time. Read 10 pages, groceries.</small></button><button type="button" class="secondary" id="add-kind-event"><strong>Event</strong><small>Something with a start and an end. Meeting friends, a class.</small></button></div>`,
    () => {},
    null,
  );
  $('add-kind-task').onclick = () => taskEditor(null, 'task');
  $('add-kind-event').onclick = () => taskEditor(null, 'event');
}
function taskEditor(id, newKind = 'task') {
  const t = state.tasks.find((t) => t.id === id),
    kind = t ? taskKind(t) : newKind,
    isEvent = kind === 'event',
    word = isEvent ? 'event' : 'task',
    startTime = t?.time || suggestedTime(),
    endTime = fromMinutes(
      Math.min(toMinutes(startTime) + (t ? eventDuration(t) : 60), 23 * 60 + 59),
    );
  openEditor(
    t ? `Edit ${word}` : isEvent ? 'Add an event' : 'Make room for something',
    `<label for="task-name">${isEvent ? 'Event' : 'Task'}</label><input id="task-name" name="name" required maxlength="100" value="${esc(t?.name)}" placeholder="${isEvent ? 'Dinner with Eitan' : 'Read 10 pages'}"><div class="fieldgrid"><div><label for="task-time">${isEvent ? 'Starts' : 'Time'}</label><input id="task-time" name="time" type="time" required value="${esc(startTime)}"></div>${isEvent ? `<div><label for="task-end">Ends</label><input id="task-end" name="end" type="time" required value="${esc(endTime)}"></div></div><div class="fieldgrid">` : ''}<div><label for="task-date">One-time date</label><input id="task-date" name="date" type="date" value="${t?.date ?? day}"></div></div><p class="muted">For a repeating task, choose days below. Otherwise it’s just for the date above.</p><div class="days-pick">${weekdays.map((d, i) => `<label><input type="checkbox" name="days" value="${i}" ${t && !t.date && t.days.includes(i) ? 'checked' : ''}>${d.slice(0, 3)}</label>`).join('')}</div><label class="repeat-workout"><input type="checkbox" name="notify" ${t?.notify === false ? '' : 'checked'}> Remind me before this task</label><p class="muted">For timed tasks: 45 minutes before. Last-minute additions get a reminder in about 2 minutes.</p>${t ? '<button type="button" id="share-task" class="secondary">Share via Messages / WhatsApp ↗</button><button type="button" id="delete-task" class="text-button">Remove task</button>' : ''}`,
    (form) => {
      const days = form.getAll('days').map(Number),
        task = {
          ...t,
          id: t?.id ?? uid(),
          kind,
          ...(isEvent
            ? { duration: toMinutes(form.get('end')) - toMinutes(form.get('time')) }
            : {}),
          name: form.get('name').trim(),
          time: form.get('time'),
          days,
          date: days.length ? '' : form.get('date'),
          start: t?.start ?? day,
          done: t?.done ?? [],
          notify: form.has('notify'),
          calendarAllDay: t?.calendarAllDay && !form.get('time'),
          reminderAddedAt:
            !t ||
            t.time !== form.get('time') ||
            t.date !== (days.length ? '' : form.get('date')) ||
            (t.notify === false && form.has('notify'))
              ? Date.now()
              : (t.reminderAddedAt ?? 0),
        };
      if (!task.name || (!days.length && !task.date))
        throw new Error(`Give your ${word} a name and a date or repeat days.`);
      if (isEvent && !(task.duration > 0)) throw new Error('The event has to end after it starts.');
      state.tasks = t ? state.tasks.map((x) => (x.id === t.id ? task : x)) : [...state.tasks, task];
    },
  );
  if (t)
    $('share-task').onclick = async () => {
      try {
        const form = new FormData($('editor-form')),
          name = String(form.get('name')).trim(),
          time = String(form.get('time'));
        if (!name) {
          toast('Add a task name before sharing.');
          return;
        }
        const chosenDate = form.getAll('days').length ? day : String(form.get('date'));
        if (!chosenDate) {
          toast('Choose a date before sharing.');
          return;
        }
        await Share.share({
          title: 'Do this together?',
          text: taskInvitation({ ...t, name, time }, chosenDate),
          dialogTitle: 'Invite someone',
        });
      } catch {
        toast('Sharing closed or unavailable.');
      }
    };
  if (t)
    $('delete-task').onclick = async () => {
      const removed = structuredClone(t);
      state.tasks = state.tasks.filter((x) => x.id !== t.id);
      await persist();
      $('editor').close();
      render();
      toast(isEvent ? 'Event removed.' : 'Task removed.', async () => {
        if (!state.tasks.some((x) => x.id === removed.id)) state.tasks.push(removed);
        await persist();
        keepScroll();
      });
    };
}
function planEditor(id, text = '') {
  const t = state.templates.find((t) => t.id === id),
    note =
      text ||
      (t
        ? t.exercises
            .map(
              (e) =>
                `${e.name} ${e.sets.map((s) => `${s.kg}x${s.reps}`).join(' ')}${e.note ? '\n' + e.note : ''}`,
            )
            .join('\n')
        : '');
  openEditor(
    t ? 'Edit workout plan' : 'Your workout plan',
    `<label for="plan-name">Plan name</label><input id="plan-name" name="name" required maxlength="80" value="${esc(t?.name)}" placeholder="Push"><details class="paste-plan"><summary>Paste a workout note (optional)</summary><label for="plan-note">Workout note</label><textarea id="plan-note" name="note" placeholder="Bench press 40x8 60x6 60x6">${esc(note)}</textarea><p class="muted">One exercise per line. First set is warm-up; the others are working sets. Leave this blank to build the plan exercise by exercise.</p></details><label for="plan-date">Also save as completed history (optional date)</label><input id="plan-date" type="date" name="date" max="${dateKey()}"><p class="muted">Review the names, weights and reps before saving.</p>`,
    (form) => {
      const parsed = form.get('note').trim()
        ? parseWorkout(form.get('note'), form.get('name'))
        : { id: uid(), name: form.get('name').trim(), exercises: [] };
      if (t)
        for (const e of parsed.exercises) {
          const old = t.exercises.find((x) => x.name === e.name);
          e.sets.forEach((set, index) => {
            if (old?.sets[index]) set.kind = old.sets[index].kind;
          });
        }
      if (!parsed.name) throw new Error('Name your plan.');
      if (
        state.templates.some(
          (x) => x.id !== t?.id && x.name.toLowerCase() === parsed.name.toLowerCase(),
        )
      )
        throw new Error('A plan with that name already exists. Edit it or choose another name.');
      if (t && t.name !== parsed.name) {
        for (const list of [
          ...state.schedule,
          ...Object.entries(state.dayPlans)
            .filter(([date]) => date >= dateKey())
            .map(([, items]) => items),
        ])
          for (const activity of list)
            if (activity.type === 'lift' && activity.name === t.name) activity.name = parsed.name;
        for (const session of Object.values(state.sessions))
          if (!session.completed && session.date >= dateKey() && session.plan === t.name)
            session.plan = parsed.name;
      }
      parsed.id = t?.id ?? parsed.id;
      state.templates = t
        ? state.templates.map((x) => (x.id === t.id ? parsed : x))
        : [...state.templates.filter((x) => x.name !== parsed.name), parsed];
      const date = form.get('date');
      if (date) {
        if (!parsed.exercises.length)
          throw new Error('Add exercises before saving completed history.');
        if (date > dateKey()) throw new Error('History must be today or earlier.');
        const activity = activitiesOn(state, date).find(
          (a) => a.name === parsed.name && a.type === 'lift',
        ) ?? { id: 'import-' + parsed.id, name: parsed.name, type: 'lift' };
        if (Object.values(state.sessions).some((s) => s.date === date && s.plan === parsed.name))
          throw new Error('That workout is already logged on this date.');
        state.sessions[sessionKey(date, activity.id)] = {
          date,
          activityId: activity.id,
          type: 'lift',
          plan: parsed.name,
          completed: true,
          exercises: structuredClone(parsed.exercises).map((e) => ({
            ...e,
            sets: e.sets.map((s) => ({ ...s, done: true })),
          })),
        };
      }
    },
  );
}
function moveWorkoutEditor(id) {
  const source = day,
    activity = activitiesOn(state, source).find((a) => a.id === id);
  if (!activity) return;
  openEditor(
    'Move this workout',
    `<p class="muted">${esc(activity.name)} · ${fmt(source)}. This changes only these dates, not your weekly routine. Any sets you’ve started come with you.</p><label for="move-date">Move to</label><input type="date" id="move-date" name="date" min="${dateKey()}" value="${shiftDate(source >= dateKey() ? source : dateKey(), 1)}" required><div id="move-choice"></div>`,
    (form) => {
      moveWorkout(
        state,
        source,
        form.get('date'),
        id,
        form.get('mode') || 'alongside',
        form.get('swap'),
      );
      day = form.get('date');
      sessionMode = false;
    },
    'Move workout',
  );
  const choices = () => {
    const target = $('move-date').value,
      items = target && target !== source ? activitiesOn(state, target) : [];
    $('move-choice').innerHTML = items.length
      ? `<p class="muted">That day already has ${items.map((a) => esc(a.name)).join(', ')}. What would you like to do?</p><label for="move-mode">Your choice</label><select id="move-mode" name="mode"><option value="alongside">Keep both on the new day</option><option value="swap">Swap with a workout on that day</option></select><div id="swap-target"><label for="move-swap">Swap with</label><select id="move-swap" name="swap">${items.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}${state.sessions[sessionKey(target, a.id)]?.completed ? ' (completed — cannot swap)' : ''}</option>`).join('')}</select></div>`
      : '<p class="muted">A clear day. Your workout will move there once.</p>';
    if ($('move-mode')) {
      const update = () => ($('swap-target').hidden = $('move-mode').value !== 'swap');
      $('move-mode').onchange = update;
      update();
    }
  };
  $('move-date').onchange = choices;
  choices();
}
function addDayWorkout() {
  openEditor(
    'Add a workout',
    `<p class="muted">Add to ${weekdays[localDate(day).getDay()]} · ${fmt(day)}. Your workout stays saved after you close the app.</p><label for="new-workout-type">Activity</label><select id="new-workout-type" name="type"><option value="lift">Lift</option><option value="run">Run</option></select><div id="new-workout-name-field"><label for="new-workout-name">Workout name</label><input id="new-workout-name" name="name" list="existing-workout-plans" required maxlength="80" placeholder="Upper, Lower, Full body…"><datalist id="existing-workout-plans">${state.templates.map((t) => `<option value="${esc(t.name)}">`).join('')}</datalist></div><label class="repeat-workout"><input type="checkbox" name="repeat" checked> Repeat every ${weekdays[localDate(day).getDay()]}</label><p class="muted">Leave checked to keep it in your weekly schedule. Uncheck for just this date.</p>`,
    (form) => {
      const type = form.get('type'),
        activity = { id: uid(), name: type === 'run' ? 'Run' : form.get('name').trim(), type };
      addWorkoutToDay(state, day, activity, form.has('repeat'));
      activeId = activity.id;
      state.sessions[activeKey()] = createSession(state, day, activity);
      sessionMode = true;
    },
    'Add workout',
  );
  $('new-workout-type').onchange = () => {
    const run = $('new-workout-type').value === 'run';
    $('new-workout-name-field').hidden = run;
    $('new-workout-name').required = !run;
  };
}
function syncNewPlan(session) {
  if (!session.syncPlan) return;
  const plan = state.templates.find((t) => t.name === session.plan);
  if (plan)
    plan.exercises = structuredClone(session.exercises).map((e) => {
      const source = e.routineOriginal ?? e;
      return { ...source, sets: source.sets.map((set) => ({ ...set, done: false })) };
    });
}
function swapEditor(index) {
  captureSetInputs();
  const session = activeSession(),
    exercise = session.exercises[index];
  const names = [
    ...new Set([
      ...state.templates.flatMap((t) => t.exercises.map((e) => e.name)),
      ...Object.values(state.sessions).flatMap((s) => (s.exercises ?? []).map((e) => e.name)),
    ]),
  ]
    .filter((n) => n.trim().toLowerCase() !== exercise.name.trim().toLowerCase())
    .sort((a, b) => a.localeCompare(b));
  openEditor(
    'Swap exercise',
    `<p class="muted">Instead of ${esc(exercise.name)} · ${fmt(day)}</p><label for="swap-search">Find a saved exercise</label><input id="swap-search" type="search" placeholder="Search exercises…" autocomplete="off"><div class="swap-choices" aria-label="Your saved exercises">${names.map((n) => `<button type="button" class="secondary" data-swap-choice="${esc(n)}">${esc(n)}</button>`).join('')}</div><label for="swap-name">Or type another exercise</label><input id="swap-name" name="name" list="swap-exercises" required maxlength="150" placeholder="Dumbbell shoulder press" autocomplete="off"><datalist id="swap-exercises">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist><p class="muted">Previous results fill in automatically. New exercises start fresh.</p>${exercise.sets.some((s) => s.done) ? '<p class="muted">This replaces the sets already checked for this exercise.</p>' : ''}<label class="repeat-workout"><input type="checkbox" name="permanent"> Also replace it in my saved routine</label><p class="muted">Leave unchecked for this day only. Other workouts and past results stay as they are.</p>`,
    (form) => {
      swapExercise(state, session, index, form.get('name'), form.has('permanent'));
      syncNewPlan(session);
    },
    'Swap exercise',
  );
  $('swap-search').oninput = () => {
    const q = $('swap-search').value.trim().toLowerCase();
    document
      .querySelectorAll('[data-swap-choice]')
      .forEach((b) => (b.hidden = !b.dataset.swapChoice.toLowerCase().includes(q)));
  };
  document.querySelectorAll('[data-swap-choice]').forEach(
    (b) =>
      (b.onclick = () => {
        $('swap-name').value = b.dataset.swapChoice;
        document
          .querySelectorAll('[data-swap-choice]')
          .forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      }),
  );
}
async function removeCurrentExercise(index) {
  captureSetInputs();
  const session = activeSession();
  if (!session || session.completed || !session.exercises[index]) return;
  const removed = structuredClone(session.exercises[index]);
  session.exercises.splice(index, 1);
  session.syncPlan = false;
  await persist();
  if ($('editor').open) $('editor').close();
  keepScroll();
  toast(removed.name + ' removed from this workout.', async () => {
    if (!session.exercises.some((e) => e.id === removed.id))
      session.exercises.splice(Math.min(index, session.exercises.length), 0, removed);
    await persist();
    keepScroll();
  });
}
function exerciseEditor(index, templateId = null) {
  const s = templateId ? state.templates.find((t) => t.id === templateId) : activeSession(),
    e = s.exercises[index];
  openEditor(
    e ? 'Edit exercise' : 'Add exercise',
    `<label for="exercise-name">Exercise name</label><input id="exercise-name" name="name" required maxlength="150" value="${esc(e?.name)}"><div class="fieldgrid"><div><label for="set-count">Total sets</label><input id="set-count" name="count" type="number" min="1" max="30" value="${e?.sets.length ?? 3}" required></div><div><label for="warm-count">Warm-up sets</label><input id="warm-count" name="warm" type="number" min="0" max="30" value="${e?.sets.filter((s) => s.kind === 'warmup').length ?? 1}" required></div></div><p id="working-count" class="muted"></p><label for="exercise-note">Note (optional)</label><input id="exercise-note" name="note" maxlength="300" value="${esc(e?.note)}">${e ? `<button type="button" id="remove-exercise" class="text-button danger">${templateId ? 'Remove exercise from routine' : 'Remove from this workout'}</button>` : ''}`,
    (form) => {
      const count = Number(form.get('count')),
        warm = Number(form.get('warm'));
      if (warm > count) throw new Error('Warm-up sets cannot exceed total sets.');
      const next = {
        id: e?.id ?? uid(),
        name: form.get('name').trim(),
        note: form.get('note'),
        sets: Array.from({ length: count }, (_, j) => ({
          ...e?.sets[j],
          kind: j < warm ? 'warmup' : 'working',
          kg: e?.sets[j]?.kg ?? 0,
          reps: e?.sets[j]?.reps ?? 0,
          done: e?.sets[j]?.done ?? false,
        })),
      };
      if (!next.name) throw new Error('Name the exercise.');
      if (e) s.exercises[index] = next;
      else s.exercises.push(next);
      syncNewPlan(s);
    },
  );
  const countText = () =>
    ($('working-count').textContent =
      `${Math.max(0, Number($('set-count').value) - Number($('warm-count').value))} working sets`);
  $('set-count').oninput = countText;
  $('warm-count').oninput = countText;
  countText();
  if (e)
    $('remove-exercise').onclick = async () => {
      if (!templateId) return removeCurrentExercise(index);
      const removed = structuredClone(e);
      s.exercises.splice(index, 1);
      syncNewPlan(s);
      await persist();
      $('editor').close();
      keepScroll();
      toast('Exercise removed.', async () => {
        if (!s.exercises.some((x) => x.id === removed.id)) s.exercises.splice(index, 0, removed);
        syncNewPlan(s);
        await persist();
        keepScroll();
      });
    };
}
function captureSetInputs() {
  let invalid = null;
  if (activeSession()?.type !== 'lift') return null;
  document.querySelectorAll('[data-set]').forEach((input) => {
    if (!input.checkValidity() || input.value === '') {
      invalid ??= input;
      return;
    }
    const [i, j, key] = input.dataset.set.split(',');
    activeSession().exercises[i].sets[j][key] = Number(input.value);
  });
  return invalid;
}
function scheduleDeviceRefresh() {
  if (!isIPhone() || !state?.onboarded) return;
  clearTimeout(deviceTimer);
  deviceTimer = setTimeout(() => refreshDeviceConnections(), 900);
}
async function refreshDeviceConnections(force = false) {
  if (!force && !deviceDirty && Date.now() - deviceLastRefresh < 30000) return;
  if (deviceBusy || !isIPhone() || !state || sessionMode || $('editor').open) return;
  deviceBusy = true;
  deviceDirty = false;
  deviceLastRefresh = Date.now();
  try {
    if (state.calendar?.enabled) {
      const original = state,
        baseline = JSON.stringify(state),
        copy = structuredClone(state);
      await reconcileCalendar(copy);
      if (
        state === original &&
        JSON.stringify(state) === baseline &&
        !sessionMode &&
        !$('editor').open
      ) {
        state = copy;
        await saveState(state);
        syncActivityReminders(state).catch(() => {});
        deviceError = '';
        if (view === 'today' || view === 'settings') keepScroll();
      }
    }
    if (healthEnabled && state.healthConnected) {
      const result = await Device.readSteps();
      stepCount = Number.isFinite(result.steps) ? result.steps : null;
      stepUpdated = result.updated ?? '';
      if (view === 'today' && !sessionMode && !$('editor').open) keepScroll();
    }
  } catch (e) {
    deviceError = e.message || 'Could not refresh your phone connection.';
    if (force) toast(deviceError);
  } finally {
    deviceBusy = false;
  }
}
async function connectMainCalendar() {
  if (!isIPhone()) {
    toast('Calendar sync works in the iPhone app.');
    return;
  }
  try {
    const result = await Device.connectCalendar();
    state.calendar = {
      enabled: true,
      id: result.id,
      name: result.name,
      links: {},
      pending: [],
      ignored: [],
      ignoredLocal: [],
    };
    deviceError = '';
    await persist();
    render();
    await refreshDeviceConnections(true);
  } catch (e) {
    toast(e.message);
  }
}
function reviewCalendarChange(index) {
  const pending = state.calendar.pending[index];
  if (!pending) return;
  const removed = pending.kind === 'local-delete',
    remoteRemoved = pending.kind === 'remote-delete';
  openEditor(
    'Review calendar change',
    `<p>${esc(pending.label)}</p><p class="muted">${removed ? 'You removed this plan in Shavit. Remove the linked Calendar event too?' : remoteRemoved ? 'This event disappeared from the connected calendar. Remove the linked Shavit plan, or restore the Calendar event?' : pending.kind === 'conflict' ? 'Both copies changed. Choose which version to keep.' : 'This change affects saved workout history. Keep the history and disconnect this event link.'} Completed workout history is always preserved.</p><label for="calendar-choice">Your choice</label><select id="calendar-choice" name="choice">${removed ? '<option value="keep">Keep the Calendar event</option><option value="delete">Delete the Calendar event too</option>' : remoteRemoved ? '<option value="keep">Restore the Calendar event</option><option value="delete">Remove this Shavit plan</option>' : pending.kind === 'conflict' ? '<option value="calendar">Use the Calendar version</option><option value="shavit">Use the Shavit version</option>' : '<option value="keep">Keep history and unlink</option>'}</select>`,
    async (form) => {
      await resolveCalendarChange(state, pending, form.get('choice'));
    },
    'Apply choice',
  );
}
function workoutTimeEditor(id) {
  const activity = activitiesOn(state, day).find((a) => a.id === id),
    timing = state.workoutTimes?.[activity.calendarUid];
  openEditor(
    'Workout calendar time',
    `<p class="muted">${esc(activity.name)} · ${fmt(day)}. This time applies to this date only.</p><label for="calendar-time">Start time</label><input id="calendar-time" name="time" type="time" required value="${timing?.time ?? '17:00'}"><label for="calendar-duration">Duration (minutes)</label><input id="calendar-duration" name="duration" type="number" min="1" max="1440" required value="${timing?.duration ?? 60}">`,
    (form) => {
      const items = structuredClone(activitiesOn(state, day)),
        a = items.find((a) => a.id === id);
      a.calendarUid ??= uid();
      state.dayPlans[day] = items;
      state.workoutTimes ??= {};
      state.workoutTimes[a.calendarUid] = {
        time: form.get('time'),
        duration: Number(form.get('duration')),
      };
    },
  );
}
async function connectHealth() {
  if (!isIPhone()) {
    toast('Apple Health works in the iPhone app.');
    return;
  }
  try {
    const status = await Device.healthStatus();
    healthEnabled = status.enabled;
    if (!healthEnabled) {
      toast(
        'Apple Health is ready in the code. HealthKit signing needs the Apple Developer Program before this test app can connect.',
      );
      return;
    }
    await Device.connectHealth();
    state.healthConnected = true;
    await persist();
    await refreshDeviceConnections(true);
    render();
  } catch (e) {
    toast(e.message);
  }
}
function bind() {
  if ($('tutorial')) $('tutorial').onclick = startTutorial;
  if ($('connect-calendar')) $('connect-calendar').onclick = connectMainCalendar;
  if ($('sync-calendar')) $('sync-calendar').onclick = () => refreshDeviceConnections(true);
  if ($('disconnect-calendar'))
    $('disconnect-calendar').onclick = async () => {
      state.calendar.enabled = false;
      await persist();
      render();
      toast('Disconnected. Calendar events and Shavit records were kept.');
    };
  document
    .querySelectorAll('[data-calendar-review]')
    .forEach((b) => (b.onclick = () => reviewCalendarChange(Number(b.dataset.calendarReview))));
  document
    .querySelectorAll('[data-workout-time]')
    .forEach((b) => (b.onclick = () => workoutTimeEditor(b.dataset.workoutTime)));
  if ($('connect-health')) $('connect-health').onclick = connectHealth;
  if ($('step-goal'))
    $('step-goal').onclick = () =>
      openEditor(
        'Your daily step goal',
        `<label for="daily-step-goal">Steps per day</label><input id="daily-step-goal" name="goal" type="number" inputmode="numeric" min="1" max="100000" required value="${state.stepGoal ?? 10000}"><p class="muted">Steps stay separate from your daily schedule.</p>`,
        (form) => {
          state.stepGoal = Number(form.get('goal'));
        },
      );

  document.querySelectorAll('[data-workout-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        workoutTab = b.dataset.workoutTab;
        render();
      }),
  );
  document.querySelectorAll('[data-graph-range]').forEach(
    (b) =>
      (b.onclick = () => {
        graphRange = b.dataset.graphRange;
        keepScroll();
      }),
  );
  document.querySelectorAll('[data-graph-metric]').forEach(
    (b) =>
      (b.onclick = () => {
        graphMetric = b.dataset.graphMetric;
        keepScroll();
      }),
  );
  if ($('graph-exercise'))
    $('graph-exercise').onchange = () => {
      graphExercise = $('graph-exercise').value;
      keepScroll();
    };
  if ($('workout-graph'))
    disposeGraph = mountWorkoutGraph(
      $('workout-graph'),
      exerciseProgress(state, graphExercise, graphRange),
      graphMetric,
    );

  document
    .querySelectorAll('[data-move-workout]')
    .forEach((b) => (b.onclick = () => moveWorkoutEditor(b.dataset.moveWorkout)));
  if ($('activity-reminders'))
    $('activity-reminders').onclick = async () => {
      try {
        const enabled = state.activityReminders === false;
        if (enabled) await enableActivityReminders();
        state.activityReminders = enabled;
        state.activityRemindersSince = Date.now();
        await persist();
        render();
        toast(enabled ? 'Task and gym reminders enabled.' : 'Task and gym reminders turned off.');
      } catch (e) {
        toast(e.message);
      }
    };
  if ($('add-run-goal')) $('add-run-goal').onclick = () => runGoalEditor();
  document
    .querySelectorAll('[data-edit-run-goal]')
    .forEach((b) => (b.onclick = () => runGoalEditor(b.dataset.editRunGoal)));
  if ($('export-workout-photo')) $('export-workout-photo').onclick = exportWorkoutPhoto;
  if ($('recap-prev'))
    $('recap-prev').onclick = () => {
      recapAnchor = shiftDate(recapAnchor, -7);
      keepScroll();
    };
  if ($('recap-next'))
    $('recap-next').onclick = () => {
      recapAnchor = shiftDate(recapAnchor, 7);
      keepScroll();
    };
  document.querySelectorAll('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        sessionMode = false;
        render();
        window.scrollTo(0, 0);
      }),
  );
  document.querySelectorAll('[data-day]').forEach(
    (b) =>
      (b.onclick = () => {
        day = b.dataset.day;
        sessionMode = false;
        render();
      }),
  );
  document
    .querySelectorAll('[data-template-add]')
    .forEach((b) => (b.onclick = () => exerciseEditor(-1, b.dataset.templateAdd)));
  document
    .querySelectorAll('[data-template-exercise]')
    .forEach(
      (b) =>
        (b.onclick = () => exerciseEditor(Number(b.dataset.index), b.dataset.templateExercise)),
    );
  document.querySelectorAll('[data-history-filter]').forEach(
    (b) =>
      (b.onclick = () => {
        historyFilter = b.dataset.historyFilter;
        render();
      }),
  );
  if ($('plan-search'))
    $('plan-search').oninput = (e) => {
      let count = 0;
      document.querySelectorAll('[data-plan-card]').forEach((card) => {
        card.hidden = !card.dataset.search.includes(e.target.value.trim().toLowerCase());
        if (!card.hidden) count++;
      });
      $('no-plans-found').hidden = count > 0;
    };
  const on = (id, fn) => {
    if ($(id)) $(id).onclick = fn;
  };
  on('choose-date', () =>
    openEditor(
      'Jump to a day',
      `<label for="jump-date">Date</label><input id="jump-date" name="date" type="date" required value="${day}">`,
      (form) => {
        day = form.get('date');
        sessionMode = false;
        view = 'today';
      },
      'Show day',
    ),
  );
  on('prev-week', () => {
    day = shiftDate(day, -7);
    sessionMode = false;
    render();
  });
  on('next-week', () => {
    day = shiftDate(day, 7);
    sessionMode = false;
    render();
  });
  on('today', () => {
    day = dateKey();
    sessionMode = false;
    render();
  });
  document.querySelectorAll('[data-open-activity]').forEach(
    (button) =>
      (button.onclick = async () => {
        activeId = button.dataset.openActivity;
        const activity = activitiesOn(state, day).find((a) => a.id === activeId);
        if (!activity) return;
        if (!activeSession()) {
          state.sessions[activeKey()] = createSession(state, day, activity);
          await persist();
        }
        sessionMode = true;
        render();
      }),
  );
  on('save-session-plan', async () => {
    const s = state.sessions[activeKey()];
    if (!s.exercises.length) {
      toast('Add an exercise first.');
      return;
    }
    const t = {
      id: state.templates.find((t) => t.name === s.plan)?.id ?? uid(),
      name: s.plan,
      exercises: structuredClone(s.exercises).map((e) => {
        delete e.routineOriginal;
        return { ...e, sets: e.sets.map((set) => ({ ...set, done: false })) };
      }),
    };
    state.templates = [...state.templates.filter((t) => t.name !== s.plan), t];
    await persist();
    toast('Workout plan updated for next time.');
  });
  on('back-workout', () => {
    sessionMode = false;
    render();
  });
  on('add-exercise', () => exerciseEditor(-1));
  document
    .querySelectorAll('[data-exercise-swap]')
    .forEach((b) => (b.onclick = () => swapEditor(Number(b.dataset.exerciseSwap))));
  document
    .querySelectorAll('[data-exercise-remove]')
    .forEach((b) => (b.onclick = () => removeCurrentExercise(Number(b.dataset.exerciseRemove))));
  document
    .querySelectorAll('[data-exercise-edit]')
    .forEach((b) => (b.onclick = () => exerciseEditor(Number(b.dataset.exerciseEdit))));
  document.querySelectorAll('[data-set]').forEach((input) => {
    input.oninput = () => {
      if (input.checkValidity() && input.value !== '') {
        const [i, j, key] = input.dataset.set.split(',');
        activeSession().exercises[i].sets[j][key] = Number(input.value);
      }
    };
    input.onchange = async () => {
      if (!input.checkValidity() || input.value === '') {
        input.reportValidity();
        return;
      }
      const [i, j, key] = input.dataset.set.split(',');
      state.sessions[activeKey()].exercises[i].sets[j][key] = Number(input.value);
      await persist();
    };
  });
  document.querySelectorAll('[data-kind]').forEach(
    (input) =>
      (input.onchange = async () => {
        const [i, j] = input.dataset.kind.split(',');
        state.sessions[activeKey()].exercises[i].sets[j].kind = input.value;
        const exercise = activeSession().exercises[i],
          previous = previousExercise(state, exercise.name, day);
        input
          .closest('.exercise')
          .querySelectorAll('.set-last')
          .forEach((cell, index) => {
            const last = previousSet(exercise, index, previous);
            cell.innerHTML = last ? `${last.kg} kg <span>× ${last.reps}</span>` : '—';
          });
        await persist();
      }),
  );
  document.querySelectorAll('[data-done]').forEach(
    (input) =>
      (input.onchange = async () => {
        const [i, j] = input.dataset.done.split(',');
        captureSetInputs();
        const set = activeSession().exercises[i].sets[j];
        const row = input.closest('.set-row'),
          invalid = [...row.querySelectorAll('input[type=number]')].find(
            (field) => !field.checkValidity() || field.value === '',
          );
        if (input.checked && invalid) {
          input.checked = false;
          toast('Add a valid weight and rep count first.');
          invalid.reportValidity();
          invalid.focus();
          return;
        }
        if (input.checked && set.reps <= 0) {
          input.checked = false;
          toast('Add the reps before completing this set.');
          document.querySelector(`[data-set="${i},${j},reps"]`)?.focus();
          return;
        }
        set.done = input.checked;
        await persist();
        const scroll = window.scrollY;
        render();
        window.scrollTo(0, scroll);
      }),
  );
  const refreshRun = () => {
    if ($('run-summary')) $('run-summary').innerHTML = runSummary(activeSession());
  };
  document.querySelectorAll('[data-run-field]').forEach(
    (input) =>
      (input.onchange = async () => {
        if (!input.checkValidity() || (input.type === 'number' && !input.value)) {
          $('run-error').textContent = 'Enter a distance greater than zero.';
          return;
        }
        activeSession()[input.dataset.runField] =
          input.type === 'number' ? Number(input.value) : input.value;
        await persist();
        refreshRun();
      }),
  );
  if ($('run-km'))
    $('run-km').oninput = () => {
      if ($('run-km').value && $('run-km').checkValidity()) {
        activeSession().km = Number($('run-km').value);
        refreshRun();
      }
    };
  const readRunTime = () => {
    const minutes = $('run-minutes'),
      seconds = $('run-seconds');
    if (!minutes.checkValidity() || !seconds.checkValidity())
      throw new Error('Use whole minutes and 0–59 seconds.');
    return parseRunTime(`${minutes.value || 0}:${String(seconds.value || 0).padStart(2, '0')}`);
  };
  const saveRunTime = async () => {
    const seconds = readRunTime();
    activeSession().durationSeconds = seconds;
    activeSession().minutes = seconds / 60;
    $('run-error').textContent = '';
    await persist();
    refreshRun();
  };
  for (const id of ['run-minutes', 'run-seconds'])
    if ($(id)) {
      $(id).oninput = () => {
        try {
          activeSession().durationSeconds = readRunTime();
          refreshRun();
        } catch {}
      };
      $(id).onchange = async () => {
        try {
          await saveRunTime();
        } catch (e) {
          $('run-error').textContent = e.message;
        }
      };
    }
  on('finish-run', async () => {
    if (day > dateKey()) return;
    activeSession().completed = true;
    await persist();
    sessionMode = false;
    render();
    toast('Run done. Nice one.');
  });
  on('finish-workout', async () => {
    const invalid = captureSetInputs();
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return;
    }
    if (activeSession().exercises.some((e) => e.sets.some((set) => !set.done || set.reps <= 0))) {
      toast('Add reps and check every set before finishing.');
      return;
    }
    syncNewPlan(activeSession());
    finishLiftingWorkout(state, activeSession());
    await persist();
    sessionMode = false;
    render();
    toast('Workout saved. A promise kept. ✦');
  });
  on('reopen-workout', async () => {
    state.sessions[activeKey()].completed = false;
    await persist();
    render();
  });
  on('add-day-workout', addDayWorkout);
  on('add-task', () => addChooser());
  document
    .querySelectorAll('[data-edit-task]')
    .forEach((b) => (b.onclick = () => taskEditor(b.dataset.editTask)));
  document.querySelectorAll('[data-task]').forEach(
    (input) =>
      (input.onchange = async () => {
        const t = state.tasks.find((t) => t.id === input.dataset.task);
        t.done = input.checked ? [...new Set([...t.done, day])] : t.done.filter((k) => k !== day);
        await persist();
        keepScroll();
      }),
  );
  on('add-plan', () => planEditor());
  on('notes-plan', () => $('import-notes').click());
  document
    .querySelectorAll('[data-plan]')
    .forEach((b) => (b.onclick = () => planEditor(b.dataset.plan)));
  document.querySelectorAll('[data-history]').forEach(
    (b) =>
      (b.onclick = () => {
        const session = state.sessions[b.dataset.history];
        day = session.date;
        activeId = session.activityId;
        view = 'today';
        sessionMode = true;
        render();
        window.scrollTo(0, 0);
      }),
  );
  on('edit-schedule', () => {
    openEditor(
      'Your weekly schedule',
      scheduleFields() +
        `<p class="muted">Past days keep their original schedule. Changes affect today and future days.</p>`,
      () => {
        const next = readSchedule();
        if (next.flat().some((a) => !a.name))
          throw new Error('Name each activity or remove its row.');
        changeWeeklySchedule(state, next);
      },
    );
    bindSchedule();
  });
  on('reminder', async () => {
    try {
      await setReminder(!state.reminder);
      state.reminder = !state.reminder;
      await persist();
      render();
      toast(state.reminder ? 'Daily reminder set for 9:00 AM.' : 'Reminder turned off.');
    } catch (e) {
      toast(e.message);
    }
  });
  if ($('place-times')) $('place-times').onclick = placeTimesEditor;
  document
    .querySelectorAll('[data-time-activity]')
    .forEach((b) => (b.onclick = () => activityTimeEditor(b.dataset.timeActivity)));
  scrollTimeline();
  document.querySelectorAll('[data-theme-pick]').forEach(
    (b) =>
      (b.onclick = async () => {
        state.theme = b.dataset.themePick;
        await persist();
        render();
      }),
  );
  on('meet-helper', () => {
    const params = new URLSearchParams(location.search);
    params.set('welcome', '1');
    history.pushState(null, '', '?' + params);
    sessionMode = false;
    render();
    window.scrollTo(0, 0);
  });
  on('export', exportBackup);
  on('import', () => $('import-backup').click());
}
async function exportWorkoutPhoto() {
  if (activeSession()?.type === 'lift') captureSetInputs();
  try {
    const session = activeSession();
    if (!session) return;
    const photos = renderWorkoutPhotos(structuredClone(session));
    const dialog = document.createElement('dialog');
    dialog.className = 'photo-export';
    dialog.innerHTML = `<div class="dialog-head"><h2>Your workout photo</h2><button type="button" aria-label="Close image preview" class="icon">×</button></div><p class="muted">${photos.length > 1 ? `${photos.length} images keep all your sets readable.` : 'Ready to keep or share.'} ${session.completed ? '' : 'Unfinished sets are labelled.'}</p><div class="photo-pages">${photos.map((src, i) => `<img src="${src}" alt="Workout sets, image ${i + 1}">`).join('')}</div><button type="button" class="primary" data-photo-share>${isNative ? 'Save / share image' : 'Download image'}${photos.length > 1 ? 's' : ''} ↗</button><p class="error" role="alert"></p>`;
    document.body.append(dialog);
    dialog.querySelector('.icon').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();
    dialog.querySelector('[data-photo-share]').onclick = async () => {
      const button = dialog.querySelector('[data-photo-share]');
      button.disabled = true;
      try {
        if (isNative) {
          const files = [];
          for (let i = 0; i < photos.length; i++) {
            const file = await Filesystem.writeFile({
              path: `shavit-workout-${session.date}-${Date.now()}-${i + 1}.png`,
              data: photos[i].split(',')[1],
              directory: Directory.Cache,
            });
            files.push(file.uri);
          }
          await Share.share({ title: 'My workout with Shavit', files });
        } else {
          photos.forEach((src, i) => {
            const a = document.createElement('a');
            a.href = src;
            a.download = `shavit-workout-${session.date}-${i + 1}.png`;
            a.click();
          });
        }
      } catch (e) {
        dialog.querySelector('.error').textContent =
          'Sharing was closed or unavailable. You can try again.';
      } finally {
        button.disabled = false;
      }
    };
  } catch {
    toast('Could not create the image. Please try again.');
  }
}
async function exportBackup() {
  const data = JSON.stringify(state, null, 2),
    name = `shavit-helper-${dateKey()}.json`;
  try {
    if (isNative) {
      const file = await Filesystem.writeFile({
        path: name,
        data,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: 'Shavit backup', url: file.uri });
    } else {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })),
        a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (e) {
    toast('Could not export. Please try again.');
  }
}
$('import-notes').onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1e6) throw new Error('Choose a text note under 1 MB.');
    planEditor(null, await file.text());
  } catch (e) {
    toast(e.message);
  } finally {
    $('import-notes').value = '';
  }
};
$('import-backup').onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5e6) throw new Error('Choose a backup under 5 MB.');
    const imported = validateBackup(JSON.parse(await file.text()));
    openEditor(
      'Review your import',
      `<p>${imported.templates.length} workout plans · ${Object.values(imported.sessions).filter((s) => s.completed).length} completed sessions · ${imported.tasks.length} tasks</p><p class="muted">${imported.templates.map((t) => esc(t.name) + ' · ' + t.exercises.length + ' exercises').join('<br>')}</p><p class="muted">Merge adds new plans and history, keeping existing dates and tasks. Replace restores the complete file.</p><label for="import-mode">Import mode</label><select id="import-mode" name="mode"><option value="merge">Merge with this device</option><option value="replace">Replace helper data</option></select>`,
      (form) => {
        if (form.get('mode') === 'replace') {
          const reminder = state.reminder;
          state = imported;
          state.reminder = reminder;
          state.calendar = null;
          state.healthConnected = false;
        } else {
          for (const t of imported.templates)
            if (!state.templates.some((x) => x.name === t.name)) state.templates.push(t);
          for (const [key, s] of Object.entries(imported.sessions))
            if (
              !Object.values(state.sessions).some(
                (x) => x.date === s.date && x.plan === s.plan && x.type === s.type,
              )
            )
              state.sessions[key] = s;
          for (const t of imported.tasks)
            if (!state.tasks.some((x) => x.id === t.id)) state.tasks.push(t);
          state.runGoals ??= [];
          for (const g of imported.runGoals ?? [])
            if (!state.runGoals.some((x) => x.id === g.id)) state.runGoals.push(g);
        }
        state.onboarded = true;
      },
      'Import to this device',
    );
  } catch (error) {
    toast(error.message || 'Could not read this file.');
  } finally {
    e.target.value = '';
  }
};
try {
  state = migrateState(await loadState()) ?? emptyState();
  render();
  if (isIPhone()) {
    Device.healthStatus()
      .then((s) => {
        healthEnabled = s.enabled;
      })
      .catch(() => {});
    Device.addListener('calendarChanged', () => {
      deviceDirty = true;
      scheduleDeviceRefresh();
    }).catch(() => {});
  }
  if (isNative && state.onboarded) {
    await maybeEnableReminders();
    syncActivityReminders(state).catch(() => {});
  }
} catch (error) {
  $('app').innerHTML =
    '<main><h1>Let’s keep your data safe.</h1><p>Shavit could not open your saved data. Close and reopen the app. Nothing has been reset.</p></main>';
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state) {
    deviceDirty = true;
    scheduleDeviceRefresh();
  }
  if (!document.hidden && state) syncActivityReminders(state).catch(() => {});
  if (!document.hidden && view === 'today' && !sessionMode) {
    day = dateKey();
    render();
  }
});

if (!isNative && 'serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('/sw.js').catch(() => {});

window.addEventListener('popstate', () => {
  sessionMode = false;
  render();
});
