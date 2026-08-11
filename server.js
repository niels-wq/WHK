// server.js — arbeidsdeskundig.com
// Dunne Express-laag rond de bestaande single-file frontend (public/index.html).
// Doel: elke pagina/artikel krijgt een eigen, echte URL met eigen <title>, meta
// description, canonical en (voor artikelen) Article-structured-data, zodat
// Google en LLM-crawlers elke pagina los kunnen indexeren — in plaats van alles
// onder één URL (zoals het geval was toen dit alleen een los HTML-bestand was).

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'https://www.arbeidsdeskundig.com';

const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Persoonlijke foto voor het bedankblok onderaan de offerte-PDF. Optioneel: als
// het bestand ontbreekt (bijv. nog niet geüpload), slaat de PDF dit blok gewoon over.
let PERSONAL_PHOTO = null;
try {
    PERSONAL_PHOTO = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'niels-foto.png'));
} catch (e) {
    console.log('[Offerte-PDF] Geen persoonlijke foto gevonden op public/assets/niels-foto.png — sectie wordt overgeslagen.');
}

let MATCHVERMOGEN_LOGO = null;
let MATCHVERMOGEN_LOGO_RATIO = 1434 / 383;
try {
    MATCHVERMOGEN_LOGO = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'matchvermogen-logo.png'));
} catch (e) {
    console.log('[Offerte-PDF] Geen Matchvermogen-logo gevonden op public/assets/matchvermogen-logo.png — tekstversie wordt gebruikt.');
}

// Artikel-metadata (slug, titel, meta description, tag) wordt bij het opstarten
// rechtstreeks uit de `posts`-array in public/index.html gehaald — dat is de
// enige bron van waarheid. Geen los posts.json-bestand meer om synchroon te
// houden: pas je een artikel aan in index.html, dan klopt de routing vanzelf.
function extractPosts(html) {
    const start = html.indexOf('const posts = [');
    const end = html.indexOf('\n  ];', start);
    const block = html.slice(start, end);
    const lines = block.match(/\{ tag:.*? \},?/gs) || [];
    const field = (name, line) => {
        const m = line.match(new RegExp(name + ':"((?:[^"\\\\]|\\\\.)*)"'));
        return m ? m[1].replace(/\\"/g, '"') : null;
    };
    const extractFaq = (line) => {
        const idx = line.indexOf('faq:[');
        if (idx === -1) return null;
        // Balanced-bracket scan vanaf 'faq:' tot de bijbehorende sluit-bracket.
        let depth = 0, i = idx + 4, startIdx = -1;
        for (; i < line.length; i++) {
            if (line[i] === '[') { if (depth === 0) startIdx = i; depth++; }
            else if (line[i] === ']') { depth--; if (depth === 0) { i++; break; } }
        }
        const raw = line.slice(startIdx, i);
        try { return JSON.parse(raw); } catch (e) { return null; }
    };
    return lines
        .map((line) => ({
            slug: field('slug', line),
            title: field('title', line),
            meta: field('meta', line),
            tag: field('tag', line),
            faq: extractFaq(line),
        }))
        .filter((p) => p.slug);
}

const posts = extractPosts(INDEX_HTML);

// personaData is pure JSON (gegenereerd met json.dumps), dus simpel te parsen —
// geen regex-gepuzzel zoals bij de `posts`-array met zijn JS-objectliteral-syntax.
function extractPersonas(html) {
    const start = html.indexOf('const personaData = ');
    const jsonStart = html.indexOf('[', start);
    let depth = 0, i = jsonStart;
    for (; i < html.length; i++) {
        if (html[i] === '[') depth++;
        else if (html[i] === ']') { depth--; if (depth === 0) { i++; break; } }
    }
    try { return JSON.parse(html.slice(jsonStart, i)); } catch (e) { return []; }
}

const personas = extractPersonas(INDEX_HTML);
const DEFAULT_TITLE = 'arbeidsdeskundig.com — Arbeidsdeskundig onderzoek, online én fysiek';
const DEFAULT_DESC = 'Arbeidsdeskundig onderzoek vanaf €1.095,-. Online of fysiek, door heel Nederland. Specialist in WGA, Ziektewet en Wet Poortwachter.';

app.use(compression());
app.disable('x-powered-by');
// CSP staat uit: de frontend leunt zwaar op inline <script>/style="" (single-file
// opzet), en een niet-grondig-geteste CSP kan de site stuk breken. De overige
// helmet-headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
// HSTS, enz.) staan wel aan — dat is winst zonder risico. Wil je later een
// strikte CSP, dan hoort daar eerst een refactor naar externe .js/.css bij.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));

// Statische assets (indien later toegevoegd, bv. /public/afbeeldingen) cachen agressief.
// De hoofd-HTML zelf wordt NIET via express.static geserveerd, want die krijgt
// per route aangepaste <head>-tags — zie renderPage() hieronder.
//
// LET OP: door 'immutable' hieronder cachen browsers deze bestanden tot 30
// dagen zonder ooit opnieuw te controleren. Vervang je een bestaand bestand in
// public/assets/ door een nieuwe versie (bijv. een andere teamfoto), dan blijft
// een browser die de oude versie al eerder heeft opgehaald gewoon de oude
// versie tonen. Voeg in dat geval altijd een cache-bust toe aan de verwijzing,
// bijvoorbeeld `/assets/niels-foto.png?v=2` -> `?v=3` bij de volgende wijziging.
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
    maxAge: '30d',
    immutable: true,
}));

