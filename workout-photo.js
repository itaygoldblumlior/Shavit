// Draw directly to a local canvas: no uploads, external fonts or screenshot service.

// The exported photo uses the same colours as the theme picked in More.
export const PHOTO_PALETTES = {
  midnight: { bg: '#122033', text: '#f0eadb', muted: '#a5b3c4', accent: '#a4c2df' },
  paper: { bg: '#f5efe3', text: '#1d2a3c', muted: '#6b6457', accent: '#b9481a' },
  coach: { bg: '#0d0e10', text: '#f4f4f0', muted: '#9a9ea6', accent: '#d4ff3a' },
};
export const photoPalette = (theme) => PHOTO_PALETTES[theme] ?? PHOTO_PALETTES.midnight;

export function workoutPhotoLines(session) {
  return workoutPhotoRows(session).map((r) => r.text);
}
// Each row knows if it is an exercise name, so names can be drawn in the accent colour.
export function workoutPhotoRows(session) {
  if (session.type === 'run')
    return [
      `${session.km || 0} km`,
      session.durationSeconds
        ? `${Math.floor(session.durationSeconds / 60)}:${String(session.durationSeconds % 60).padStart(2, '0')}`
        : `${session.minutes || 0} minutes`,
      ...(session.note ? [session.note] : []),
    ].map((text, i) => ({ text, name: i === 0 }));
  return (session.exercises ?? []).flatMap((exercise) =>
    [
      { text: exercise.name, name: true },
      exercise.sets
        .map(
          (s) =>
            `${s.kg} × ${s.reps || '—'}${s.kind === 'warmup' ? ' (W)' : ''}${!session.completed && !s.done ? ' · not checked' : ''}`,
        )
        .join('   '),
      ...(exercise.note ? [exercise.note] : []),
      '',
    ].map((row) => (typeof row === 'string' ? { text: row, name: false } : row)),
  );
}
export function renderWorkoutPhotos(session, theme = 'midnight') {
  const colour = photoPalette(theme);
  const width = 1170,
    padding = 78,
    font = 42,
    lineHeight = 66,
    maxHeight = 2200;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${font}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
  const wrap = (text) => {
    const output = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (measure.measureText(word).width > width - padding * 2) {
        if (line) {
          output.push(line);
          line = '';
        }
        let piece = '';
        for (const char of word) {
          if (measure.measureText(piece + char).width > width - padding * 2) {
            output.push(piece);
            piece = '';
          }
          piece += char;
        }
        line = piece;
        continue;
      }
      if (line && measure.measureText(line + ' ' + word).width > width - padding * 2) {
        output.push(line);
        line = word;
      } else line += (line ? ' ' : '') + word;
    }
    output.push(line);
    return output;
  };
  const lines = workoutPhotoRows(session).flatMap((row) =>
    wrap(row.text).map((text) => ({ text, name: row.name })),
  );
  if (!lines.length) lines.push({ text: 'No sets logged yet.', name: false });
  const title = String(session.plan || 'Workout');
  measure.font = '600 54px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  const titleRows = wrap(title),
    bodyTop = 300 + titleRows.length * 64,
    rowsPerPage = Math.floor((maxHeight - bodyTop - 65) / lineHeight),
    pages = [];
  for (let offset = 0; offset < lines.length; offset += rowsPerPage) {
    const rows = lines.slice(offset, offset + rowsPerPage),
      canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.max(700, bodyTop + 65 + rows.length * lineHeight);
    const c = canvas.getContext('2d');
    c.fillStyle = colour.bg;
    c.fillRect(0, 0, width, canvas.height);
    c.save();
    c.translate(65, 48);
    c.scale(1.35, 1.35);
    c.strokeStyle = colour.accent;
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.stroke(
      new Path2D(
        'M79 49c2 23-12 34-32 32S18 69 19 48 32 18 51 19s29 12 28 30Z M37 41l1 5 M62 40l1 5 M35 59q16 16 30-1',
      ),
    );
    c.restore();
    c.fillStyle = colour.accent;
    c.font = '28px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
    c.fillText('SHAVIT · YOUR COOL FRIEND', 200, 120);
    c.fillStyle = colour.text;
    c.font = '600 54px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
    titleRows.forEach((line, i) => c.fillText(line, padding, 230 + i * 64));
    c.fillStyle = colour.muted;
    c.font = '32px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
    c.fillText(
      `${session.date} · ${session.type === 'run' ? 'Run' : 'kg × reps · W = warm-up'}${session.completed ? '' : ' · In progress'}`,
      padding,
      bodyTop - 55,
    );
    rows.forEach((line, i) => {
      c.fillStyle = line.name ? colour.accent : colour.text;
      c.font = `${line.name ? '600 ' : ''}${font}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
      c.fillText(line.text, padding, bodyTop + i * lineHeight);
    });
    if (lines.length > rowsPerPage) {
      c.fillStyle = colour.muted;
      c.font = '26px Arial';
      c.fillText(
        `${pages.length + 1} / ${Math.ceil(lines.length / rowsPerPage)}`,
        width - 150,
        canvas.height - 26,
      );
    }
    pages.push(canvas.toDataURL('image/png'));
  }
  return pages;
}
