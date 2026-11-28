import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWorkout,
  streakStats,
  emptyState,
  previousExercise,
  tasksOn,
  validateBackup,
  migrateState,
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
} from '../helper-model.js';
test('notes parse decimals, zero weight, wrapped lines and first-set warmups', () => {
  const p = parseWorkout('Dips 0x6 20x6\nPress 40x7 57.5x7\n57.5x5', 'Upper');
  assert.equal(p.exercises.length, 2);
  assert.equal(p.exercises[0].sets[0].kg, 0);
  assert.equal(p.exercises[1].sets.length, 3);
  assert.deepEqual(
    p.exercises[1].sets.map((s) => s.kind),
    ['warmup', 'working', 'working'],
  );
});
test('no default split is imposed on a new user', () =>
  assert(emptyState().schedule.every((day) => day.length === 0)));
test('legacy schedules and history migrate without changing results', () => {
  const old = {
    version: 1,
    schedule: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest'],
    sessions: {
      '2026-10-26': { date: '2026-10-26', plan: 'Pull', completed: true, exercises: [] },
    },
  };
  const s = migrateState(old);
  assert.equal(s.version, 2);
  assert.equal(s.schedule[1][0].name, 'Pull');
  assert.equal(Object.values(s.sessions)[0].completed, true);
  assert(dayComplete(s, '2026-10-26'));
  assert.equal(old.version, 1);
});
function multi() {
  const s = emptyState();
  s.start = '2026-10-25';
  s.schedule[0] = [
    { id: 'upper', name: 'Upper', type: 'lift' },
    { id: 'run', name: 'Easy run', type: 'run' },
  ];
  s.schedule[1] = [{ id: 'lower', name: 'Lower', type: 'lift' }];
  return s;
}
test('run and lift need separate completion; full day counts once', () => {
  const s = multi();
  s.sessions[sessionKey('2026-10-25', 'upper')] = {
    date: '2026-10-25',
    completed: true,
    exercises: [],
  };
  assert(!dayComplete(s, '2026-10-25'));
  s.sessions[sessionKey('2026-10-25', 'run')] = {
    date: '2026-10-25',
    completed: true,
    exercises: [],
  };
  assert(dayComplete(s, '2026-10-25'));
  assert.equal(streakStats(s, '2026-10-26').current, 1);
  assert.equal(streakStats(s, '2026-10-26').total, 2);
});
test('rest days preserve streak; unfinished today is not missed', () => {
  const s = multi();
  s.sessions[sessionKey('2026-10-25', 'upper')] = { date: '2026-10-25', completed: true };
  s.sessions[sessionKey('2026-10-25', 'run')] = { date: '2026-10-25', completed: true };
  s.sessions[sessionKey('2026-10-26', 'lower')] = { date: '2026-10-26', completed: true };
  assert.equal(streakStats(s, '2026-10-28').current, 2);
  s.sessions[sessionKey('2026-10-26', 'lower')].completed = false;
  assert.equal(streakStats(s, '2026-10-28').current, 0);
});
test('history finds most recent earlier completed exercise', () => {
  const s = {
    sessions: {
      a: { date: '2026-10-25', completed: true, exercises: [{ name: 'Press', sets: [] }] },
      b: { date: '2026-10-26', completed: false, exercises: [{ name: 'Press' }] },
    },
  };
  assert.equal(previousExercise(s, 'press', '2026-10-27').date, '2026-10-25');
});
test('tasks respect repeat days and start date', () => {
  const s = {
    tasks: [
      { date: '', start: '2026-10-26', days: [1] },
      { date: '2026-10-27', days: [] },
    ],
  };
  assert.equal(tasksOn(s, '2026-10-26').length, 1);
  assert.equal(tasksOn(s, '2026-10-19').length, 0);
});
test('backup accepts arbitrary named multiple activities and rejects malformed dates', () => {
  const s = multi();
  assert.equal(validateBackup(s).schedule[0].length, 2);
  assert.throws(() => validateBackup({ ...s, start: '2026-99-01' }));
  assert.throws(() =>
    validateBackup({
      ...s,
      schedule: [[{ id: 'bad', name: '', type: 'lift' }], ...s.schedule.slice(1)],
    }),
  );
});

