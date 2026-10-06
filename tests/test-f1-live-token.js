'use strict';

// F1 (echtes Netzwerk): Ein formal korrekter, aber ausgedachter Token wird von Discord abgelehnt.
// Nutzt den ECHTEN discord.js-Client. Genau EINE Anfrage an Discord. Überspringen mit PK_SKIP_NETWORK=1.
const test = require('node:test');
const assert = require('node:assert/strict');
const discord = require('discord.js');
const { createDiscordService } = require('../src/main/discord');
const { tmpEnv, FAKE_TOKEN } = require('./helpers/fake-discord');

test('Echter Login mit falschem Token → TOKEN_INVALID (deutsche Meldung)', { skip: process.env.PK_SKIP_NETWORK === '1', timeout: 30000 }, async () => {
  const events = [];
  const service = createDiscordService({ discord, envPath: tmpEnv(`DISCORD_TOKEN=${FAKE_TOKEN}\n`), emit: (t, p) => events.push({ t, p }) });
  const st = await service.connect();
  console.log('    Status von Discord:', JSON.stringify({ state: st.state, code: st.error?.code, message: st.error?.message }));
  if (st.error?.code === 'NETWORK') return test.skip?.('kein Internet');
  assert.equal(st.state, 'setup');
  assert.equal(st.error.code, 'TOKEN_INVALID');
});
