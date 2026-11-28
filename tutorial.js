export function showTutorial(onDone) {
  if (document.getElementById('shavit-tutorial')) return;
  const steps = [
    [
      'A little plan. A little more together.',
      'Today is your home. Pick any day in the week, add a task or workout, and tick things off as you go.',
      'Today → Add task',
      'Work, reading, errands—make room for your whole day.',
    ],
    [
      'Your week, your way.',
      'In More → Edit weekly schedule, add any lifting split and runs on the days you want. Leave rest days empty. You can add extra workouts or move a session from Today.',
      'More → Edit weekly schedule',
      'A run only needs a done button. Planned rest days protect your training streak.',
    ],
    [
      'Make your first workout.',
      'Open Workouts → Create plan. Use the same name as your scheduled lift. Add exercises with total sets and warm-ups, or import a text note.',
      'Workouts → Create plan',
      'For example: schedule “Upper” and create a routine called “Upper”.',
    ],
    [
      'Log it. Make it yours.',
      'Open today’s workout, enter kg and reps, then check each set. Previous results appear beside your sets. Swap or remove an exercise just for this workout.',
      'Today → Open workout',
      'Check all your sets, then Finish workout. Your next session remembers your results.',
    ],
    [
      'Little wins, safely kept.',
      'Workouts → Progress shows your weekly recap, streak and weight and rep graphs. Workouts → History lists every finished workout.',
      'More → Export backup',
      'Everything saves in this browser. There is no account or automatic sync between devices. Export backups regularly; private browsing or clearing site data can lose your records.',
    ],
  ];
  const dialog = document.createElement('dialog');
  dialog.id = 'shavit-tutorial';
  dialog.className = 'tutorial';
  dialog.setAttribute('aria-labelledby', 'tour-title');
  document.body.append(dialog);
  let index = 0;
  const finish = async () => {
    try {
      await onDone();
      dialog.close();
      dialog.remove();
    } catch {
      dialog.querySelector('[role=alert]').textContent =
        'Could not save your preference. Please try again.';
    }
  };
  const draw = () => {
    const [title, body, path, note] = steps[index];
    dialog.innerHTML = `<div class="tour-top"><img src="/helper-icon.svg" alt="Shavit’s smiling face"><span>${index + 1} / ${steps.length}</span><button type="button" id="tour-skip">Skip tour</button></div><h2 id="tour-title">${title}</h2><p>${body}</p><div class="tour-path">${path}</div><p class="muted">${note}</p><p role="alert"></p><div class="tour-actions"><button type="button" id="tour-back" ${index === 0 ? 'disabled' : ''}>Back</button><button type="button" class="primary" id="tour-next">${index === steps.length - 1 ? 'Let’s go →' : 'Next →'}</button></div>`;
    dialog.querySelector('#tour-skip').onclick = finish;
    dialog.querySelector('#tour-back').onclick = () => {
      index--;
      draw();
    };
    dialog.querySelector('#tour-next').onclick = () => {
      if (index === steps.length - 1) finish();
      else {
        index++;
        draw();
      }
    };
    dialog.querySelector('#tour-next').focus();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    finish();
  });
  dialog.showModal();
  draw();
}