test('schedule progress combines lifts, runs and recurring or one-time tasks', () => {
  const s = multi();
  s.tasks = [
    { id: 'read', date: '', start: '2026-10-25', days: [0], done: ['2026-10-25'] },
    { id: 'work', date: '2026-10-25', days: [], done: [] },
  ];
  s.sessions[sessionKey('2026-10-25', 'upper')] = { completed: true };
  assert.deepEqual(scheduleProgress(s, '2026-10-25'), {
    total: 4,
    completed: 2,
    left: 2,
    percent: 50,
  });
  s.sessions[sessionKey('2026-10-25', 'run')] = { completed: true };
  s.tasks[1].done.push('2026-10-25');
  assert.equal(scheduleProgress(s, '2026-10-25').percent, 100);
  assert.deepEqual(scheduleProgress(emptyState(), '2026-10-25'), {
    total: 0,
    completed: 0,
    left: 0,
    percent: 0,
  });
});

test('exact running time, pace and earlier same-distance comparisons', () => {
  assert.equal(parseRunTime('14:30'), 870);
  assert.equal(parseRunTime('15'), 900);
  assert.equal(formatRunTime(870), '14:30');
  assert.equal(runSeconds({ minutes: 14.5 }), 870);
  assert.equal(runPace({ km: 3, durationSeconds: 870 }), '4:50 /km');
  const old = { type: 'run', date: '2026-10-19', completed: true, km: 3, minutes: 15 };
  const other = { ...old, km: 5 };
  const current = { ...old, date: '2026-10-26', durationSeconds: 870 };
  assert.deepEqual(previousRuns({ sessions: { old, other, current } }, current), [old]);
  assert.equal(runSeconds(old) - runSeconds(current), 30);
  for (const value of ['14:90', '0', '-1', '14.30', '14:3', 'abc'])
    assert.throws(() => parseRunTime(value));
});

test('a workout added after setup persists weekly without rewriting earlier days', () => {
  const s = emptyState();
  s.start = '2026-10-19';
  const a = { id: 'new-upper', name: 'Upper', type: 'lift' };
  addWorkoutToDay(s, '2026-10-26', a, true);
  assert.equal(s.schedule[1][0].name, 'Upper');
  assert.equal(s.dayPlans['2026-10-19'].length, 0);
  assert.equal(s.dayPlans['2026-10-26'][0].id, a.id);
  assert.equal(s.templates[0].name, 'Upper');
  const restored = validateBackup(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.schedule[1][0].name, 'Upper');
  const run = { id: 'one-off', name: 'Run', type: 'run' };
  addWorkoutToDay(restored, '2026-10-26', run, false);
  assert.equal(restored.dayPlans['2026-10-26'].length, 2);
  assert.equal(restored.schedule[1].length, 1);
});

