import { dateKey, shiftDate, localDate } from './helper-model.js';
export function exerciseProgress(state, name, range = 'month', today = dateKey()) {
  const start =
    range === 'week' ? shiftDate(today, -6) : range === 'month' ? shiftDate(today, -29) : '0000';
  return Object.entries(state.sessions)
    .filter(([, s]) => s.completed && s.type !== 'run' && s.date >= start && s.date <= today)
    .flatMap(([id, s]) =>
      (s.exercises ?? [])
        .filter((e) => e.name.trim().toLowerCase() === name.trim().toLowerCase())
        .map((e) => {
          const sets = e.sets.filter(
            (set) => set.kind === 'working' && set.done !== false && set.reps > 0,
          );
          const best = sets.reduce(
            (b, set) => (!b || set.kg > b.kg || (set.kg === b.kg && set.reps > b.reps) ? set : b),
            null,
          );
          return best ? { id, date: s.date, kg: best.kg, reps: best.reps, plan: s.plan } : null;
        })
        .filter(Boolean),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function progressExerciseNames(state) {
  return [
    ...new Set([
      ...state.templates.flatMap((t) => t.exercises.map((e) => e.name)),
      ...Object.values(state.sessions).flatMap((s) => (s.exercises ?? []).map((e) => e.name)),
    ]),
  ].sort((a, b) => a.localeCompare(b));
}
export function mountWorkoutGraph(root, points, metric = 'kg') {
  if (!root) return () => {};
  const svg = root.querySelector('svg'),
    detail = root.querySelector('[data-chart-detail]'),
    tap = root.querySelector('[data-chart-tap]'),
    prev = root.querySelector('[data-point-prev]'),
    next = root.querySelector('[data-point-next]');
  let selected = points.length - 1,
    positions = [];
  const ns = 'http://www.w3.org/2000/svg',
    label = (date) =>
      localDate(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const make = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    if (text !== undefined) e.textContent = text;
    svg.append(e);
  };
  const draw = () => {
    if (!points.length) return;
    const width = root.clientWidth,
      height = 235,
      left = 44,
      right = width - 12,
      top = 23,
      bottom = 188;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();
    const vals = points.map((p) => p[metric]),
      low = Math.min(...vals),
      high = Math.max(...vals),
      pad = Math.max((high - low) * 0.25, metric === 'kg' ? 2 : 1),
      min = Math.max(0, low - pad),
      max = high + pad;
    const firstTime = localDate(points[0].date).getTime(),
      lastTime = localDate(points.at(-1).date).getTime();
    const x = (i) =>
        left +
        7 +
        (lastTime === firstTime
          ? 0.5
          : (localDate(points[i].date).getTime() - firstTime) / (lastTime - firstTime)) *
          (right - left - 14),
      y = (v) => bottom - 8 - ((v - min) / (max - min)) * (bottom - top - 16);
    positions = points.map((_, i) => x(i));
    make(
      'title',
      {},
      `${metric === 'kg' ? 'Weight in kilograms' : 'Reps'} in the heaviest working set for ${points.length} completed sessions`,
    );
    for (let i = 0; i < 3; i++) {
      const v = min + ((max - min) * i) / 2,
        yy = y(v);
      make('line', {
        x1: left,
        y1: yy,
        x2: right,
        y2: yy,
        stroke: 'var(--line)',
        'stroke-width': 1,
      });
      make('text', { x: left - 8, y: yy + 4, 'text-anchor': 'end' }, Number(v.toFixed(1)));
    }
    make('text', { x: left, y: 12 }, metric === 'kg' ? 'kg' : 'reps');
    make('text', { x: right, y: 232, 'text-anchor': 'end' }, 'Session date');
    [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].forEach((i, k, a) =>
      make(
        'text',
        {
          x: x(i),
          y: 210,
          'text-anchor': k === 0 ? 'start' : k === a.length - 1 ? 'end' : 'middle',
        },
        label(points[i].date),
      ),
    );
    make('path', {
      d: points.map((p, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(p[metric])).join(' '),
      fill: 'none',
      stroke: 'var(--blue)',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    make('line', {
      x1: x(selected),
      x2: x(selected),
      y1: top,
      y2: bottom,
      stroke: 'var(--c-8096ad)',
      'stroke-dasharray': '3 5',
    });
    points.forEach((p, i) =>
      make('circle', {
        cx: x(i),
        cy: y(p[metric]),
        r: i === selected ? 5 : 3,
        fill: 'var(--blue)',
        stroke: 'var(--c-122033)',
        'stroke-width': 2,
      }),
    );
    const p = points[selected];
    detail.textContent = `${p.kg} kg × ${p.reps} reps · ${label(p.date)} ${localDate(p.date).getFullYear()}`;
    prev.disabled = selected === 0;
    next.disabled = selected === points.length - 1;
  };
  prev.onclick = () => {
    selected = Math.max(0, selected - 1);
    draw();
  };
  next.onclick = () => {
    selected = Math.min(points.length - 1, selected + 1);
    draw();
  };
  tap.onclick = (e) => {
    const xx = e.clientX - tap.getBoundingClientRect().left;
    selected = positions.reduce(
      (b, v, i) => (Math.abs(v - xx) < Math.abs(positions[b] - xx) ? i : b),
      0,
    );
    draw();
  };
  tap.onkeydown = (e) => {
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      selected = Math.max(
        0,
        Math.min(points.length - 1, selected + (e.key === 'ArrowRight' ? 1 : -1)),
      );
      draw();
    }
  };
  const observer = new ResizeObserver(draw);
  observer.observe(root);
  draw();
  return () => observer.disconnect();
}
