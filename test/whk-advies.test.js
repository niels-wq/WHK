'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');

var SLEUTEL = 'test-key-not-real-whk-advies-9f3c';
process.env.XAI_API_KEY = SLEUTEL;
process.env.SPAM_HMAC_SECRET = 'whk-advies-test-secret';
process.env.WHK_CAPTURE_LEADS = '1';
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.LEAD_WEBHOOK_URL;
delete process.env.XAI_API_BASE;

var spamGuard = require('../lib/spam-guard');
var advies = require('../lib/whk-advies');
var app = require('../server');

var logs = [];
var origLog = console.log;
var origErr = console.error;
console.log = function () {
  logs.push(Array.prototype.map.call(arguments, String).join(' '));
  return origLog.apply(console, arguments);
};
console.error = function () {
  logs.push(Array.prototype.map.call(arguments, String).join(' '));
  return origErr.apply(console, arguments);
};

var mockHits = 0;
var authKlopt = false;
var mockMode = 'ok';

function modelJson() {
  return JSON.stringify({
    samenvatting: 'Kort beeld \u2014 van een middelgrote werkgever met een hogere WGA-component.',
    aandachtspunten: 'De beschikking is nog niet nagekeken. Dat is het aandachtspunt.',
    beschikking: 'Laat de loonsom, de premiecomponenten en de toerekening nakijken.',
    wga: 'Er is WGA-instroom genoemd. Het risico vraagt aandacht. Geen bedrag toegevoegd.',
    ziektewet: 'Er zijn Ziektewet-uitkeringen na einde dienstverband genoemd.',
    vervolgstappen: 'Vraag de gratis check door een specialist aan. Het advies is indicatief.'
  });
}

global.fetch = function (url, opts) {
  mockHits += 1;
  var headers = (opts && opts.headers) || {};
  authKlopt = headers.Authorization === 'Bearer ' + process.env.XAI_API_KEY;
  var raw = String((opts && opts.body) || '');
  if (raw.indexOf(SLEUTEL) !== -1 || /bearer/i.test(raw)) authKlopt = false;
  if (String(url).indexOf(SLEUTEL) !== -1) authKlopt = false;
  if (mockMode === 'down') {
    return Promise.resolve({ ok: false, status: 503, json: function () { return Promise.resolve({}); } });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: function () {
      return Promise.resolve({ choices: [{ message: { content: modelJson() } }] });
    }
  });
};

function request(method, urlPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var payload = body ? JSON.stringify(body) : '';
    var hdrs = Object.assign({}, headers || {});
    if (body) {
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = Buffer.byteLength(payload);
    }
    var req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: urlPath,
      method: method,
      headers: hdrs
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var buf = Buffer.concat(chunks);
        var text = buf.toString('utf8');
        var json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text: text, json: json, buf: buf });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function stamped(body) {
  return Object.assign({ website: '' }, body, { whk_ts: spamGuard.issue(Date.now() - 5000) });
}

function geldig(extra) {
  return stamped(Object.assign({
    premie: 'Middelgrote werkgever. Het WGA-deel op de laatste brief ligt hoger dan het jaar ervoor. Het ZW-deel is gelijk gebleven.',
    toelichting: 'We willen weten of de toerekening klopt.',
    regeling: 'publiek',
    wgaInstroom: 'ja',
    wgaRisico: 'aandacht',
    ziektewet: 'ja',
    beschikking: 'nog-niet',
    email: 'jan@bedrijf.nl',
    telefoon: '',
    avg: true
  }, extra || {}));
}

function countH1(html) {
  var m = html.match(/<h1\b/gi);
  return m ? m.length : 0;
}