test('next workout pre-fills completed results by set type and resets checks', () => {
  const s = emptyState();
  s.templates = [
    {
      name: 'Upper',
      exercises: [
        {
          id: 'press',
          name: 'Press',
          sets: [
            { kind: 'warmup', kg: 10, reps: 8, done: true },
            { kind: 'working', kg: 20, reps: 6, done: true },
          ],
        },
      ],
    },
  ];
  s.sessions.old = {
    date: '2026-10-19',
    completed: true,
    exercises: [
      {
        name: 'Press',
        sets: [
          { kind: 'warmup', kg: 12.5, reps: 10, done: true },
          { kind: 'working', kg: 25, reps: 8, done: true },
        ],
      },
    ],
  };
  const session = createSession(s, '2026-10-26', { id: 'upper', name: 'Upper', type: 'lift' });
  assert.deepEqual(
    session.exercises[0].sets.map((x) => [x.kg, x.reps, x.done]),
    [
      [12.5, 10, false],
      [25, 8, false],
    ],
  );
  assert.equal(s.templates[0].exercises[0].sets[1].kg, 20);
  const blank = createSession(s, '2026-10-26', { id: 'new', name: 'New plan', type: 'lift' });
  assert(blank.syncPlan);
  assert(s.templates.some((t) => t.name === 'New plan'));
});
test('weekly schedule edits retain one-off future workouts and past days', () => {
  const s = emptyState();
  s.start = '2026-10-19';
  s.schedule[1] = [{ id: 'old', name: 'Upper', type: 'lift' }];
  s.dayPlans['2026-11-02'] = [...s.schedule[1], { id: 'one-off', name: 'Run', type: 'run' }];
  const next = structuredClone(s.schedule);
  next[1] = [{ id: 'new', name: 'Lower', type: 'lift' }];
  changeWeeklySchedule(s, next, '2026-10-26');
  assert.deepEqual(
    s.dayPlans['2026-11-02'].map((a) => a.id),
    ['new', 'one-off'],
  );
  assert.equal(s.dayPlans['2026-10-19'][0].name, 'Upper');
  assert.equal(s.schedule[1][0].name, 'Lower');
});

test('set history matches by kind and ordinal without reusing missing sets', async () => {
  const { previousSet } = await import('../helper-model.js');
  const previous = {
    sets: [
      { kind: 'warmup', kg: 20, reps: 8 },
      { kind: 'working', kg: 40, reps: 6 },
      { kind: 'working', kg: 42.5, reps: 5 },
    ],
  };
  const current = {
    sets: [
      { kind: 'warmup' },
      { kind: 'warmup' },
      { kind: 'working' },
      { kind: 'working' },
      { kind: 'working' },
    ],
  };
  assert.equal(previousSet(current, 0, previous).kg, 20);
  assert.equal(previousSet(current, 1, previous), null);
  assert.equal(previousSet(current, 2, previous).kg, 40);
  assert.equal(previousSet(current, 3, previous).kg, 42.5);
  assert.equal(previousSet(current, 4, previous), null);
  assert.equal(previousSet(current, 0, null), null);
});
test('weekly recap combines runs lifts and task occurrences, excludes incomplete and future results', async () => {
  const { weeklyRecap } = await import('../helper-model.js');
  const s = multi();
  s.tasks = [
    {
      id: 'read',
      date: '',
      start: '2026-10-25',
      days: [0, 1, 2, 3],
      done: ['2026-10-25', '2026-10-26'],
    },
    { id: 'once', date: '2026-10-27', days: [], done: ['2026-10-27'] },
  ];
  s.sessions = {
    a: { date: '2026-10-25', type: 'lift', completed: true },
    b: { date: '2026-10-25', type: 'run', completed: true, km: 3 },
    c: { date: '2026-10-26', type: 'run', completed: false, km: 5 },
    d: { date: '2026-10-28', type: 'run', completed: true, km: 10 },
    e: { date: '2026-10-24', type: 'run', completed: true, km: 2 },
  };
  s.sessions[sessionKey('2026-10-25', 'upper')] = s.sessions.a;
  delete s.sessions.a;
  s.sessions[sessionKey('2026-10-25', 'run')] = s.sessions.b;
  delete s.sessions.b;
  const r = weeklyRecap(s, '2026-10-27', '2026-10-27');
  assert.equal(r.start, '2026-10-25');
  assert.equal(r.end, '2026-10-31');
  assert.equal(r.lifts, 1);
  assert.equal(r.runs, 1);
  assert.equal(r.km, 3);
  assert.equal(r.tasksDone, 3);
  assert.equal(r.tasksTotal, 4);
  assert.equal(r.trainingDone, 2);
  assert.equal(r.trainingTotal, 3);
  assert.equal(r.days[0].complete, true);
  assert.equal(r.days[2].rest, true);
  assert.equal(r.days[3].future, true);
  assert(r.partial);
  const old = weeklyRecap(s, '2026-10-20', '2026-10-27');
  assert(!old.partial);
  assert.equal(old.start, '2026-10-18');
  assert.equal(old.runs, 1);
});

