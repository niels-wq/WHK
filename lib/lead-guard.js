'use strict';

// Shared lead validation / spam classification for server + browser.
// Real leads: status=new and notify. Test/honeypot: still stored, no mail to info@.

var PLACEHOLDER_EMAILS = [
  'naam@bedrijf.nl',
  'uw@email.nl',
  'email@email.com',
  'foo@bar.com',
  'test@test.com',
  'test@example.com',
  'user@example.com',
  'j.devries@intermediair.nl'
];

var DISPOSABLE_DOMAINS = [
  'example.com', 'example.nl', 'example.org',
  'mailinator.com', 'tempmail.com', 'trashmail.com',
  'guerrillamail.com', '10minutemail.com', 'yopmail.com',
  'fakeinbox.com', 'test.com', 'test.nl', 'asdf.com'
];

var MISSING_MSG = 'Naam en telefoon of e-mail zijn verplicht.';

function trim(v) {
  return String(v == null ? '' : v).trim();
}

function digits(phone) {
  return trim(phone).replace(/\D/g, '');
}

function looksLikeEmail(s) {
  return /@/.test(s) && /\./.test(s);
}

function honeypotValue(input) {
  if (!input || typeof input !== 'object') return '';
  return trim(
    input.honeypot ||
    input.website ||
    input.hp ||
    input._gotcha ||
    input.company_url ||
    input.url
  );
}

function normalize(input) {
  var src = input && typeof input === 'object' ? input : {};
  var name = trim(src.name);
  var phone = trim(src.phone);
  var email = trim(src.email).toLowerCase();
  if (!email && looksLikeEmail(phone)) {
    email = phone.toLowerCase();
    phone = '';
  }
  return {
    name: name,
    phone: phone,
    email: email,
    honeypot: honeypotValue(src),
    source: trim(src.source),
    message: trim(src.message || src.summary),
    page: trim(src.page)
  };
}

function isPlaceholderName(name) {
  var n = trim(name).toLowerCase().replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.length < 2) return true;
  return /^(onbekend|unknown|n\/a|na|xxx+|geen naam|geennaam|geen telefoon)$/.test(n);
}

function isTestName(name) {
  var n = trim(name).toLowerCase();
  if (!n) return false;
  if (/test|asdf|qwerty|lorem|ipsum|dummy|spam/.test(n)) return true;
  return /^(foo|bar|foo bar)$/.test(n);
}

function isTestPhone(phone) {
  var d = digits(phone);
  if (!d) return false;
  if (/^0+$/.test(d)) return true;
  if (d.indexOf('00000000') !== -1) return true;
  if (d === '0612345678' || d === '31612345678' || d === '0031612345678') return true;
  if (d === '0123456789' || d === '1234567890' || d === '12345678' || d === '06123456789') return true;
  if (d.length >= 8 && /^(\d)\1+$/.test(d)) return true;
  return false;
}

function isTestEmail(email) {
  var e = trim(email).toLowerCase();
  if (!e) return false;
  if (PLACEHOLDER_EMAILS.indexOf(e) !== -1) return true;
  var parts = e.split('@');
  var local = parts[0] || '';
  var domain = parts[1] || '';
  if (/^(test|tester|asdf|dummy|spam|user|foo|bar|noreply)$/.test(local)) return true;
  if (DISPOSABLE_DOMAINS.indexOf(domain) !== -1) return true;
  return false;
}

function hasRequiredContact(fields) {
  var n = normalize(fields);
  if (!n.name || isPlaceholderName(n.name)) return false;
  if (!n.phone && !n.email) return false;
  return true;
}

function classify(input) {
  var n = normalize(input);
  if (n.honeypot) {
    return { ok: true, notify: false, status: 'spam', reason: 'honeypot', error: null, lead: n };
  }
  if (!hasRequiredContact(n)) {
    return { ok: false, notify: false, status: null, reason: 'missing_contact', error: MISSING_MSG, lead: n };
  }
  if (n.email && n.email.indexOf('@') === -1 && !n.phone) {
    return { ok: false, notify: false, status: null, reason: 'missing_contact', error: MISSING_MSG, lead: n };
  }
  if (isTestName(n.name) || isTestPhone(n.phone) || isTestEmail(n.email)) {
    return { ok: true, notify: false, status: 'test', reason: 'test_payload', error: null, lead: n };
  }
  return { ok: true, notify: true, status: 'new', reason: 'ok', error: null, lead: n };
}

var api = {
  MISSING_MSG: MISSING_MSG,
  classify: classify,
  normalize: normalize,
  hasRequiredContact: hasRequiredContact,
  isTestName: isTestName,
  isTestPhone: isTestPhone,
  isTestEmail: isTestEmail
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof globalThis === 'object' && globalThis) {
  globalThis.LeadGuard = api;
}
