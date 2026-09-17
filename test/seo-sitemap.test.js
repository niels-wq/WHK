'use strict';

var assert = require('assert');
var http = require('http');
var serverMod = require('../server');
var app = serverMod.app;
var APEX_ORIGIN = serverMod.APEX_ORIGIN;
var REQUIRED_SITEMAP_PATHS = serverMod.REQUIRED_SITEMAP_PATHS;
var SITEMAP_LASTMOD = serverMod.SITEMAP_LASTMOD;
var loadMarkdownArticles = serverMod.loadMarkdownArticles;

function get(server, path) {
  return new Promise(function(resolve, reject) {
    var port = server.address().port;
    http.get({ hostname: '127.0.0.1', port: port, path: path }, function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        resolve({ status: res.statusCode, headers: res.headers, body: body });
      });
    }).on('error', reject);
  });
}

function locs(xml) {
  var out = [];
  var re = /<loc>([^<]+)<\/loc>/g;
  var m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

var server = app.listen(0, '127.0.0.1', function() {
  Promise.resolve().then(function() {
    return get(server, '/sitemap.xml');
  }).then(function(res) {
    assert.strictEqual(res.status, 200, 'sitemap status');
    assert.ok(/xml/.test(res.headers['content-type'] || ''), 'sitemap content-type');
    assert.ok(res.headers['last-modified'], 'Last-Modified header present so GSC can re-read');
    assert.ok(res.body.indexOf('<lastmod>' + SITEMAP_LASTMOD + '</lastmod>') !== -1, 'sitemap lastmod stamped');
    assert.ok(!/https?:\/\/www\.werkhervattingskas\.nl/.test(res.body), 'zero www hosts in sitemap');

    var urls = locs(res.body);
    REQUIRED_SITEMAP_PATHS.forEach(function(p) {
      var want = APEX_ORIGIN + p;
      assert.ok(urls.indexOf(want) !== -1, 'sitemap missing ' + want);
    });

    loadMarkdownArticles().forEach(function(p) {
      var want = APEX_ORIGIN + '/blog/' + p.slug;
      assert.ok(urls.indexOf(want) !== -1, 'markdown article missing from sitemap: ' + want);
    });

    assert.ok(urls.indexOf(APEX_ORIGIN + '/blog/bezwaar-maken-bij-het-uwv') !== -1);
    assert.ok(urls.indexOf(APEX_ORIGIN + '/blog/uwv-herbeoordeling-2026') !== -1);
    assert.ok(urls.indexOf(APEX_ORIGIN + '/tools/wia-calculator') !== -1);
    assert.ok(urls.indexOf(APEX_ORIGIN + '/beschikking-uitleg') !== -1);

    return get(server, '/tools/wia-calculator');
  }).then(function(res) {
    assert.strictEqual(res.status, 200, 'calculator status');
    var canon = (res.body.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    var og = (res.body.match(/<meta property="og:url" content="([^"]*)"/) || [])[1];
    var hreflang = (res.body.match(/<link rel="alternate" hreflang="nl" href="([^"]*)"/) || [])[1];
    var want = APEX_ORIGIN + '/tools/wia-calculator';
    assert.strictEqual(canon, want, 'calculator canonical');
    assert.strictEqual(og, want, 'calculator og:url');
    assert.strictEqual(hreflang, want, 'calculator hreflang');
    assert.ok(!/https?:\/\/www\.werkhervattingskas\.nl/.test(canon + og + hreflang));

    var webpage = res.body.match(/<script type="application\/ld\+json" id="webpage-schema">([\s\S]*?)<\/script>/);
    assert.ok(webpage, 'webpage JSON-LD present');
    var data = JSON.parse(webpage[1]);
    assert.strictEqual(data.url, want, 'calculator JSON-LD url');
    assert.strictEqual(data['@id'], want, 'calculator JSON-LD @id');
    assert.ok(!/https?:\/\/www\.werkhervattingskas\.nl/.test(webpage[1]));
    assert.ok(
      res.body.indexOf('id="dynamic-schema"></script>') !== -1 &&
      res.body.indexOf('id="webpage-schema">') !== -1 &&
      res.body.indexOf('id="webpage-schema">') > res.body.indexOf('id="dynamic-schema"></script>') - 80,
      'webpage schema injected next to dynamic-schema, not into JS strings'
    );
    assert.ok(
      res.body.indexOf('</style></head><body>') !== -1,
      'checklist download JS string still contains </head>'
    );

    var link = res.headers.link || '';
    assert.ok(link.indexOf(want) !== -1, 'Link rel=canonical header');

    console.log('seo-sitemap tests ok');
    server.close();
  }).catch(function(err) {
    console.error(err);
    try { server.close(); } catch (e) {}
    process.exit(1);
  });
});