test('workout photo keeps every exercise and identifies warmups and unfinished sets', async () => {
  const { workoutPhotoLines } = await import('../workout-photo.js');
  const session = {
    completed: false,
    exercises: [
      {
        name: 'Press',
        note: 'Keep steady',
        sets: [
          { kg: 20, reps: 8, kind: 'warmup', done: true },
          { kg: 40, reps: 6, kind: 'working', done: false },
        ],
      },
      { name: 'Row', sets: [{ kg: 35, reps: 0, kind: 'working', done: false }] },
    ],
  };
  const text = workoutPhotoLines(session).join('\n');
  assert(text.includes('Press'));
  assert(text.includes('20 × 8 (W)'));
  assert(text.includes('40 × 6 · not checked'));
  assert(text.includes('Row'));
  assert(text.includes('35 × —'));
  assert(text.includes('Keep steady'));
  assert(
    !workoutPhotoLines({ ...session, completed: true })
      .join('\n')
      .includes('not checked'),
  );
});

test('day-only swaps keep routine, use replacement history and clear completion', async () => {
  const { swapExercise } = await import('../helper-model.js');
  const s = emptyState();
  const old = {
    id: 'machine',
    name: 'Machine press',
    sets: [{ kind: 'working', kg: 80, reps: 6, done: true }],
  };
  s.templates = [{ name: 'Upper', exercises: [structuredClone(old)] }];
  s.sessions.past = {
    date: '2026-10-25',
    completed: true,
    exercises: [{ name: 'DB press', sets: [{ kind: 'working', kg: 22, reps: 8, done: true }] }],
  };
  const session = {
    date: '2026-10-27',
    plan: 'Upper',
    completed: false,
    exercises: [structuredClone(old)],
  };
  swapExercise(s, session, 0, 'DB press');
  assert.equal(s.templates[0].exercises[0].name, 'Machine press');
  assert.equal(session.exercises[0].sets[0].kg, 22);
  assert.equal(session.exercises[0].sets[0].done, false);
  assert.equal(session.exercises[0].routineOriginal.name, 'Machine press');
  swapExercise(s, session, 0, 'New press');
  assert.equal(session.exercises[0].sets[0].kg, 0);
  assert.equal(session.exercises[0].sets[0].reps, 0);
  assert.equal(session.exercises[0].routineOriginal.name, 'Machine press');
  swapExercise(s, session, 0, 'DB press', true);
  assert.equal(s.templates[0].exercises[0].name, 'DB press');
  assert(!session.exercises[0].routineOriginal);
  assert.equal(s.sessions.past.exercises[0].sets[0].done, true);
  assert.throws(() => swapExercise(s, { ...session, completed: true }, 0, 'Other'));
});