// ---------------------------------------------------------------------------
// Helper: render de basis-HTML met per-pagina title/meta/canonical/JSON-LD en
// een geïnjecteerde __ROUTE__ zodat de client-JS meteen de juiste view toont
// (geen flits van de homepage, en werkend zonder JavaScript-afhankelijke SPA-router).
// ---------------------------------------------------------------------------
function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function renderPage(res, { title, description, canonicalPath, route, articleJsonLd, breadcrumbJsonLd, faqJsonLd, statusCode }) {
    const canonical = BASE_URL.replace(/\/$/, '') + canonicalPath;
    const safeTitle = escapeHtml(title || DEFAULT_TITLE);
    const safeDesc = escapeHtml(description || DEFAULT_DESC);

    let html = INDEX_HTML;

    // <title>
    html = html.replace(/<title>.*?<\/title>/s, `<title>${safeTitle}</title>`);
    // <meta name="description">
    html = html.replace(
        /<meta name="description" content=".*?">/s,
        `<meta name="description" content="${safeDesc}">`
    );
    // canonical
    html = html.replace(
        /<link rel="canonical" href=".*?">/s,
        `<link rel="canonical" href="${canonical}">`
    );
    // Open Graph + Twitter
    html = html.replace(/<meta property="og:title" content=".*?">/s, `<meta property="og:title" content="${safeTitle}">`);
    html = html.replace(/<meta property="og:description" content=".*?">/s, `<meta property="og:description" content="${safeDesc}">`);
    html = html.replace(/<meta property="og:url" content=".*?">/s, `<meta property="og:url" content="${canonical}">`);
    html = html.replace(/<meta name="twitter:title" content=".*?">/s, `<meta name="twitter:title" content="${safeTitle}">`);
    html = html.replace(/<meta name="twitter:description" content=".*?">/s, `<meta name="twitter:description" content="${safeDesc}">`);

    // Extra per-pagina JSON-LD (Article + BreadcrumbList) vóór </head> toevoegen,
    // naast het bestaande site-brede JSON-LD-blok (Organization/FAQPage/Blog).
    let extraJsonLd = '';
    if (articleJsonLd) extraJsonLd += `<script type="application/ld+json">${JSON.stringify(articleJsonLd)}</script>\n`;
    if (breadcrumbJsonLd) extraJsonLd += `<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>\n`;
    if (faqJsonLd) extraJsonLd += `<script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>\n`;
    if (extraJsonLd) html = html.replace('</head>', extraJsonLd + '</head>');

    // GA4 en Meta Pixel: de ID's worden altijd meegegeven (als de env vars zijn
    // gezet), maar de daadwerkelijke scripts laden pas client-side, en alleen
    // ná expliciete toestemming via de cookiebanner (zie CONSENT_KEY in de HTML).
    // Zonder env vars of zonder toestemming laadt er niets.
    const GA4_ID = process.env.GA4_MEASUREMENT_ID || '';
    const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
    const analyticsIdsScript = `<script>window.__ANALYTICS_IDS__ = ${JSON.stringify({ ga4: GA4_ID, metaPixel: META_PIXEL_ID })};</script>\n`;
    html = html.replace('</head>', analyticsIdsScript + '</head>');

    // __ROUTE__ injecteren zodat de client meteen de juiste view rendert.
    const routeScript = `<script>window.__ROUTE__ = ${JSON.stringify(route)};</script>\n`;
    html = html.replace('<script>', routeScript + '<script>');

    res.status(statusCode || 200).set('Content-Type', 'text/html; charset=utf-8').send(html);
}

function breadcrumbFor(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.name,
            item: BASE_URL.replace(/\/$/, '') + it.path,
        })),
    };
}

// ---------------------------------------------------------------------------
// Routes — één per "view" in de bestaande frontend
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
    renderPage(res, { title: DEFAULT_TITLE, description: DEFAULT_DESC, canonicalPath: '/', route: { view: 'home' } });
});

app.get('/rekentool', (req, res) => {
    renderPage(res, {
        title: 'Rekentool: bereken je tijdwinst — arbeidsdeskundig.com',
        description: 'Bereken hoeveel tijd en geld eerder starten met een arbeidsdeskundig onderzoek oplevert in jouw situatie.',
        canonicalPath: '/rekentool',
        route: { view: 'calculator' },
    });
});

