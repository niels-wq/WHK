// werkhervattingskas.nl — Railway backend server v2.0
// Met echte URL's en SEO meta-tag injectie per pagina

const express = require('express');
const { Pool } = require('pg');
const jwt      = require('jsonwebtoken');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'verander-dit';
const JWT_SECRET     = process.env.JWT_SECRET     || 'verander-dit-secret';
const SITE_URL       = (process.env.SITE_URL || 'https://www.werkhervattingskas.nl').replace(/\/$/, '');
const PORT           = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ================================================================
// META-TAGS PER URL
// ================================================================
const URL_META = {
  '/':                                 { title: 'WHK-beschikking controleren & verzuimkosten verlagen — werkhervattingskas.nl', desc: 'Gratis controle van uw WHK-beschikking op fouten en gemiste subsidies. Gemiddeld €41.000 besparing per jaar. No cure, no pay.' },
  '/over-ons':                         { title: 'Over Matchvermogen — werkhervattingskas.nl', desc: 'Matchvermogen is gespecialiseerd in WHK-optimalisatie, arbeidsdeskundig onderzoek en re-integratiediensten.' },
  '/aanpak':                           { title: 'Onze aanpak — werkhervattingskas.nl', desc: 'Zo werken wij: van vrijblijvende check tot bezwaarprocedure. Geen kosten tenzij wij besparing realiseren.' },
  '/faq':                              { title: 'Veelgestelde vragen over WHK-premie — werkhervattingskas.nl', desc: 'Antwoorden op de meest gestelde vragen over de Werkhervattingskas, no-riskpolissen en bezwaarprocedures.' },
  '/blog':                             { title: 'WHK-kennisbank voor HR en Finance — werkhervattingskas.nl', desc: 'Actuele artikelen over WHK-premies, re-integratie, no-riskpolissen en loonkostenvoordeel.' },
  '/tools':                            { title: 'Gratis WHK-tools — werkhervattingskas.nl', desc: 'Poortwachter-tijdlijn, WIA-calculator, subsidie-scan en meer. Gratis voor HR-managers en controllers.' },
  '/tarieven':                         { title: 'Tarieven — werkhervattingskas.nl', desc: 'Transparante tarieven voor WHK-controle en arbeidsdeskundig onderzoek. Altijd no cure, no pay.' },
  '/sectoren':                         { title: 'WHK-besparing per sector — werkhervattingskas.nl', desc: 'Branchespecifieke besparingsanalyse voor zorg, onderwijs, bouw, overheid en meer.' },
  '/casestudies':                      { title: 'Praktijkcasussen WHK-besparing — werkhervattingskas.nl', desc: 'Vijf geanonimiseerde casussen: van €9.800 tot €137.000 besparing per jaar.' },
  '/beschikking-uitleg':              { title: 'Hoe lees ik mijn WHK-beschikking? — werkhervattingskas.nl', desc: 'Stap-voor-stap uitleg van de WHK-beschikking: wat betekent elk onderdeel en waar zitten de fouten?' },
  '/vergelijking':                     { title: 'Matchvermogen vs. controller vs. arbodienst — werkhervattingskas.nl', desc: 'Eerlijke vergelijking: wie controleert uw WHK-beschikking het beste?' },
  '/privacy':                          { title: 'Privacyverklaring — werkhervattingskas.nl', desc: 'Hoe werkhervattingskas.nl omgaat met uw persoonsgegevens en AVG-rechten.' },
  '/quiz':                             { title: 'WHK-risicoscan — werkhervattingskas.nl', desc: 'Doe de korte scan en ontdek in 2 minuten uw WHK-besparingspotentieel.' },
  '/besparingen':                      { title: 'Alle besparingsmogelijkheden — werkhervattingskas.nl', desc: 'Compleet overzicht van alle WHK-besparingsroutes.' },
  '/lexicon':                          { title: 'WHK-lexicon — werkhervattingskas.nl', desc: 'Begrippenlijst: WGA, IVA, no-riskpolis, LKV, loonsanctie en meer uitgelegd in gewone taal.' },
  '/tools/poortwachter':              { title: 'Poortwachter-tijdlijnchecker — werkhervattingskas.nl', desc: 'Vul de eerste ziektedag in en zie direct welke deadlines golden en welke actie nodig is.' },
  '/tools/wia-calculator':            { title: 'WIA-uitkeringscalculator — werkhervattingskas.nl', desc: 'Bereken de indicatieve WGA- of IVA-uitkering op basis van dagloon en AO-percentage.' },
  '/tools/subsidie-scan':             { title: 'Subsidie-scan LKV, LIV en WKB — werkhervattingskas.nl', desc: 'Bereken of u loonkostenvoordeel of werkbonus kunt claimen voor uw medewerkers.' },
  '/tools/jaarkalender':              { title: 'WHK Jaarkalender 2026 — werkhervattingskas.nl', desc: 'Alle WHK-deadlines per maand: bezwaartermijn, LKV-aanvraag en WIA-aanvraag.' },
  '/tools/premiehistorie':            { title: 'WGA-premies 2022–2026 — werkhervattingskas.nl', desc: 'Historisch overzicht van de gedifferentieerde WGA-premies per jaar.' },
  '/tools/interventie-check':         { title: 'Interventietarief checker — werkhervattingskas.nl', desc: 'Vergelijk uw interventietarieven met de marktnorm en ontdek of u te veel betaalt.' },
  '/tools/preventie-calculator':      { title: 'Preventieve besparingscalculator — werkhervattingskas.nl', desc: 'Bereken wat vroege interventie uw organisatie kan besparen op de WHK-premie.' },
  '/voor/hr-manager':                 { title: 'WHK voor HR-managers & HR-adviseurs — werkhervattingskas.nl', desc: 'U regelt het verzuim. Wij regelen de financiële kant: WHK-check en no-riskpolissen.' },
  '/voor/controller':                 { title: 'WHK-optimalisatie voor controllers & Finance — werkhervattingskas.nl', desc: 'Verlaag de WHK-loonkostenpost structureel. No cure, no pay.' },
  '/voor/casemanager':                { title: 'WHK en re-integratie voor casemanagers — werkhervattingskas.nl', desc: 'Wij zijn uw verlengstuk: AD-onderzoek, tweede spoor en WGA-herbeoordeling.' },
  '/voor/directeur':                  { title: 'WHK-besparing voor directeuren & eigenaren — werkhervattingskas.nl', desc: 'In 8 van de 10 gevallen vinden wij besparing. No cure, no pay.' },
  '/diensten/whk-controle':           { title: 'WHK-beschikking controleren — werkhervattingskas.nl', desc: 'Professionele controle op foutieve toerekening en gemiste no-riskpolissen. No cure, no pay.' },
  '/diensten/besparingsonderzoek':    { title: 'WHK-besparingsonderzoek — werkhervattingskas.nl', desc: 'Compleet onderzoek naar alle besparingsmogelijkheden in één rapport.' },
  '/diensten/letselschade':           { title: 'Letselschade en regres verhalen — werkhervattingskas.nl', desc: 'Verhaal uw loonkosten bij aansprakelijke derden na bedrijfsongeval. No cure, no pay.' },
  '/diensten/arbeidsdeskundig-onderzoek': { title: 'Arbeidsdeskundig onderzoek — werkhervattingskas.nl', desc: 'Erkend arbeidsdeskundig rapport voor re-integratie of WIA-onderbouwing. Vanaf €1.095.' },
  '/diensten/tweede-spoor':           { title: 'Tweede spoor re-integratie — werkhervattingskas.nl', desc: 'Tijdig tweede spoor voorkomt loonsanctie. Volledig begeleid traject.' },
  '/diensten/consultancy':            { title: 'Verzuimconsultancy — werkhervattingskas.nl', desc: 'Structurele verbetering van uw verzuimbeleid en re-integratiemanagement.' },
  '/diensten/erd-partneradvies':      { title: 'Eigenrisicodragerschap & partneradvies — werkhervattingskas.nl', desc: 'Is eigenrisicodragerschap voordeliger? Wij vergelijken en begeleiden de overgang.' },
};

