'use strict';

var assert = require('assert');
var seo = require('../lib/seo');

assert.strictEqual(seo.APEX_ORIGIN, 'https://werkhervattingskas.nl');
assert.strictEqual(seo.toApexOrigin('https://www.werkhervattingskas.nl'), seo.APEX_ORIGIN);
assert.strictEqual(seo.toApexOrigin('https://www.werkhervattingskas.nl/'), seo.APEX_ORIGIN);
assert.strictEqual(seo.toApexOrigin('http://www.werkhervattingskas.nl'), seo.APEX_ORIGIN);
assert.strictEqual(seo.toApexOrigin('https://werkhervattingskas.nl'), seo.APEX_ORIGIN);
assert.strictEqual(seo.toApexOrigin('https://whk-production.up.railway.app'), seo.APEX_ORIGIN);
assert.strictEqual(seo.toApexOrigin(undefined), seo.APEX_ORIGIN);

assert.strictEqual(seo.apexPageUrl('/tools/wia-calculator'), 'https://werkhervattingskas.nl/tools/wia-calculator');
assert.strictEqual(seo.apexPageUrl('https://www.werkhervattingskas.nl/tools/wia-calculator'), 'https://werkhervattingskas.nl/tools/wia-calculator');
assert.strictEqual(seo.apexPageUrl('/'), 'https://werkhervattingskas.nl/');
assert.strictEqual(seo.apexPageUrl('/beschikking-uitleg/'), 'https://werkhervattingskas.nl/beschikking-uitleg');

assert.strictEqual(
  seo.stripWwwHost('https://www.werkhervattingskas.nl/tools/wia-calculator'),
  'https://werkhervattingskas.nl/tools/wia-calculator'
);
assert.strictEqual(seo.hasWwwSiteHost('https://www.werkhervattingskas.nl/x'), true);
assert.strictEqual(seo.hasWwwSiteHost('https://werkhervattingskas.nl/x'), false);
assert.strictEqual(seo.hasWwwSiteHost('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), false);

console.log('seo helper tests ok');
