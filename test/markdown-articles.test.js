'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var dir = path.join(__dirname, '..', 'content', 'articles');
var NEW_SLUGS = [
  'no-riskpolis-7-checkpunten-voor-whk-beschikking',
  'whk-beschikking-lezen-in-10-minuten',
  'erd-2027-aanvragen-voor-2-oktober'
];
var REQUIRED_LINKS = [
  'https://werkhervattingskas.nl/tools/wia-calculator',
  'https://werkhervattingskas.nl/tools/premiehistorie',
  'https://werkhervattingskas.nl/beschikking-uitleg',
  'https://werkhervattingskas.nl/faq'
];

function parseFrontmatter(raw) {
  var m = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  var meta = {};
  m[1].split(/\r?\n/).forEach(function (line) {
    var i = line.indexOf(':');
    if (i === -1) return;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  return { meta: meta, body: m[2].trim() };
}

var files = fs.readdirSync(dir).filter(function (f) {
  return f.endsWith('.md') && f.toLowerCase() !== 'readme.md';
});
assert.ok(files.length >= 9, 'expected existing plus new markdown articles');

var slugs = [];
var allNewBodies = '';
files.forEach(function (file) {
  var parsed = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf8'));
  assert.ok(parsed && parsed.meta.title, file + ' missing frontmatter title');
  var slug = parsed.meta.slug || file.replace(/\.md$/, '');
  slugs.push(slug);
  assert.strictEqual(file, slug + '.md', file + ' should match slug');
  assert.ok(parsed.meta.description, file + ' missing description');
  assert.ok(parsed.meta.description.length <= 170, file + ' description too long');
  assert.ok(parsed.meta.publishedAt, file + ' missing publishedAt');
  assert.ok((parsed.body.match(/^## /gm) || []).length >= 4, file + ' needs FAQ-style H2s');
  assert.ok(parsed.body.indexOf('www.werkhervattingskas.nl') === -1, file + ' must use apex URLs');
  assert.ok(parsed.body.indexOf('calendly.com') === -1, file + ' must not hard-code Calendly');
  if (NEW_SLUGS.indexOf(slug) !== -1) {
    assert.ok(parsed.body.indexOf('\u2014') === -1, file + ' must not use em dashes');
    assert.ok(parsed.body.indexOf('Gratis WHK-beschikking check') !== -1, file + ' missing soft CTA');
    allNewBodies += parsed.body;
  }
});

NEW_SLUGS.forEach(function (slug) {
  assert.ok(slugs.indexOf(slug) !== -1, 'missing new article ' + slug);
});
REQUIRED_LINKS.forEach(function (href) {
  assert.ok(allNewBodies.indexOf(href) !== -1, 'new posts should link ' + href);
});

console.log('markdown-articles tests ok (' + files.length + ' posts, ' + NEW_SLUGS.length + ' new)');