test('run comparisons use earlier completed runs at the same distance and separate last from best', async () => {
  const { runComparison } = await import('../helper-model.js');
  const s = emptyState();
  s.sessions = {
    a: { date: '2026-10-20', type: 'run', completed: true, km: 3, durationSeconds: 840 },
    b: { date: '2026-10-25', type: 'run', completed: true, km: 3, durationSeconds: 900 },
    other: { date: '2026-10-26', type: 'run', completed: true, km: 5, durationSeconds: 800 },
    draft: { date: '2026-10-26', type: 'run', completed: false, km: 3, durationSeconds: 700 },
  };
  const c = runComparison(s, { date: '2026-10-31', km: 3, durationSeconds: 870 });
  assert.equal(c.last.date, '2026-10-25');
  assert.equal(c.best.date, '2026-10-20');
  assert.equal(c.deltaLast, 30);
  assert.equal(c.deltaBest, -30);
  assert.equal(c.previous.length, 2);
  assert.equal(runComparison(s, { date: '2026-10-19', km: 3 }).best, null);
});
test('running goals measure distance or exact-distance time and survive backup validation', async () => {
  const { runGoalResult } = await import('../helper-model.js');
  const s = emptyState();
  s.runGoals = [
    { id: 'distance', km: 5, seconds: null },
    { id: 'time', km: 3, seconds: 870 },
  ];
  s.sessions = {
    a: {
      date: '2026-10-28',
      activityId: 'a',
      plan: 'Run',
      type: 'run',
      completed: true,
      km: 3,
      minutes: 15,
      exercises: [],
    },
    b: {
      date: '2026-10-30',
      activityId: 'b',
      plan: 'Run',
      type: 'run',
      completed: true,
      km: 3,
      minutes: 14.5,
      exercises: [],
    },
    c: {
      date: '2026-11-02',
      activityId: 'c',
      plan: 'Run',
      type: 'run',
      completed: true,
      km: 6,
      minutes: 30,
      exercises: [],
    },
  };
  assert.equal(runGoalResult(s, s.runGoals[0], '2026-10-31').best.km, 3);
  assert.equal(runGoalResult(s, s.runGoals[0], '2026-10-31').achieved, null);
  assert.equal(runGoalResult(s, s.runGoals[1], '2026-10-31').achieved.date, '2026-10-30');
  assert.equal(runGoalResult(s, s.runGoals[0], '2026-11-02').achieved.km, 6);
  const stricter = { id: 'fast', km: 3, seconds: 840 };
  assert.equal(runGoalResult(s, stricter, '2026-10-31').remaining, 30);
  s.sessions = Object.fromEntries(
    Object.values(s.sessions).map((r) => [sessionKey(r.date, r.activityId), r]),
  );
  assert.equal(validateBackup(s).runGoals[1].seconds, 870);
  assert.throws(() => validateBackup({ ...s, runGoals: [{ id: 'bad', km: -3, seconds: null }] }));
});