app.get('/keuzehulp', (req, res) => {
    renderPage(res, {
        title: 'Gratis keuzehulp: online of fysiek onderzoek? — arbeidsdeskundig.com',
        description: 'Beantwoord twee korte vragen en ontdek of een online of fysiek arbeidsdeskundig onderzoek het beste bij jouw situatie past.',
        canonicalPath: '/keuzehulp',
        route: { view: 'advies' },
    });
});

app.get('/veelgestelde-vragen', (req, res) => {
    renderPage(res, {
        title: 'Veelgestelde vragen over arbeidsdeskundig onderzoek — arbeidsdeskundig.com',
        description: 'Antwoord op de meest gestelde vragen over arbeidsdeskundig onderzoek: kosten, doorlooptijd, WGA, Ziektewet en meer.',
        canonicalPath: '/veelgestelde-vragen',
        route: { view: 'faq' },
        breadcrumbJsonLd: breadcrumbFor([{ name: 'Home', path: '/' }, { name: 'Veelgestelde vragen', path: '/veelgestelde-vragen' }]),
    });
});

app.get('/over-ons', (req, res) => {
    renderPage(res, {
        title: 'Over ons — Matchvermogen B.V. / arbeidsdeskundig.com',
        description: 'Onderdeel van Matchvermogen B.V.: ruim 20 geregistreerde arbeidsdeskundigen en 40 re-integratiecoaches, actief door heel Nederland.',
        canonicalPath: '/over-ons',
        route: { view: 'over' },
    });
});

app.get('/offerte-aanvragen', (req, res) => {
    renderPage(res, {
        title: 'Offerte aanvragen — arbeidsdeskundig.com',
        description: 'Vraag vrijblijvend een offerte aan voor een arbeidsdeskundig onderzoek. Reactie binnen 24 uur.',
        canonicalPath: '/offerte-aanvragen',
        route: { view: 'offerte' },
    });
});

app.get('/aanmelden', (req, res) => {
    renderPage(res, {
        title: 'Aanmelden voor een arbeidsdeskundig onderzoek — arbeidsdeskundig.com',
        description: 'Meld je aan voor een arbeidsdeskundig onderzoek. Volledig digitaal, inclusief ondertekening.',
        canonicalPath: '/aanmelden',
        route: { view: 'aanmelden' },
    });
});

app.get('/kennisbank', (req, res) => {
    renderPage(res, {
        title: 'Kennisbank arbeidsdeskundig onderzoek — arbeidsdeskundig.com',
        description: 'Alles over arbeidsdeskundig onderzoek: de Wet Poortwachter, WGA, Ziektewet, WIA, WHK-premie en praktijkcasussen.',
        canonicalPath: '/kennisbank',
        route: { view: 'kennisbank' },
        breadcrumbJsonLd: breadcrumbFor([{ name: 'Home', path: '/' }, { name: 'Kennisbank', path: '/kennisbank' }]),
    });
});

app.get('/voor/:slug', (req, res, next) => {
    const persona = personas.find((p) => p.slug === req.params.slug);
    if (!persona) return next(); // -> 404 handler

    renderPage(res, {
        title: persona.title + ' — arbeidsdeskundig.com',
        description: persona.meta,
        canonicalPath: '/voor/' + persona.slug,
        route: { view: 'persona', slug: persona.slug },
        breadcrumbJsonLd: breadcrumbFor([
            { name: 'Home', path: '/' },
            { name: persona.label, path: '/voor/' + persona.slug },
        ]),
    });
});

app.get('/kennisbank/:slug', (req, res, next) => {
    const post = posts.find((p) => p.slug === req.params.slug);
    if (!post) return next(); // -> 404 handler

    const articleJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.meta,
        articleSection: post.tag,
        keywords: post.tag + ', arbeidsdeskundig onderzoek, Wet Poortwachter',
        inLanguage: 'nl-NL',
        author: { '@type': 'Organization', name: 'Matchvermogen B.V.' },
        publisher: { '@type': 'Organization', name: 'arbeidsdeskundig.com' },
        mainEntityOfPage: BASE_URL.replace(/\/$/, '') + '/kennisbank/' + post.slug,
    };

    // Elk artikel met FAQ-items krijgt zijn eigen FAQPage-schema — los van het
    // site-brede FAQPage-blok voor /veelgestelde-vragen — zodat losse artikelen
    // ook zelf in aanmerking komen voor FAQ-rich-snippets in Google.
    let faqJsonLd = null;
    if (post.faq && post.faq.length) {
        faqJsonLd = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: post.faq.map(([q, a]) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
            })),
        };
    }

    renderPage(res, {
        title: post.title + ' — arbeidsdeskundig.com',
        description: post.meta,
        canonicalPath: '/kennisbank/' + post.slug,
        route: { view: 'artikel', slug: post.slug },
        articleJsonLd,
        faqJsonLd,
        breadcrumbJsonLd: breadcrumbFor([
            { name: 'Home', path: '/' },
            { name: 'Kennisbank', path: '/kennisbank' },
            { name: post.title, path: '/kennisbank/' + post.slug },
        ]),
    });
});

