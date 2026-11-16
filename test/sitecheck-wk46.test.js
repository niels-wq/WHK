'use strict';

// Weekronde 46: elke sitemap-URL, elke blogslug en de bronbestanden.
// Verboden verkoopclaims mogen nergens op een publieke pagina terugkomen.

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');

var APEX = 'https://werkhervattingskas.nl';
var PILLAR = '/blog/compensatie-transitievergoeding-na-2-jaar-ziekte';
var CLAIM = /no[\s-]*cure[\s-]*no[\s-]*pay|8\s+van\s+de\s+10|(?<![\d])8\/10(?![\d])|47\.000/i;
var QUOTES = [
  'In 8 van de 10 gevallen vinden wij iets',
  'levert onze check in 8 van de 10',
  'Is een WHK-specialist altijd no-cure-no-pay',
  '8 van de 10 beschikkingen'
];

function request(port, urlPath, headers) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'GET',
      headers: headers || {}
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
  var workers = [];
  var n = Math.min(limit, items.length);
  for (var w = 0; w < n; w++) workers.push(worker());
  return Promise.all(workers).then(function () { return out; });
}

function countH1(html) {
  var m = html.match(/<h1\b/gi);
  return m ? m.length : 0;
}

function claimHit(text) {
  var found = [];
  var re = new RegExp(CLAIM.source, 'gi');
  var m;
  while ((m = re.exec(text))) {
    found.push(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' '));
    if (found.length >= 2) break;
  }
  QUOTES.forEach(function (q) {
    if (text.indexOf(q) !== -1) found.push(q);
  });
  return found;
}

function locsOf(xml) {
  return (xml.match(/<loc>([^<]+)<\/loc>/g) || []).map(function (tag) {
    return tag.replace(/<\/?loc>/g, '');
  });
}

function internalPath(href) {
  if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0 || href.indexOf('javascript:') === 0) {
    return null;
  }
  var pathn = '';
  if (href.indexOf('http') === 0) {
    var u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.hostname !== 'werkhervattingskas.nl' && u.hostname !== 'www.werkhervattingskas.nl') return null;
    pathn = u.pathname;
  } else if (href.charAt(0) === '/') {
    pathn = href.split('#')[0].split('?')[0];
  } else {
    return null;
  }
  if (pathn.length > 1 && pathn.charAt(pathn.length - 1) === '/') pathn = pathn.slice(0, -1);
  return pathn || '/';
}

function sourceFiles() {
  var root = path.join(__dirname, '..');
  var files = [
    path.join(root, 'whk_verzuim.html'),
    path.join(root, 'whk_checklist.html')
  ];
  var articles = path.join(root, 'content', 'articles');
  fs.readdirSync(articles).forEach(function (name) {
    if (name.endsWith('.md')) files.push(path.join(articles, name));
  });
  var pub = path.join(root, 'public');
  if (fs.existsSync(pub)) {
    fs.readdirSync(pub).forEach(function (name) {
      var full = path.join(pub, name);
      if (fs.statSync(full).isDirectory()) {
        fs.readdirSync(full).forEach(function (child) {
          if (/\.(js|html|json)$/.test(child)) files.push(path.join(full, child));
        });
      } else if (/\.(js|html|json)$/.test(name)) files.push(full);
    });
  }
  return files;
}