test('half reps parse, validate, prefill and export without rounding', async () => {
  const { validReps } = await import('../helper-model.js');
  const { workoutPhotoLines } = await import('../workout-photo.js');
  const parsed = parseWorkout('Press 20x6.5 30x7.5', 'Upper');
  assert.equal(parsed.exercises[0].sets[0].reps, 6.5);
  assert(validReps(0.5));
  assert(!validReps(6.25));
  assert.throws(() => parseWorkout('Press 20x6.25', 'Upper'));
  const s = emptyState();
  s.templates = [parsed];
  assert.equal(validateBackup(s).templates[0].exercises[0].sets[1].reps, 7.5);
  assert(
    workoutPhotoLines({ completed: true, exercises: parsed.exercises }).join(' ').includes('6.5'),
  );
});
test('finishing saves latest lighter or heavier results and preserves day-only swaps', async () => {
  const { finishLiftingWorkout, swapExercise } = await import('../helper-model.js');
  const s = emptyState();
  s.templates = [
    {
      name: 'Upper',
      exercises: [
        { id: 'press', name: 'Machine press', sets: [{ kind: 'working', kg: 40, reps: 8 }] },
      ],
    },
  ];
  const current = {
    type: 'lift',
    plan: 'Upper',
    date: '2026-10-31',
    completed: false,
    exercises: [
      {
        id: 'press',
        name: 'Machine press',
        sets: [{ kind: 'working', kg: 35, reps: 6.5, done: true }],
      },
    ],
  };
  finishLiftingWorkout(s, current);
  assert.equal(s.templates[0].exercises[0].sets[0].kg, 35);
  assert.equal(s.templates[0].exercises[0].sets[0].reps, 6.5);
  assert.equal(s.templates[0].exercises[0].sets[0].done, false);
  const swap = { ...structuredClone(current), completed: false };
  swapExercise(s, swap, 0, 'DB press');
  swap.exercises[0].sets = [{ kind: 'working', kg: 18, reps: 7.5, done: true }];
  finishLiftingWorkout(s, swap);
  assert.equal(s.templates[0].exercises[0].name, 'Machine press');
  assert.equal(s.templates[0].exercises[0].sets[0].kg, 35);
});
test('one-time move and swap preserve drafts, weekly schedule and completed history', async () => {
  const { moveWorkout } = await import('../helper-model.js');
  const s = emptyState();
  s.start = '2026-10-25';
  s.schedule[5] = [{ id: 'legs', type: 'lift', name: 'Legs' }];
  s.schedule[6] = [{ id: 'upper', type: 'lift', name: 'Upper' }];
  s.sessions[sessionKey('2026-10-30', 'legs')] = {
    date: '2026-10-30',
    activityId: 'legs',
    type: 'lift',
    plan: 'Legs',
    completed: false,
    exercises: [{ name: 'Squat', sets: [] }],
  };
  moveWorkout(s, '2026-10-30', '2026-10-31', 'legs', 'swap', 'upper', '2026-10-31');
  assert.equal(s.dayPlans['2026-10-30'][0].name, 'Upper');
  assert.equal(s.dayPlans['2026-10-31'][0].name, 'Legs');
  assert.equal(s.sessions[sessionKey('2026-10-31', 'legs')].exercises[0].name, 'Squat');
  assert.equal(s.schedule[5][0].name, 'Legs');
  assert(!s.sessions[sessionKey('2026-10-30', 'legs')]);
  s.sessions[sessionKey('2026-10-31', 'legs')].completed = true;
  assert.throws(() =>
    moveWorkout(s, '2026-10-31', '2026-11-01', 'legs', 'alongside', null, '2026-10-31'),
  );
});
test('move alongside handles repeated activity IDs without overwriting sessions', async () => {
  const { moveWorkout } = await import('../helper-model.js');
  const s = emptyState();
  s.schedule[5] = [{ id: 'same', name: 'Upper', type: 'lift' }];
  s.schedule[6] = [{ id: 'same', name: 'Upper', type: 'lift' }];
  s.sessions[sessionKey('2026-10-31', 'same')] = {
    completed: true,
    date: '2026-10-31',
    activityId: 'same',
  };
  const moved = moveWorkout(s, '2026-10-30', '2026-10-31', 'same', 'alongside', null, '2026-10-31');
  assert.notEqual(moved.id, 'same');
  assert.equal(s.dayPlans['2026-10-31'].length, 2);
  assert(s.sessions[sessionKey('2026-10-31', 'same')].completed);
});
test('task invitation contains chosen date and time and leaves task state alone', async () => {
  const { taskInvitation } = await import('../helper-model.js');
  const task = { name: 'Buy a book', time: '16:00' };
  const text = taskInvitation(task, '2026-10-31');
  assert(text.includes('Buy a book'));
  assert(text.includes('16:00'));
  assert(text.includes('31 October 2026'));
  assert.deepEqual(task, { name: 'Buy a book', time: '16:00' });
});

