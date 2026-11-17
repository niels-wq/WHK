'use strict';

// Blogdatums: geen lastmod of datePublished na nu, en een seed met een
// datum in de toekomst wordt niet geserveerd.

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var APEX = 'https://werkhervattingskas.nl';
var FUTURE_SLUG = 'loonsom-whk-premie-wat-telt-mee';
var PAST_SLUG = 'whk-beschikking-controleren-fouten-loonsom';

// publishedAt is de auteurdatum van de commit die de post introduceerde, in UTC.
// updatedAt is diezelfde datum, of de commit van de laatste echte tekstwijziging.
var EXPECTED = {
  'loonsom-whk-premie-wat-telt-mee': {
    published: '2026-06-26T16:30:02.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'reorganisatie-whk-risico-overdracht': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'banenafspraak-no-riskpolis-whk-premie-werkgever': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'bezwaar-wia-beslissing-technisch-sterke-zaak': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'zelf-bezwaar-maken-whk-beschikking-of-specialist': {
    published: '2026-07-27T09:23:38.000Z',
    modified: '2026-07-27T09:23:38.000Z',
    lastmod: '2026-07-27'
  },
  'zw-wga-instroom-na-reorganisatie-whk': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'reorganisatie-due-diligence-whk-risico-beoordeling': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'wia-herkeuringen-uwv-uitgesteld-werkgever': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'whk-hoog-verloop-horeca-retail-schoonmaak': {
    published: '2026-07-27T09:23:38.000Z',
    modified: '2026-07-27T09:23:38.000Z',
    lastmod: '2026-07-27'
  },
  'herbeoordeling-uwv-complexer-technische-argumentatie': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'participatiewet-arbeidsbeperking-whk-gevolgen': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'fusie-overname-whk-gevolgen': {
    published: '2026-06-26T16:30:02.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'bezwaar-uwv-belastingdienst-technische-drempel': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'wovon-faillissement-doorstart-whk-risico': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'dossiervorming-verzuim-bezwaarkansen-poortwachter': {
    published: '2026-06-26T16:30:02.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'wia-beoordeling-hoe-uwv-beslist-en-fouten': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  },
  'functionele-mogelijkhedenlijst-fml-betwisten': {
    published: '2026-07-07T10:14:29.000Z',
    modified: '2026-07-07T10:14:29.000Z',
    lastmod: '2026-07-07'
  }
};

function request(port, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'GET'
    }, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', reject);
    req.end();
  });
}

function mapPool(items, limit, fn) {
  var i = 0;
  var out = new Array(items.length);
  function worker() {
    if (i >= items.length) return Promise.resolve();
    var idx = i++;
    return fn(items[idx], idx).then(function (res) {
      out[idx] = res;
      return worker();
    });
  }
  var n = Math.min(limit, items.length);
  var workers = [];
  for (var w = 0; w < n; w++) workers.push(worker());
  return Promise.all(workers).then(function () { return out; });
}

function isNotAfterNow(value) {
  var t = new Date(value);
  return !Number.isNaN(t.getTime()) && t.getTime() <= Date.now();
}

function collect(html, key) {
  var re = new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"', 'g');
  var found = [];
  var m;
  while ((m = re.exec(html))) found.push(m[1]);
  return found;
}

function assertDatesNotAfterNow(html, label) {
  ['datePublished', 'dateModified'].forEach(function (key) {
    collect(html, key).forEach(function (value) {
      assert.ok(isNotAfterNow(value), label + ' ' + key + ' na nu: ' + value);
    });
  });
}

function routeArticle(html) {
  var marker = 'id="route-article-schema"';
  var at = html.indexOf(marker);
  assert.ok(at !== -1, 'BlogPosting schema ontbreekt');
  var end = html.indexOf('</script>', at);
  var start = html.indexOf('{', at);
  return JSON.parse(html.slice(start, end));
}

function blogPaths(sitemap) {
  var re = /<loc>([^<]+)<\/loc>/g;
  var paths = [];
  var m;
  while ((m = re.exec(sitemap))) {
    if (m[1].indexOf('/blog/') !== -1) paths.push(new URL(m[1]).pathname);
  }
  return paths;
}

function assertLastmods(sitemap) {
  var re = /<lastmod>([^<]*)<\/lastmod>/g;
  var count = 0;
  var m;
  while ((m = re.exec(sitemap))) {
    count++;
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(m[1]), 'lastmod formaat ' + m[1]);
    assert.ok(isNotAfterNow(m[1]), 'lastmod na vandaag: ' + m[1]);
  }
  assert.ok(count > 0, 'sitemap heeft lastmod');
}

