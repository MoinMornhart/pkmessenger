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
]);

const call = (channel) => (payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('api', {
  getStatus: call('pk:get-status'),
  connect: call('pk:connect'),
  openEnvFile: call('pk:open-env-file'),
  getInviteUrl: call('pk:get-invite-url'),
  listGuilds: call('pk:list-guilds'),
  listChannels: call('pk:list-channels'),
  getMessages: call('pk:get-messages'),
  sendMessage: call('pk:send-message'),
  sendTyping: call('pk:send-typing'),
  searchMentionables: call('pk:search-mentionables'),
  getSettings: call('pk:get-settings'),
  setReadMarker: call('pk:set-read-marker'),
  setLastLocation: call('pk:set-last-location'),
  openExternal: call('pk:open-external'),
  // Abo auf Live-Events. Gibt eine Abmelde-Funktion zurück.
  onEvent(callback) {
    const listener = (_e, msg) => {
      if (msg && EVENT_TYPES.has(msg.type)) callback(msg.type, msg.payload);
    };
    ipcRenderer.on('pk:event', listener);
    return () => ipcRenderer.removeListener('pk:event', listener);
  },
});
