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
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD    || 'verander-dit';
const JWT_SECRET        = process.env.JWT_SECRET        || 'verander-dit-secret';
const SITE_URL          = (process.env.SITE_URL         || 'https://www.werkhervattingskas.nl').replace(/\/$/, '');
const PORT              = process.env.PORT              || 3000;
const NOTIFICATION_EMAIL= process.env.NOTIFICATION_EMAIL|| 'info@matchvermogen.nl';
const RESEND_API_KEY    = process.env.RESEND_API_KEY    || '';
const FROM_EMAIL        = process.env.FROM_EMAIL        || 'noreply@werkhervattingskas.nl';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
function defaultFor(key) {
  return ['posts','categories','leads','newsletter','activity_log'].includes(key) ? [] : {};
}

// ================================================================
// LEAD NOTIFICATIE ENDPOINT — nieuw, stuurt ook e-mail
// ================================================================
app.post('/api/lead/notify', async (req, res) => {
  try {
    const lead = {
      id: 'lead_' + Date.now(),
      name:    req.body.name    || '',
      phone:   req.body.phone   || '',
      email:   req.body.email   || '',
      source:  req.body.source  || 'onbekend',
      message: req.body.message || req.body.summary || '',
      page:    req.body.page    || '',
      createdAt: new Date().toISOString(),
      status: 'new'
    };

    // Opslaan in database
    const existing = await kvGet('leads');
    const leads = existing ? JSON.parse(existing) : [];
    leads.unshift(lead);
    await kvSet('leads', JSON.stringify(leads));

    // E-mail sturen
    await sendLeadEmail(lead);

    // Webhook (optioneel)
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

    res.json({ ok: true, id: lead.id });
  } catch (e) {
    console.error('Lead notify fout:', e.message);
    res.status(500).json({ error: e.message });
  }
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
// META-TAGS PER URL
// ================================================================
const URL_META = {
  '/':                              { title: 'WHK-beschikking controleren & verzuimkosten verlagen — werkhervattingskas.nl', desc: 'Gratis controle van uw WHK-beschikking op fouten en gemiste subsidies. Besparing varieert van €25.000 tot €100.000 per jaar. No cure, no pay.' },
  '/over-ons':                      { title: 'Over Matchvermogen — werkhervattingskas.nl', desc: 'Matchvermogen is gespecialiseerd in WHK-optimalisatie, arbeidsdeskundig onderzoek en re-integratiediensten.' },
  '/aanpak':                        { title: 'Onze aanpak — werkhervattingskas.nl', desc: 'Zo werken wij: van vrijblijvende check tot bezwaarprocedure. Geen kosten tenzij wij besparing realiseren.' },
  '/faq':                           { title: 'Veelgestelde vragen over WHK-premie — werkhervattingskas.nl', desc: 'Antwoorden op de meest gestelde vragen over de Werkhervattingskas, no-riskpolissen en bezwaarprocedures.' },
  '/blog':                          { title: 'WHK-kennisbank voor HR en Finance — werkhervattingskas.nl', desc: 'Actuele artikelen over WHK-premies, re-integratie, no-riskpolissen en loonkostenvoordeel.' },
  '/tools':                         { title: 'Gratis WHK-tools voor werkgevers — werkhervattingskas.nl', desc: 'Poortwachter-tijdlijnchecker, WIA-uitkeringscalculator, subsidie-scan, interventietarief checker en WHK-jaarkalender. Direct inzicht, geen registratie vereist.' },
  '/tarieven':                      { title: 'Tarieven — werkhervattingskas.nl', desc: 'Transparante tarieven voor WHK-controle en arbeidsdeskundig onderzoek. Altijd no cure, no pay.' },
  '/sectoren':                      { title: 'WHK-besparing per sector — werkhervattingskas.nl', desc: 'Branchespecifieke besparingsanalyse voor zorg, onderwijs, bouw, overheid en meer.' },
  '/casestudies':                   { title: 'Praktijkcasussen WHK-besparing — werkhervattingskas.nl', desc: 'Vijf geanonimiseerde casussen: van €9.800 tot €137.000 besparing per jaar.' },
  '/beschikking-uitleg':           { title: 'Hoe lees ik mijn WHK-beschikking? — werkhervattingskas.nl', desc: 'Stap-voor-stap uitleg van de WHK-beschikking: wat betekent elk onderdeel en waar zitten de fouten?' },
  '/vergelijking':                  { title: 'Matchvermogen vs. controller vs. arbodienst — werkhervattingskas.nl', desc: 'Eerlijke vergelijking: wie controleert uw WHK-beschikking het beste?' },
  '/privacy':                       { title: 'Privacyverklaring — werkhervattingskas.nl', desc: 'Hoe werkhervattingskas.nl omgaat met uw persoonsgegevens en AVG-rechten.' },
  '/quiz':                          { title: 'WHK-risicoscan — werkhervattingskas.nl', desc: 'Doe de korte scan en ontdek in 2 minuten uw WHK-besparingspotentieel.' },
  '/besparingen':                   { title: 'Alle besparingsmogelijkheden — werkhervattingskas.nl', desc: 'Compleet overzicht van alle WHK-besparingsroutes.' },
  '/lexicon':                       { title: 'WHK-lexicon — werkhervattingskas.nl', desc: 'Begrippenlijst: WGA, IVA, no-riskpolis, LKV, loonsanctie uitgelegd in gewone taal.' },
  '/tools/poortwachter':           { title: 'Poortwachter-tijdlijnchecker 2026 — werkhervattingskas.nl', desc: 'Vul de eerste ziektedag in en zie direct alle Wet poortwachter-deadlines, aanbevolen interventiemomenten en de relatie met uw WHK-premie.' },
  '/tools/wia-calculator':         { title: 'WIA-uitkeringscalculator: WGA of IVA en uw WHK-premie — werkhervattingskas.nl', desc: 'Bereken de indicatieve WGA- of IVA-uitkering op basis van dagloon en AO-percentage. WGA telt mee in uw schadelast, IVA niet. Bereken het verschil.' },
  '/tools/subsidie-scan':          { title: 'Subsidie-scan LKV, LIV en WKB — werkhervattingskas.nl', desc: 'Bereken in 3 stappen of u loonkostenvoordeel (max €6.000/jaar), lage-inkomensvoordeel of werkbonus kunt claimen. Direct resultaat, gratis tool.' },
  '/tools/jaarkalender':           { title: 'WHK Jaarkalender 2026 — alle deadlines op een rij — werkhervattingskas.nl', desc: 'Alle WHK-deadlines per maand: bezwaartermijn beschikking (6 weken!), LKV-aanvraag, WIA-aanvraag en poortwachter-verplichtingen. Nooit meer een termijn missen.' },
  '/tools/premiehistorie':         { title: 'WGA-premies 2022–2026 — werkhervattingskas.nl', desc: 'Historisch overzicht van de gedifferentieerde WGA-premies per jaar.' },
  '/voor/tussenpersoon':           { title: 'WHK-expertise voor tussenpersonen & assurantieadviseurs — werkhervattingskas.nl', desc: 'Als assurantietussenpersoon of adviseur biedt u uw klanten meer waarde met WHK-expertise. Doorverwijzingsmodel beschikbaar, no cure no pay.' },
  '/sectoren/bouw':                { title: 'WHK-beschikking bouwsector: structureel te hoog door hoog verzuim — werkhervattingskas.nl', desc: 'Bouwbedrijven betalen structureel te veel WHK-premie door hoog verzuim, gemist letselschaderegres en foutieve sectorindeling. Wij controleren gratis. No cure, no pay.' },
  '/sectoren/zorg':                { title: 'WHK-optimalisatie voor zorginstellingen — werkhervattingskas.nl', desc: 'Zorginstellingen betalen vaak te veel WHK-premie door hoog verzuim en gemiste no-riskregistraties. Bezwaar- en herbeoordelingsprocedures zijn onze specialiteit.' },
  '/tools/interventie-check':      { title: 'Interventietarief checker: betaalt u te veel? — werkhervattingskas.nl', desc: 'Vergelijk uw tarieven voor arbeidsdeskundig onderzoek, tweede spoor en coaching met de marktnorm. Direct resultaat. Fors boven de norm? Overweeg een besparingsonderzoek.' },
  '/tools/preventie-calculator':   { title: 'Preventieve besparingscalculator WHK — werkhervattingskas.nl', desc: 'Bereken indicatief hoeveel WGA-instroom en WHK-premie u bespaart door eerder in te grijpen bij langdurig verzuim. Gebaseerd op actuele uitkeringsduur en dagloongemiddelden.' },
  '/voor/hr-manager':              { title: 'WHK voor HR-managers & HR-adviseurs — werkhervattingskas.nl', desc: 'U regelt het verzuim. Wij regelen de financiële kant: WHK-check en no-riskpolissen.' },
  '/voor/controller':              { title: 'WHK-optimalisatie voor controllers & Finance — werkhervattingskas.nl', desc: 'Verlaag de WHK-loonkostenpost structureel. No cure, no pay.' },
  '/voor/casemanager':             { title: 'WHK en re-integratie voor casemanagers — werkhervattingskas.nl', desc: 'Wij zijn uw verlengstuk: AD-onderzoek, tweede spoor en WGA-herbeoordeling.' },
  '/voor/directeur':               { title: 'WHK-besparing voor directeuren & eigenaren — werkhervattingskas.nl', desc: 'In 8 van de 10 gevallen vinden wij besparing. No cure, no pay.' },
  '/diensten/whk-controle':        { title: 'WHK-beschikking controleren — werkhervattingskas.nl | No cure, no pay', desc: 'Professionele controle van uw WHK-beschikking op fouten, foutieve toerekening en gemiste no-riskpolissen. Besparing varieert van €25.000 tot €100.000 per jaar. No cure, no pay.' },
  '/diensten/besparingsonderzoek': { title: 'Volledig WHK-besparingsonderzoek — werkhervattingskas.nl', desc: 'Compleet onderzoek naar alle WHK-besparingsmogelijkheden: beschikking, no-riskpolissen, interventietarieven en eigenrisicodragerschap in één rapport. No cure, no pay.' },
  '/diensten/letselschade':        { title: 'Letselschade en regres verhalen — werkhervattingskas.nl', desc: 'Verhaal uw loonkosten bij aansprakelijke derden na bedrijfsongeval. No cure, no pay.' },
  '/diensten/arbeidsdeskundig-onderzoek': { title: 'Arbeidsdeskundig onderzoek — werkhervattingskas.nl', desc: 'Erkend arbeidsdeskundig rapport voor re-integratie of WIA-onderbouwing. Vanaf €1.095.' },
  '/diensten/tweede-spoor':        { title: 'Tweede spoor re-integratie — werkhervattingskas.nl', desc: 'Tijdig tweede spoor voorkomt loonsanctie. Volledig begeleid traject.' },
  '/diensten/consultancy':         { title: 'Verzuimconsultancy — werkhervattingskas.nl', desc: 'Structurele verbetering van uw verzuimbeleid en re-integratiemanagement.' },
  '/whk_checklist.html':           { title: 'Gratis WHK-checklist 2026: 25 controlepunten — werkhervattingskas.nl', desc: 'Download de gratis WHK-checklist voor werkgevers. 25 punten om fouten in uw beschikking te vinden. No cure, no pay bij gevonden fouten.' },
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

// ================================================================
// ROBOTS.TXT
// ================================================================
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type','text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// ================================================================
// GEZONDHEIDSCHECK
// ================================================================
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, db: 'connected', email: emailReady }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});


// JSON-LD voor blogpagina (Blog index)
app.get(['/blog', '/kennisbank'], (req, res, next) => {
  req.seoExtra = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "WHK-kennisbank",
    "description": "Actuele artikelen over WHK-premie optimalisatie, no-riskpolissen, bezwaarprocedures en re-integratie.",
    "url": "https://werkhervattingskas.nl/blog",
    "publisher": { "@type": "Organization", "name": "Matchvermogen / Werkhervattingskas.nl" }
  });
  next();
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
app.get('/whk_checklist.html', (req, res) => {
  const p = path.join(__dirname, 'whk_checklist.html');
  if (!fs.existsSync(p)) return res.status(404).send('Checklist niet gevonden');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(p);
});

// Catch-all
app.get('*', (req, res) => serveWithMeta(res, URL_META['/'], '/'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`werkhervattingskas.nl v3.0 op poort ${PORT} | ${SITE_URL}`);
  console.log(`E-mail: ${emailReady ? 'ACTIEF via Resend' : 'NIET geconfigureerd'}`);
});
