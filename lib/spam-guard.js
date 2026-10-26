'use strict';

// Server-side spam checks for public form posts.
// Honeypot, HMAC timestamp (min ~3s, max 24h) and an in-memory IP limit.
// Spam is counted and dropped. No submission content is logged.

const crypto = require('crypto');

const MIN_AGE_MS = 3000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const PLACEHOLDERS = {
  'verander-dit': true,
  'verander-dit-secret': true,
  'wijzig-dit-wachtwoord': true,
  'wijzig-dit-secret': true
};

const hits = new Map();
const counts = { total: 0 };

let cachedSecret = '';

function signingSecret() {
  if (cachedSecret) return cachedSecret;
  const fromEnv = [
    process.env.SPAM_HMAC_SECRET,
    process.env.JWT_SECRET,
    process.env.ADMIN_PASSWORD
  ];
  for (let i = 0; i < fromEnv.length; i++) {
    const value = fromEnv[i];
    if (value && !PLACEHOLDERS[value]) {
      cachedSecret = String(value);
      return cachedSecret;
    }
  }
  cachedSecret = crypto.randomBytes(32).toString('hex');
  return cachedSecret;
}

function issue(at) {
  const ts = String(at == null ? Date.now() : at);
  const sig = crypto.createHmac('sha256', signingSecret()).update(ts).digest('hex');
  return ts + '.' + sig;
}

function verifyToken(token, now) {
  const raw = String(token == null ? '' : token).trim();
  const dot = raw.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'invalid' };
  const tsPart = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^\d+$/.test(tsPart) || !/^[a-f0-9]+$/i.test(sig)) return { ok: false, reason: 'invalid' };
  const expected = crypto.createHmac('sha256', signingSecret()).update(tsPart).digest('hex');
  let a;
  let b;
  try {
    a = Buffer.from(sig, 'hex');
    b = Buffer.from(expected, 'hex');
  } catch (e) {
    return { ok: false, reason: 'invalid' };
  }
  if (a.length !== b.length || a.length === 0 || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid' };
  }
  const age = now - Number(tsPart);
  if (age < MIN_AGE_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_AGE_MS) return { ok: false, reason: 'expired' };
  return { ok: true, reason: 'ok' };
}

function text(value) {
  if (Array.isArray(value)) value = value[0];
  return String(value == null ? '' : value).trim();
}

function honeypotFilled(body) {
  const src = body && typeof body === 'object' ? body : {};
  return text(
    src.honeypot ||
    src.website ||
    src.hp ||
    src._gotcha ||
    src.company_url ||
    src.url
  );
}

function allowIp(ip, now) {
  const key = String(ip || '0.0.0.0');
  let arr = hits.get(key) || [];
  arr = arr.filter(function (t) { return now - t < RATE_WINDOW_MS; });
  if (arr.length >= RATE_LIMIT) {
    if (arr.length) hits.set(key, arr);
    else hits.delete(key);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

function note(reason) {
  counts.total += 1;
  counts[reason] = (counts[reason] || 0) + 1;
  console.log('spam-guard ' + counts.total);
}

function evaluate(opts) {
  const options = opts || {};
  const now = options.now == null ? Date.now() : options.now;
  const body = options.body || {};
  if (honeypotFilled(body)) {
    note('honeypot');
    return { spam: true, reason: 'honeypot' };
  }
  const time = verifyToken(body.whk_ts != null ? body.whk_ts : body.whkTs, now);
  if (!time.ok) {
    note(time.reason);
    return { spam: true, reason: time.reason };
  }
  if (options.rate !== false && !allowIp(options.ip || '0.0.0.0', now)) {
    note('rate');
    return { spam: true, reason: 'rate' };
  }
  return { spam: false, reason: 'ok' };
}

function clientIp(req) {
  // req.ip follows `trust proxy` (Railway sends X-Forwarded-For).
  let ip = '';
  if (req) ip = req.ip || (req.socket && req.socket.remoteAddress) || '';
  ip = String(ip || '').replace(/^::ffff:/, '').split(',')[0].trim();
  return (ip || '0.0.0.0').slice(0, 80);
}

function attr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function tokenField(token) {
  return '<input type="hidden" name="whk_ts" value="' + attr(token) + '" autocomplete="off">';
}

function honeypotField(id) {
  return '<div class="hp-field" aria-hidden="true"><label for="' + attr(id) + '" aria-hidden="true">Website</label><input type="text" id="' + attr(id) + '" name="website" tabindex="-1" autocomplete="off"></div>';
}

function stampHtml(html, token) {
  if (!html) return html;
  const field = tokenField(token);
  let n = 0;
  let out = String(html).replace(/<div class="hp-field"\b[^>]*>[\s\S]*?<\/div>/g, function (block) {
    if (/name=["']whk_ts["']/.test(block)) return block;
    return block + field;
  });
  out = out.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, function (form) {
    if (/name=["']whk_ts["']/.test(form) && /name=["']website["']/.test(form)) return form;
    n += 1;
    const extra = (/name=["']website["']/.test(form) ? '' : honeypotField('whk-hp-' + n)) +
      (/name=["']whk_ts["']/.test(form) ? '' : field);
    if (!extra) return form;
    return form.replace(/<form\b[^>]*>/i, function (open) { return open + extra; });
  });
  const boot = '<script id="whk-form-guard">window.WHK_FORM_GUARD=' + JSON.stringify({ token: String(token || '') }) + ';</script>';
  if (out.indexOf('id="whk-form-guard"') === -1) {
    if (out.indexOf('</head>') !== -1) out = out.replace('</head>', boot + '\n</head>');
    else out = boot + '\n' + out;
  }
  return out;
}

function stats() {
  return {
    total: counts.total,
    honeypot: counts.honeypot || 0,
    too_fast: counts.too_fast || 0,
    expired: counts.expired || 0,
    invalid: counts.invalid || 0,
    rate: counts.rate || 0
  };
}

function reset() {
  hits.clear();
  Object.keys(counts).forEach(function (key) { delete counts[key]; });
  counts.total = 0;
}

module.exports = {
  MIN_AGE_MS: MIN_AGE_MS,
  MAX_AGE_MS: MAX_AGE_MS,
  RATE_LIMIT: RATE_LIMIT,
  RATE_WINDOW_MS: RATE_WINDOW_MS,
  issue: issue,
  verifyToken: verifyToken,
  evaluate: evaluate,
  clientIp: clientIp,
  stampHtml: stampHtml,
  honeypotField: honeypotField,
  stats: stats,
  reset: reset,
  note: note
};
