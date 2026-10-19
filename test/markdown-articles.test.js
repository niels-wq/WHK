'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var dir = path.join(__dirname, '..', 'content', 'articles');
var NEW_SLUGS = [
  'no-riskpolis-7-checkpunten-voor-whk-beschikking',
  'whk-beschikking-lezen-in-10-minuten',
  'erd-2027-aanvragen-voor-2-oktober',
  'whk-premies-2027-wga-en-zw',
  'lkv-deadlines-kalender-werkgever',
  'zw-eigenrisicodrager-checklist',
  'kleine-middelgrote-grote-werkgever-whk-2027',
  'wia-herstelactie-en-60-plusmaatregel-werkgevers',
  'ziektewet-flexpremie-2027-negatief-vermogen',
  'loondoorbetaling-bij-ziekte-scenarios-mkb',
  'correctiefactor-whk-onvolledige-periode',
  'jaareinde-checklist-whk-voor-31-december'
];
var ROUND_SLUGS = [
  'kleine-middelgrote-grote-werkgever-whk-2027',
  'wia-herstelactie-en-60-plusmaatregel-werkgevers',
  'ziektewet-flexpremie-2027-negatief-vermogen'
];
var OCT12_SLUGS = [
  'loondoorbetaling-bij-ziekte-scenarios-mkb'
];
var OCT19_SLUGS = [
  'correctiefactor-whk-onvolledige-periode'
];
var JAAR_SLUGS = [
  'jaareinde-checklist-whk-voor-31-december'
];
var BACKLINKS = {
  'kleine-middelgrote-grote-werkgever-whk-2027': [
    'whk-premies-2027-wga-en-zw.md',
    'whk-beschikking-lezen-in-10-minuten.md'
  ],
  'wia-herstelactie-en-60-plusmaatregel-werkgevers': [
    'whk-premies-2027-wga-en-zw.md',
    'uwv-herbeoordeling-2026.md'
  ],
  'ziektewet-flexpremie-2027-negatief-vermogen': [
    'whk-premies-2027-wga-en-zw.md',
    'zw-eigenrisicodrager-checklist.md'
  ],
  'loondoorbetaling-bij-ziekte-scenarios-mkb': [
    'uwv-herbeoordeling-2026.md'
  ],
  'correctiefactor-whk-onvolledige-periode': [
    'whk-premies-2027-wga-en-zw.md',
    'whk-premieverhoging-na-een-wga-instroom-rekenvoorbeeld-mkb.md'
  ],
  'jaareinde-checklist-whk-voor-31-december': [
    'lkv-deadlines-kalender-werkgever.md',
    'no-riskpolis-7-checkpunten-voor-whk-beschikking.md',
    'whk-beschikking-lezen-in-10-minuten.md'
  ]
};
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
    assert.ok(parsed.body.indexOf('\u2013') === -1, file + ' must not use en dashes');
    assert.ok(!/no cure no pay/i.test(parsed.body), file + ' must not claim no cure no pay');
    assert.ok(parsed.body.indexOf('47.000') === -1, file + ' must not claim €47.000');
    assert.ok(parsed.body.indexOf('Gratis WHK-beschikking check') !== -1, file + ' missing soft CTA');
    allNewBodies += parsed.body;
  }
  if (JAAR_SLUGS.indexOf(slug) !== -1) {
    assert.ok(parsed.meta.description.length >= 140 && parsed.meta.description.length <= 155, file + ' description length ' + parsed.meta.description.length);
    assert.ok(parsed.meta.publishedAt === '2026-10-19', file + ' publishedAt');
    assert.ok(parsed.meta.updatedAt === '2026-10-19', file + ' updatedAt');
    assert.ok(parsed.body.indexOf('## Veelgestelde vragen') !== -1, file + ' missing FAQ heading');
    assert.ok((parsed.body.match(/^\*\*.+\?\*\*/gm) || []).length >= 3, file + ' FAQ questions');
    assert.ok(parsed.body.indexOf('https://download.belastingdienst.nl/belastingdienst/docs/handboek-loonheffingen-lh0221t61fd.pdf') !== -1, file + ' missing handboek');
    assert.ok(parsed.body.indexOf('https://zoek.officielebekendmakingen.nl/stcrt-2026-24832.html') !== -1, file + ' missing staatscourant');
    assert.ok(parsed.body.indexOf('https://www.uwv.nl/nl/no-riskpolis') !== -1, file + ' missing no-risk source');
    assert.ok(parsed.body.indexOf('https://www.uwv.nl/nl/loonkostenvoordeel/doelgroepverklaring-lkv-aanvragen') !== -1, file + ' missing LKV source');
    assert.ok(parsed.body.indexOf('6 weken') !== -1, file + ' missing bezwaartermijn');
    assert.ok(parsed.body.indexOf('3 maanden') !== -1, file + ' missing LKV-termijn');
    assert.ok(parsed.body.indexOf('31 januari 2027') !== -1, file + ' missing aangiftedatum');
    assert.ok(parsed.body.indexOf('erd-partneradvies') === -1, file + ' must not link ERD advice');
    assert.ok(parsed.body.indexOf('8 van de 10') === -1, file + ' must not claim 8 van de 10');
    [
      'https://werkhervattingskas.nl/tools/jaarkalender',
      'https://werkhervattingskas.nl/beschikking-uitleg',
      'https://werkhervattingskas.nl/diensten/whk-controle',
      'https://werkhervattingskas.nl/faq',
      '/blog/lkv-deadlines-kalender-werkgever',
      '/blog/whk-beschikking-controleren-fouten-loonsom',
      '/blog/no-risk-polis-check-stappenplan-2026',
      '/blog/whk-premie-verwachtingen-2027',
      '/blog/correctiefactor-whk-onvolledige-periode',
      '/blog/whk-premies-2027-wga-en-zw',
      '/blog/kleine-middelgrote-grote-werkgever-whk-2027',
      '/blog/bezwaar-maken-bij-het-uwv'
    ].forEach(function (href) {
      assert.ok(parsed.body.indexOf(href) !== -1, file + ' missing link ' + href);
    });
  }
  if (OCT19_SLUGS.indexOf(slug) !== -1) {
    assert.ok(parsed.meta.title.length >= 50 && parsed.meta.title.length <= 60, file + ' title length ' + parsed.meta.title.length);
    assert.ok(parsed.meta.description.length >= 140 && parsed.meta.description.length <= 155, file + ' description length ' + parsed.meta.description.length);
    assert.ok(parsed.meta.publishedAt === '2026-10-19', file + ' publishedAt');
    assert.ok(parsed.meta.updatedAt === '2026-10-19', file + ' updatedAt');
    assert.ok(parsed.body.indexOf('## Veelgestelde vragen') !== -1, file + ' missing FAQ heading');
    assert.ok((parsed.body.match(/^\*\*.+\?\*\*/gm) || []).length >= 3, file + ' FAQ questions');
    assert.ok(parsed.body.indexOf('https://zoek.officielebekendmakingen.nl/stcrt-2026-24832.html') !== -1, file + ' missing staatscourant');
    assert.ok(parsed.body.indexOf('5,00') !== -1 && parsed.body.indexOf('2,00') !== -1, file + ' missing factors');
    var internal = [
      'https://werkhervattingskas.nl/tools/wia-calculator',
      'https://werkhervattingskas.nl/tools/premiehistorie',
      'https://werkhervattingskas.nl/beschikking-uitleg',
      'https://werkhervattingskas.nl/diensten/whk-controle',
      'https://werkhervattingskas.nl/faq',
      '/blog/'
    ].filter(function (href) { return parsed.body.indexOf(href) !== -1; });
    assert.ok(internal.length >= 3, file + ' needs at least 3 internal links, got ' + internal.length);
  }
  if (OCT12_SLUGS.indexOf(slug) !== -1) {
    assert.ok(parsed.meta.title.length >= 50 && parsed.meta.title.length <= 60, file + ' title length ' + parsed.meta.title.length);
    assert.ok(parsed.meta.description.length >= 140 && parsed.meta.description.length <= 155, file + ' description length ' + parsed.meta.description.length);
    assert.ok(parsed.meta.publishedAt === '2026-10-12', file + ' publishedAt');
    assert.ok(parsed.meta.updatedAt === '2026-10-12', file + ' updatedAt');
    assert.ok(parsed.body.indexOf('## Veelgestelde vragen') !== -1, file + ' missing FAQ heading');
    assert.ok((parsed.body.match(/^\*\*.+\?\*\*/gm) || []).length >= 3, file + ' FAQ questions');
    assert.ok(parsed.body.indexOf('https://www.eerstekamer.nl/behandeling/20260908/brief_regering_inventarisatie/info') !== -1, file + ' missing kamerbrief');
    assert.ok(parsed.body.indexOf('104 weken') !== -1, file + ' missing 104 weken');
  }
  if (ROUND_SLUGS.indexOf(slug) !== -1) {
    assert.ok(parsed.meta.title.length >= 50 && parsed.meta.title.length <= 60, file + ' title length ' + parsed.meta.title.length);
    assert.ok(parsed.meta.description.length >= 140 && parsed.meta.description.length <= 155, file + ' description length ' + parsed.meta.description.length);
    assert.ok(parsed.meta.publishedAt === '2026-10-05', file + ' publishedAt');
    assert.ok(parsed.meta.updatedAt === '2026-10-05', file + ' updatedAt');
    assert.ok(parsed.body.indexOf('## Veelgestelde vragen') !== -1, file + ' missing FAQ heading');
    assert.ok((parsed.body.match(/^\*\*.+\?\*\*/gm) || []).length >= 3, file + ' FAQ questions');
    var internal = [
      'https://werkhervattingskas.nl/tools/wia-calculator',
      'https://werkhervattingskas.nl/tools/premiehistorie',
      'https://werkhervattingskas.nl/beschikking-uitleg',
      'https://werkhervattingskas.nl/diensten',
      'https://werkhervattingskas.nl/faq',
      '/blog/'
    ].filter(function (href) { return parsed.body.indexOf(href) !== -1; });
    assert.ok(internal.length >= 3, file + ' needs at least 3 internal links, got ' + internal.length);
  }
  if (slug === 'erd-2027-aanvragen-voor-2-oktober') {
    assert.ok(/verstreken|voorbij/i.test(parsed.body), file + ' should say the January 2027 deadline has passed');
    assert.ok(parsed.body.indexOf('1 oktober 2027') !== -1, file + ' should point to 1 oktober 2027');
    assert.ok(!/moet de aanvraag \*\*vóór 2 oktober 2026\*\*/.test(parsed.body), file + ' still tells readers to file before 2 October 2026');
  }
  if (slug === 'zw-eigenrisicodrager-checklist') {
    assert.ok(parsed.body.indexOf('partneradvies') === -1, file + ' must not CTA to partneradvies');
    assert.ok(parsed.body.indexOf('erd-partneradvies') === -1, file + ' must not link ERD advice');
    assert.ok(parsed.body.indexOf('Gratis WHK-beschikking check') !== -1, file + ' must keep the WHK check CTA');
  }
});

NEW_SLUGS.forEach(function (slug) {
  assert.ok(slugs.indexOf(slug) !== -1, 'missing new article ' + slug);
});
REQUIRED_LINKS.forEach(function (href) {
  assert.ok(allNewBodies.indexOf(href) !== -1, 'new posts should link ' + href);
});
Object.keys(BACKLINKS).forEach(function (slug) {
  var linked = BACKLINKS[slug].some(function (file) {
    return fs.readFileSync(path.join(dir, file), 'utf8').indexOf('/blog/' + slug) !== -1;
  });
  assert.ok(linked, 'no existing article links to ' + slug);
});

console.log('markdown-articles tests ok (' + files.length + ' posts, ' + NEW_SLUGS.length + ' new)');
