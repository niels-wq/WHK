'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, '..', 'whk_verzuim.html'), 'utf8');

function section(id) {
  var re = new RegExp('<section[^>]*id="' + id + '"[\\s\\S]*?</section>');
  var m = html.match(re);
  assert.ok(m, 'missing section ' + id);
  return m[0];
}

function count(str, needle) {
  return str.split(needle).length - 1;
}

// Primary conversion action is the home WHK-check, not a second competing modal CTA
['wia-calc-view', 'premiehistorie-view', 'faq-view', 'beschikking-uitleg-view'].forEach(function (id) {
  var s = section(id);
  assert.ok(s.indexOf('Gratis WHK-beschikking check') !== -1, id + ' missing primary CTA label');
  assert.ok(s.indexOf('data-cta="calculator"') !== -1, id + ' missing calculator CTA');
  assert.ok(s.indexOf('No cure, no pay') !== -1 || s.indexOf('no cure, no pay') !== -1, id + ' missing trust line');
});

var wia = section('wia-calc-view');
assert.ok(wia.indexOf('id="wia-result-cta"') !== -1, 'WIA result CTA missing');
assert.ok(wia.indexOf('wia-followup-cta') === -1, 'old always-on WIA followup should be gone');
assert.strictEqual(count(wia, 'data-cta="terugbel"'), 0, 'WIA page should not open a second callback CTA');

var premie = section('premiehistorie-view');
assert.ok(premie.indexOf('id="premiehistorie-cta"') !== -1, 'premiehistorie after-table CTA missing');
assert.ok(premie.indexOf('Bekijk uw sector') === -1, 'competing sector button should be a text link');

var faq = section('faq-view');
assert.ok(faq.indexOf('faq-sticky-cta') !== -1, 'FAQ sticky CTA missing');
assert.ok(faq.indexOf('id="faq-end-cta"') !== -1, 'FAQ end CTA missing');
assert.ok(faq.indexOf('faq-vraag-naam') !== -1 && faq.indexOf('faq-vraag-email') !== -1, 'FAQ lead form fields missing');

var modal = html.slice(html.indexOf('id="terugbel-modal"'), html.indexOf('id="privacy-modal"'));
assert.ok(modal.indexOf('Telefoonnummer <span') === -1, 'phone should not be marked required-only');
assert.ok(modal.indexOf('naam plus telefoonnummer of e-mail') !== -1, 'modal should state name + phone OR email');

var ldBlocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
var faqLd = null;
ldBlocks.forEach(function (block) {
  if (block.indexOf('"FAQPage"') !== -1 && block.indexOf('/faq#faq') !== -1) faqLd = block;
});
assert.ok(faqLd, 'FAQPage JSON-LD missing');
var json = faqLd.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
var parsed = JSON.parse(json);
var graph = parsed['@graph'] || parsed;
var faqPage = Array.isArray(graph)
  ? graph.filter(function (n) { return n['@type'] === 'FAQPage'; })[0]
  : parsed;
if (!faqPage && parsed['@graph']) {
  faqPage = parsed['@graph'].filter(function (n) { return n['@type'] === 'FAQPage'; })[0];
}
assert.ok(faqPage && faqPage.mainEntity, 'FAQPage.mainEntity missing');
var names = faqPage.mainEntity.map(function (q) { return q.name; });
[
  'Wat is de Werkhervattingskas (WHK)?',
  'Wat is de gemiddelde WGA-premie in 2026?',
  'Hoe start ik een gratis WHK-beschikking check?',
  'Hoe lees ik mijn WHK-beschikking?',
  'Wanneer is het tweede spoor re-integratie verplicht?',
  'Kan ik de beschikking van vorig jaar nog laten controleren?'
].forEach(function (q) {
  assert.ok(names.indexOf(q) !== -1, 'FAQ JSON-LD missing: ' + q);
});
assert.ok(faqPage.mainEntity.length >= 25, 'FAQ JSON-LD should cover the visible question set');

console.log('conversion-pages tests ok (' + faqPage.mainEntity.length + ' FAQ JSON-LD questions)');

function byId(tag, id) {
  var re = new RegExp('<' + tag + '[^>]*id="' + id + '"[\\s\\S]*?</' + tag + '>');
  var m = html.match(re);
  assert.ok(m, 'missing ' + tag + '#' + id);
  return m[0];
}

var home = byId('main', 'home-view');
assert.ok(home.indexOf('hero-cta-row') !== -1, 'home missing hero CTA row');
assert.ok(home.indexOf('Gratis WHK-beschikking check') !== -1, 'home missing primary CTA label');
assert.ok(home.indexOf('data-cta="calculator"') !== -1, 'home missing calculator CTA');
assert.ok(/hero-cta-row[\s\S]*data-cta="terugbel"/.test(home), 'home missing secondary callback in hero');
assert.ok(home.indexOf('ERD 2027 aanvragen vóór 2 okt') !== -1, 'home missing ERD deadline CTA');
assert.ok(home.indexOf('/blog/erd-2027-aanvragen-voor-2-oktober') !== -1, 'home ERD CTA should link the deadline post');
assert.ok(home.indexOf('id="erd-deadline-bar"') !== -1, 'home missing above-the-fold ERD deadline bar');

