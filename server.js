// werkhervattingskas.nl — Railway backend server v3.0
// Met echte URL's, SEO meta-tag injectie, e-mailnotificaties en llms.txt

const express    = require('express');
const { Pool }   = require('pg');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const https      = require('https');

const app  = express();
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD    || 'verander-dit';
const JWT_SECRET        = process.env.JWT_SECRET        || 'verander-dit-secret';
// Primary host is the apex domain. www is redirected here; www currently has a
// separate DNS/cert issue outside this repo. Canonicals, hreflang, sitemap and
// robots all use SITE_URL (apex).
const SITE_URL          = (process.env.SITE_URL         || 'https://werkhervattingskas.nl').replace(/\/$/, '').replace('https://www.', 'https://');
const PORT              = process.env.PORT              || 3000;
const NOTIFICATION_EMAIL= process.env.NOTIFICATION_EMAIL|| 'info@matchvermogen.nl';
const RESEND_API_KEY    = process.env.RESEND_API_KEY    || '';
const FROM_EMAIL        = process.env.FROM_EMAIL        || 'noreply@werkhervattingskas.nl';
const ARTICLES_DIR      = path.join(__dirname, 'content', 'articles');
const leadGuard         = require('./lib/lead-guard');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Railway / GSC send Host or X-Forwarded-Host; needed to see www behind the proxy.
app.set('trust proxy', 1);

function requestHost(req) {
  const raw = String(req.get('x-forwarded-host') || req.get('host') || req.hostname || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return raw.replace(/:\d+$/, '');
}

// Host www → 301 apex (https://werkhervattingskas.nl + path).
// GSC's 11× 404s are all www — DNS/TLS on www is still required outside this repo.
// This 301 only fires after a request reaches the app; it does not paper over a broken www cert.
app.use((req, res, next) => {
  const host = requestHost(req);
  if (host === 'www.werkhervattingskas.nl' || host.startsWith('www.')) {
    return res.redirect(301, SITE_URL + (req.originalUrl || '/'));
  }
  next();
});

// Collapse trailing slashes so /over-ons/ and /over-ons share one URL
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const rest = req.url.slice(req.path.length);
    return res.redirect(301, req.path.slice(0, -1) + rest);
  }
  next();
});

// ================================================================
// E-MAIL VIA RESEND API
// ================================================================
const emailReady = !!RESEND_API_KEY;
console.log(emailReady ? `E-mail geconfigureerd via Resend → ${NOTIFICATION_EMAIL}` : 'E-mail niet geconfigureerd — stel RESEND_API_KEY in als Railway variabele.');

function sendResendEmail(to, subject, html) {
  return new Promise(function(resolve, reject) {
    const body = JSON.stringify({
      from: `werkhervattingskas.nl <${FROM_EMAIL}>`,
      to: [to],
      subject: subject,
      html: html
    });
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      let data = '';
      res.on('data', function(chunk){ data += chunk; });
      res.on('end', function(){
        if(res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`Resend status ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendLeadEmail(lead) {
  if (!emailReady) return;
  const bronLabels = {
    'calculator':            'WHK-calculator op de homepage',
    'terugbel-modal':        'Terugbelformulier (modal)',
    'footer-form':           'Terugbelformulier (footer)',
    'lead-magnet-checklist': 'Gratis WHK-checklist download',
    'quiz':                  'WHK-risicoscan quiz',
    'terugbel-checklist':    'Terugbelverzoek via checklist',
  };
  const bron = bronLabels[lead.source] || lead.source || 'Onbekend';
  const tijdstip = new Date(lead.createdAt).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#A23E2C;color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:1.1rem;">🔔 Nieuwe lead — werkhervattingskas.nl</h2>
      </div>
      <div style="background:#f7f3ea;padding:20px 24px;border:1px solid #D7CBB0;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <tr><td style="padding:8px 0;color:#666;width:120px;"><strong>Naam</strong></td><td style="padding:8px 0;">${lead.name || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Telefoon</strong></td><td style="padding:8px 0;">${lead.phone || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>E-mail</strong></td><td style="padding:8px 0;">${lead.email || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Bericht</strong></td><td style="padding:8px 0;">${lead.message || lead.summary || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Pagina</strong></td><td style="padding:8px 0;">${lead.page || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Formulier</strong></td><td style="padding:8px 0;">${bron}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Tijdstip</strong></td><td style="padding:8px 0;">${tijdstip}</td></tr>
        </table>
        <div style="margin-top:16px;padding:12px 16px;background:white;border-radius:6px;border-left:4px solid #A23E2C;">
          <p style="margin:0;font-size:0.86rem;color:#666;">📌 Ga naar <a href="${SITE_URL}" style="color:#A23E2C;">werkhervattingskas.nl</a> → admin → Leads om de status bij te werken.</p>
        </div>
      </div>
    </div>`;

  try {
    await sendResendEmail(NOTIFICATION_EMAIL, `🔔 Nieuwe lead: ${lead.name || 'Anoniem'} via ${bron}`, html);
    console.log(`E-mail verstuurd naar ${NOTIFICATION_EMAIL} voor lead: ${lead.name}`);
  } catch (e) {
    console.error('E-mail versturen mislukt:', e.message);
  }
}

// ================================================================
// AUTH
// ================================================================
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Niet geautoriseerd' });
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'Token verlopen' }); }
}
app.post('/api/auth/login', (req, res) => {
  if ((req.body || {}).password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Onjuist wachtwoord' });
  res.json({ token: jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '8h' }), ok: true });
});
app.post('/api/auth/verify', (req, res) => {
  try { jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET); res.json({ ok: true }); }
  catch (e) { res.status(401).json({ ok: false }); }
});