// ---------------------------------------------------------------------------
// sitemap.xml — dynamisch, inclusief alle kennisbank-artikelen
// ---------------------------------------------------------------------------
app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const staticPaths = [
        '/', '/rekentool', '/keuzehulp', '/veelgestelde-vragen',
        '/over-ons', '/offerte-aanvragen', '/aanmelden', '/kennisbank',
    ];
    const urls = [
        ...staticPaths.map((p) => `  <url><loc>${BASE_URL}${p}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.7'}</priority></url>`),
        ...personas.map((p) => `  <url><loc>${BASE_URL}/voor/${p.slug}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`),
        ...posts.map((p) => `  <url><loc>${BASE_URL}/kennisbank/${p.slug}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    res.set('Content-Type', 'application/xml').send(xml);
});

// ---------------------------------------------------------------------------
// robots.txt — staat crawlers én de bekende AI-/LLM-crawlers expliciet toe
// ---------------------------------------------------------------------------
app.get('/robots.txt', (req, res) => {
    const txt = `User-agent: *
Allow: /

# AI- / LLM-crawlers expliciet toegestaan — relevant voor vindbaarheid in
# ChatGPT, Perplexity, Claude en vergelijkbare answer engines.
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
    res.set('Content-Type', 'text/plain').send(txt);
});

// ---------------------------------------------------------------------------
// llms.txt — opkomende conventie (vergelijkbaar met robots.txt) waarmee AI-/
// LLM-crawlers en answer engines in één oogopslag zien waar de site over gaat
// en welke content er is. Nog geen officiële standaard, maar kost weinig en
// kan alleen helpen bij vindbaarheid in ChatGPT/Perplexity/Claude e.d.
// ---------------------------------------------------------------------------
app.get('/llms.txt', (req, res) => {
    const byTag = {};
    posts.forEach((p) => {
        if (!byTag[p.tag]) byTag[p.tag] = [];
        byTag[p.tag].push(p);
    });
    let txt = `# arbeidsdeskundig.com

> arbeidsdeskundig.com (onderdeel van Matchvermogen B.V.) is een Nederlands bureau
> voor arbeidsdeskundig onderzoek: objectieve beoordeling van wat een werknemer nog
> kan werken, in het kader van de Wet Poortwachter, WGA, Ziektewet en WIA.
> Onderzoek vanaf €1.095,-, online of fysiek, door heel Nederland. Reactie op
> aanvragen binnen 24 uur.

## Belangrijkste pagina's

- [Home](${BASE_URL}/): overzicht van diensten, tarieven en werkwijze
- [Rekentool](${BASE_URL}/rekentool): bereken tijdwinst en besparing van vroeg starten
- [Gratis keuzehulp](${BASE_URL}/keuzehulp): online of fysiek onderzoek nodig?
- [Kennisbank](${BASE_URL}/kennisbank): alle artikelen hieronder
- [Veelgestelde vragen](${BASE_URL}/veelgestelde-vragen)
- [Over ons](${BASE_URL}/over-ons)
- [Offerte aanvragen](${BASE_URL}/offerte-aanvragen)

## Voor specifieke doelgroepen

${personas.map((p) => `- [${p.title}](${BASE_URL}/voor/${p.slug}): ${p.meta}`).join('\n')}

## Kennisbank, per onderwerp
`;
    Object.keys(byTag).sort().forEach((tag) => {
        txt += `\n### ${tag}\n`;
        byTag[tag].forEach((p) => {
            txt += `- [${p.title}](${BASE_URL}/kennisbank/${p.slug}): ${p.meta}\n`;
        });
    });
    res.set('Content-Type', 'text/plain; charset=utf-8').send(txt);
});

// Health check (handig voor Railway se deploy-status)
// ---------------------------------------------------------------------------
// E-mail via Resend — klaar voor gebruik, maar inactief zolang RESEND_API_KEY
// niet is gezet in Railway (Settings -> Variables). Zonder die key wordt de
// e-mail alleen gelogd in de server-console; er gaat dan niets verloren, maar
// er wordt ook niets verstuurd. Zodra je de key toevoegt, werkt dit direct.
//
// Benodigde env vars, later in te stellen:
//   RESEND_API_KEY     - API key uit resend.com
//   RESEND_FROM_EMAIL   - bijv. "arbeidsdeskundig.com <noreply@arbeidsdeskundig.com>"
//                          (het afzenderdomein moet geverifieerd zijn bij Resend)
// ---------------------------------------------------------------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'arbeidsdeskundig.com <noreply@arbeidsdeskundig.com>';
const NOTIFY_EMAIL = 'info@matchvermogen.nl';

