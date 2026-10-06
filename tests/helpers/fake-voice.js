'use strict';

// Nachbau der Teile von @discordjs/voice, die src/main/voice.js nutzt (ohne Netzwerk).
// Enums (Status, StreamType, …) stammen aus der ECHTEN Bibliothek.
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const real = require('@discordjs/voice');

function createFakeVoiceLib({ readyOnJoin = true } = {}) {
  const lib = {
    VoiceConnectionStatus: real.VoiceConnectionStatus,
    StreamType: real.StreamType,
    NoSubscriberBehavior: real.NoSubscriberBehavior,
    EndBehaviorType: real.EndBehaviorType,
    joins: [],
    connections: [],
    players: [],
  };

  lib.joinVoiceChannel = (cfg) => {
    lib.joins.push(cfg);
    const conn = new EventEmitter();
    conn.joinConfig = cfg;
    conn.state = { status: real.VoiceConnectionStatus.Signalling };
    conn.readyOnJoin = readyOnJoin;
    conn.rejoins = [];
    conn.subscribed = null;
    conn.receiver = {
      speaking: new EventEmitter(),
      subscriptions: [],
      subscribe(userId, opts) {
        const s = new PassThrough({ objectMode: true });
        conn.receiver.subscriptions.push({ userId, opts, stream: s });
        return s;
      },
    };
    conn.subscribe = (player) => (conn.subscribed = player);
    conn.setStatus = (status) => {
      const old = conn.state;
      conn.state = { status };
      conn.emit('stateChange', old, conn.state);
    };
    conn.destroy = () => conn.setStatus(real.VoiceConnectionStatus.Destroyed);
    conn.rejoin = (c) => (conn.rejoins.push(c), true);
    lib.connections.push(conn);
    return conn;
  };

  lib.entersState = (target, status, timeout) =>
    new Promise((resolve, reject) => {
      if (target.state?.status === status) return resolve(target);
      if (status === real.VoiceConnectionStatus.Ready && target.readyOnJoin) {
        setImmediate(() => target.setStatus(status));
        return resolve(target);
      }
      const t = setTimeout(() => reject(new Error('timeout')), typeof timeout === 'number' ? Math.min(timeout, 50) : 50);
      target.on?.('stateChange', (_o, n) => n.status === status && (clearTimeout(t), resolve(target)));
    });

  lib.createAudioPlayer = (opts) => {
    const p = { opts, played: [], stopped: 0, play: (r) => p.played.push(r), stop: () => (p.stopped += 1) };
    lib.players.push(p);
    return p;
  };
  lib.createAudioResource = (stream, opts) => ({ stream, opts });
  return lib;
}

module.exports = { createFakeVoiceLib };