var server = app.listen(0, '127.0.0.1', function () {
  var leadsBefore = app.capturedLeads.length;
  Promise.resolve()
    .then(function () { return request('GET', '/whk-advies-generator'); })
    .then(function (res) {
      assert.strictEqual(res.status, 200, 'route status');
      assert.strictEqual(countH1(res.text), 1, 'precies een h1');
      assert.ok(res.text.indexOf('>Genereer vrijblijvend een WHK-advies<') !== -1, 'h1');
      assert.ok(res.text.indexOf('<title>Gratis WHK-adviesgenerator | Werkhervattingskas.nl</title>') !== -1, 'title');
      assert.ok(res.text.indexOf('rel="canonical" href="https://werkhervattingskas.nl/whk-advies-generator"') !== -1, 'canonical');
      assert.ok(res.text.indexOf('name="description" content="Genereer vrijblijvend een indicatief WHK-advies') !== -1, 'description');
      assert.strictEqual(res.text.indexOf(SLEUTEL), -1, 'sleutel in html');
      assert.strictEqual(res.text.indexOf('XAI_API_KEY'), -1, 'env-naam in html');
      assert.ok(res.text.indexOf('api.x.ai') === -1, 'api-host in html');
      assert.strictEqual(res.text.split(advies.WAARSCHUWING).length - 1, 2, 'waarschuwing twee keer');
      assert.ok(res.text.indexOf(advies.DISCLAIMER) !== -1, 'disclaimer');
      assert.ok(res.text.indexOf('id="whk-advies-website"') !== -1, 'honeypot');
      assert.ok(res.text.indexOf('id="whk-advies-avg"') !== -1, 'avg');
      assert.ok(res.text.indexOf('whk_advies_start') !== -1, 'event start');
      assert.ok(res.text.indexOf('whk_advies_lead') !== -1, 'event lead');
      assert.ok(res.text.indexOf('whk_advies_download') !== -1, 'event download');
      assert.ok(res.text.indexOf('id="home-view"') === -1, 'andere view blijft weg');
      var blocks = [];
      var re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
      var m;
      while ((m = re.exec(res.text))) {
        try { blocks.push(JSON.parse(m[1])); } catch (e) { /* andere blokken blijven staan */ }
      }
      var flat = [];
      blocks.forEach(function (b) {
        if (b && b['@graph']) flat = flat.concat(b['@graph']);
        else flat.push(b);
      });
      var appLd = flat.filter(function (b) { return b && b['@type'] === 'WebApplication'; })[0];
      var faq = flat.filter(function (b) { return b && b['@type'] === 'FAQPage'; })[0];
      assert.ok(appLd, 'WebApplication');
      assert.strictEqual(appLd.name, 'WHK-adviesgenerator');
      assert.strictEqual(appLd.offers.price, '0');
      assert.ok(faq, 'FAQPage');
      assert.ok(faq.mainEntity.length >= 4 && faq.mainEntity.length <= 5, 'faq aantal');
      faq.mainEntity.forEach(function (vraag) {
        assert.ok(res.text.indexOf(vraag.name) !== -1, 'faq zichtbaar ' + vraag.name);
        assert.ok(vraag.name.indexOf('\u2014') === -1 && vraag.name.indexOf('\u2013') === -1, 'faq streep');
      });
      var sectie = res.text.slice(res.text.indexOf('id="whk-advies-view"'), res.text.indexOf('id="whk-advies-faq"') + 4000);
      assert.ok(sectie.indexOf('\u2014') === -1 && sectie.indexOf('\u2013') === -1, 'pagina zonder streep');
      assert.ok(!/no[\s-]*cure[\s-]*no[\s-]*pay/i.test(res.text), 'no cure');
      assert.ok(res.text.indexOf('47.000') === -1, 'verboden bedrag');
      assert.ok(res.text.indexOf('8 van de 10') === -1, 'verboden statistiek');
      return request('GET', '/');
    })
    .then(function (home) {
      assert.ok(home.text.indexOf('class="whk-nav-promo"') !== -1, 'nav promo');
      assert.ok(home.text.indexOf('class="wvz-nav"') !== -1 && home.text.indexOf('href="/whk-advies-generator"') !== -1, 'nav link');
      assert.ok(home.text.indexOf('mobile-nav-list') !== -1 && home.text.indexOf('Genereer vrijblijvend een WHK-advies') !== -1, 'mobiele nav');
      assert.ok(home.text.indexOf('class="hero-advies-cta"') !== -1, 'hero');
      assert.ok(home.text.indexOf('class="wvz-footer"') !== -1 && home.text.indexOf('href="/whk-advies-generator"') !== -1, 'footer');
      assert.ok(home.text.indexOf('id="whk-advies-sticky"') !== -1, 'sticky');
      assert.ok(home.text.indexOf('id="whk-advies-view"') === -1, 'formulier niet op home');
      assert.ok(home.text.indexOf('z-index:580') !== -1, 'sticky onder de popup');
      assert.ok(home.text.indexOf('.exit-intent-bg{position:fixed;inset:0;background:rgba(17,25,43,.55);z-index:900;') !== -1, 'exit-intent blijft erboven');
      return request('GET', '/blog/whk-beschikking-lezen-in-10-minuten');
    })
    .then(function (artikel) {
      assert.strictEqual(artikel.status, 200, 'artikel');
      assert.ok(artikel.text.indexOf('id="whk-advies-artikel"') !== -1, 'onder het artikel');
      assert.ok(artikel.text.indexOf('Genereer vrijblijvend een WHK-advies') !== -1, 'artikel-cta');
      assert.strictEqual(countH1(artikel.text), 1, 'artikel houdt een h1');
      return request('GET', '/sitemap.xml');
    })
    .then(function (xml) {
      assert.ok(xml.text.indexOf('<loc>https://werkhervattingskas.nl/whk-advies-generator</loc>') !== -1, 'sitemap');
      return request('GET', '/llms.txt');
    })
    .then(function (llms) {
      assert.ok(llms.text.indexOf('https://werkhervattingskas.nl/whk-advies-generator') !== -1, 'llms url');
      assert.ok(llms.text.indexOf('WHK-adviesgenerator') !== -1, 'llms label');
      assert.ok(llms.text.indexOf('\u2014') === -1, 'llms streep');
      leadsBefore = app.capturedLeads.length;
      return request('POST', '/api/whk-advies', geldig({ email: '', telefoon: '' }), { 'x-forwarded-for': '203.0.113.61' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 400, 'zonder contact');
      assert.strictEqual(res.json.ok, false);
      assert.ok(/e-mailadres of telefoonnummer/i.test(res.json.error), res.json.error);
      assert.strictEqual(res.json.secties, undefined);
      assert.strictEqual(res.json.id, undefined);
      assert.strictEqual(app.capturedLeads.length, leadsBefore, 'geen lead zonder contact');
      assert.strictEqual(mockHits, 0, 'geen model zonder contact');
      return request('POST', '/api/whk-advies', geldig({ avg: false }), { 'x-forwarded-for': '203.0.113.64' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 400, 'zonder avg');
      assert.ok(/toestemming/i.test(res.json.error), res.json.error);
      assert.strictEqual(res.json.id, undefined);
      assert.strictEqual(app.capturedLeads.length, leadsBefore, 'geen lead zonder avg');
      return request('POST', '/api/whk-advies', geldig({
        premie: 'De premie steeg en de diagnose is depressie bij een medewerker volgens de brief.'
      }), { 'x-forwarded-for': '203.0.113.62' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 400, 'medisch');
      assert.strictEqual(res.json.error, advies.MEDISCH_FOUT);
      assert.strictEqual(res.json.secties, undefined);
      assert.ok(res.text.indexOf('depressie') === -1, 'medische term niet terug');
      return request('POST', '/api/whk-advies', geldig({
        toelichting: 'Kan de toerekening kloppen. BSN 123456782 staat per ongeluk in de tekst.'
      }), { 'x-forwarded-for': '203.0.113.63' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 400, 'bsn');
      assert.strictEqual(res.json.error, advies.MEDISCH_FOUT);
      assert.ok(res.text.indexOf('123456782') === -1, 'bsn niet terug');
      assert.strictEqual(app.capturedLeads.length, leadsBefore, 'filter slaat niets op');
      assert.strictEqual(mockHits, 0, 'filter roept het model niet aan');
      return request('POST', '/api/whk-advies', geldig({ website: 'https://spam.example' }), { 'x-forwarded-for': '203.0.113.70' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200, 'honeypot status');
      assert.strictEqual(res.json.ok, true);
      assert.strictEqual(res.json.id, undefined, 'honeypot geen rapport');
      assert.strictEqual(app.capturedLeads.length, leadsBefore, 'honeypot geen lead');
      mockHits = 0;
      authKlopt = false;
      return request('POST', '/api/whk-advies', geldig(), { 'x-forwarded-for': '203.0.113.65' });
    })
    .then(function (res) {
      assert.strictEqual(res.status, 200, 'advies status');
      assert.strictEqual(res.json.ok, true);
      assert.strictEqual(res.json.saved, true);
      assert.strictEqual(res.json.fallback, false);
      assert.strictEqual(res.json.secties.length, 6);
      assert.strictEqual(res.json.disclaimer, advies.DISCLAIMER);
      assert.ok(res.json.stoplicht.kleur === 'rood' || res.json.stoplicht.kleur === 'oranje', 'stoplicht');
      assert.strictEqual(res.text.indexOf(SLEUTEL), -1, 'sleutel in antwoord');
      assert.strictEqual(res.text.indexOf('\u2014'), -1, 'emdash uit model');
      assert.strictEqual(res.text.indexOf('XAI_API_KEY'), -1);
      assert.strictEqual(authKlopt, true, 'server stuurt de sleutel alleen naar de api');
      assert.strictEqual(mockHits, 1);
      assert.ok(logs.join('\n').indexOf(SLEUTEL) === -1, 'sleutel in logs');
      var lead = app.capturedLeads[app.capturedLeads.length - 1];
      assert.strictEqual(lead.source, 'whk-advies-generator');
      assert.strictEqual(lead.email, 'jan@bedrijf.nl');
      assert.ok(lead.message.indexOf('Publiek verzekerd') !== -1);
      assert.ok(/onbekend/i.test(lead.message) === false, 'mail zonder onbekend');
      var id = res.json.id;
      return request('POST', '/api/whk-advies-pdf', { id: id });
    })
    .then(function (pdf) {
      assert.strictEqual(pdf.status, 200, 'pdf status');
      assert.ok(/application\/pdf/.test(pdf.headers['content-type']), 'pdf type');
      assert.strictEqual(pdf.buf.slice(0, 4).toString(), '%PDF');
      var ruw = pdf.buf.toString('latin1');
      assert.ok(ruw.indexOf('medisch advies') !== -1, 'pdf disclaimer');
      assert.ok(ruw.indexOf('geen garantie') !== -1, 'pdf garantie');
      assert.strictEqual(ruw.indexOf(SLEUTEL), -1, 'sleutel in pdf');
      assert.strictEqual(ruw.indexOf('jan@bedrijf.nl'), -1, 'mail niet in pdf');
      mockMode = 'down';
      return request('POST', '/api/whk-advies', geldig({ email: 'piet@bedrijf.nl' }), { 'x-forwarded-for': '203.0.113.66' });
    })
    .then(function (res) {
      mockMode = 'ok';
      assert.strictEqual(res.status, 200, 'fallback status');
      assert.strictEqual(res.json.ok, true);
      assert.strictEqual(res.json.fallback, true);
      assert.strictEqual(res.json.secties.length, 6);
      assert.strictEqual(res.json.disclaimer, advies.DISCLAIMER);
      assert.ok(app.capturedLeads.some(function (lead) { return lead.email === 'piet@bedrijf.nl'; }), 'lead blijft bij fallback');
      var vorige = process.env.XAI_API_KEY;
      delete process.env.XAI_API_KEY;
      return request('POST', '/api/whk-advies', geldig({ email: 'klaar@bedrijf.nl' }), { 'x-forwarded-for': '203.0.113.67' })
        .then(function (zonder) {
          process.env.XAI_API_KEY = vorige;
          assert.strictEqual(zonder.status, 503, 'geen sleutel');
          assert.strictEqual(zonder.json.ok, false);
          assert.strictEqual(zonder.json.saved, true);
          assert.strictEqual(zonder.json.id, undefined);
          assert.strictEqual(zonder.json.secties, undefined);
          assert.strictEqual(zonder.json.error, advies.GEEN_SLEUTEL);
          assert.ok(zonder.text.indexOf('XAI_API_KEY') === -1, 'env-naam niet naar de client');
          assert.ok(app.capturedLeads.some(function (lead) { return lead.email === 'klaar@bedrijf.nl'; }), 'lead blijft zonder sleutel');
          return request('GET', '/health');
        });
    })
    .then(function (health) {
      assert.strictEqual(health.status, 200, 'server blijft overeind');
      assert.strictEqual(health.json.ok, true);
      var groen = advies.berekenStoplicht({
        regeling: 'publiek', wgaInstroom: 'nee', wgaRisico: 'laag', ziektewet: 'nee', beschikking: 'nagekeken'
      });
      assert.strictEqual(groen.kleur, 'groen');
      var rood = advies.berekenStoplicht({
        regeling: 'publiek', wgaInstroom: 'ja', wgaRisico: 'hoog', ziektewet: 'ja', beschikking: 'nog-niet'
      });
      assert.strictEqual(rood.kleur, 'rood');
      assert.strictEqual(advies.vindMedisch('Het WGA-deel is hoger en de beschikking is nog niet nagekeken.'), '');
      assert.strictEqual(advies.vindMedisch('De diagnose is een hernia.'), 'medisch');
      assert.strictEqual(advies.vindMedisch('Nummer 123456782'), 'bsn');
      assert.strictEqual(advies.elfproef('123456782'), true);
      var parsed = advies.validateAdviesLead(geldig({ email: 'jan@bedrijf.nl', telefoon: '0687654321' }));
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.lead.bron, 'whk-advies-generator');
      assert.ok(parsed.lead.regelingLabel.indexOf('Publiek') !== -1);
      console.log = origLog;
      console.error = origErr;
      console.log('whk-advies tests ok');
      server.close();
    })
    .catch(function (err) {
      console.log = origLog;
      console.error = origErr;
      console.error(err);
      server.close();
      process.exit(1);
    });
});
