'use strict';

// Schmale, benannte API für den Renderer. Kein Zugriff auf ipcRenderer, Node oder den Token.
const { contextBridge, ipcRenderer } = require('electron');

const EVENT_TYPES = new Set([
  'status',
  'message:create',
  'message:update',
  'message:delete',
  'typing',
  'guilds:changed',
  'channels:changed',
  'ratelimit',
  'log',
  'update',
  'voice:state',
  'voice:speaking',
  'voice:members',
  'threads:changed',
  'interaction',
]);

const call = (channel) => (payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  getStatus: call('pk:get-status'),
  getAppInfo: call('pk:get-app-info'),
  checkForUpdates: call('pk:check-updates'),
  installUpdate: call('pk:install-update'),
  connect: call('pk:connect'),
  openEnvFile: call('pk:open-env-file'),
  getInviteUrl: call('pk:get-invite-url'),
  listGuilds: call('pk:list-guilds'),
  listChannels: call('pk:list-channels'),
  getPreviews: call('pk:get-previews'),
  getMessages: call('pk:get-messages'),
  sendMessage: call('pk:send-message'),
  sendTyping: call('pk:send-typing'),
  searchMentionables: call('pk:search-mentionables'),
  getSettings: call('pk:get-settings'),
  setReadMarker: call('pk:set-read-marker'),
  setLastLocation: call('pk:set-last-location'),
  openExternal: call('pk:open-external'),
  tokenInfo: call('pk:token-info'),
  tokenSave: call('pk:token-save'),
  tokenClear: call('pk:token-clear'),
  invitePreview: call('pk:invite-preview'),
  editMessage: call('pk:edit-message'),
  endPoll: call('pk:end-poll'),
  deleteMessage: call('pk:delete-message'),
  react: call('pk:react'),
  listPins: call('pk:list-pins'),
  setPinned: call('pk:set-pinned'),
  listThreads: call('pk:list-threads'),
  createThread: call('pk:create-thread'),
  getThread: call('pk:get-thread'),
  searchMessages: call('pk:search-messages'),
  listEmojis: call('pk:list-emojis'),
  commandsState: call('pk:commands-state'),
  refresh: call('pk:refresh'),
  channelAccess: call('pk:channel-access'),
  // Sprachkanäle
  listVoiceMembers: call('pk:list-voice-members'),
  voiceState: call('pk:voice-state'),
  voiceJoin: call('pk:voice-join'),
  voiceLeave: call('pk:voice-leave'),
  voiceTalk: call('pk:voice-talk'),
  voiceListen: call('pk:voice-listen'),
  voicePacket(data) {
    if (data instanceof Uint8Array && data.byteLength > 0 && data.byteLength <= 1500) ipcRenderer.send('pk:voice-packet', data);
  },
  onVoiceAudio(callback) {
    const listener = (_e, msg) => {
      if (msg && typeof msg.userId === 'string' && msg.data instanceof Uint8Array) callback(msg.userId, msg.data);
    };
    ipcRenderer.on('pk:voice-audio', listener);
    return () => ipcRenderer.removeListener('pk:voice-audio', listener);
  },
  // Abo auf Live-Events. Gibt eine Abmelde-Funktion zurück.
  onEvent(callback) {
    const listener = (_e, msg) => {
      if (msg && EVENT_TYPES.has(msg.type)) callback(msg.type, msg.payload);
    };
    ipcRenderer.on('pk:event', listener);
    return () => ipcRenderer.removeListener('pk:event', listener);
  },
});
