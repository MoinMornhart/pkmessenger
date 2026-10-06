'use strict';

// Rate-Limit-Simulation: Ein lokaler Fake-Discord-Server antwortet zuerst mit 429 + retry_after.
// Geprüft wird der ECHTE REST-Client von discord.js (@discordjs/rest): er muss warten und dann erneut senden.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { REST, RESTEvents } = require('discord.js');

test('429 mit retry_after → REST-Client wartet und wiederholt automatisch', { timeout: 20000 }, async () => {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(Date.now());
    if (hits.length === 1) {
      res.writeHead(429, {
        'content-type': 'application/json',
        'retry-after': '1',
        'x-ratelimit-scope': 'user',
        'x-ratelimit-global': 'false',
      });
      res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.8, global: false }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: '444444444444444401', ok: true }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const rest = new REST({ api: `http://127.0.0.1:${port}`, version: '10', retries: 2 }).setToken('test-token-nur-lokal');
  const limited = [];
  rest.on(RESTEvents.RateLimited, (info) => limited.push(info));
  try {
    const data = await rest.get('/channels/444444444444444401');
    assert.equal(data.ok, true);
    assert.equal(hits.length, 2, 'genau ein Wiederholungsversuch');
    const waited = hits[1] - hits[0];
    console.log(`    gewartet: ${waited} ms (retry_after = 800 ms), RateLimited-Events: ${limited.length}`);
    assert.ok(waited >= 750, `zu früh wiederholt: ${waited} ms`);
  } finally {
    server.close();
  }
});