// ================================================================
// KV-DATABASE
// ================================================================
async function kvGet(key) {
  if (!pool) return null;
  try {
    const r = await pool.query('SELECT value FROM kv_store WHERE key=$1', [key]);
    return r.rows[0] ? r.rows[0].value : null;
  } catch (e) {
    console.error('kvGet', key, e.message);
    return null;
  }
}
async function kvSet(key, value) {
  if (!pool) throw new Error('Database niet geconfigureerd');
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  await pool.query(
    'INSERT INTO kv_store(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()',
    [key, v]
  );
}
function defaultFor(key) {
  return ['posts','categories','leads','newsletter','activity_log'].includes(key) ? [] : {};
}

// ================================================================
// FILE-BASED ARTICLES — content/articles/*.md (frontmatter + markdown)
// Additive to the existing SEED_POSTS (in HTML) and admin CMS (/api/posts).
// On slug conflict, database/CMS posts win.
// ================================================================
function inlineMd(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function mdToHtml(md) {
  return String(md || '').split(/\n{2,}/).map(function(block) {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('### ')) return '<h3>' + inlineMd(b.slice(4)) + '</h3>';
    if (b.startsWith('## ')) return '<h2>' + inlineMd(b.slice(3)) + '</h2>';
    if (b.startsWith('# ')) return '<h2>' + inlineMd(b.slice(2)) + '</h2>';
    if (/^[-*] /.test(b)) {
      const items = b.split('\n').map(function(line) {
        return '<li>' + inlineMd(line.replace(/^[-*] /, '')) + '</li>';
      }).join('');
      return '<ul>' + items + '</ul>';
    }
    return '<p>' + inlineMd(b).replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
}
function parseFrontmatter(raw) {
  const m = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  m[1].split(/\r?\n/).forEach(function(line) {
    const i = line.indexOf(':');
    if (i === -1) return;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[k] = v;
  });
  return { meta: meta, body: m[2].trim() };
}
function loadMarkdownArticles() {
  const posts = [];
  if (!fs.existsSync(ARTICLES_DIR)) return posts;
  fs.readdirSync(ARTICLES_DIR).forEach(function(file) {
    if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') return;
    const parsed = parseFrontmatter(fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8'));
    if (!parsed || !parsed.meta.title) return;
    const slug = parsed.meta.slug || file.replace(/\.md$/, '');
    posts.push({
      slug: slug,
      title: parsed.meta.title,
      metaDescription: parsed.meta.description || parsed.meta.title,
      tags: parsed.meta.tags ? parsed.meta.tags.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [],
      publishedAt: parsed.meta.publishedAt || parsed.meta.date || new Date().toISOString(),
      archived: parsed.meta.archived === 'true',
      source: 'markdown',
      bodyHtml: mdToHtml(parsed.body)
    });
  });
  return posts;
}
function mergePostSources(dbPosts) {
  const bySlug = new Map();
  loadMarkdownArticles().forEach(function(p) { if (p.slug) bySlug.set(p.slug, p); });
  (Array.isArray(dbPosts) ? dbPosts : []).forEach(function(p) { if (p && p.slug) bySlug.set(p.slug, p); });
  return Array.from(bySlug.values());
}
function extractSeedBlogSlugs(html) {
  const slugs = [];
  const start = html.indexOf('var SEED_POSTS = [');
  if (start === -1) return slugs;
  const end = html.indexOf('var posts = [];', start);
  const chunk = html.slice(start, end === -1 ? start + 800000 : end);
  const re = /^\s+slug:\s*'([a-z0-9-]+)'/gm;
  let m;
  while ((m = re.exec(chunk))) slugs.push(m[1]);
  return slugs;
}
function findSeedPostMeta(html, slug) {
  if (!html || !slug) return null;
  const start = html.indexOf("slug: '" + slug + "'");
  if (start === -1) return null;
  const chunk = html.slice(start, start + 2500);
  const title = chunk.match(/title:\s*'((?:\\'|[^'])*)'/);
  const desc = chunk.match(/metaDescription:\s*'((?:\\'|[^'])*)'/);
  if (!title) return null;
  return {
    title: title[1].replace(/\\'/g, "'") + ' — werkhervattingskas.nl',
    desc: desc ? desc[1].replace(/\\'/g, "'") : title[1]
  };
}

// ================================================================
// LEAD NOTIFICATIE — naam + (telefoon of e-mail); test/spam niet naar info@
// ================================================================
async function handleLeadPost(req, res) {
  try {
    const classified = leadGuard.classify(req.body || {});
    if (!classified.ok) {
      return res.status(400).json({ error: classified.error, reason: classified.reason });
    }
    const n = classified.lead;
    const lead = {
      id: 'lead_' + Date.now(),
      name:    n.name,
      phone:   n.phone,
      email:   n.email,
      source:  n.source || 'onbekend',
      message: n.message,
      page:    n.page,
      createdAt: new Date().toISOString(),
      status: classified.status,
      flagReason: classified.reason === 'ok' ? undefined : classified.reason
    };

    if (pool) {
      const existing = await kvGet('leads');
      const leads = existing ? JSON.parse(existing) : [];
      leads.unshift(lead);
      await kvSet('leads', JSON.stringify(leads));
    }

    if (classified.notify) {
      await sendLeadEmail(lead);
      const webhookRaw = await kvGet('settings_webhook_url');
      if (webhookRaw) {
        const webhookUrl = typeof webhookRaw === 'string' ? webhookRaw.replace(/^"|"$/g,'') : '';
        if (webhookUrl && webhookUrl.startsWith('http')) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'new_lead', lead })
          }).catch(() => {});
        }
      }
    } else {
      console.log(`Lead ${lead.id} opgeslagen als ${lead.status} (${classified.reason}) — geen e-mail naar ${NOTIFICATION_EMAIL}`);
    }

    res.json({ ok: true, id: lead.id, status: lead.status, notified: !!classified.notify });
  } catch (e) {
    console.error('Lead notify fout:', e.message);
    res.status(500).json({ error: e.message });
  }
}
app.post('/api/lead/notify', handleLeadPost);
app.post('/api/leads', handleLeadPost);

app.get('/lib/lead-guard.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'lib', 'lead-guard.js'));
});

// ================================================================
// GENERIEKE API ENDPOINTS
// ================================================================
const ENDPOINTS = [
  ['/api/posts','posts',true],['/api/categories','categories',true],
  ['/api/leads','leads',false],['/api/newsletter','newsletter',false],
  ['/api/analytics/summary','analytics_summary',false],
  ['/api/analytics/calc_log','analytics_calc_log',false],
  ['/api/analytics/ab_cta','analytics_ab_cta',false],
  ['/api/settings/calc_config','settings_calc_config',false],
  ['/api/settings/ga4id','settings_ga4id',false],
  ['/api/settings/webhook_url','settings_webhook_url',false],
  ['/api/settings/ab_cta','settings_ab_cta',false],
  ['/api/settings/newsletter_api','settings_newsletter_api',false],
  ['/api/settings/calendly_url','settings_calendly_url',false],
  ['/api/log','activity_log',false],
  ['/api/settings/siteteksten','settings_siteteksten',true],
  ['/api/settings/page_content','settings_page_content',true],
  ['/api/settings/faq_items','settings_faq_items',true],
];

ENDPOINTS.forEach(([p, key, open]) => {
  const mw = open ? [] : [auth];
  app.get(p, ...mw, async (req, res) => {
    try {
      const v = await kvGet(key);
      let data;
      if (v === null) data = defaultFor(key);
      else { try { data = JSON.parse(v); } catch (e) { return res.send(v); } }
      if (key === 'posts') data = mergePostSources(data);
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(p, auth, async (req, res) => {
    try { await kvSet(key, req.body); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// ================================================================
// META-TAGS PER URL
// ================================================================
const URL_META = {
  '/':                              { title: 'WHK-beschikking controleren — in 8 van de 10 gevallen vinden wij iets', desc: 'Fout in uw WHK-beschikking? Gratis controle, no cure no pay bezwaar. Gemiddeld €47.000 besparing. Erkend arbeidsdeskundige. Resultaat binnen 5 werkdagen.' },
  '/over-ons':                      { title: 'Over Matchvermogen — werkhervattingskas.nl', desc: 'Matchvermogen is gespecialiseerd in WHK-optimalisatie, arbeidsdeskundig onderzoek en re-integratiediensten.' },
  '/aanpak':                        { title: 'Onze aanpak — werkhervattingskas.nl', desc: 'Zo werken wij: van vrijblijvende check tot bezwaarprocedure. Geen kosten tenzij wij besparing realiseren.' },
  '/faq':                           { title: 'FAQ Werkhervattingskas (WHK): vragen over premie, WIA en bezwaar', desc: 'Wat is de Werkhervattingskas? Hoe werkt de WHK-premie, no-riskpolis, WIA/WGA en bezwaar? Antwoorden van een erkend arbeidsdeskundige, plus links naar rekentools.' },
  '/blog':                          { title: 'WHK-kennisbank voor HR en Finance — werkhervattingskas.nl', desc: 'Actuele artikelen over WHK-premies, re-integratie, no-riskpolissen en loonkostenvoordeel.' },
  '/tools':                         { title: 'Gratis WHK-tools voor werkgevers — werkhervattingskas.nl', desc: 'Poortwachter-tijdlijnchecker, WIA-uitkeringscalculator, subsidie-scan, interventietarief checker en WHK-jaarkalender. Direct inzicht, geen registratie vereist.' },
  '/tarieven':                      { title: 'Tarieven — werkhervattingskas.nl', desc: 'Transparante tarieven voor WHK-controle en arbeidsdeskundig onderzoek. Altijd no cure, no pay.' },
  '/sectoren':                      { title: 'WHK-premie per sector: wat betaalt uw branche gemiddeld? [2026]', desc: 'Zie hoe uw WHK-premie zich verhoudt tot het sectorgemiddelde. Zorg, bouw, transport, onderwijs — per sector uitgelegd inclusief typische fouten in de beschikking.' },
  '/casestudies':                   { title: 'Praktijkcasussen WHK-besparing — werkhervattingskas.nl', desc: 'Vijf geanonimiseerde casussen: van €9.800 tot €137.000 besparing per jaar.' },
  '/beschikking-uitleg':           { title: 'Wat is de Werkhervattingskas (WHK)? Zo leest u uw beschikking', desc: 'De Werkhervattingskas is de gedifferentieerde ZW- en WGA-premie. Uitleg per onderdeel van uw WHK-beschikking: dagtekening, loonsom, toerekening en veelgemaakte fouten.' },
  '/vergelijking':                  { title: 'Matchvermogen vs. controller vs. arbodienst — werkhervattingskas.nl', desc: 'Eerlijke vergelijking: wie controleert uw WHK-beschikking het beste?' },
  '/privacy':                       { title: 'Privacyverklaring — werkhervattingskas.nl', desc: 'Hoe werkhervattingskas.nl omgaat met uw persoonsgegevens en AVG-rechten.' },
  '/quiz':                          { title: 'WHK-risicoscan — werkhervattingskas.nl', desc: 'Doe de korte scan en ontdek in 2 minuten uw WHK-besparingspotentieel.' },
  '/besparingen':                   { title: 'Alle besparingsmogelijkheden — werkhervattingskas.nl', desc: 'Compleet overzicht van alle WHK-besparingsroutes.' },
  '/lexicon':                       { title: 'WHK-lexicon — werkhervattingskas.nl', desc: 'Begrippenlijst: WGA, IVA, no-riskpolis, LKV, loonsanctie uitgelegd in gewone taal.' },
  '/tools/poortwachter':           { title: 'Poortwachter-tijdlijnchecker 2026 — werkhervattingskas.nl', desc: 'Vul de eerste ziektedag in en zie direct alle Wet poortwachter-deadlines, aanbevolen interventiemomenten en de relatie met uw WHK-premie.' },
  '/tools/wia-calculator':         { title: 'WIA berekenen: WGA, IVA en loonaanvullingsuitkering [2026]', desc: 'WIA, WGA of IVA berekenen op basis van dagloon en AO-percentage. Inclusief loonaanvullingsuitkering en het effect op de WHK-premie van de werkgever. Indicatief, gratis.' },
  '/tools/subsidie-scan':          { title: 'Subsidie-scan LKV, LIV en WKB — werkhervattingskas.nl', desc: 'Bereken in 3 stappen of u loonkostenvoordeel (max €6.000/jaar), lage-inkomensvoordeel of werkbonus kunt claimen. Direct resultaat, gratis tool.' },
  '/tools/jaarkalender':           { title: 'WHK Jaarkalender 2026 — alle deadlines op een rij — werkhervattingskas.nl', desc: 'Alle WHK-deadlines per maand: bezwaartermijn beschikking (6 weken!), LKV-aanvraag, WIA-aanvraag en poortwachter-verplichtingen. Nooit meer een termijn missen.' },
  '/tools/premiehistorie':         { title: 'WHK- en WGA-premies 2022–2026: historisch overzicht', desc: 'Gemiddelde gedifferentieerde WGA-premie per jaar, met minimum, maximum en loonsomgrenzen. Vergelijk de reeks met het WGA-deel op uw WHK-beschikking.' },
  '/voor/tussenpersoon':           { title: 'WHK-expertise voor tussenpersonen & assurantieadviseurs — werkhervattingskas.nl', desc: 'Als assurantietussenpersoon of adviseur biedt u uw klanten meer waarde met WHK-expertise. Doorverwijzingsmodel beschikbaar, no cure no pay.' },
  '/sectoren/bouw':                { title: 'WHK-beschikking bouwsector: structureel te hoog door hoog verzuim — werkhervattingskas.nl', desc: 'Bouwbedrijven betalen structureel te veel WHK-premie door hoog verzuim, gemist letselschaderegres en foutieve sectorindeling. Wij controleren gratis. No cure, no pay.' },
  '/sectoren/zorg':                { title: 'WHK-optimalisatie voor zorginstellingen — werkhervattingskas.nl', desc: 'Zorginstellingen betalen vaak te veel WHK-premie door hoog verzuim en gemiste no-riskregistraties. Bezwaar- en herbeoordelingsprocedures zijn onze specialiteit.' },
  '/tools/interventie-check':      { title: 'Interventietarief checker: betaalt u te veel? — werkhervattingskas.nl', desc: 'Vergelijk uw tarieven voor arbeidsdeskundig onderzoek, tweede spoor en coaching met de marktnorm. Direct resultaat. Fors boven de norm? Overweeg een besparingsonderzoek.' },
  '/tools/preventie-calculator':   { title: 'Preventieve besparingscalculator WHK — werkhervattingskas.nl', desc: 'Bereken indicatief hoeveel WGA-instroom en WHK-premie u bespaart door eerder in te grijpen bij langdurig verzuim. Gebaseerd op actuele uitkeringsduur en dagloongemiddelden.' },
  '/voor/hr-manager':              { title: 'WHK voor HR-managers & HR-adviseurs — werkhervattingskas.nl', desc: 'U regelt het verzuim. Wij regelen de financiële kant: WHK-check en no-riskpolissen.' },
  '/voor/controller':              { title: 'WHK-optimalisatie voor controllers & Finance — werkhervattingskas.nl', desc: 'Verlaag de WHK-loonkostenpost structureel. No cure, no pay.' },
  '/voor/casemanager':             { title: 'WHK en re-integratie voor casemanagers — werkhervattingskas.nl', desc: 'Wij zijn uw verlengstuk: AD-onderzoek, tweede spoor en WGA-herbeoordeling.' },
  '/voor/directeur':               { title: 'WHK-besparing voor directeuren & eigenaren — werkhervattingskas.nl', desc: 'In 8 van de 10 gevallen vinden wij besparing. No cure, no pay.' },
  '/diensten/whk-controle':        { title: 'WHK-beschikking controleren: gratis check, no cure no pay [2026]', desc: 'Erkend arbeidsdeskundige controleert uw WHK-beschikking op fouten, gemiste no-riskpolissen en onjuiste toerekening. Gemiddeld €47.000 besparing. Start gratis.' },
  '/diensten/besparingsonderzoek': { title: 'WHK-besparingsonderzoek: ontdek wat u onnodig betaalt — gratis intake', desc: 'Wij onderzoeken uw volledige WHK-positie: beschikking, no-riskpolissen, interventietarieven en ERD. Gemiddeld €47.000 besparing per jaar. Volledig no cure, no pay.' },
  '/diensten/letselschade':        { title: 'Letselschaderegres: WGA-kosten verhalen op aansprakelijke partij', desc: 'Heeft een derde uw medewerker letsel toegebracht? Dan kunt u de WGA-kosten en WHK-premieverhoging op hen verhalen. Wij regelen het traject. No cure, no pay.' },
  '/diensten/arbeidsdeskundig-onderzoek': { title: 'Arbeidsdeskundig onderzoek: wat het is, wanneer nodig en kosten [2026]', desc: 'Arbeidsdeskundig onderzoek door een erkende arbeidsdeskundige: belastbaarheid, spoorkeuze en dossierwaarde. Wanneer het nodig is bij poortwachter, WIA of bezwaar — en wat het inhoudt.' },
  '/diensten/tweede-spoor':        { title: 'Tweede spoor re-integratie — werkhervattingskas.nl', desc: 'Tijdig tweede spoor voorkomt loonsanctie. Volledig begeleid traject.' },
  '/diensten/consultancy':         { title: 'Verzuimconsultancy — werkhervattingskas.nl', desc: 'Structurele verbetering van uw verzuimbeleid en re-integratiemanagement.' },
  '/diensten/erd-partneradvies':   { title: 'Eigenrisicodragerschap & partneradvies — werkhervattingskas.nl', desc: 'Is eigenrisicodragerschap voordeliger? Wij vergelijken en begeleiden de overgang.' },
};

const SECTOR_META = {
  'zorg':       { title: 'WHK-besparing in de zorgsector — werkhervattingskas.nl', desc: 'De zorgsector heeft structureel hoog verzuim. Ontdek de besparingskansen voor ziekenhuizen, GGZ en VVT.' },
  'onderwijs':  { title: 'WHK-besparing in het onderwijs — werkhervattingskas.nl', desc: 'Onderwijsinstellingen betalen gemiddeld te veel WHK-premie. De meest voorkomende fouten.' },
  'bouw':       { title: 'WHK-besparing in de bouw — werkhervattingskas.nl', desc: 'Bouwbedrijven kampen met hoog verzuim door fysieke belasting. Zo beheerst u de WHK-premie.' },
  'overheid':   { title: 'WHK-besparing bij overheid & gemeenten — werkhervattingskas.nl', desc: 'Gemeenten en overheidsinstellingen als grote werkgever: effectieve beschikkingcontrole.' },
  'retail':     { title: 'WHK-besparing in de retail — werkhervattingskas.nl', desc: 'Retailbedrijven met veel parttimers: no-riskpolissen en WHK-premie optimaal beheren.' },
  'industrie':  { title: 'WHK-besparing in de industrie — werkhervattingskas.nl', desc: 'Productiebedrijven: hoe u de WHK-beschikking controleert en fouten corrigeert.' },
  'transport':  { title: 'WHK-besparing in transport & logistiek — werkhervattingskas.nl', desc: 'Transportbedrijven: zo beperkt u de WHK-lasten via betere re-integratiekeuzes.' },
  'ict':        { title: 'WHK-besparing in de ICT-sector — werkhervattingskas.nl', desc: 'ICT-bedrijven met burnout-gerelateerd verzuim: no-riskregistraties en WHK-premie.' },
  'financieel': { title: 'WHK-besparing in de financiële sector — werkhervattingskas.nl', desc: 'Banken en verzekeraars: zo optimaliseert u de WHK-beschikking.' },
  'uitzend':    { title: 'WHK-besparing in de uitzendsector — werkhervattingskas.nl', desc: 'Uitzendbureaus: hoge doorstroming en WHK-lasten beheersen.' },
  'horeca':     { title: 'WHK-besparing in de horeca — werkhervattingskas.nl', desc: 'Horecabedrijven met seizoenswerk en hoog verloop: WHK-premie en no-riskpolissen.' },
  'schoonmaak': { title: 'WHK-besparing in de schoonmaakbranche — werkhervattingskas.nl', desc: 'Schoonmaakbedrijven: zo beheerst u de WHK-lasten bij fysiek zwaar werk.' },
};

// ================================================================
// HTML CACHE & META-INJECTIE
// ================================================================
let cachedHtml = null;
function getHtml() {
  if (!cachedHtml) {
    const p = path.join(__dirname, 'whk_verzuim.html');
    if (!fs.existsSync(p)) return null;
    cachedHtml = fs.readFileSync(p, 'utf8');
  }
  return cachedHtml;
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function innerLocalBusinessLd() {
  // Same parent as homepage: LocalBusiness + ProfessionalService owns aggregateRating.
  // OfferCatalog (Service "WHK-beschikking controleren") stays homepage-only so GSC
  // does not treat that Service as the Review parent on inner URLs like /voor/casemanager.
  return `<script type="application/ld+json" id="localbusiness-schema">
{
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "ProfessionalService"],
  "@id": "${SITE_URL}/#localbusiness",
  "name": "werkhervattingskas.nl – Matchvermogen",
  "description": "Onafhankelijke controle van WHK-beschikkingen, arbeidsdeskundig onderzoek, tweede spoor re-integratie en verzuimoptimalisatie. No cure, no pay.",
  "url": "${SITE_URL}/",
  "telephone": "+31650213593",
  "email": "info@werkhervattingskas.nl",
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "NL"
  },
  "areaServed": "NL",
  "priceRange": "No cure, no pay",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "bestRating": "5",
    "worstRating": "1",
    "ratingCount": "14",
    "reviewCount": "14"
  }
}
</script>`;
}

function serveWithMeta(res, meta, canonPath, statusCode) {
  const html = getHtml();
  if (!html) return res.status(404).send('<h2>Site niet gevonden</h2><p>Upload whk_verzuim.html naar GitHub.</p>');
  const t = esc(meta.title), d = esc(meta.desc), c = SITE_URL + canonPath;
  const noindex = meta.robots || ((canonPath === '/admin') ? 'noindex, nofollow' : 'index, follow');
  let modified = html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${c}"`)
    .replace(/<link rel="alternate" hreflang="nl" href="[^"]*"/, `<link rel="alternate" hreflang="nl" href="${c}"`)
    .replace(/<link rel="alternate" hreflang="x-default" href="[^"]*"/, `<link rel="alternate" hreflang="x-default" href="${c}"`)
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${c}"`)
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`)
    .replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`)
    .replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${t}"`)
    .replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${d}"`)
    .replace(/<meta name="robots" content="[^"]*"/, `<meta name="robots" content="${noindex}"`);
  if (canonPath !== '/') {
    modified = modified.replace(
      /<script type="application\/ld\+json" id="localbusiness-schema">[\s\S]*?<\/script>/,
      innerLocalBusinessLd()
    );
  }
  res.status(statusCode || 200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', canonPath === '/admin' ? 'no-store' : 'public, max-age=300');
  res.send(modified);
}

function serveNotFound(res) {
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pagina niet gevonden — werkhervattingskas.nl</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${SITE_URL}/">
  <style>
    body{margin:0;font-family:IBM Plex Sans,Arial,sans-serif;background:#F7F3EA;color:#11192B;}
    .wrap{max-width:640px;margin:12vh auto;padding:0 24px;}
    h1{font-family:Georgia,serif;font-size:2rem;margin:0 0 12px;}
    p{color:#5B5547;line-height:1.6;}
    a{color:#A23E2C;}
    ul{padding-left:18px;line-height:1.8;}
  </style>
</head>
<body>
  <div class="wrap">
    <p style="letter-spacing:.08em;text-transform:uppercase;font-size:.75rem;color:#A23E2C;font-weight:700;">404</p>
    <h1>Deze pagina bestaat niet</h1>
    <p>De URL die u opvroeg hoort niet bij werkhervattingskas.nl. Ga terug naar een bestaande pagina:</p>
    <ul>
      <li><a href="/">Home — WHK-check</a></li>
      <li><a href="/over-ons">Over ons</a></li>
      <li><a href="/blog">Kennisbank</a></li>
      <li><a href="/diensten/whk-controle">WHK-beschikking controleren</a></li>
    </ul>
  </div>
</body>
</html>`;
  res.status(404);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

// ================================================================
// BLOG ARTIKEL — eigen meta per artikel
// ================================================================
app.get('/blog/:slug', async (req, res) => {
  try {
    const raw = await kvGet('posts');
    const dbPosts = raw ? JSON.parse(raw) : [];
    const posts = mergePostSources(Array.isArray(dbPosts) ? dbPosts : []);
    const post = posts.find(p => p.slug === req.params.slug && !p.archived);
    let meta = post
      ? { title: post.title + ' — werkhervattingskas.nl', desc: post.metaDescription || post.title }
      : findSeedPostMeta(getHtml() || '', req.params.slug);
    if (!meta) meta = URL_META['/blog'];
    serveWithMeta(res, meta, '/blog/' + req.params.slug);
  } catch (e) { serveWithMeta(res, URL_META['/blog'], '/blog/' + req.params.slug); }
});

// ================================================================
// SECTOR ROUTE
// ================================================================
app.get('/sectoren/:sector', (req, res) => {
  const meta = SECTOR_META[req.params.sector];
  if (!meta) return serveNotFound(res);
  serveWithMeta(res, meta, '/sectoren/' + req.params.sector);
});

// ================================================================
// STATISCHE ROUTES
// ================================================================
Object.keys(URL_META).forEach(p => {
  app.get(p, (req, res) => serveWithMeta(res, URL_META[p], p));
});

// ================================================================
// LLMS.TXT — voor AI-zoekmachines (ChatGPT, Perplexity, Claude)
// ================================================================
app.get('/llms.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(`# Matchvermogen — werkhervattingskas.nl
> WHK-beschikking optimalisatie en verzuimkostenreductie voor werkgevers in Nederland

Matchvermogen helpt werkgevers met meer dan 25 medewerkers de WHK-premie (Werkhervattingskas) te verlagen. Wij controleren WHK-beschikkingen op fouten, voeren bezwaarprocedures en bieden arbeidsdeskundig onderzoek en re-integratiediensten. Gemiddelde besparing: €47.000 per jaar. No cure, no pay.

## Diensten

- WHK-beschikking controleren: ${SITE_URL}/diensten/whk-controle
- Besparingsonderzoek: ${SITE_URL}/diensten/besparingsonderzoek
- Arbeidsdeskundig onderzoek: ${SITE_URL}/diensten/arbeidsdeskundig-onderzoek
- Tweede spoor re-integratie: ${SITE_URL}/diensten/tweede-spoor
- Letselschade en regres: ${SITE_URL}/diensten/letselschade
- Verzuimconsultancy: ${SITE_URL}/diensten/consultancy
- Eigenrisicodragerschap advies: ${SITE_URL}/diensten/erd-partneradvies

## Gratis tools

- Poortwachter-tijdlijnchecker: ${SITE_URL}/tools/poortwachter
- WIA-uitkeringscalculator: ${SITE_URL}/tools/wia-calculator
- Subsidie-scan LKV/LIV: ${SITE_URL}/tools/subsidie-scan
- WHK Jaarkalender 2026: ${SITE_URL}/tools/jaarkalender
- Interventietarief checker: ${SITE_URL}/tools/interventie-check

## Voor wie

- HR-managers en HR-adviseurs: ${SITE_URL}/voor/hr-manager
- Controllers en Finance: ${SITE_URL}/voor/controller
- Casemanagers verzuim/WGA: ${SITE_URL}/voor/casemanager
- Directeuren en eigenaren: ${SITE_URL}/voor/directeur

## Kennisbank

- Blog: ${SITE_URL}/blog
- FAQ: ${SITE_URL}/faq
- Hoe lees ik mijn WHK-beschikking: ${SITE_URL}/beschikking-uitleg
- WHK-lexicon: ${SITE_URL}/lexicon
- Praktijkcasussen: ${SITE_URL}/casestudies

## Contact

- Website: ${SITE_URL}
- E-mail: info@matchvermogen.nl
- Telefoon: 06-50213593

## Sitemap

${SITE_URL}/sitemap.xml
`);
});

// ================================================================
// SITEMAP
// ================================================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const raw = await kvGet('posts');
    let dbPosts = [];
    try { dbPosts = raw ? JSON.parse(raw) : []; } catch (e) { dbPosts = []; }
    const posts = mergePostSources(Array.isArray(dbPosts) ? dbPosts : []);
    const seen = new Set();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    function addUrl(loc, changefreq, priority, lastmod) {
      if (!loc || seen.has(loc)) return;
      seen.add(loc);
      xml += `  <url><loc>${loc}</loc>`;
      if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
      xml += `<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>\n`;
    }
    Object.keys(URL_META).forEach(p => {
      const prio = p === '/' ? '1.0' : p.startsWith('/diensten') ? '0.9' : '0.7';
      addUrl(SITE_URL + p, 'monthly', prio);
    });
    addUrl(SITE_URL + '/whk_checklist.html', 'monthly', '0.8');
    Object.keys(SECTOR_META).forEach(s => {
      addUrl(SITE_URL + '/sectoren/' + s, 'monthly', '0.7');
    });
    const now = new Date();
    posts.filter(p => p && p.slug && !p.archived && (!p.publishedAt || new Date(p.publishedAt) <= now)).forEach(p => {
      const lastmod = p.publishedAt ? String(p.publishedAt).slice(0, 10) : undefined;
      addUrl(SITE_URL + '/blog/' + p.slug, 'yearly', '0.6', lastmod);
    });
    const html = getHtml();
    if (html) {
      extractSeedBlogSlugs(html).forEach(slug => {
        addUrl(SITE_URL + '/blog/' + slug, 'yearly', '0.6');
      });
    }
    xml += '</urlset>';
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (e) {
    console.error('Sitemap fout:', e.message);
    res.status(500).type('text/plain').send('Sitemap tijdelijk niet beschikbaar');
  }
});

// ================================================================
// ROBOTS.TXT
// ================================================================
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n' +
    'Disallow: /admin\n' +
    'Sitemap: ' + SITE_URL + '/sitemap.xml\n' +
    'Host: werkhervattingskas.nl\n'
  );
});

// ================================================================
// GEZONDHEIDSCHECK
// ================================================================
app.get('/health', async (req, res) => {
  if (!pool) return res.json({ ok: true, db: 'not_configured', email: emailReady });
  try { await pool.query('SELECT 1'); res.json({ ok: true, db: 'connected', email: emailReady }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/kennisbank', (req, res) => {
  res.redirect(301, '/blog');
});

app.get('/admin', (req, res) => {
  serveWithMeta(res, { title: 'Beheer — werkhervattingskas.nl', desc: 'Beheerderslogin.' }, '/admin');
});


// OG Social Share Image
app.get('/og-image.png', (req, res) => {
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#11192B"/>
    <rect width="1200" height="8" fill="#A23E2C"/>
    <text x="80" y="220" font-family="Georgia,serif" font-size="52" font-weight="bold" fill="white">WHK-beschikking controleren</text>
    <text x="80" y="300" font-family="Georgia,serif" font-size="40" fill="#C8B89A">en verzuimkosten verlagen</text>
    <text x="80" y="420" font-family="Arial,sans-serif" font-size="28" fill="#9B9588">No cure, no pay  ·  €25.000–€100.000 besparing</text>
    <text x="80" y="570" font-family="Arial,sans-serif" font-size="24" fill="#A23E2C" font-weight="bold">werkhervattingskas.nl</text>
  </svg>`;
  // Convert SVG to response (browsers accept SVG as og:image if served correctly)
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

// Checklist download
// Redirect zonder .html naar canonical met .html
app.get('/whk_checklist', (req, res) => {
  res.redirect(301, `${SITE_URL}/whk_checklist.html`);
});

app.get('/whk_checklist.html', (req, res) => {
  const p = path.join(__dirname, 'whk_checklist.html');
  if (!fs.existsSync(p)) return res.status(404).send('Checklist niet gevonden');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Link', `<${SITE_URL}/whk_checklist.html>; rel="canonical"`);
  res.sendFile(p);
});

// Catch-all
app.get('*', (req, res) => serveNotFound(res));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`werkhervattingskas.nl v3.0 op poort ${PORT} | ${SITE_URL}`);
  console.log(`E-mail: ${emailReady ? 'ACTIEF via Resend' : 'NIET geconfigureerd'}`);
});