async function sendEmail({ to, subject, html, replyTo, attachments }) {
    if (!RESEND_API_KEY) {
        console.log(`[Resend niet geconfigureerd] Zou e-mail sturen naar ${to}: "${subject}"${attachments ? ` (met ${attachments.length} bijlage(n))` : ''}`);
        return { skipped: true };
    }
    try {
        const body = { from: RESEND_FROM_EMAIL, to: [to], subject, html };
        if (replyTo) body.reply_to = replyTo;
        if (attachments && attachments.length) body.attachments = attachments;
        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!r.ok) console.error('Resend-fout:', r.status, await r.text());
        return r;
    } catch (err) {
        console.error('Resend-verzoek mislukt:', err);
        return { error: true };
    }
}

// Zet een { veldnaam: waarde }-object om in een nette HTML-lijst voor in de e-mail.
function fieldsToHtml(fields) {
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0; color:#666; vertical-align:top;">${escapeHtml(k)}</td><td style="padding:4px 0;">${escapeHtml(String(v))}</td></tr>`)
        .join('');
}

// ---------------------------------------------------------------------------
// Formulier-endpoints: offerte, aanmelding, gratis checklist.
// Sturen (zodra geconfigureerd) altijd twee e-mails: een notificatie naar
// info@arbeidsdeskundig.com, en — als er een e-mailadres is ingevuld — een
// automatische bevestiging aan de aanvrager zelf.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Vrijblijvende offerte als PDF — een bewust ánder, lichter traject dan
// "direct aanmelden" (dat blijft de volledige 6-stappen-wizard met
// ondertekening). Hier: gegevens in, meteen een PDF-offerte terug (download +
// e-mail), zonder enige verplichting.
// ---------------------------------------------------------------------------
const PDFDocument = require('pdfkit');

const OFFERTE_GROOTTE_LABELS = {
    klein: 'Tot 5 medewerkers / stichting',
    midden: 'Tot 100 medewerkers',
    groot: 'Groot zakelijk',
};
const OFFERTE_PRICE_TIERS = { klein: 1095, midden: 1125, groot: 1395 };

function berekenOffertePrijs(grootte, vorm) {
    const basis = OFFERTE_PRICE_TIERS[grootte] || OFFERTE_PRICE_TIERS.midden;
    const fysiekToeslag = vorm === 'Fysiek' ? 295 : 0;
    return { basis, fysiekToeslag, totaal: basis + fysiekToeslag };
}

