'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');

var tool = require(path.join(__dirname, '..', 'lib', 'vergelijkingstool'));
var APEX = 'https://werkhervattingskas.nl';
var ROUTE = '/tools/vergelijken-interventies';
var CLAIM = /no[\s-]*cure[\s-]*no[\s-]*pay/i;
var OWN = ['1.095', '1.695', '2.950'];

function request(port, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'GET'
    }, function (res) {
      var chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function countH1(html) {
  var m = html.match(/<h1\b/gi);
  return m ? m.length : 0;
}

function assertClean(label, html) {
  assert.ok(!CLAIM.test(html), label + ' bevat de geblokkeerde term');
  assert.ok(html.indexOf('—') === -1 && html.indexOf('&mdash;') === -1, label + ' bevat een emdash');
  OWN.forEach(function (amount) {
    assert.ok(html.indexOf(amount) === -1, label + ' toont eigen tarief ' + amount);
  });
  assert.ok(html.indexOf('werkhervattingskas.nl/tarieven') === -1, label + ' citeert de tarievenpagina');
}

var data = tool.loadData();
assert.strictEqual(Object.keys(data.bronnen).length, 92, 'bronnen');
assert.strictEqual(Object.keys(data.aanbieders).length, 46, 'partijen');

var model = tool.prepareModel(data, { leukBereikbaar: true });
var state = tool.defaultState();
model.interventies.forEach(function (iv) {
  state.interventie = iv.id;
  var html = tool.renderApp(model, state);
  assertClean(iv.id, html);
  iv.aanbieders.forEach(function (aanbieder) {
    if (aanbieder.id === 'mv' || aanbieder.id === 'bm' || aanbieder.id === 'wkk') {
      assert.strictEqual(aanbieder.prijzen.length, 0, aanbieder.id + ' mag geen eigen bedragen tonen op ' + iv.id);
    }
  });
});

var whk = null;
model.interventies.forEach(function (iv) {
  if (iv.id === 'whk-onderzoek') whk = iv;
});
assert.ok(whk, 'WHK-onderzoek ontbreekt');
var wkk = null;
whk.aanbieders.forEach(function (aanbieder) {
  if (aanbieder.id === 'wkk') wkk = aanbieder;
});
assert.ok(wkk && wkk.nietOpenbaar, 'wkk hoort prijs niet openbaar te zijn');
state.interventie = 'whk-onderzoek';
var whkHtml = tool.renderApp(model, state);
assert.ok(whkHtml.indexOf('prijs niet openbaar') !== -1, 'WHK-onderzoek toont prijs niet openbaar');
assert.ok(whkHtml.indexOf('>20%</p>') !== -1, 'percentage blijft een percentage');
assert.ok(whkHtml.indexOf('€20') === -1 && whkHtml.indexOf('€25') === -1 && whkHtml.indexOf('€30') === -1, 'percentage niet als eurobedrag');

var adHtml = tool.renderApp(model, tool.defaultState());
assert.ok(adHtml.indexOf('prijs niet openbaar') !== -1, 'standaardweergave toont prijs niet openbaar');
assert.ok(adHtml.indexOf(tool.EIGEN_AD) !== -1, 'openbare AD-tekst ontbreekt');
assert.ok(adHtml.indexOf('vgl_start') === -1, 'render mag de events niet als tekst dumpen');

var js = require('fs').readFileSync(path.join(__dirname, '..', 'lib', 'vergelijkingstool.js'), 'utf8');
['vgl_start', 'vgl_filter', 'vgl_cta_click'].forEach(function (name) {
  assert.ok(js.indexOf("'" + name + "'") !== -1 || js.indexOf('"' + name + '"') !== -1, 'event ' + name);
});
assert.ok(js.indexOf("source: 'vergelijkingstool'") !== -1, 'leadbron');

delete process.env.DATABASE_URL;
var app = require(path.join(__dirname, '..', 'server'));

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  Promise.all([
    request(port, ROUTE),
    request(port, '/sitemap.xml'),
    request(port, '/tools'),
    request(port, '/tools/interventie-check'),
    request(port, '/llms.txt')
  ]).then(function (results) {
    var page = results[0];
    var sitemap = results[1];
    var tools = results[2];
    var check = results[3];
    var llms = results[4];

    assert.strictEqual(page.status, 200, 'route status');
    assert.strictEqual(countH1(page.body), 1, 'h1 ' + countH1(page.body));
    assert.ok(page.body.indexOf('<h1') !== -1 && page.body.indexOf('Interventies vergelijken: kosten, kwaliteit en de Whk-premie') !== -1, 'h1 tekst');
    assert.ok(page.body.indexOf('<title>Interventies vergelijken: kosten, kwaliteit en Whk | Werkhervattingskas.nl</title>') !== -1, 'title');
    assert.ok(page.body.indexOf('Vergelijk openbare tarieven van interventies bij verzuim, met bron en peildatum. Zie wat de keuze betekent voor WGA-instroom en de Whk-premie.') !== -1, 'description');
    assert.ok(page.body.indexOf('rel="canonical" href="' + APEX + ROUTE + '"') !== -1, 'canonical');
    assert.ok(page.body.indexOf('prijs niet openbaar') !== -1, 'prijs niet openbaar');
    assert.ok(page.body.indexOf('FAQPage') !== -1, 'FAQ-schema');
    assert.ok(page.body.indexOf('Waar komen de prijzen in deze vergelijking vandaan?') !== -1, 'faq zichtbaar');
    assert.ok(page.body.indexOf('name="source" value="vergelijkingstool"') !== -1, 'leadbron in formulier');
    assert.ok(page.body.indexOf('/api/leads') !== -1, 'lead-endpoint');
    assert.ok(page.body.indexOf('src="/lib/vergelijkingstool.js"') !== -1, 'script');
    assert.ok(page.body.indexOf('href="/tools/interventie-check"') !== -1, 'link naar interventie-check');
    assert.ok(page.body.indexOf('Publiek verzekerde werkgever') !== -1, 'publiek');
    assert.ok(page.body.indexOf('Eigenrisicodrager') !== -1, 'eigenrisicodrager');
    var sectionStart = page.body.indexOf('id="vergelijk-interventies-view"');
    var sectionEnd = page.body.indexOf('</section>', sectionStart);
    assert.ok(sectionStart !== -1 && sectionEnd > sectionStart, 'sectie');
    assertClean('pagina', page.body.slice(sectionStart, sectionEnd));
    var headEnd = page.body.toLowerCase().indexOf('</head>');
    assertClean('head', page.body.slice(0, headEnd));

    assert.strictEqual(sitemap.status, 200, 'sitemap');
    assert.ok(sitemap.body.indexOf('<loc>' + APEX + ROUTE + '</loc>') !== -1, 'sitemap mist de tool');

    assert.strictEqual(tools.status, 200, 'tools');
    assert.ok(tools.body.indexOf('href="/tools/vergelijken-interventies"') !== -1, 'tools-overzicht');
    assert.strictEqual(countH1(tools.body), 1, 'tools h1');

    assert.strictEqual(check.status, 200, 'interventie-check');
    assert.ok(check.body.indexOf('href="/tools/vergelijken-interventies"') !== -1, 'link vanaf interventie-check');
    assert.ok(check.body.indexOf('id="interventie-check-view"') !== -1, 'bestaande tool blijft');
    assert.ok(check.body.indexOf('id="vergelijk-interventies-view"') === -1, 'nieuwe tool vervangt de check niet');

    assert.ok(llms.body.indexOf(APEX + ROUTE) !== -1, 'llms');

    console.log('vergelijkingstool tests ok');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
