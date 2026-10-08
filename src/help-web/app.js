'use strict';
// Helfer-Oberfläche (Issue #79). Verschlüsselt mit nacl (Schlüssel aus dem Link-Fragment #c=). Zeigt nur die
// geschwärzte Sicht, die der PC schickt. Nur textContent – nie innerHTML (keine fremden Skripte).
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var key = null;
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  try {
    var frag = new URLSearchParams(location.hash.slice(1));
    var raw = atob((frag.get('c') || '').replace(/-/g, '+').replace(/_/g, '/'));
    key = Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  } catch (e) { key = null; }

  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s); return Uint8Array.from(b, function (c) { return c.charCodeAt(0); }); }
  function seal(obj) {
    var n = nacl.randomBytes(nacl.secretbox.nonceLength);
    return { n: b64(n), c: b64(nacl.secretbox(enc.encode(JSON.stringify(obj)), n, key)) };
  }
  function unseal(msg) {
    if (!msg || !msg.c) return msg;
    var p = nacl.secretbox.open(unb64(msg.c), unb64(msg.n), key);
    return p ? JSON.parse(dec.decode(p)) : null;
  }
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }

  function show(el, on) { el.classList.toggle('hidden', !on); }
  var msg = $('msg');

  $('go').onclick = function () {
    if (!key) { msg.textContent = 'Ungültiger Link. Bitte den QR-Code neu scannen.'; return; }
    var code = ($('code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { msg.textContent = 'Der Code hat 6 Zeichen.'; return; }
    msg.textContent = 'Warte auf Bestätigung am anderen PC …';
    var sealed = seal({ name: $('name').value || 'Helfer', t: Date.now() });
    post('/pair', { code: code, n: sealed.n, c: sealed.c }).then(function (res) {
      var out = unseal(res);
      if (!out || out.error) { msg.textContent = (out && out.error) || res.error || 'Verbindung fehlgeschlagen.'; return; }
      show($('connect'), false);
      show($('live'), true);
      loop();
    }).catch(function () { msg.textContent = 'Verbindung fehlgeschlagen.'; });
  };

  function send(path, payload) {
    var body = seal(Object.assign({ t: Date.now() }, payload || {}));
    return post(path, body).then(function (r) { return unseal(r) || r; });
  }

  function renderFields(view) {
    var box = $('fields');
    box.textContent = '';
    (view.fields || []).forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'field' + (f.secret ? ' secret' : '');
      b.textContent = f.label || '(ohne Beschriftung)';
      if (f.secret) { b.disabled = true; b.title = 'Sicherheits-Feld – bedient nur der Nutzer'; }
      else b.onclick = function () { send('/act', { action: { type: 'click', target: f.id } }); };
      box.appendChild(b);
    });
  }

  function loop() {
    send('/view', {}).then(function (out) {
      if (!out || out.error) { $('note').textContent = (out && out.error) || 'Getrennt.'; return; }
      var v = out.view || {};
      $('screen').textContent = 'Bildschirm: ' + (v.screen || '?');
      $('note').textContent = v.note || '';
      $('control').textContent = out.control ? 'Du kannst mithelfen (Knöpfe klicken).' : 'Nur Zusehen – der Nutzer hat das Mitsteuern aus.';
      if (v.hidden) { $('fields').textContent = ''; }
      else renderFields(v);
      var cur = $('cursor');
      if (v.cursor) { show(cur, true); cur.style.left = (v.cursor.x - 8) + 'px'; cur.style.top = (v.cursor.y - 8) + 'px'; }
      else show(cur, false);
      setTimeout(loop, 900);
    }).catch(function () { $('note').textContent = 'Verbindung verloren.'; });
  }
})();