function euro(bedrag) {
    return '€ ' + bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Oplopend offertenummer, per jaar (OFF-2026-0001, OFF-2026-0002, ...).
// Wordt bijgehouden in een JSON-bestand op schijf, zodat het nummer blijft
// doortellen tussen aanvragen door (in plaats van bijvoorbeeld een timestamp,
// die geen logische volgorde heeft).
//
// LET OP — Railway-specifiek: het bestandssysteem van een Railway-service is
// standaard *ephemeral*: het overleeft een herstart van de container, maar
// NIET een nieuwe deploy. Zonder een Railway Volume gekoppeld aan dit pad,
// begint de teller na elke deploy dus weer bij 1. Voor een garantie dat het
// nummer nooit meer terugspringt, koppel je in Railway een Volume aan
// bijvoorbeeld `/data` en verwijs je COUNTER_FILE daarnaartoe (regel hieronder).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Offertenummer, per bedrijf (OFF-2026-0001-TestbedrijfBV). Het nummer telt op
// per bedrijf, niet globaal over alle klanten heen — dat is bewust: bij het
// huidige, ephemere bestandssysteem van Railway (overleeft een herstart, niet
// een nieuwe deploy) zou een globale teller na elke deploy weer bij 1 beginnen
// en zo de indruk wekken dat het steeds "onze allereerste offerte" is. Per
// bedrijf klopt "0001" bij een nieuwe klant echter altijd, deploy of niet — en
// vraagt hetzelfde bedrijf later nogmaals een offerte aan, dan telt het net zo
// netjes door (0002, 0003, ...), ook bij een andere contactpersoon.
// Zonder ingevulde bedrijfsnaam (bijv. een zzp'er) valt dit terug op de naam
// van de aanvrager, en anders op het e-mailadres.
// ---------------------------------------------------------------------------
const COUNTER_FILE = path.join(__dirname, 'data', 'offerte-counter.json');

function saniteerVoorNummer(tekst) {
    return (tekst || 'Klant')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // diakritische tekens eraf (é -> e)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 24) || 'Klant';
}

function volgendOfferteNummer(klantBedrijf, klantNaam, klantEmail) {
    const jaar = new Date().getFullYear();
    // Sleutel voor de telling: bedrijfsnaam als die er is, anders naam, anders e-mail.
    const sleutelBron = (klantBedrijf || klantNaam || klantEmail || 'onbekend').trim().toLowerCase();
    const sleutel = sleutelBron.replace(/[^a-z0-9]/g, '');
    // Weergave in het nummer zelf: dezelfde voorkeursvolgorde.
    const weergaveNaam = klantBedrijf || klantNaam || 'Klant';

    let staat = {};
    try {
        staat = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    } catch (e) {
        // Bestand bestaat nog niet (eerste keer) of is onleesbaar — begin leeg.
    }
    const huidig = staat[sleutel] && staat[sleutel].jaar === jaar ? staat[sleutel] : { jaar, laatsteNummer: 0 };
    huidig.laatsteNummer += 1;
    staat[sleutel] = huidig;
    try {
        fs.mkdirSync(path.dirname(COUNTER_FILE), { recursive: true });
        fs.writeFileSync(COUNTER_FILE, JSON.stringify(staat));
    } catch (e) {
        console.error('Kon offerte-teller niet wegschrijven:', e.message);
    }
    return 'OFF-' + jaar + '-' + String(huidig.laatsteNummer).padStart(4, '0') + '-' + saniteerVoorNummer(weergaveNaam);
}

function genereerOffertePdf(fields) {
    const naam = fields.naam || '';
    const bedrijf = fields.bedrijf || '';
    const email = fields.email || '';
    const telefoon = fields.telefoon || '';
    const grootte = fields.grootte || 'midden';
    const vorm = fields.vorm || 'Online';
    const omschrijving = fields.omschrijving || '';
    const { basis, fysiekToeslag, totaal } = berekenOffertePrijs(grootte, vorm);
    const vandaag = new Date();
    const geldigTot = new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000);
    const offerteNummer = volgendOfferteNummer(bedrijf, naam, email);
    const fmtDatum = (d) => d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 56 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const ink = '#12203A';
        const amber = '#D8A03D';
        const teal = '#1F6F5C';
        const muted = '#555555';

        if (MATCHVERMOGEN_LOGO) {
            const logoWidth = 160;
            const logoHeight = logoWidth / MATCHVERMOGEN_LOGO_RATIO;
            doc.image(MATCHVERMOGEN_LOGO, 56, 40, { width: logoWidth, height: logoHeight });
            doc.fillColor(ink).fontSize(15).font('Helvetica-Bold').text('Vrijblijvende offerte', 56, 40 + logoHeight + 14);
            doc.fillColor(muted).fontSize(9).font('Helvetica').text('Arbeidsdeskundig onderzoek — mede mogelijk gemaakt door arbeidsdeskundig.com', 56, 40 + logoHeight + 34);
        } else {
            // Terugvalvariant zolang er geen logo-bestand aanwezig is
            doc.fillColor(ink).fontSize(20).font('Helvetica-Bold').text('Matchvermogen B.V.', 56, 40);
            doc.fillColor(muted).fontSize(10).font('Helvetica').text('Vrijblijvende offerte — arbeidsdeskundig onderzoek, mede mogelijk gemaakt door arbeidsdeskundig.com', 56, 66);
        }

        doc.moveTo(56, 128).lineTo(doc.page.width - 56, 128).strokeColor(teal).lineWidth(2).stroke();
        doc.lineWidth(1);

        doc.fillColor(muted).fontSize(9).font('Helvetica')
            .text(`Offertenummer: ${offerteNummer}`, 56, 148)
            .text(`Datum: ${fmtDatum(vandaag)}`, 56, 162)
            .text(`Geldig tot: ${fmtDatum(geldigTot)}`, 56, 176)
            .text('Opgesteld door: Matchvermogen B.V.', 56, 190);

        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Aanvrager', 56, 220);
        doc.fillColor(muted).fontSize(10).font('Helvetica')
            .text(naam || '—', 56, 236)
            .text(bedrijf || '—', 56, 250)
            .text(email || '—', 56, 264)
            .text(telefoon || '—', 56, 278);

        let y = 312;
        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Onderzoek', 56, y);
        y += 20;
        const rows = [
            ['Dienst', 'Arbeidsdeskundig onderzoek'],
            ['Vorm', vorm === 'Fysiek' ? 'Fysiek, op locatie' : (vorm === 'Online' ? 'Online' : 'Nog te bepalen')],
            ['Bedrijfsgrootte', OFFERTE_GROOTTE_LABELS[grootte] || OFFERTE_GROOTTE_LABELS.midden],
        ];
        rows.forEach(([k, v]) => {
            doc.fillColor(muted).fontSize(9.5).font('Helvetica').text(k, 56, y, { width: 150 });
            doc.fillColor(ink).fontSize(9.5).font('Helvetica-Bold').text(v, 210, y, { width: 320 });
            y += 18;
        });
        if (omschrijving) {
            y += 4;
            doc.fillColor(muted).fontSize(9.5).font('Helvetica').text('Omschrijving', 56, y, { width: 150 });
            doc.fillColor(ink).fontSize(9.5).font('Helvetica').text(omschrijving, 210, y, { width: 320 });
            y += Math.max(18, doc.heightOfString(omschrijving, { width: 320 }) + 6);
        }

        y += 20;
        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#C7CCC4').stroke();
        y += 20;

        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Investering (excl. btw)', 56, y);
        y += 20;
        doc.fillColor(muted).fontSize(9.5).font('Helvetica').text('Arbeidsdeskundig onderzoek', 56, y);
        doc.fillColor(ink).fontSize(9.5).font('Helvetica').text(euro(basis), 400, y, { width: 130, align: 'right' });
        y += 18;
        if (fysiekToeslag) {
            doc.fillColor(muted).fontSize(9.5).font('Helvetica').text('Toeslag fysiek onderzoek', 56, y);
            doc.fillColor(ink).fontSize(9.5).font('Helvetica').text(euro(fysiekToeslag), 400, y, { width: 130, align: 'right' });
            y += 18;
        }
        y += 6;
        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#C7CCC4').stroke();
        y += 12;
        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text('Totaal (excl. btw)', 56, y);
        doc.fillColor(ink).fontSize(11).font('Helvetica-Bold').text(euro(totaal), 400, y, { width: 130, align: 'right' });

        y += 50;
        if (PERSONAL_PHOTO) {
            const photoSize = 54;
            doc.save();
            doc.circle(56 + photoSize / 2, y + photoSize / 2, photoSize / 2).clip();
            doc.image(PERSONAL_PHOTO, 56, y, { width: photoSize, height: photoSize });
            doc.restore();
            doc.fillColor(ink).fontSize(9.5).font('Helvetica-Bold').text('Bedankt voor het aanvragen van deze offerte!', 56 + photoSize + 16, y + 4, { width: doc.page.width - 112 - photoSize - 16 });
            doc.fillColor(muted).fontSize(9).font('Helvetica').text('We gaan snel en graag voor je aan de slag.', 56 + photoSize + 16, y + 20, { width: doc.page.width - 112 - photoSize - 16 });
            y += photoSize + 24;
        }

        const disclaimerTekst = 'Deze offerte is geheel vrijblijvend en verplicht tot niets. Reactie op eventuele vervolgvragen meestal binnen 24 uur. ' +
            'Prijzen zijn exclusief btw. Aan deze offerte kunnen geen rechten worden ontleend na de vermelde geldigheidsdatum.';
        doc.fillColor(muted).fontSize(8.5).font('Helvetica').text(disclaimerTekst, 56, y, { width: doc.page.width - 112, lineBreak: true });
        y += doc.heightOfString(disclaimerTekst, { width: doc.page.width - 112 }) + 40;

        doc.moveTo(56, y).lineTo(doc.page.width - 56, y).strokeColor('#C7CCC4').stroke();
        y += 10;
        doc.fillColor(muted).fontSize(8).font('Helvetica').text(
            'Matchvermogen B.V. · Losplaats 16d, 5404 NJ Uden · 085 087 0307 · info@arbeidsdeskundig.com · KVK 85849618',
            56, y, { width: doc.page.width - 112, align: 'center' },
        );

        doc.end();
    });
}

