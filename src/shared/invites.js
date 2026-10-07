'use strict';

// Discord-Einladungslinks erkennen: discord.gg/CODE, discord.com/invite/CODE, discordapp.com/invite/CODE oder nur CODE.
const CODE_RE = /^[A-Za-z0-9-]{2,32}$/;
const URL_RE = /^(?:https?:\/\/)?(?:www\.|ptb\.|canary\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?(?:[?#].*)?$/i;

/** @returns {string|null} der Einladungscode oder null */
function parseInviteCode(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || s.length > 200) return null;
  const m = URL_RE.exec(s);
  if (m) return m[1];
  return CODE_RE.test(s) ? s : null;
}

/** Offizieller Link zum Beitreten (öffnet Browser bzw. die Discord-App). */
function inviteJoinUrl(code) {
  return `https://discord.com/invite/${encodeURIComponent(code)}`;
}

module.exports = { parseInviteCode, inviteJoinUrl };
