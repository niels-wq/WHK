'use strict';

var assert = require('assert');
var http = require('http');
var path = require('path');

var APEX = 'https://werkhervattingskas.nl';
var BOTS = [
  '*',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Google-Extended',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Applebot-Extended',
  'Bingbot',
  'Googlebot'
];
var SECTIONS = ['Start', 'Tools', 'Diensten', 'Blog', 'Optional'];

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
      res.on('end', function () {
        resolve({ status: res.statusCode, headers: res.headers, body: body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function section(body, name) {
  var start = body.indexOf('## ' + name + '\n');
  assert.ok(start !== -1, 'missing section ' + name);
  var rest = body.slice(start + ('## ' + name + '\n').length);
  var next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

function markdownLinks(text) {
  var links = [];
  var re = /^- \[([^\]]+)\]\((https:\/\/[^)\s]+)\): (.+)$/gm;
  var m;
  while ((m = re.exec(text))) {
    links.push({ label: m[1], url: m[2], desc: m[3] });
  }
  return links;
}

delete process.env.DATABASE_URL;
var app = require(path.join(__dirname, '..', 'server'));

var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  Promise.all([
    request(port, '/robots.txt'),
    request(port, '/llms.txt'),
    request(port, '/api/posts'),
    request(port, '/sitemap.xml')
  ]).then(function (results) {
    var robots = results[0];
    var llms = results[1];
    var postsRes = results[2];
    var sitemap = results[3];

    assert.strictEqual(robots.status, 200, 'robots status');
    assert.strictEqual(robots.headers['content-type'], 'text/plain; charset=utf-8', 'robots content-type');
    var blocks = robots.body.trim().split(/\n\n+/);
    assert.strictEqual(blocks[blocks.length - 1], 'Sitemap: ' + APEX + '/sitemap.xml', 'sitemap line');
    var groups = blocks.slice(0, -1);
    assert.strictEqual(groups.length, BOTS.length, 'one group per agent');
    groups.forEach(function (group, i) {
      var lines = group.split('\n');
      assert.deepStrictEqual(lines, [
        'User-agent: ' + BOTS[i],
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /admin'
      ], 'group for ' + BOTS[i]);
    });
    assert.ok(robots.body.indexOf('https://www.') === -1, 'robots stays on the apex');

    assert.strictEqual(llms.status, 200, 'llms status');
    assert.strictEqual(llms.headers['content-type'], 'text/plain; charset=utf-8', 'llms content-type');
    assert.ok(llms.body.indexOf('# Werkhervattingskas.nl\n') === 0, 'llms heading');
    assert.ok(/^> .+\n/.test(llms.body.split('\n').slice(1).join('\n')), 'one-line Dutch summary');
    assert.ok(llms.body.indexOf('\u2014') === -1, 'llms must not use an em dash');
    assert.ok(llms.body.indexOf('€47.000') === -1, 'llms must not claim €47.000');
    assert.ok(llms.body.indexOf('No cure, no pay') === -1, 'llms must not claim no cure, no pay');
    assert.ok(llms.body.indexOf('https://www.') === -1, 'llms should stay on the apex');
    assert.ok(llms.body.indexOf(APEX + '/tools/wia-calculator') !== -1, 'llms missing calculator');
    assert.ok(llms.body.indexOf(APEX + '/beschikking-uitleg') !== -1, 'llms missing beschikking');
    assert.ok(llms.body.indexOf('WIA-uitkering berekenen') !== -1, 'llms calculator label');
    assert.ok(
      llms.body.indexOf('- [WIA-uitkering berekenen 2026](' + APEX + '/tools/wia-calculator): indicatie van een WGA- of IVA-uitkering op dagloon en percentage, met maximumdagloon € 309,91 (UWV, per 1 juli 2026) en de WHK-impact voor werkgevers.') !== -1,
      'llms calculator line'
    );

    var posts = JSON.parse(postsRes.body);
    assert.ok(Array.isArray(posts) && posts.length > 0, 'posts data');
    var liveSlugs = posts.filter(function (p) {
      return p && p.slug && !p.archived;
    }).map(function (p) { return p.slug; });

    SECTIONS.forEach(function (name) {
      var links = markdownLinks(section(llms.body, name));
      assert.ok(links.length > 0, name + ' needs markdown links');
      links.forEach(function (link) {
        assert.ok(link.url.indexOf(APEX) === 0, 'apex link ' + link.url);
        assert.ok(link.url.indexOf('https://www.') === -1, link.url);
        assert.ok(link.label.indexOf('\u2014') === -1, link.label);
        assert.ok(link.desc.indexOf('\u2014') === -1, link.desc);
      });
    });

    var blogLinks = markdownLinks(section(llms.body, 'Blog'));
    var blogSlugs = blogLinks.map(function (link) {
      var m = link.url.match(/\/blog\/([a-z0-9-]+)$/);
      assert.ok(m, 'blog link should be /blog/<slug>: ' + link.url);
      return m[1];
    });
    blogSlugs.forEach(function (slug) {
      assert.ok(liveSlugs.indexOf(slug) !== -1, 'blog slug is not in /api/posts: ' + slug);
    });
    liveSlugs.forEach(function (slug) {
      assert.ok(blogSlugs.indexOf(slug) !== -1, 'live post missing from llms.txt: ' + slug);
    });
    assert.strictEqual(sitemap.status, 200, 'sitemap status');
    assert.ok(sitemap.body.indexOf('<urlset') !== -1, 'sitemap urlset');
    liveSlugs.forEach(function (slug) {
      assert.ok(
        sitemap.body.indexOf('<loc>' + APEX + '/blog/' + slug + '</loc>') !== -1,
        'sitemap missing ' + slug
      );
    });
    assert.ok(sitemap.body.indexOf('https://www.') === -1, 'sitemap stays on the apex');
    assert.ok(llms.body.indexOf('/blog/dit-artikel-bestaat-niet') === -1, 'unknown slug must not be linked');

    console.log('seo txt tests ok (' + BOTS.length + ' robots groups, ' + blogSlugs.length + ' blog links)');
    server.close();
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