app.post('/api/offerte-pdf', async (req, res) => {
    const fields = req.body || {};
    const naam = (fields.naam || '').trim();
    const email = (fields.email || '').trim();
    const telefoon = (fields.telefoon || '').trim();
    if (!naam || !email || !telefoon) {
        return res.status(400).json({ ok: false, error: 'Naam, e-mail en telefoon zijn verplicht.' });
    }

    try {
        const pdfBuffer = await genereerOffertePdf(fields);
        const pdfBase64 = pdfBuffer.toString('base64');
        const voornaam = naam.split(' ')[0] || 'daar';
        const attachments = [{ filename: 'offerte-arbeidsdeskundig-onderzoek.pdf', content: pdfBase64 }];

        await sendEmail({
            to: email,
            subject: 'Je vrijblijvende offerte — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(voornaam)} — hierbij je vrijblijvende offerte als PDF. Geen verplichtingen: neem gerust de tijd, en stel vooral vragen als iets niet duidelijk is.</p>`,
            attachments,
        });
        await sendEmail({
            to: NOTIFY_EMAIL,
            subject: `Nieuwe PDF-offerte gegenereerd — ${naam}`,
            html: `<h2>Vrijblijvende offerte gegenereerd via arbeidsdeskundig.com</h2><table>${fieldsToHtml(fields)}</table>`,
            replyTo: email,
            attachments,
        });

        res.json({ ok: true, pdfBase64 });
    } catch (err) {
        console.error('Fout bij genereren offerte-PDF:', err);
        res.status(500).json({ ok: false, error: 'Er ging iets mis bij het genereren van de offerte.' });
    }
});

