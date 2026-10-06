'use strict';

const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fullFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeStyle: 'medium' });

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "Heute um 14:03" / "Gestern um 09:12" / "03.10.2026 18:45"
function formatMessageTime(ts, now = Date.now()) {
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (diffDays === 0) return `Heute um ${timeFmt.format(ts)}`;
  if (diffDays === 1) return `Gestern um ${timeFmt.format(ts)}`;
  return `${dateFmt.format(ts)} ${timeFmt.format(ts)}`;
}

function formatShortTime(ts) {
  return timeFmt.format(ts);
}

function formatDayDivider(ts) {
  return longDateFmt.format(ts);
}

function formatFull(ts) {
  return fullFmt.format(ts);
}

module.exports = { formatMessageTime, formatShortTime, formatDayDivider, formatFull };
