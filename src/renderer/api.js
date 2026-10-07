// Dünne Hülle um window.api (aus preload.js): wandelt { ok:false, error } in eine Exception mit deutscher Meldung.
const raw = window.api;

function call(name) {
  return async (payload) => {
    const res = await raw[name](payload);
    if (!res || !res.ok) {
      const info = res?.error || { code: 'UNKNOWN', message: 'Unbekannter Fehler.', hint: '' };
      const err = new Error(info.message);
      err.code = info.code;
      err.hint = info.hint;
      throw err;
    }
    return res.data;
  };
}

export const api = Object.fromEntries(
  [
    'getStatus',
    'getAppInfo',
    'checkForUpdates',
    'installUpdate',
    'connect',
    'openEnvFile',
    'getInviteUrl',
    'listGuilds',
    'listChannels',
    'getPreviews',
    'getMessages',
    'sendMessage',
    'sendTyping',
    'searchMentionables',
    'getSettings',
    'setReadMarker',
    'setLastLocation',
    'openExternal',
    'tokenInfo',
    'tokenSave',
    'tokenClear',
    'invitePreview',
    'editMessage',
    'deleteMessage',
    'react',
    'listPins',
    'setPinned',
    'listThreads',
    'createThread',
    'getThread',
    'searchMessages',
    'listEmojis',
    'commandsState',
    'refresh',
    'channelAccess',
    'listVoiceMembers',
    'voiceState',
    'voiceJoin',
    'voiceLeave',
    'voiceTalk',
    'voiceListen',
  ].map((n) => [n, call(n)]),
);

export const onEvent = (cb) => raw.onEvent(cb);
export const voicePacket = (data) => raw.voicePacket(data);
export const onVoiceAudio = (cb) => raw.onVoiceAudio(cb);