var header = html.slice(html.indexOf('class="wvz-header"'), html.indexOf('id="mobile-nav-overlay"'));
assert.ok(header.indexOf('header-cta-group') !== -1, 'header missing CTA group');
assert.ok(header.indexOf('id="open-whk-check"') !== -1, 'header missing primary WHK-check');
assert.ok(header.indexOf('btn-risk') !== -1, 'header primary CTA should use terracotta');
assert.ok(/id="open-terugbel"/.test(header) && /btn-ghost" id="open-terugbel"/.test(header), 'header callback should be visually secondary');

var blog = section('blog-view');
assert.ok(blog.indexOf('blog-card-skel') !== -1, 'blog listing missing skeleton placeholders');
assert.ok(/\.blog-grid\{[^}]*min-height:/.test(html), 'blog grid should reserve height');
assert.ok(html.indexOf('function blogMotifKey') !== -1, 'blog cards need motif variation');
assert.ok(html.indexOf('var posts = SEED_POSTS.slice()') !== -1, 'blog should seed posts before API load');

var post = section('blogpost-view');
assert.ok(post.indexOf('id="blogpost-end-cta"') !== -1, 'blog post layout missing end CTA');
assert.ok(post.indexOf('Gratis WHK-beschikking check') !== -1, 'blog post CTA missing WHK-check label');
assert.ok(post.indexOf('data-cta="calculator"') !== -1, 'blog post CTA missing calculator link');
assert.ok(post.indexOf('beschikking-uitleg') !== -1, 'blog post CTA missing beschikking-uitleg link');
assert.ok(post.toLowerCase().indexOf('arbeidsdeskundig onderzoek') === -1, 'blog post CTA should not use ADO language');
assert.ok(post.indexOf('Matchvermogen') === -1, 'blog post CTA block should not use Matchvermogen language');
assert.ok(html.indexOf('ensureInlineCta(p.bodyHtml') !== -1, 'openBlogPost should inject mid-article WHK CTA');
assert.ok(html.indexOf('article-whk-cta') !== -1, 'inline article CTA class missing');

console.log('conversion UX tests ok (hero + blog cards + article CTA)');

assert.ok(html.indexOf('id="home-rekentools"') !== -1, 'homepage missing tool links');
assert.ok(html.indexOf('href="/tools/wia-calculator"') !== -1, 'missing wia calculator link');
var tools = section('tools-view');
assert.ok(tools.indexOf('href="/tools/wia-calculator"') !== -1, 'tools hub missing calculator');
assert.ok(tools.indexOf('href="/tools/premiehistorie"') !== -1, 'tools hub missing premiehistorie');
assert.ok(tools.indexOf('href="/beschikking-uitleg"') !== -1, 'tools hub missing beschikking');
assert.ok(tools.indexOf('—') === -1 && tools.indexOf('&mdash;') === -1, 'tools hub H1 should not use an em dash');

var wiaLinks = section('wia-calc-view');
assert.ok(wiaLinks.indexOf('WIA-uitkering berekenen (2026)') !== -1, 'WIA H1');
assert.ok(wiaLinks.indexOf('href="/diensten/whk-controle"') !== -1, 'WIA missing whk-controle');
assert.ok(wiaLinks.indexOf('href="/diensten/besparingsonderzoek"') !== -1, 'WIA missing besparingsonderzoek');
assert.ok(wiaLinks.indexOf('href="/diensten/erd-partneradvies"') !== -1, 'WIA missing erd');
assert.ok(wiaLinks.indexOf('WIA-uitkering berekenen (2026): WGA, IVA of loonaanvulling') !== -1, 'WIA H1 should not use an em dash');

var premiePage = section('premiehistorie-view');
assert.ok(premiePage.indexOf('WGA-premie 2022-2026: historisch overzicht') !== -1, 'premie H1');
assert.ok(premiePage.indexOf('href="/diensten/whk-controle"') !== -1, 'premie missing whk-controle');
assert.ok(premiePage.indexOf('href="/diensten/besparingsonderzoek"') !== -1, 'premie missing besparingsonderzoek');
assert.ok(premiePage.indexOf('0,96%') !== -1, 'premie page should state the 2026 average');

assert.ok(section('beschikking-uitleg-view').indexOf('WHK-beschikking lezen: dagtekening, loonsom, premie en toerekening') !== -1, 'beschikking H1');
assert.ok(section('faq-view').indexOf('Wat is de gemiddelde WGA-premie in 2026?') !== -1, 'visible FAQ missing WGA premie question');
assert.ok(section('blog-view').indexOf('href="/beschikking-uitleg"') !== -1, 'blog list missing beschikking link');
assert.ok(section('blog-view').indexOf('href="/tools/wia-calculator"') !== -1, 'blog list missing calculator link');

console.log('seo ctr copy tests ok');
