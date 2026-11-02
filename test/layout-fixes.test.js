'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'whk_verzuim.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'public', 'chat', 'whk-chat.css'), 'utf8');
var js = fs.readFileSync(path.join(root, 'public', 'chat', 'whk-chat.js'), 'utf8');

assert.ok(html.indexOf('.wvz-nav > a{white-space:nowrap;}') !== -1, 'menulinks missen nowrap');
assert.ok(html.indexOf('white-space:nowrap') !== -1, 'header-CSS mist nowrap');
assert.ok(/max-width:\s*1440px\) and \(min-width:\s*781px\)/.test(html), 'compacte header-breakpoint ontbreekt');
assert.ok(html.indexOf('header-call-icon') !== -1, 'compacte belknop mist een icoon');
assert.ok(html.indexOf('aria-label="Bel 085-0870307"') !== -1, 'belknop mist aria-label');
assert.ok(html.indexOf('id="header-call" href="tel:+31850870307"') !== -1, 'belknop moet tel:+31850870307 houden');
assert.ok(html.indexOf('.wvz-logo span{display:none;}') !== -1, 'tagline wordt onder 1440px niet verborgen');

var phoneHeaderAt = html.indexOf('@media (max-width:480px){\n    .wvz-logo span{display:none;}');
assert.ok(phoneHeaderAt !== -1, 'tagline wordt onder 480px niet verborgen');
var phoneHeader = html.slice(phoneHeaderAt, html.indexOf('\n  }', phoneHeaderAt) + 4);
assert.ok(phoneHeader.indexOf('.wvz-header .wvz-header-row{gap:8px;}') !== -1, 'headergap blijft onder 480px te groot');
assert.ok(/\.header-cta-group \.btn\{padding:6px 10px;font-size:0\.75rem;\}/.test(phoneHeader), 'CTA-padding is onder 480px niet kleiner');
assert.ok(phoneHeader.indexOf('.header-cta-full{display:none;}') !== -1, 'volle CTA-tekst blijft onder 480px staan');
assert.ok(phoneHeader.indexOf('.header-cta-short{display:inline;}') !== -1, 'korte CTA ontbreekt onder 480px');
assert.ok(html.indexOf('.header-cta-short{display:none;}') !== -1, 'korte CTA is ook boven 480px zichtbaar');
assert.ok(html.indexOf('<span class="header-cta-full">Gratis WHK-check</span>') !== -1, 'desktop-CTA mist Gratis WHK-check');
assert.ok(html.indexOf('<span class="header-cta-short">Gratis check</span>') !== -1, 'smalle CTA mist Gratis check');
assert.ok(html.indexOf('@media (min-width:781px)') !== -1 && html.indexOf('.wvz-logo span{white-space:nowrap;}') !== -1, 'desktop-tagline mag niet wrappen');

var mobileCss = css.slice(css.indexOf('@media (max-width:767px)'));
assert.ok(mobileCss.indexOf('@media (max-width:767px)') === 0, 'mobiele chat-breakpoint ontbreekt');
assert.ok(/\.whkchat__teaser\{[^}]*display:\s*none/.test(mobileCss), 'ballon opent nog automatisch op mobiel');
assert.ok(/\.whkchat__contact\{[^}]*border-radius:\s*50%/.test(mobileCss), 'contactknop is op mobiel niet rond');

assert.ok(js.indexOf('(max-width: 767px)') !== -1, 'widget controleert de mobiele breedte niet');
assert.ok(js.indexOf('whk_chat_teaser_dismissed') !== -1, 'sluiten van de ballon wordt niet onthouden');
assert.ok(js.indexOf("localStorage.setItem('whk_chat_teaser_dismissed'") !== -1, 'dismiss staat niet in localStorage');
assert.ok(js.indexOf('isNarrowPhone()') !== -1, 'ballon kan op mobiel nog auto-openen');

console.log('layout fixes tests ok');
