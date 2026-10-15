'use strict';

var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var path = require('path');

var blogImages = require('../lib/blog-images');

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
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
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

function imageSize(buf) {
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    var o = 12;
    while (o + 8 <= buf.length) {
      var tag = buf.slice(o, o + 4).toString('ascii');
      var size = buf.readUInt32LE(o + 4);
      var data = o + 8;
      if (tag === 'VP8X' && size >= 10) {
        return { w: 1 + buf.readUIntLE(data + 4, 3), h: 1 + buf.readUIntLE(data + 7, 3) };
      }
      if (tag === 'VP8 ' && size >= 10) {
        return { w: buf.readUInt16LE(data + 6) & 0x3fff, h: buf.readUInt16LE(data + 8) & 0x3fff };
      }
      if (tag === 'VP8L' && size >= 5) {
        var b0 = buf[data + 1];
        var b1 = buf[data + 2];
        var b2 = buf[data + 3];
        var b3 = buf[data + 4];
        return {
          w: 1 + (((b1 & 0x3F) << 8) | b0),
          h: 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
        };
      }
      o = data + size + (size & 1);
    }
  }
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    var j = 2;
    while (j + 9 < buf.length) {
      if (buf[j] !== 0xFF) break;
      var marker = buf[j + 1];
      if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
        return { w: buf.readUInt16BE(j + 7), h: buf.readUInt16BE(j + 5) };
      }
      j += 2 + buf.readUInt16BE(j + 2);
    }
  }
  throw new Error('onbekend afbeeldingsformaat');
}

function sitemapSlugs(xml) {
  var slugs = [];
  var re = /\/blog\/([a-z0-9-]+)</g;
  var m;
  while ((m = re.exec(xml))) slugs.push(m[1]);
  return slugs;
}

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function assertPage(slug, post, res) {
  var html = res.body.toString('utf8');
  var rel = post.image;
  var abs = post.imageAbs;
  assert.strictEqual(res.status, 200, slug + ' status');
  assert.ok(html.indexOf('<meta property="og:image" content="' + abs + '"') !== -1, slug + ' og:image');
  assert.ok(html.indexOf('<meta name="twitter:image" content="' + abs + '"') !== -1, slug + ' twitter:image');
  assert.ok(html.indexOf('src="' + rel + '"') !== -1, slug + ' featured src');
  assert.ok(html.indexOf('alt="' + escAttr(post.imageAlt) + '"') !== -1, slug + ' alt');
  assert.ok(html.indexOf('"@type": "BlogPosting"') !== -1, slug + ' BlogPosting');
  assert.ok(html.indexOf('"@type": "ImageObject"') !== -1, slug + ' ImageObject');
  var schemaAt = html.indexOf('id="route-article-schema"');
  assert.ok(schemaAt !== -1, slug + ' schema block');
  var schemaEnd = html.indexOf('</script>', schemaAt);
  var schema = html.slice(schemaAt, schemaEnd === -1 ? schemaAt + 4000 : schemaEnd);
  assert.ok(schema.indexOf(abs) !== -1, slug + ' BlogPosting.image');
  assert.ok(html.indexOf('<meta property="og:image" content="https://werkhervattingskas.nl/og-image.png"') === -1, slug + ' generic og:image');
}

var posts = blogImages.allPosts().map(blogImages.decoratePost);
var bySlug = {};
posts.forEach(function (post) { bySlug[post.slug] = post; });

delete process.env.DATABASE_URL;
var app = require('../server');
var server = app.listen(0, '127.0.0.1', function () {
  var port = server.address().port;
  request(port, '/sitemap.xml').then(function (site) {
    assert.strictEqual(site.status, 200, 'sitemap');
    var slugs = sitemapSlugs(site.body.toString('utf8'));
    assert.ok(slugs.length >= 20, 'sitemap blogs ' + slugs.length);
    var seen = {};
    var hashes = {};
    slugs.forEach(function (slug) {
      assert.ok(!seen[slug], 'dubbele sitemap-slug ' + slug);
      seen[slug] = true;
      var post = bySlug[slug] || blogImages.decoratePost({ slug: slug, title: slug });
      post.imageAbs = blogImages.absoluteImageUrl(post.image, 'https://werkhervattingskas.nl');
      bySlug[slug] = post;
      assert.ok(blogImages.isOwnBlogImage(post.image), slug + ' heeft geen eigen afbeelding');
      assert.ok(!/og-image\.png/i.test(post.image), slug + ' gebruikt de generieke og-image');
      var file = blogImages.fileForPublicPath(post.image);
      assert.ok(fs.existsSync(file), slug + ' mist bestand ' + file);
      var buf = fs.readFileSync(file);
      assert.ok(buf.length >= 2000 && buf.length <= 200000, slug + ' afbeelding is niet lichtgewicht (' + buf.length + ' bytes)');
      var dim = imageSize(buf);
      assert.strictEqual(dim.w, 1200, slug + ' breedte');
      assert.strictEqual(dim.h, 630, slug + ' hoogte');
      var hash = crypto.createHash('sha256').update(buf).digest('hex');
      assert.ok(!hashes[hash], slug + ' deelt een afbeelding met ' + hashes[hash]);
      hashes[hash] = slug;
      assert.ok(post.imageAlt && post.imageAlt.length > 12, slug + ' alt');
      assert.ok(post.imageAlt.indexOf('\u2014') === -1, slug + ' alt bevat een em-dash');
    });

    var html = fs.readFileSync(path.join(__dirname, '..', 'whk_verzuim.html'), 'utf8');
    assert.ok(html.indexOf('blogFeaturedMarkup(p, false)') !== -1, 'blogkaarten zonder uitgelichte afbeelding');
    assert.ok(html.indexOf('blogFeaturedMarkup(p, true)') !== -1, 'artikel zonder uitgelichte afbeelding');

    return mapPool(slugs, 6, function (slug) {
      return request(port, '/blog/' + slug).then(function (res) {
        assertPage(slug, bySlug[slug], res);
      });
    }).then(function () {
      return request(port, bySlug[slugs[0]].image);
    }).then(function (img) {
      assert.strictEqual(img.status, 200, 'afbeelding wordt niet geserveerd');
      assert.ok(/image\/(webp|jpeg)/.test(String(img.headers['content-type'] || '')), 'content-type');
      console.log('blog image tests ok (' + slugs.length + ' blogs, elk een eigen 1200x630)');
      server.close();
    });
  }).catch(function (err) {
    console.error(err);
    server.close();
    process.exit(1);
  });
});
