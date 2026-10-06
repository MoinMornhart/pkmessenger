'use strict';

const { validators } = require('./validate');
const { describeError } = require('./errors');

/**
 * Definiert alle erlaubten IPC-Kanäle. Jeder Handler:
 *  1. prüft, dass die Anfrage aus unserem eigenen Fenster kommt,
 *  2. validiert den Payload,
 *  3. liefert IMMER { ok: true, data } oder { ok: false, error: { code, message, hint } } – nie eine Exception.
 */
function buildHandlers({ service, store, openEnvFile, openExternal }) {
  return {
    'pk:get-status': () => service.getStatus(),
    'pk:connect': () => service.connect(),
    'pk:open-env-file': () => openEnvFile(),
    'pk:get-invite-url': () => service.getInviteUrl(),
    'pk:list-guilds': () => service.listGuilds(),
    'pk:list-channels': (p) => service.listChannels(validators.guildRef(p)),
    'pk:get-messages': (p) => service.getMessages(validators.getMessages(p)),
    'pk:send-message': (p) => service.sendMessage(validators.sendMessage(p)),
    'pk:send-typing': (p) => service.sendTyping(validators.channelRef(p)),
    'pk:search-mentionables': (p) => service.searchMentionables(validators.searchMentionables(p)),
    'pk:get-settings': () => store.get(),
    'pk:set-read-marker': (p) => {
      const { channelId, messageId } = validators.readMarker(p);
      store.setReadMarker(channelId, messageId);
      return true;
    },
    'pk:set-last-location': (p) => {
      const { guildId, channelId } = validators.lastLocation(p);
      store.set('lastGuildId', guildId);
      store.set('lastChannelId', channelId);
      return true;
    },
    'pk:open-external': (p) => openExternal(validators.externalUrl(p).url),
  };
}

function wrap(handler, isTrustedSender) {
  return async (event, payload) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Anfrage aus unbekannter Quelle abgelehnt.', hint: '' } };
    try {
      return { ok: true, data: await handler(payload) };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  };
}

function registerIpc(ipcMain, deps, isTrustedSender) {
  const handlers = buildHandlers(deps);
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, wrap(handler, isTrustedSender));
  return Object.keys(handlers);
}

module.exports = { buildHandlers, wrap, registerIpc };