test('exercise graph uses completed working sets, excludes warmups and supports half reps and ranges', async () => {
  const { exerciseProgress } = await import('../workout-progress.js');
  const s = emptyState();
  s.sessions = {
    a: {
      type: 'lift',
      completed: true,
      date: '2026-10-26',
      plan: 'Upper',
      exercises: [
        {
          name: 'Press',
          sets: [
            { kind: 'warmup', kg: 100, reps: 3, done: true },
            { kind: 'working', kg: 40, reps: 6.5, done: true },
            { kind: 'working', kg: 40, reps: 8, done: true },
          ],
        },
      ],
    },
    b: {
      type: 'lift',
      completed: false,
      date: '2026-11-03',
      exercises: [{ name: 'Press', sets: [{ kind: 'working', kg: 90, reps: 8, done: true }] }],
    },
    c: {
      type: 'lift',
      completed: true,
      date: '2026-11-04',
      plan: 'Upper',
      exercises: [{ name: 'press', sets: [{ kind: 'working', kg: 42.5, reps: 6.5, done: true }] }],
    },
  };
  const month = exerciseProgress(s, 'Press', 'month', '2026-11-04');
  assert.deepEqual(
    month.map((p) => [p.kg, p.reps]),
    [
      [40, 8],
      [42.5, 6.5],
    ],
  );
  assert.equal(exerciseProgress(s, 'Press', 'week', '2026-11-04').length, 1);
  assert.equal(exerciseProgress(s, 'Press', 'all', '2026-11-04').length, 2);
});

test('text lines before the first exercise are kept as a note, never dropped', () => {
  const p = parseWorkout('Go heavy today\nRest 2 min\nBench 40x8 60x6\nSmooth reps', 'Upper');
  assert.equal(p.exercises.length, 1);
  assert.equal(p.exercises[0].note, 'Go heavy today Rest 2 min Smooth reps');
  assert.equal(p.exercises[0].sets.length, 2);
});

test('themes: unknown or missing theme falls back to Midnight', async () => {
  const { themeOf, THEMES } = await import('../helper-model.js');
  assert.deepEqual(
    THEMES.map((t) => t.id),
    ['midnight', 'paper', 'coach'],
  );
  assert.equal(themeOf({}), 'midnight');
  assert.equal(themeOf({ theme: 'paper' }), 'paper');
  assert.equal(themeOf({ theme: '<script>' }), 'midnight');
});

test('helper.css uses theme variables, never raw colours (run npm run themes)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../helper.css', import.meta.url), 'utf8');
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}(?![\w-])/g) ?? [], []);
});

test('timeline: places workouts as blocks and tasks as 30-minute slots, untimed apart', async () => {
  const { timelineFor, emptyState, toMinutes, fromMinutes } = await import('../helper-model.js');
  const state = emptyState();
  state.start = '2026-11-01';
  state.schedule[0] = [
    { id: 'u', name: 'Upper', type: 'lift', time: '17:30', duration: 60 },
    { id: 'r', name: 'Easy run', type: 'run' },
  ];
  state.tasks = [
    { id: 't1', name: 'Read', time: '17:45', days: [0], date: '', start: '2026-11-01', done: [] },
    {
      id: 't2',
      name: 'Call',
      time: '',
      days: [],
      date: '2026-11-29',
      start: '2026-11-29',
      done: [],
    },
  ];
  const { timed, untimed } = timelineFor(state, '2026-11-29');
  assert.deepEqual(
    timed.map((i) => [i.name, i.start, i.end, i.lane, i.lanes]),
    [
      ['Upper', 1050, 1110, 0, 2],
      ['Read', 1065, 1095, 1, 2],
    ],
  );
  assert.deepEqual(
    untimed.map((i) => i.name),
    ['Easy run', 'Call'],
  );
  assert.equal(toMinutes('24:00'), null);
  assert.equal(fromMinutes(1050), '17:30');
});

test('timeline: an event spans its start to its end; old Calendar imports count as events', async () => {
  const { timelineFor, emptyState, taskKind } = await import('../helper-model.js');
  const state = emptyState();
  const base = { days: [], date: '2026-11-29', start: '2026-11-29', done: [] };
  state.tasks = [
    { ...base, id: 'e', name: 'Dinner', time: '20:00', kind: 'event', duration: 150 },
    {
      ...base,
      id: 'c',
      name: 'Meeting',
      time: '09:00',
      calendarOrigin: true,
      calendarDuration: 45,
    },
    { ...base, id: 't', name: 'Read', time: '21:00' },
  ];
  const { timed } = timelineFor(state, '2026-11-29');
  assert.deepEqual(
    timed.map((i) => [i.name, i.kind, i.start, i.end]),
    [
      ['Meeting', 'event', 540, 585],
      ['Dinner', 'event', 1200, 1350],
      ['Read', 'task', 1260, 1290],
    ],
  );
  assert.equal(taskKind({ calendarOrigin: true, calendarAllDay: true }), 'task');
});

