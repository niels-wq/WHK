'use strict';

var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');

var APEX = 'https://werkhervattingskas.nl';
var TITLE_SUFFIX = ' | Werkhervattingskas.nl';
var NEW_BLOGS = [
  'whk-premies-2027-wga-en-zw',
  'lkv-deadlines-kalender-werkgever',
  'zw-eigenrisicodrager-checklist'
];

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

function countH1(html) {
  var m = html.match(/<h1\b/gi);
  return m ? m.length : 0;
}

function meta(html, name) {
  var re = new RegExp('<meta name="' + name + '" content="([^"]*)"');
  var m = html.match(re);
  return m ? m[1] : '';
}

function parseFrontmatter(raw) {
  var m = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'frontmatter');
  var meta = {};
  m[1].split(/\r?\n/).forEach(function (line) {
    var i = line.indexOf(':');
    if (i === -1) return;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return meta;
}

function articlePosts() {
  var dir = path.join(__dirname, '..', 'content', 'articles');
  return fs.readdirSync(dir).filter(function (file) {
    return file.endsWith('.md') && file.toLowerCase() !== 'readme.md';
  }).map(function (file) {
    var fm = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
    return {
      slug: fm.slug || file.replace(/\.md$/, ''),
      title: fm.title,
      description: fm.description
    };
  });
}

function seedSlugs() {
  var html = fs.readFileSync(path.join(__dirname, '..', 'whk_verzuim.html'), 'utf8');
  var start = html.indexOf('var SEED_POSTS = [');
  assert.ok(start !== -1, 'SEED_POSTS');
  var end = html.indexOf('var posts =', start);
  var chunk = html.slice(start, end === -1 ? start + 800000 : end);
  var re = /^\s+slug:\s*'([a-z0-9-]+)'/gm;
  var slugs = [];
  var m;
  while ((m = re.exec(chunk))) slugs.push(m[1]);
  return slugs;
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

function assertArticle(post, res) {
  var url = '/blog/' + post.slug;
  assert.strictEqual(res.status, 200, url + ' status ' + res.status);
  assert.strictEqual(countH1(res.body), 1, url + ' h1 count');
  assert.ok(
    res.body.indexOf('<title>' + post.title + TITLE_SUFFIX + '</title>') !== -1,
    url + ' title'
  );
  assert.strictEqual(meta(res.body, 'description'), post.description, url + ' description');
  assert.ok(
    res.body.indexOf('rel="canonical" href="' + APEX + url + '"') !== -1,
    url + ' canonical'
  );
  assert.ok(meta(res.body, 'robots').indexOf('noindex') === -1, url + ' should be indexable');
  assert.ok(res.body.indexOf(post.title) !== -1, url + ' h1 text');
  if (NEW_BLOGS.indexOf(post.slug) !== -1) {
    var start = res.body.indexOf('id="blogpost-body"');
    assert.ok(start !== -1, url + ' article body');
    var chunk = res.body.slice(start, res.body.indexOf('</div>', start));
    assert.ok(chunk.indexOf('\u2014') === -1, url + ' em dash in article');
    assert.ok(!/no cure no pay/i.test(chunk), url + ' no cure no pay');
    assert.ok(chunk.indexOf('47.000') === -1, url + ' unverifiable savings claim');
    assert.ok(meta(res.body, 'description').indexOf('\u2014') === -1, url + ' description em dash');
  }
  if (post.slug === 'zw-eigenrisicodrager-checklist') {
    var bodyAt = res.body.indexOf('id="blogpost-body"');
    var article = res.body.slice(bodyAt, res.body.indexOf('</div>', bodyAt));
    assert.ok(article.indexOf('partneradvies') === -1, url + ' partneradvies CTA');
    assert.ok(article.indexOf('erd-partneradvies') === -1, url + ' ERD advice link');
    assert.ok(article.indexOf('Gratis WHK-beschikking check') !== -1, url + ' WHK check CTA');
  }
}

function assertNotFound(res) {
  assert.strictEqual(res.status, 404, 'unknown slug status ' + res.status);
  assert.ok(meta(res.body, 'robots').indexOf('noindex') !== -1, 'unknown slug noindex');
  assert.ok(res.body.indexOf('href="/"') !== -1, 'unknown slug links home');
  assert.ok(res.body.indexOf('href="/blog"') !== -1, 'unknown slug links to /blog');
  assert.ok(res.body.indexOf('id="blog-view"') === -1, 'unknown slug must not be the kennisbank page');
  assert.ok(res.body.indexOf('WHK-kennisbank voor HR en Finance') === -1, 'unknown slug generic kennisbank title');
  assert.strictEqual(countH1(res.body), 1, 'not-found h1 count');
}

delete process.env.DATABASE_URL;
var app = require(path.join(__dirname, '..', 'server'));
var articles = articlePosts();
var seeds = seedSlugs();
assert.ok(articles.length >= 12, 'article slugs');
assert.ok(seeds.length >= 20, 'seed slugs');
NEW_BLOGS.forEach(function (slug) {
  assert.ok(articles.some(function (p) { return p.slug === slug; }), 'missing ' + slug);
});

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  var articleReqs = mapPool(articles, 6, function (post) {
    return request(port, '/blog/' + post.slug).then(function (res) {
      assertArticle(post, res);
      return res;
    });
  });
  var seedReqs = mapPool(seeds, 6, function (slug) {
    return request(port, '/blog/' + slug).then(function (res) {
      assert.strictEqual(res.status, 200, '/blog/' + slug + ' seed status ' + res.status);
      assert.strictEqual(countH1(res.body), 1, '/blog/' + slug + ' seed h1');
      assert.ok(res.body.indexOf(TITLE_SUFFIX + '</title>') !== -1, '/blog/' + slug + ' seed title suffix');
      assert.ok(meta(res.body, 'description').length > 0, '/blog/' + slug + ' seed description');
      assert.ok(
        res.body.indexOf('rel="canonical" href="' + APEX + '/blog/' + slug + '"') !== -1,
        '/blog/' + slug + ' seed canonical'
      );
      return res;
    });
  });
  var missing = request(port, '/blog/bestaat-niet-xyz').then(assertNotFound);

  Promise.all([articleReqs, seedReqs, missing]).then(function () {
    console.log('blog slug tests ok (' + articles.length + ' articles, ' + seeds.length + ' seed posts, unknown 404)');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