app.post('/api/offerte', async (req, res) => {
    const fields = req.body || {};
    const email = fields['of-email'] || fields.email;
    const naam = fields['of-naam'] || fields.naam || '';
    const voornaam = naam.split(' ')[0] || 'daar';

    await sendEmail({
        to: NOTIFY_EMAIL,
        subject: `Nieuwe offerteaanvraag — ${naam || 'onbekend'}`,
        html: `<h2>Nieuwe offerteaanvraag via arbeidsdeskundig.com</h2><table>${fieldsToHtml(fields)}</table>`,
        replyTo: email,
    });
    if (email) {
        await sendEmail({
            to: email,
            subject: 'Bedankt voor je offerteaanvraag — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(voornaam)} — we hebben je offerteaanvraag ontvangen en nemen binnen 24 uur contact met je op.</p>`,
        });
    }
    res.json({ ok: true });
});

app.post('/api/aanmelden', async (req, res) => {
    const fields = req.body || {};
    const email = fields['inp-aanvrager-email'] || fields.email;
    const naam = fields['inp-aanvrager-naam'] || fields.naam || '';
    const voornaam = naam.split(' ')[0] || 'daar';
    const spoor2 = !!fields['chk-spoor2'];

    await sendEmail({
        to: NOTIFY_EMAIL,
        subject: `Nieuwe aanmelding${spoor2 ? ' (incl. Spoor 2)' : ''} — ${naam || 'onbekend'}`,
        html: `<h2>Nieuwe aanmelding via arbeidsdeskundig.com</h2><table>${fieldsToHtml(fields)}</table>`,
        replyTo: email,
    });
    if (email) {
        await sendEmail({
            to: email,
            subject: 'Bedankt voor je aanmelding — arbeidsdeskundig.com',
            html: `<p>Bedankt, ${escapeHtml(voornaam)} — we hebben je aanmelding ontvangen en pakken dit binnen 24 uur op.</p>`,
        });
    }
    res.json({ ok: true });
});

app.post('/api/checklist', async (req, res) => {
    const fields = req.body || {};
    const email = fields['cl-email'] || fields.email;
    const naam = fields['cl-naam'] || fields.naam || '';

    await sendEmail({
        to: NOTIFY_EMAIL,
        subject: `Checklist aangevraagd — ${naam || 'onbekend'}`,
        html: `<h2>Gratis checklist aangevraagd via arbeidsdeskundig.com</h2><table>${fieldsToHtml(fields)}</table>`,
        replyTo: email,
    });
    if (email) {
        await sendEmail({
            to: email,
            subject: 'Je gratis checklist — arbeidsdeskundig.com',
            html: `<p>Bedankt${naam ? ', ' + escapeHtml(naam) : ''} — hierbij de checklist waar je om vroeg.</p>`,
        });
    }
    res.json({ ok: true });
});

// Google Search Console eigendomsverificatie (HTML-bestandsmethode). De inhoud
// moet exact overeenkomen met wat Google in het te downloaden bestand zet.
app.get('/googlea9befd16dd1488a4.html', (req, res) => {
    res.type('text/plain').send('google-site-verification: googlea9befd16dd1488a4.html');
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

// ---------------------------------------------------------------------------
// 404 — een eigen, simpele pagina (geen hergebruik van de homepage-SPA), zodat
// deze niet als near-duplicate van de homepage wordt gezien en de bezoeker
// meteen ziet dat de gevraagde pagina niet bestaat.
// ---------------------------------------------------------------------------
app.use((req, res) => {
    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagina niet gevonden (404) — arbeidsdeskundig.com</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${BASE_URL}${req.path}">
<style>
  body{font-family:Arial,sans-serif; background:#EDEFEA; color:#12203A; margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; text-align:center; padding:24px;}
  .box{max-width:480px;}
  h1{font-size:2.2rem; margin-bottom:8px;}
  p{color:#4A5568; line-height:1.6;}
  a{display:inline-block; margin-top:20px; background:#D8A03D; color:#12203A; padding:12px 22px; border-radius:2px; text-decoration:none; font-weight:600;}
</style>
</head>
<body>
  <div class="box">
    <h1>404 — Pagina niet gevonden</h1>
    <p>De pagina <code>${escapeHtml(req.path)}</code> bestaat niet (meer). Mogelijk is de link verouderd of is er een typefout gemaakt.</p>
    <a href="/">Terug naar de homepage</a>
  </div>
</body>
</html>`;
    res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(html);
});

app.listen(PORT, () => {
    console.log(`arbeidsdeskundig.com draait op poort ${PORT}`);
});
