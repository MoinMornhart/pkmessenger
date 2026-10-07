'use strict';

const { validators } = require('./validate');
const { describeError } = require('./errors');

/**
 * Definiert alle erlaubten IPC-Kanäle. Jeder Handler:
 *  1. prüft, dass die Anfrage aus unserem eigenen Fenster kommt,
 *  2. validiert den Payload,
 *  3. liefert IMMER { ok: true, data } oder { ok: false, error: { code, message, hint } } – nie eine Exception.
 */
function buildHandlers({ service, store, openEnvFile, openExternal, updater, appVersion, voice, tokenStore, setScreenProtection, ai, soundFile, copyText, appLock, autostart }) {
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
    // Moderation (nur mit Bot-Rechten; Kick/Bann fragt die Oberfläche vorher nach)
    'pk:channel-rename': (p) => service.renameChannel(validators.channelRename(p)),
    'pk:channel-move': (p) => service.moveChannel(validators.channelMove(p)),
    'pk:member-info': (p) => service.getMemberInfo(validators.memberRef(p)),
    'pk:member-role': (p) => service.setMemberRole(validators.memberRole(p)),
    'pk:member-timeout': (p) => service.timeoutMember(validators.memberTimeout(p)),
    'pk:member-kick': (p) => service.kickMember(validators.memberKick(p)),
    'pk:member-ban': (p) => service.banMember(validators.memberBan(p)),
    'pk:copy-text': (p) => {
      copyText?.(validators.copyText(p));
      return true;
    },
    // KI-Agenten (Beta) – der API-Schlüssel geht nur hinein, nie heraus
    'pk:ai-get': () => requireAi().getConfig(),
    'pk:ai-set-config': (p) => requireAi().setConfig(validators.aiConfig(p)),
    'pk:ai-set-key': (p) => requireAi().setKey(validators.aiKey(p)),
    'pk:ai-clear-key': () => requireAi().clearKey(),
    'pk:ai-test': () => requireAi().test(),
    'pk:ai-save-job': (p) => requireAi().saveJob(validators.aiJob(p)),
    'pk:ai-delete-job': (p) => requireAi().deleteJob(validators.aiJobRef(p)),
    'pk:ai-run-job': (p) => requireAi().runJob(validators.aiJobRef(p)),
    'pk:ai-preview-job': (p) => requireAi().previewJob(validators.aiJob(p)), // postet NIE
    'pk:ai-set-limits': (p) => requireAi().setLimits(validators.aiLimits(p)),
    'pk:ai-save-profile': (p) => requireAi().saveProfile(validators.aiProfileName(p)),
    'pk:ai-use-profile': (p) => requireAi().useProfile(validators.aiJobRef(p)),
    'pk:ai-delete-profile': (p) => requireAi().deleteProfile(validators.aiJobRef(p)),
    'pk:ai-abort': () => ({ aborted: requireAi().abort() }),
    'pk:ai-set-responder': (p) => requireAi().setResponder(validators.aiResponder(p)),
    'pk:ai-models': (p) => requireAi().models(validators.aiModels(p)),
    'pk:ai-find-local': () => requireAi().findLocal(),
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
    'pk:get-settings': () => {
      const { appLock: _lock, ...rest } = store.get(); // Passwort-Hash nie an die Oberfläche
      return rest;
    },
    // App-Sperre (nur Hash gespeichert; solange gesperrt, sind alle anderen Kanäle zu – siehe wrap())
    'pk:lock-status': () => (appLock ? appLock.status() : { enabled: false, locked: false }),
    'pk:lock-verify': (p) => appLock.verify(validators.lockPassword(p).password),
    'pk:lock-set': (p) => appLock.set(validators.lockSet(p)),
    'pk:lock-idle': (p) => appLock.setIdle(validators.lockIdle(p)),
    'pk:lock-clear': (p) => appLock.clear({ current: validators.lockPassword(p).password }),
    'pk:lock-now': () => appLock.lock(),
    // Mit Windows starten (nur installierte App)
    'pk:autostart-get': () => (autostart ? autostart.get() : { available: false, enabled: false }),
    'pk:autostart-set': (p) => {
      if (!autostart?.get().available) throw Object.assign(new Error('Autostart gibt es nur in der installierten App.'), { code: 'VALIDATION' });
      return autostart.set(validators.flag(p));
    },
    // Eigener Benachrichtigungston (liegt nur lokal im App-Ordner)
    'pk:sound-custom-info': () => ({ has: Boolean(soundFile?.has()) }),
    'pk:sound-custom-get': () => (soundFile ? soundFile.get() : null),
    'pk:sound-custom-set': (p) => {
      if (!soundFile) throw Object.assign(new Error('Eigene Töne sind hier nicht verfügbar.'), { code: 'NOT_FOUND' });
      soundFile.set(validators.soundFile(p));
      return { has: true };
    },
    'pk:sound-custom-clear': () => {
      soundFile?.clear();
      return { has: false };
    },
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

// Diese Kanäle gehen auch, wenn die App gesperrt ist (alles andere wird abgelehnt)
const ALLOWED_WHILE_LOCKED = new Set(['pk:lock-status', 'pk:lock-verify', 'pk:get-status', 'pk:get-app-info']);

function wrap(handler, isTrustedSender, channel = '', isLocked = () => false) {
  return async (event, payload) => {
    if (!isTrustedSender(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Anfrage aus unbekannter Quelle abgelehnt.', hint: '' } };
    if (isLocked() && !ALLOWED_WHILE_LOCKED.has(channel)) return { ok: false, error: { code: 'LOCKED', message: 'PKMessenger ist gesperrt.', hint: 'Bitte mit dem Passwort entsperren.' } };
    try {
      return { ok: true, data: await handler(payload) };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  };
}

function registerIpc(ipcMain, deps, isTrustedSender) {
  const handlers = buildHandlers(deps);
  const isLocked = () => Boolean(deps.appLock?.isLocked());
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, wrap(handler, isTrustedSender, channel, isLocked));
  // Mikrofon-Pakete: ~50 pro Sekunde → "fire and forget" statt invoke. Prüfung auf Herkunft + Größe in voice.pushPacket().
  if (deps.voice) {
    ipcMain.on('pk:voice-packet', (event, data) => {
      if (isTrustedSender(event) && !isLocked()) deps.voice.pushPacket(data);
    });
  }
  return Object.keys(handlers);
}

module.exports = { buildHandlers, wrap, registerIpc };