test('workout photo uses the chosen theme colours, exercise names in the accent', async () => {
  const { workoutPhotoRows, photoPalette } = await import('../workout-photo.js');
  assert.deepEqual(photoPalette('coach'), {
    bg: '#0d0e10',
    text: '#f4f4f0',
    muted: '#9a9ea6',
    accent: '#d4ff3a',
  });
  assert.equal(photoPalette('unknown').bg, '#122033');
  const rows = workoutPhotoRows({
    completed: true,
    exercises: [{ name: 'Sldl', sets: [{ kg: 100, reps: 6, kind: 'working', done: true }] }],
  });
  assert.deepEqual(
    rows.map((r) => [r.text, r.name]),
    [
      ['Sldl', true],
      ['100 × 6', false],
      ['', false],
    ],
  );
});

test('workouts tab: which days a plan is scheduled, and when it was last done', async () => {
  const { planDays, lastDone, emptyState } = await import('../helper-model.js');
  const state = emptyState();
  state.schedule[2] = [{ id: 'a', name: 'Push', type: 'lift' }];
  state.schedule[6] = [
    { id: 'b', name: 'Legs', type: 'lift' },
    { id: 'c', name: 'Run', type: 'run' },
  ];
  state.schedule[4] = [{ id: 'd', name: 'Push', type: 'lift' }];
  assert.deepEqual(planDays(state, 'Push'), [2, 4]);
  assert.deepEqual(planDays(state, 'Pull'), []);
  state.sessions = {
    x: { plan: 'Legs', date: '2026-11-21', completed: true },
    y: { plan: 'Legs', date: '2026-11-28', completed: true },
    z: { plan: 'Legs', date: '2026-11-30', completed: false },
  };
  assert.equal(lastDone(state, 'Legs'), '2026-11-28');
  assert.equal(lastDone(state, 'Push'), null);
});

test('plan screen: last result, reorder and start now', async () => {
  const { lastResult, moveExercise, startPlanToday, emptyState, activitiesOn } =
    await import('../helper-model.js');
  const state = emptyState();
  state.sessions = {
    a: {
      date: '2026-11-20',
      completed: true,
      plan: 'Upper',
      exercises: [
        {
          name: 'Bench press',
          sets: [
            { kg: 40, reps: 8 },
            { kg: 60, reps: 6 },
          ],
        },
      ],
    },
    b: {
      date: '2026-11-27',
      completed: true,
      plan: 'Upper',
      exercises: [
        {
          name: 'Bench press',
          sets: [
            { kg: 62.5, reps: 5 },
            { kg: 62.5, reps: 6 },
          ],
        },
      ],
    },
  };
  assert.deepEqual(lastResult(state, 'bench press'), { date: '2026-11-27', kg: 62.5, reps: 6 });
  assert.equal(lastResult(state, 'Squat'), null);

  const t = { name: 'Upper', exercises: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] };
  moveExercise(t, 0, 2);
  assert.deepEqual(
    t.exercises.map((e) => e.name),
    ['B', 'C', 'A'],
  );
  moveExercise(t, 2, 9); // out of range: no change
  assert.deepEqual(
    t.exercises.map((e) => e.name),
    ['B', 'C', 'A'],
  );

  state.templates = [t];
  const today = '2026-11-28'; // a Saturday with nothing scheduled
  const first = startPlanToday(state, t, today);
  assert.equal(activitiesOn(state, today).length, 1);
  assert.equal(startPlanToday(state, t, today).id, first.id); // no duplicate
  assert.equal(state.schedule[6].length, 0); // weekly schedule untouched
});