if (process.env.WHK_FUTURE_SEED === '1') {
  delete process.env.DATABASE_URL;
  var futureApp = require(path.join(__dirname, '..', 'server'));
  var futureServer = futureApp.listen(0, '127.0.0.1', function () {
    var port = futureServer.address().port;
    Promise.all([
      request(port, '/blog/' + FUTURE_SLUG),
      request(port, '/sitemap.xml'),
      request(port, '/llms.txt'),
      request(port, '/api/posts'),
      request(port, '/blog/' + PAST_SLUG)
    ]).then(function (results) {
      var page = results[0];
      var sitemap = results[1];
      var llms = results[2];
      var posts = JSON.parse(results[3].body);
      var past = results[4];
      assert.strictEqual(page.status, 404, 'seed met datum in de toekomst geeft 404');
      assert.ok(page.body.indexOf('2099-01-01') === -1, '404 toont geen toekomstige datum');
      assert.ok(page.body.indexOf(FUTURE_SLUG) === -1, '404 linkt de toekomstige seed niet');
      assert.ok(sitemap.body.indexOf('/blog/' + FUTURE_SLUG) === -1, 'toekomstige seed staat niet in de sitemap');
      assert.ok(llms.body.indexOf('/blog/' + FUTURE_SLUG) === -1, 'toekomstige seed staat niet in llms.txt');
      assert.ok(!posts.some(function (p) { return p && p.slug === FUTURE_SLUG; }), 'toekomstige seed staat niet in /api/posts');
      assert.strictEqual(past.status, 200, 'al live seed blijft 200');
      assertLastmods(sitemap.body);
      console.log('toekomstige seed wordt niet geserveerd');
      futureServer.close();
    }).catch(function (err) {
      console.error(err);
      futureServer.close();
      process.exit(1);
    });
  });
} else {
  delete process.env.DATABASE_URL;
  var app = require(path.join(__dirname, '..', 'server'));
  var server = app.listen(0, '127.0.0.1', function () {
    var port = server.address().port;
    Promise.all([
      request(port, '/sitemap.xml'),
      request(port, '/'),
      request(port, '/llms.txt'),
      request(port, '/api/posts')
    ]).then(function (head) {
      var sitemap = head[0];
      var home = head[1];
      var llms = head[2];
      var apiPosts = JSON.parse(head[3].body);
      assert.strictEqual(sitemap.status, 200, 'sitemap');
      assert.strictEqual(home.status, 200, 'home');
      assert.strictEqual(llms.status, 200, 'llms.txt');
      assertLastmods(sitemap.body);
      assertDatesNotAfterNow(home.body, 'homepage');
      var publishedInSource = home.body.match(/publishedAt:\s*'([^']+)'/g) || [];
      assert.ok(publishedInSource.length > 10, 'seed publishedAt in de pagina');
      publishedInSource.forEach(function (token) {
        var value = token.match(/'([^']+)'/)[1];
        assert.ok(isNotAfterNow(value), 'publishedAt na nu in de pagina: ' + value);
      });
      apiPosts.forEach(function (p) {
        if (!p || !p.publishedAt) return;
        assert.ok(isNotAfterNow(p.publishedAt), '/api/posts publishedAt na nu: ' + p.slug);
      });
      Object.keys(EXPECTED).forEach(function (slug) {
        var exp = EXPECTED[slug];
        var loc = '<loc>' + APEX + '/blog/' + slug + '</loc><lastmod>' + exp.lastmod + '</lastmod>';
        assert.ok(sitemap.body.indexOf(loc) !== -1, 'sitemap lastmod ' + slug);
      });
      var paths = blogPaths(sitemap.body);
      assert.ok(paths.length >= Object.keys(EXPECTED).length, 'blogpaden in sitemap');
      return mapPool(paths, 4, function (urlPath) {
        return request(port, urlPath).then(function (res) {
          assert.strictEqual(res.status, 200, urlPath + ' status ' + res.status);
          assertDatesNotAfterNow(res.body, urlPath);
          var article = routeArticle(res.body);
          assert.ok(isNotAfterNow(article.datePublished), urlPath + ' datePublished ' + article.datePublished);
          assert.ok(isNotAfterNow(article.dateModified), urlPath + ' dateModified ' + article.dateModified);
          var slug = urlPath.replace(/^\/blog\//, '');
          if (EXPECTED[slug]) {
            assert.strictEqual(article.datePublished, EXPECTED[slug].published, slug + ' datePublished');
            assert.strictEqual(article.dateModified, EXPECTED[slug].modified, slug + ' dateModified');
          }
        });
      });
    }).then(function () {
      server.close();
      var tmp = path.join(os.tmpdir(), 'whk-future-seed-' + process.pid + '.html');
      var src = fs.readFileSync(path.join(__dirname, '..', 'whk_verzuim.html'), 'utf8');
      var at = src.indexOf("slug: '" + FUTURE_SLUG + "'");
      assert.ok(at !== -1, 'fixture slug');
      var pub = src.indexOf('publishedAt:', at);
      var lineEnd = src.indexOf('\n', pub);
      src = src.slice(0, pub) + "publishedAt: '2099-01-01T09:00:00.000Z'," + src.slice(lineEnd);
      fs.writeFileSync(tmp, src);
      var env = Object.assign({}, process.env);
      delete env.DATABASE_URL;
      env.WHK_FUTURE_SEED = '1';
      env.WHK_HTML_PATH = tmp;
      var child = spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8' });
      fs.unlinkSync(tmp);
      if (child.stdout) process.stdout.write(child.stdout);
      if (child.status !== 0) {
        if (child.stderr) process.stderr.write(child.stderr);
        process.exit(child.status || 1);
      }
      console.log('seed publicatiedatums ok (' + Object.keys(EXPECTED).length + ' gecorrigeerde posts)');
    }).catch(function (err) {
      console.error(err);
      server.close();
      process.exit(1);
    });
  });
}
