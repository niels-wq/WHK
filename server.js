// werkhervattingskas.nl — Railway backend server
// Versie 1.0 — upload dit bestand naar GitHub samen met package.json, schema.sql en whk_verzuim.html

const express = require('express');
const { Pool } = require('pg');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'verander-dit-wachtwoord';
const JWT_SECRET     = process.env.JWT_SECRET     || 'verander-dit-secret-minimaal-32-tekens';
const PORT           = process.env.PORT            || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ================================================================
// AUTH MIDDLEWARE
// ================================================================
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Niet geautoriseerd' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token verlopen of ongeldig' });
  }
}

// ================================================================
// AUTH ENDPOINTS
// ================================================================
app.post('/api/auth/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Onjuist wachtwoord' });
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, ok: true });
});

app.post('/api/auth/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({ ok: false });
  }
});

// ================================================================
// KEY-VALUE HELPERS
// ================================================================
async function kvGet(key) {
  const r = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}

async function kvSet(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  await pool.query(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, v]
  );
}

// Default lege waarden per sleutel
function defaultFor(key) {
  if (['posts','categories','leads','newsletter','activity_log'].includes(key)) return [];
  return {};
}

// ================================================================
// GENERIEKE API ENDPOINTS (alle storage-sleutels)
// ================================================================
const ENDPOINTS = [
  { path: '/api/posts',                    key: 'posts',                   open: true  },
  { path: '/api/categories',               key: 'categories',              open: true  },
  { path: '/api/leads',                    key: 'leads',                   open: false },
  { path: '/api/newsletter',               key: 'newsletter',              open: false },
  { path: '/api/analytics/summary',        key: 'analytics_summary',       open: false },
  { path: '/api/analytics/calc_log',       key: 'analytics_calc_log',      open: false },
  { path: '/api/analytics/ab_cta',         key: 'analytics_ab_cta',        open: false },
  { path: '/api/settings/calc_config',     key: 'settings_calc_config',    open: false },
  { path: '/api/settings/ga4id',           key: 'settings_ga4id',          open: false },
  { path: '/api/settings/webhook_url',     key: 'settings_webhook_url',    open: false },
  { path: '/api/settings/ab_cta',          key: 'settings_ab_cta',         open: false },
  { path: '/api/settings/newsletter_api',  key: 'settings_newsletter_api', open: false },
  { path: '/api/settings/calendly_url',    key: 'settings_calendly_url',   open: false },
  { path: '/api/log',                      key: 'activity_log',            open: false },
  { path: '/api/settings/siteteksten',     key: 'settings_siteteksten',    open: true  },
  { path: '/api/settings/page_content',    key: 'settings_page_content',   open: true  },
  { path: '/api/settings/faq_items',       key: 'settings_faq_items',      open: true  },
];

ENDPOINTS.forEach(({ path: p, key, open }) => {
  const middleware = open ? [] : [auth];

  // GET
  app.get(p, ...middleware, async (req, res) => {
    try {
      const val = await kvGet(key);
      if (val === null) return res.json(defaultFor(key));
      try { res.json(JSON.parse(val)); } catch (e) { res.send(val); }
    } catch (e) {
      console.error('GET error', key, e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PUT (altijd auth vereist voor schrijven)
  app.put(p, auth, async (req, res) => {
    try {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      await kvSet(key, body);
      res.json({ ok: true });
    } catch (e) {
      console.error('PUT error', key, e.message);
      res.status(500).json({ error: e.message });
    }
  });
});

// ================================================================
// SITEMAP.XML — dynamisch gegenereerd
// ================================================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const postsRaw = await kvGet('posts');
    const posts    = postsRaw ? JSON.parse(postsRaw) : [];
    const base     = process.env.SITE_URL || 'https://www.werkhervattingskas.nl';

    const staticPaths = [
      '/', '/over-ons', '/aanpak', '/faq', '/blog', '/tools',
      '/tarieven', '/sectoren', '/casestudies', '/beschikking-uitleg',
      '/vergelijking', '/poortwachter', '/wia-calculator', '/subsidie-scan',
      '/jaarkalender', '/premiehistorie', '/privacy'
    ];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml    += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    staticPaths.forEach(p => {
      xml += `  <url><loc>${base}${p}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n`;
    });

    const now = new Date().toISOString().slice(0, 10);
    posts
      .filter(p => !p.archived && new Date(p.publishedAt) <= new Date())
      .forEach(p => {
        xml += `  <url><loc>${base}/blog/${p.slug}</loc><lastmod>${p.publishedAt.slice(0,10)}</lastmod><changefreq>yearly</changefreq><priority>0.6</priority></url>\n`;
      });

    xml += '</urlset>';
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    res.status(500).send('Sitemap kon niet worden gegenereerd: ' + e.message);
  }
});

// ================================================================
// ROBOTS.TXT
// ================================================================
app.get('/robots.txt', (req, res) => {
  const base = process.env.SITE_URL || 'https://www.werkhervattingskas.nl';
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`);
});

// ================================================================
// GEZONDHEIDSCHECK
// ================================================================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: 'error', error: e.message });
  }
});

// ================================================================
// STATISCHE HTML SERVEREN — catch-all (moet als laatste staan)
// ================================================================
app.get('*', (req, res) => {
  const htmlPath = path.join(__dirname, 'whk_verzuim.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send([
      '<h2>whk_verzuim.html niet gevonden</h2>',
      '<p>Upload het HTML-bestand naar de root van het project in GitHub.</p>',
      '<p>Verwachte locatie: <code>' + htmlPath + '</code></p>'
    ].join(''));
  }
});

// ================================================================
// SERVER STARTEN
// ================================================================
app.listen(PORT, () => {
  console.log(`werkhervattingskas.nl server gestart op poort ${PORT}`);
  console.log(`Omgeving: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DATABASE_URL ? 'gekoppeld' : 'NIET gekoppeld — DATABASE_URL ontbreekt'}`);
});
