'use strict';

// Public SEO origin is always the apex host. www currently has an invalid TLS
// certificate, so canonical / og:url / hreflang / JSON-LD url / sitemap loc
// must never emit https://www.werkhervattingskas.nl.
const APEX_ORIGIN = 'https://werkhervattingskas.nl';
const WWW_HOST_RE = /https?:\/\/www\.werkhervattingskas\.nl/gi;

function toApexOrigin(raw) {
  const fallback = APEX_ORIGIN;
  let s = String(raw || fallback).trim();
  if (!s) return fallback;
  s = s.replace(/\/$/, '');
  s = s.replace(/^https?:\/\/www\./i, 'https://');
  s = s.replace(/^http:\/\//i, 'https://');
  try {
    const u = new URL(s.includes('://') ? s : 'https://' + s);
    const host = String(u.hostname || '').replace(/^www\./i, '').toLowerCase();
    if (host === 'werkhervattingskas.nl') return APEX_ORIGIN;
  } catch (e) { /* fall through to apex */ }
  return fallback;
}

function apexPageUrl(pathname) {
  let p = String(pathname == null ? '/' : pathname);
  p = p.replace(WWW_HOST_RE, '');
  p = p.replace(/^https?:\/\/werkhervattingskas\.nl/i, '');
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p === '/' ? APEX_ORIGIN + '/' : APEX_ORIGIN + p;
}

function stripWwwHost(str) {
  return String(str || '').replace(WWW_HOST_RE, APEX_ORIGIN);
}

function hasWwwSiteHost(str) {
  return /https?:\/\/www\.werkhervattingskas\.nl/i.test(String(str || ''));
}

module.exports = {
  APEX_ORIGIN,
  WWW_HOST_RE,
  toApexOrigin,
  apexPageUrl,
  stripWwwHost,
  hasWwwSiteHost
};