const SECTOR_META = {
  'zorg':       { title: 'WHK-besparing in de zorgsector — werkhervattingskas.nl', desc: 'De zorgsector heeft structureel hoog verzuim en een hoge WHK-premie. Ontdek de besparingskansen.' },
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
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function serveWithMeta(res, meta, canonPath) {
  const html = getHtml();
  if (!html) return res.status(404).send('<h2>Site niet gevonden</h2><p>Upload whk_verzuim.html naar GitHub.</p>');
  const t = esc(meta.title), d = esc(meta.desc), c = SITE_URL + canonPath;
  const modified = html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`)
    .replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${c}"`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(modified);
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
  const r = await pool.query('SELECT value FROM kv_store WHERE key=$1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}
async function kvSet(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  await pool.query(
    'INSERT INTO kv_store(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()',
    [key, v]
  );
}
function defaultFor(key) { return ['posts','categories','leads','newsletter','activity_log'].includes(key) ? [] : {}; }

const ENDPOINTS = [
  ['/api/posts','posts',true],['/api/categories','categories',true],
  ['/api/leads','leads',false],['/api/newsletter','newsletter',false],
  ['/api/analytics/summary','analytics_summary',false],['/api/analytics/calc_log','analytics_calc_log',false],
  ['/api/analytics/ab_cta','analytics_ab_cta',false],['/api/settings/calc_config','settings_calc_config',false],
  ['/api/settings/ga4id','settings_ga4id',false],['/api/settings/webhook_url','settings_webhook_url',false],
  ['/api/settings/ab_cta','settings_ab_cta',false],['/api/settings/newsletter_api','settings_newsletter_api',false],
  ['/api/settings/calendly_url','settings_calendly_url',false],['/api/log','activity_log',false],
  ['/api/settings/siteteksten','settings_siteteksten',true],['/api/settings/page_content','settings_page_content',true],
  ['/api/settings/faq_items','settings_faq_items',true],
];

ENDPOINTS.forEach(([p, key, open]) => {
  const mw = open ? [] : [auth];
  app.get(p, ...mw, async (req, res) => {
    try {
      const v = await kvGet(key);
      if (v === null) return res.json(defaultFor(key));
      try { res.json(JSON.parse(v)); } catch (e) { res.send(v); }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put(p, auth, async (req, res) => {
    try { await kvSet(key, req.body); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// ================================================================
// BLOG ARTIKEL — eigen meta per artikel
// ================================================================
app.get('/blog/:slug', async (req, res) => {
  try {
    const raw = await kvGet('posts');
    const posts = raw ? JSON.parse(raw) : [];
    const post = posts.find(p => p.slug === req.params.slug && !p.archived);
    const meta = post
      ? { title: post.title + ' — werkhervattingskas.nl', desc: post.metaDescription || post.title }
      : URL_META['/blog'];
    serveWithMeta(res, meta, '/blog/' + req.params.slug);
  } catch (e) { serveWithMeta(res, URL_META['/blog'], '/blog'); }
});

// ================================================================
// SECTOR ROUTE
// ================================================================
app.get('/sectoren/:sector', (req, res) => {
  const meta = SECTOR_META[req.params.sector] || URL_META['/sectoren'];
  serveWithMeta(res, meta, '/sectoren/' + req.params.sector);
});

// ================================================================
// STATISCHE ROUTES
// ================================================================
Object.keys(URL_META).forEach(p => { app.get(p, (req, res) => serveWithMeta(res, URL_META[p], p)); });

// ================================================================
// SITEMAP
// ================================================================
app.get('/sitemap.xml', async (req, res) => {
  const raw = await kvGet('posts').catch(() => null);
  const posts = raw ? JSON.parse(raw) : [];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  Object.keys(URL_META).forEach(p => {
    const prio = p === '/' ? '1.0' : p.startsWith('/diensten') ? '0.9' : '0.7';
    xml += `  <url><loc>${SITE_URL}${p}</loc><changefreq>monthly</changefreq><priority>${prio}</priority></url>\n`;
  });
  Object.keys(SECTOR_META).forEach(s => {
    xml += `  <url><loc>${SITE_URL}/sectoren/${s}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
  });
  posts.filter(p => !p.archived && new Date(p.publishedAt) <= new Date()).forEach(p => {
    xml += `  <url><loc>${SITE_URL}/blog/${p.slug}</loc><lastmod>${p.publishedAt.slice(0,10)}</lastmod><changefreq>yearly</changefreq><priority>0.6</priority></url>\n`;
  });
  xml += '</urlset>';
  res.setHeader('Content-Type','application/xml');
  res.setHeader('Cache-Control','public, max-age=3600');
  res.send(xml);
});

app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type','text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, db: 'connected' }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Catch-all
app.get('*', (req, res) => serveWithMeta(res, URL_META['/'], '/'));

app.listen(PORT, () => {
  console.log(`werkhervattingskas.nl v2.0 op poort ${PORT} | ${SITE_URL}`);
});
