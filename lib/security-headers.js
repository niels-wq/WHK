'use strict';

// Afdwingende headers op elk antwoord. De volledige CSP blijft Report-Only:
// de pagina draait op inline scripts/styles, de chatwidget, GA4 en Calendly.
// frame-ancestors 'self' staat wél afdwingend, naast X-Frame-Options.

const CSP_FRAME_ANCESTORS = "frame-ancestors 'self'";

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://assets.calendly.com https://calendly.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://assets.calendly.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://stats.g.doubleclick.net",
  "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.googletagmanager.com https://fonts.googleapis.com https://fonts.gstatic.com https://calendly.com https://*.calendly.com https://api.anthropic.com",
  "frame-src 'self' https://calendly.com https://*.calendly.com"
].join('; ');

function securityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP_FRAME_ANCESTORS);
  res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
  next();
}

module.exports = {
  securityHeaders: securityHeaders,
  cspFrameAncestors: CSP_FRAME_ANCESTORS,
  cspReportOnly: CSP_REPORT_ONLY
};
