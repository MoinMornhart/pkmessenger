'use strict';

const { validators } = require('./validate');
const { describeError } = require('./errors');

/**
 * Definiert alle erlaubten IPC-Kanäle. Jeder Handler:
 *  1. prüft, dass die Anfrage aus unserem eigenen Fenster kommt,
 *  2. validiert den Payload,
 *  3. liefert IMMER { ok: true, data } oder { ok: false, error: { code, message, hint } } – nie eine Exception.
 */
function buildHandlers({ service, store, openEnvFile, openExternal, updater, appVersion, voice, tokenStore, setScreenProtection, ai }) {
  const requireAi = () => {
    if (!ai) throw Object.assign(new Error('KI-Agenten sind nicht verfügbar.'), { code: 'NOT_FOUND' });
    return ai;
  };
  const requireVoice = () => {
    if (!voice) throw Object.assign(new Error('Sprachfunktion nicht verfügbar.'), { code: 'NOT_FOUND' });
    return voice;
  };
  const requireTokens = () => {
    if (!tokenStore) throw Object.assign(new Error('Im Demo-Modus gibt es keinen Token-Tresor.'), { code: 'NOT_FOUND' });
    return tokenStore;
  };
  return {
    // Token: Oberfläche bekommt NIE den Token zurück, nur Status/Bot-ID.
    'pk:token-info': () => (tokenStore ? tokenStore.info() : { stored: false, demo: true }),
    'pk:token-save': async (p) => {
      const info = requireTokens().save(validators.tokenInput(p));
      const status = await service.connect();
      return { info, state: status.state, error: status.error || null };
    },
    'pk:token-clear': async () => {
      const info = requireTokens().clear();
      await service.connect(); // → Setup-Ansicht
      return info;
    },
    // F7–F15
    'pk:edit-message': (p) => service.editMessage(validators.editMessage(p)),
    'pk:end-poll': (p) => service.endPoll(validators.messageRef(p)),
    'pk:delete-message': (p) => service.deleteMessage(validators.messageRef(p)),
    'pk:react': (p) => service.react(validators.react(p)),
    'pk:list-pins': (p) => service.listPins(validators.channelRef(p)),
    'pk:set-pinned': (p) => service.setPinned(validators.pin(p)),
    'pk:list-threads': (p) => service.listThreads(validators.channelRef(p)),
    'pk:create-thread': (p) => service.createThread(validators.threadCreate(p)),
    'pk:get-thread': (p) => service.getThread(validators.threadRef(p)),
    'pk:search-messages': (p) => service.searchMessages(validators.search(p)),
    'pk:list-emojis': (p) => service.listEmojis(validators.guildRef(p)),
    'pk:commands-state': () => service.getCommandsState(),
    'pk:list-dms': () => service.listDMs(),
    // KI-Agenten (Beta) – der API-Schlüssel geht nur hinein, nie heraus
    'pk:ai-get': () => requireAi().getConfig(),
    'pk:ai-set-config': (p) => requireAi().setConfig(validators.aiConfig(p)),
    'pk:ai-set-key': (p) => requireAi().setKey(validators.aiKey(p)),
    'pk:ai-clear-key': () => requireAi().clearKey(),
    'pk:ai-test': () => requireAi().test(),
    'pk:ai-save-job': (p) => requireAi().saveJob(validators.aiJob(p)),
    'pk:ai-delete-job': (p) => requireAi().deleteJob(validators.aiJobRef(p)),
    'pk:ai-run-job': (p) => requireAi().runJob(validators.aiJobRef(p)),
    'pk:ai-set-responder': (p) => requireAi().setResponder(validators.aiResponder(p)),
    'pk:open-dm': (p) => service.openDM(validators.userRef(p)),
    'pk:get-profile': (p) => service.getProfile(validators.profileRef(p)),
    'pk:update-profile': (p) => service.updateProfile(validators.profileUpdate(p)),
    'pk:refresh':(p) => service.refresh(validators.optionalGuildRef(p)),
    'pk:channel-access': (p) => service.getChannelAccess(validators.guildRef(p)),
    'pk:list-voice-members': (p) => service.listVoiceMembers(validators.guildRef(p)),
    'pk:voice-state': () => (voice ? voice.getState() : { state: 'idle' }),
    'pk:voice-join': (p) => requireVoice().join(validators.voiceJoin(p)),
    'pk:voice-leave': () => requireVoice().leave(),
    'pk:voice-talk': (p) => requireVoice().setTalking(validators.flag(p)),
    'pk:voice-listen': (p) => requireVoice().setListening(validators.flag(p)),
    'pk:get-app-info': () => ({ version: appVersion || null, update: updater ? updater.getState() : { state: 'disabled' } }),
    'pk:check-updates': () => (updater ? updater.check() : null),
    'pk:install-update': () => (updater ? updater.install() : false),
    'pk:get-status': () => service.getStatus(),
    'pk:connect': () => service.connect(),
    'pk:open-env-file': () => openEnvFile(),
    'pk:get-invite-url': (p) => service.getInviteUrl(validators.optionalGuildRef(p)),
    'pk:invite-preview': (p) => service.previewInvite(validators.inviteInput(p)),
    'pk:list-guilds': () => service.listGuilds(),
    'pk:list-channels': (p) => service.listChannels(validators.guildRef(p)),
    'pk:get-previews': (p) => service.getPreviews(validators.guildRef(p)),
    'pk:get-messages':(p) => service.getMessages(validators.getMessages(p)),
    'pk:send-message': (p) => service.sendMessage(validators.sendMessage(p)),
    'pk:send-typing': (p) => service.sendTyping(validators.channelRef(p)),
    'pk:search-mentionables': (p) => service.searchMentionables(validators.searchMentionables(p)),
    'pk:get-settings': () => store.get(),
    'pk:set-screen-protection': (p) => {
      const on = validators.flag(p);
      store.set('screenProtection', on);
      setScreenProtection?.(on);
      return on;
    },
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
  // Mikrofon-Pakete: ~50 pro Sekunde → "fire and forget" statt invoke. Prüfung auf Herkunft + Größe in voice.pushPacket().
  if (deps.voice) {
    ipcMain.on('pk:voice-packet', (event, data) => {
      if (isTrustedSender(event)) deps.voice.pushPacket(data);
    });
  }
  return Object.keys(handlers);
}

module.exports = { buildHandlers, wrap, registerIpc };
