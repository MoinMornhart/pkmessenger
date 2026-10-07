'use strict';

// Zeitpläne für KI-Agenten (Beta): „alle N Minuten“ (mind. 15, damit kein Spam entsteht)
// oder „täglich um HH:MM“ an ausgewählten Wochentagen (0 = Sonntag … 6 = Samstag, wie Date#getDay).
const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function isValidSchedule(s) {
  if (!s || typeof s !== 'object') return false;
  if (s.kind === 'interval') return Number.isInteger(s.minutes) && s.minutes >= MIN_INTERVAL_MINUTES && s.minutes <= MAX_INTERVAL_MINUTES;
  if (s.kind === 'daily')
    return (
      typeof s.time === 'string' &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time) &&
      Array.isArray(s.days) &&
      s.days.length >= 1 &&
      s.days.length <= 7 &&
      s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
      new Set(s.days).size === s.days.length
    );
  return false;
}

/** Nächster Ausführungszeitpunkt nach `from` (ms) oder null. Lokale Zeit des PCs. */
function nextRun(s, from = Date.now()) {
  if (!isValidSchedule(s)) return null;
  if (s.kind === 'interval') return from + s.minutes * 60000;
  const [h, m] = s.time.split(':').map(Number);
  const d = new Date(from);
  for (let i = 0; i <= 7; i++) {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, h, m, 0, 0);
    if (c.getTime() > from && s.days.includes(c.getDay())) return c.getTime();
  }
  return null;
}

/** „alle 30 Min.“ / „täglich um 08:00“ / „Mo, Mi, Fr um 18:30“ */
function describeSchedule(s) {
  if (!isValidSchedule(s)) return 'ungültiger Zeitplan';
  if (s.kind === 'interval') {
    if (s.minutes % 60 === 0) return s.minutes === 60 ? 'jede Stunde' : `alle ${s.minutes / 60} Std.`;
    return `alle ${s.minutes} Min.`;
  }
  const days = [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Montag zuerst
  if (days.length === 7) return `täglich um ${s.time}`;
  if (days.join() === '1,2,3,4,5') return `werktags um ${s.time}`;
  if (days.join() === '6,0') return `am Wochenende um ${s.time}`;
  return `${days.map((x) => DAY_NAMES[x]).join(', ')} um ${s.time}`;
}

module.exports = { MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, DAY_NAMES, isValidSchedule, nextRun, describeSchedule };