function slugsInHtml(html) {
  var found = {};
  var re = /slug:\s*'([a-z0-9-]+)'/g;
  var m;
  while ((m = re.exec(html))) found[m[1]] = true;
  var dir = path.join(__dirname, '..', 'content', 'articles');
  fs.readdirSync(dir).forEach(function (name) {
    if (!name.endsWith('.md') || name.toLowerCase() === 'readme.md') return;
    var raw = fs.readFileSync(path.join(dir, name), 'utf8');
    var fm = raw.match(/^slug:\s*(\S+)/m);
    found[(fm ? fm[1] : name.replace(/\.md$/, '')).replace(/['"]/g, '')] = true;
  });
  return Object.keys(found);
}

delete process.env.DATABASE_URL;
var app = require(path.join(__dirname, '..', 'server'));

sourceFiles().forEach(function (file) {
  var text = fs.readFileSync(file, 'utf8');
  var hits = claimHit(text);
  assert.deepStrictEqual(hits, [], path.basename(file) + ' bevat een verboden claim: ' + hits.join(' | '));
});

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  Promise.all([
    request(port, '/sitemap.xml'),
    request(port, '/robots.txt'),
    request(port, '/llms.txt'),
    request(port, '/api/posts'),
    request(port, '/', { Host: 'www.werkhervattingskas.nl' })
  ]).then(function (head) {
    var sitemap = head[0];
    var robots = head[1];
    var llms = head[2];
    var posts = JSON.parse(head[3].body);
    var www = head[4];

    assert.strictEqual(sitemap.status, 200, 'sitemap status');
    assert.ok(sitemap.body.indexOf('<?xml') === 0, 'sitemap xml declaration');
    assert.ok(sitemap.body.indexOf('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') !== -1, 'sitemap namespace');
    assert.ok(sitemap.body.trim().endsWith('</urlset>'), 'sitemap closed');
    var urlCount = (sitemap.body.match(/<url>/g) || []).length;
    var locs = locsOf(sitemap.body);
    assert.strictEqual(locs.length, urlCount, 'each url has one loc');
    assert.strictEqual(locs.length, new Set(locs).size, 'duplicate sitemap loc');
    locs.forEach(function (loc) {
      assert.ok(loc.indexOf(APEX) === 0, 'sitemap loc not apex: ' + loc);
      assert.ok(loc.indexOf('https://www.') === -1, 'sitemap www: ' + loc);
    });
    (sitemap.body.match(/<lastmod>([^<]*)<\/lastmod>/g) || []).forEach(function (tag) {
      assert.ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(tag), 'bad lastmod ' + tag);
    });
    assert.ok(sitemap.body.indexOf('<loc>' + APEX + PILLAR + '</loc>') !== -1, 'sitemap mist de pillar');

    assert.strictEqual(robots.status, 200);
    assert.ok(robots.body.indexOf('Sitemap: ' + APEX + '/sitemap.xml') !== -1, 'robots sitemap');
    assert.ok(robots.body.indexOf('Disallow: /api/') !== -1, 'robots api');
    assert.ok(robots.body.indexOf('Disallow: /admin') !== -1, 'robots admin');
    assert.deepStrictEqual(claimHit(robots.body), [], 'robots claim');
    assert.ok(robots.body.indexOf('https://www.') === -1, 'robots www');

    assert.strictEqual(llms.status, 200);
    assert.ok(llms.body.indexOf(APEX + PILLAR) !== -1, 'llms mist de pillar');
    assert.deepStrictEqual(claimHit(llms.body), [], 'llms claim');
    assert.ok(llms.body.indexOf('https://www.') === -1, 'llms www');
    var liveSlugs = posts.filter(function (p) { return p && p.slug && !p.archived; }).map(function (p) { return p.slug; });
    liveSlugs.forEach(function (slug) {
      assert.ok(llms.body.indexOf(APEX + '/blog/' + slug) !== -1, 'llms mist ' + slug);
      assert.ok(sitemap.body.indexOf('<loc>' + APEX + '/blog/' + slug + '</loc>') !== -1, 'sitemap mist ' + slug);
    });

    assert.strictEqual(www.status, 301, 'www status');
    assert.strictEqual(www.headers.location, APEX + '/', 'www location');

    var html = fs.readFileSync(path.join(__dirname, '..', 'whk_verzuim.html'), 'utf8');
    var extra = slugsInHtml(html).map(function (slug) { return '/blog/' + slug; });
    var paths = locs.map(function (loc) { return new URL(loc).pathname; });
    extra.forEach(function (p) {
      if (paths.indexOf(p) === -1) paths.push(p);
    });

    return mapPool(paths, 8, function (urlPath) {
      return request(port, urlPath).then(function (res) {
        return { path: urlPath, res: res };
      });
    }).then(function (pages) {
      var known = {};
      var linkSeen = {};
      var pending = [];
      pages.forEach(function (page) {
        var res = page.res;
        var inSitemap = locs.indexOf(APEX + page.path) !== -1 || (page.path === '/' && locs.indexOf(APEX + '/') !== -1);
        if (page.path === '/' ) inSitemap = locs.indexOf(APEX + '/') !== -1;
        assert.strictEqual(res.status, 200, page.path + ' status ' + res.status);
        if (inSitemap) {
          assert.ok(!res.headers.location, page.path + ' sitemap-URL mag niet redirecten');
        }
        var ct = String(res.headers['content-type'] || '');
        if (ct.indexOf('html') === -1) return;
        assert.strictEqual(countH1(res.body), 1, page.path + ' h1 ' + countH1(res.body));
        var canons = (res.body.match(/rel="canonical" href="([^"]+)"/g) || []).map(function (tag) {
          return tag.replace(/.*href="([^"]+)".*/, '$1');
        });
        var expected = APEX + (page.path === '/' ? '/' : page.path);
        assert.deepStrictEqual(canons, [expected], page.path + ' canonical ' + canons.join(','));
        assert.ok(res.body.indexOf('https://www.werkhervattingskas.nl') === -1, page.path + ' www');
        var hits = claimHit(res.body);
        assert.deepStrictEqual(hits, [], page.path + ' claim ' + hits.join(' | '));
        known[page.path] = true;
        var hrefs = res.body.match(/href="([^"]+)"/g) || [];
        hrefs.forEach(function (tag) {
          var href = tag.slice(6, -1);
          var dest = internalPath(href);
          if (!dest || known[dest] || linkSeen[dest]) return;
          if (dest === '/robots.txt' || dest === '/llms.txt' || dest === '/sitemap.xml' || dest === '/admin') {
            linkSeen[dest] = true;
            return;
          }
          linkSeen[dest] = true;
          pending.push({ from: page.path, dest: dest });
        });
      });

      var slashPaths = locs.map(function (loc) { return new URL(loc).pathname; }).filter(function (p) {
        return p !== '/' && p.indexOf('.') === -1;
      });
      return mapPool(pending, 8, function (item) {
        return request(port, item.dest).then(function (res) {
          if (res.status === 200) return;
          if (res.status === 301 || res.status === 302) {
            var loc = res.headers.location || '';
            var next = loc;
            try { next = new URL(loc, APEX).pathname; } catch (e) { next = loc; }
            return request(port, next).then(function (res2) {
              assert.strictEqual(res2.status, 200, item.dest + ' vanaf ' + item.from + ' eindigt op ' + res2.status);
              assert.ok(res2.status < 300 || !res2.headers.location, item.dest + ' redirect-keten');
              if (res2.headers.location) {
                assert.fail(item.dest + ' redirect-keten via ' + loc + ' en ' + res2.headers.location);
              }
            });
          }
          assert.fail('kapotte interne link ' + item.dest + ' (' + res.status + ') vanaf ' + item.from);
        });
      }).then(function () {
        return mapPool(slashPaths, 8, function (urlPath) {
          return request(port, urlPath + '/').then(function (res) {
            if (urlPath === '/diensten') {
              assert.strictEqual(res.status, 200, '/diensten/ blijft 200');
              return;
            }
            assert.strictEqual(res.status, 301, urlPath + '/ status ' + res.status);
            var loc = res.headers.location || '';
            var locPath = loc;
            try { locPath = new URL(loc, APEX).pathname; } catch (e) { locPath = loc; }
            assert.strictEqual(locPath, urlPath, urlPath + '/ location ' + loc);
          });
        });
      });
    });
  }).then(function () {
    console.log('sitecheck wk46 ok');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
