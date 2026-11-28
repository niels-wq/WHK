'use strict';

// Gratis WHK-adviesgenerator.
// De xAI-sleutel komt alleen uit XAI_API_KEY. Die sleutel gaat nooit naar de
// browser, nooit naar een logregel en nooit naar een antwoord.

const crypto = require('crypto');

const DISCLAIMER = 'Dit is een automatisch gegenereerd, indicatief advies op basis van uw invoer. Het is geen medisch advies en geen garantie op de juistheid of adequaatheid voor uw situatie. Er kunnen geen rechten aan worden ontleend. Na dit advies volgt een gratis check door een specialist.';

const WAARSCHUWING = 'Vul geen medische gegevens in (geen diagnoses, ziektes, medicatie of behandelingen) en geen BSN. Beschrijf alleen de situatie van de werkgever: premie, regeling, WGA en Ziektewet.';

const MEDISCH_FOUT = 'We kunnen dit niet verwerken. Haal medische gegevens weg (geen diagnoses, ziektes, medicatie of behandelingen) en haal nummers zoals een BSN weg. Beschrijf alleen de premie, de regeling, WGA-instroom, Ziektewet na einde dienstverband en de beschikking.';

const GEEN_SLEUTEL = 'Het advies kan op dit moment niet worden gemaakt. Uw aanvraag is wel ontvangen. Een specialist neemt contact met u op voor de gratis check.';

const ADVIES_FAQS = [
  ['Wat doet de WHK-adviesgenerator?', 'De generator maakt een vrijblijvend, indicatief advies op basis van uw Whk-premie, of u publiek verzekerd bent of eigenrisicodrager, WGA-instroom, WGA-risico, Ziektewet-uitkeringen na einde dienstverband en of de WHK-beschikking al is nagekeken. Het is geen controle van de beschikking.'],
  ['Mag ik medische gegevens of een BSN invullen?', 'Nee. Vul geen diagnoses, ziektes, medicatie, behandelingen of een BSN in. Beschrijf alleen de situatie van de werkgever.'],
  ['Wanneer verschijnt het advies?', 'Het advies en de PDF verschijnen op deze pagina nadat u een e-mailadres of telefoonnummer invult en het AVG-vinkje aanzet.'],
  ['Is dit advies een garantie?', 'Nee. Het advies is indicatief. Het is geen medisch advies en geen garantie op adequaatheid. Er volgt een gratis check door een specialist.'],
  ['Wat gebeurt er na het advies?', 'Een specialist kan de WHK-beschikking gratis en vrijblijvend nakijken. U zit nergens aan vast.']
];

const REGELING = {
  publiek: 'Publiek verzekerd',
  'erd-wga': 'Eigenrisicodrager voor de WGA',
  'erd-zw': 'Eigenrisicodrager voor de Ziektewet',
  'erd-beide': 'Eigenrisicodrager voor WGA en Ziektewet',
  'niet-bekend': 'Niet bekend'
};

const JA_NEE = {
  ja: 'Ja',
  nee: 'Nee',
  'niet-bekend': 'Niet bekend'
};

const RISICO = {
  laag: 'Laag',
  aandacht: 'Vraagt aandacht',
  hoog: 'Hoog',
  'niet-bekend': 'Niet bekend'
};

const BESCHIKKING = {
  'nog-niet': 'Nog niet gecontroleerd',
  nagekeken: 'Al eens nagekeken',
  geen: 'Geen beschikking ontvangen',
  'niet-bekend': 'Niet bekend'
};

const SECTIE_TITELS = [
  ['samenvatting', 'Samenvatting'],
  ['aandachtspunten', 'Aandachtspunten'],
  ['beschikking', 'Check van de WHK-beschikking'],
  ['wga', 'WGA-instroom en WGA-risico'],
  ['ziektewet', 'Ziektewet na einde dienstverband'],
  ['vervolgstappen', 'Vervolgstappen']
];

const MEDISCHE_TERM = new RegExp(
  '\\b(?:' + [
    'gediagnosticeerd', 'geneesmiddelen', 'geneesmiddel', 'antidepressiva',
    'fysiotherapie', 'psychotherapie', 'angststoornis', 'fibromyalgie',
    'schizofrenie', 'aandoeningen', 'aandoening', 'ziektebeeld',
    'behandelingen', 'behandeling', 'medicijngebruik', 'burgerservicenummer',
    'long covid', 'longcovid', 'medicijnen', 'medicatie', 'medicijn',
    'antibiotica', 'antibioticum', 'prednisolon', 'sertraline', 'citalopram',
    'paracetamol', 'ibuprofen', 'oxycodon', 'diagnose', 'diagnoses',
    'burn-out', 'burnout', 'depressief', 'depressie', 'epilepsie',
    'whiplash', 'parkinson', 'artrose', 'beroerte', 'diabetes', 'migraine',
    'autisme', 'therapie', 'operatie', 'chemokuur', 'ziekten', 'ziekte',
    'kanker', 'hernia', 'corona', 'griep', 'astma', 'reuma', 'tumor',
    'morfine', 'covid', 'ptsd', 'ptss', 'adhd', 'bipolair'
  ].sort(function (a, b) { return b.length - a.length; }).map(escapeRe).join('|') + ')\\b',
  'i'
);

const VERBODEN = /no[\s-]*cure[\s-]*no[\s-]*pay|8\s+van\s+de\s+10|(?<![\d])8\/10(?![\d])|47\.000/i;

const reports = new Map();
const rateHits = new Map();
const REPORT_TTL_MS = 2 * 60 * 60 * 1000;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function num(name, def) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function apiKey() {
  return String(process.env.XAI_API_KEY || '').trim();
}

function schoon(value, max) {
  return String(value == null ? '' : value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function tidy(text) {
  return String(text || '')
    .replace(/\u2014/g, ', ')
    .replace(/\u2013/g, '-')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
}

function redact(text) {
  const key = apiKey();
  let out = String(text || '');
  if (key) out = out.split(key).join('');
  return out
    .replace(/Bearer\s+\S+/gi, '')
    .replace(/XAI_API_KEY/g, '')
    .replace(VERBODEN, '');
}

function firstString(src, keys) {
  for (let i = 0; i < keys.length; i++) {
    const value = src[keys[i]];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function waarheid(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'ja';
}

function elfproef(digits) {
  let d = String(digits || '');
  if (d.length === 8) d = '0' + d;
  if (!/^\d{9}$/.test(d) || d === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * Number(d[i]);
  sum -= Number(d[8]);
  return sum % 11 === 0;
}

function heeftBsn(tekst) {
  const raw = String(tekst || '');
  if (/\b(?:bsn|burgerservicenummer|sofinummer)\b/i.test(raw)) return true;
  const re = /(?<!\d)(?:\d[\s.]?){8,9}(?!\d)/g;
  let m;
  while ((m = re.exec(raw))) {
    const digits = m[0].replace(/\D/g, '');
    if ((digits.length === 8 || digits.length === 9) && elfproef(digits)) return true;
  }
  return false;
}

function vindMedisch(tekst) {
  const raw = String(tekst || '');
  if (heeftBsn(raw)) return 'bsn';
  if (MEDISCHE_TERM.test(raw)) return 'medisch';
  return '';
}

function keuze(map, value) {
  const key = schoon(value, 40).toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? key : '';
}

function label(map, key) {
  return map[key] || 'Niet bekend';
}

function alleVrijeTekst(fields) {
  const src = (fields && typeof fields === 'object' && !Array.isArray(fields)) ? fields : {};
  const skip = new Set([
    'email', 'telefoon', 'phone', 'avg', 'website', 'honeypot', 'whk_ts', 'whkTs',
    'regeling', 'wgaInstroom', 'wgaRisico', 'ziektewet', 'beschikking'
  ]);
  const parts = [];
  Object.keys(src).forEach(function (key) {
    if (skip.has(key)) return;
    const val = src[key];
    if (typeof val === 'string') parts.push(val);
    else if (Array.isArray(val)) parts.push(val.filter(function (item) { return typeof item === 'string'; }).join(' '));
  });
  return parts.join('\n');
}

function naamUitContact(naam, email) {
  const ingevuld = schoon(naam, 80);
  if (ingevuld.length >= 2 && !/^(onbekend|unknown|n\/a|na|xxx+|geen naam|test)$/i.test(ingevuld)) {
    return ingevuld;
  }
  const local = String(email || '').split('@')[0].replace(/[._+-]+/g, ' ').replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  if (local && /[a-z]/i.test(local) && local.length >= 2 && !/onbekend|test|foo|bar/i.test(local)) {
    return local.slice(0, 80);
  }
  return 'WHK-adviesaanvrager';
}

function validateAdviesLead(fields) {
  const src = (fields && typeof fields === 'object' && !Array.isArray(fields)) ? fields : {};
  const email = schoon(firstString(src, ['email', 'whk-email']), 120).toLowerCase();
  const telefoon = schoon(firstString(src, ['telefoon', 'phone', 'whk-telefoon']), 30);
  const premie = redact(schoon(firstString(src, ['premie', 'whkPremie', 'premieToelichting']), 1500));
  const toelichting = redact(schoon(firstString(src, ['toelichting', 'situatie']), 2000));
  const organisatie = redact(schoon(firstString(src, ['organisatie', 'bedrijf']), 120));
  const regeling = keuze(REGELING, firstString(src, ['regeling']));
  const wgaInstroom = keuze(JA_NEE, firstString(src, ['wgaInstroom', 'wga-instroom']));
  const wgaRisico = keuze(RISICO, firstString(src, ['wgaRisico', 'wga-risico']));
  const ziektewet = keuze(JA_NEE, firstString(src, ['ziektewet', 'zw']));
  const beschikking = keuze(BESCHIKKING, firstString(src, ['beschikking']));
  const errors = [];

  if (!isValidEmail(email) && !isValidPhone(telefoon)) {
    errors.push('Vul een e-mailadres of telefoonnummer in.');
  } else {
    if (email && !isValidEmail(email)) errors.push('Vul een geldig e-mailadres in.');
    if (telefoon && !isValidPhone(telefoon)) errors.push('Vul een geldig telefoonnummer in.');
  }
  if (!waarheid(src.avg)) {
    errors.push('Vink aan dat u toestemming geeft om uw gegevens te gebruiken voor dit advies en om contact op te nemen.');
  }
  if (premie.length < 8) errors.push('Beschrijf in het kort uw Whk-premie of wat u op de beschikking ziet.');
  if (!regeling) errors.push('Geef aan of u publiek verzekerd bent of eigenrisicodrager.');
  if (!wgaInstroom) errors.push('Geef aan of er WGA-instroom is.');
  if (!wgaRisico) errors.push('Geef een inschatting van het WGA-risico.');
  if (!ziektewet) errors.push('Geef aan of er Ziektewet-uitkeringen zijn na einde dienstverband.');
  if (!beschikking) errors.push('Geef aan wat de stand van de WHK-beschikking is.');

  const lead = {
    naam: naamUitContact(firstString(src, ['naam', 'name']), email),
    email: isValidEmail(email) ? email : '',
    telefoon: isValidPhone(telefoon) ? telefoon : '',
    organisatie: organisatie,
    premie: premie,
    toelichting: toelichting,
    regeling: regeling,
    regelingLabel: label(REGELING, regeling),
    wgaInstroom: wgaInstroom,
    wgaInstroomLabel: label(JA_NEE, wgaInstroom),
    wgaRisico: wgaRisico,
    wgaRisicoLabel: label(RISICO, wgaRisico),
    ziektewet: ziektewet,
    ziektewetLabel: label(JA_NEE, ziektewet),
    beschikking: beschikking,
    beschikkingLabel: label(BESCHIKKING, beschikking),
    avg: waarheid(src.avg),
    bron: 'whk-advies-generator',
    dienst: 'WHK-adviesgenerator'
  };
  lead.stoplicht = berekenStoplicht(lead);

  if (errors.length) return { ok: false, errors: errors, lead: lead };
  return { ok: true, lead: lead };
}

function berekenStoplicht(lead) {
  let punten = 0;
  const redenen = [];
  if (lead.wgaInstroom === 'ja') {
    punten += 2;
    redenen.push('U noemt WGA-instroom.');
  }
  if (lead.wgaRisico === 'hoog') {
    punten += 2;
    redenen.push('U schat het WGA-risico hoog in.');
  } else if (lead.wgaRisico === 'aandacht') {
    punten += 1;
    redenen.push('U geeft aan dat het WGA-risico aandacht vraagt.');
  }
  if (lead.ziektewet === 'ja') {
    punten += 2;
    redenen.push('U noemt Ziektewet-uitkeringen na einde dienstverband.');
  }
  if (lead.beschikking === 'nog-niet' || lead.beschikking === 'geen') {
    punten += 1;
    redenen.push('De WHK-beschikking is nog niet nagekeken.');
  }
  const open = [lead.regeling, lead.wgaInstroom, lead.wgaRisico, lead.ziektewet, lead.beschikking]
    .filter(function (v) { return v === 'niet-bekend'; }).length;
  if (open) {
    punten += 1;
    redenen.push('Een of meer onderdelen zijn niet bekend. Daardoor blijft het advies beperkt tot wat u heeft ingevuld.');
  }
  let kleur = 'groen';
  let titel = 'Groen';
  if (punten >= 4) {
    kleur = 'rood';
    titel = 'Rood';
  } else if (punten >= 2) {
    kleur = 'oranje';
    titel = 'Oranje';
  }
  if (!redenen.length) {
    redenen.push('Op basis van deze invoer zijn er geen directe signalen. Een check van de beschikking blijft zinvol.');
  }
  return { kleur: kleur, titel: titel, redenen: redenen };
}

function regelingZin(lead) {
  if (lead.regeling === 'publiek') {
    return 'U geeft aan publiek verzekerd te zijn voor de Whk. Dit advies gebruikt dat als feit en raadt geen overstap aan.';
  }
  if (lead.regeling === 'niet-bekend') {
    return 'Het is niet bekend of u publiek verzekerd bent of eigenrisicodrager. Dit advies raadt geen overstap aan.';
  }
  return 'U geeft aan: ' + lead.regelingLabel + '. Dit advies gebruikt dat als feit en raadt geen overstap aan.';
}

function fallbackSecties(lead) {
  const situatie = lead.premie + (lead.toelichting ? ' ' + lead.toelichting : '');
  return {
    samenvatting: 'Indicatief beeld op basis van uw invoer. Regeling: ' + lead.regelingLabel + '. WGA-instroom: ' + lead.wgaInstroomLabel + '. WGA-risico: ' + lead.wgaRisicoLabel + '. Ziektewet na einde dienstverband: ' + lead.ziektewetLabel + '. Beschikking: ' + lead.beschikkingLabel + '. Stoplicht: ' + lead.stoplicht.titel + '. ' + regelingZin(lead),
    aandachtspunten: lead.stoplicht.redenen.join(' ') + ' Wat u over de premie schreef: ' + situatie,
    beschikking: 'De stand die u doorgaf: ' + lead.beschikkingLabel + '. Een specialist kan de beschikking gratis nakijken op loonsom, premiecomponenten en toerekening. Dit automatische advies vervangt die check niet.',
    wga: 'WGA-instroom volgens uw invoer: ' + lead.wgaInstroomLabel + '. Uw inschatting van het WGA-risico: ' + lead.wgaRisicoLabel + '. Dit advies vult daar geen bedrag of percentage aan in.',
    ziektewet: 'Ziektewet-uitkeringen na einde dienstverband volgens uw invoer: ' + lead.ziektewetLabel + '. Of die uitkeringen op de beschikking thuishoren, volgt pas uit een check van de bijlage.',
    vervolgstappen: 'Laat een specialist de WHK-beschikking gratis en vrijblijvend nakijken. Houd de dagtekening en de bezwaartermijn in de gaten. Dit advies is indicatief en geen garantie.'
  };
}

function naarSecties(obj) {
  return SECTIE_TITELS.map(function (pair) {
    return {
      id: pair[0],
      titel: pair[1],
      tekst: tidy(redact(obj[pair[0]])).slice(0, 2500)
    };
  });
}

function parseModel(text) {
  let raw = redact(tidy(text));
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  for (let i = 0; i < SECTIE_TITELS.length; i++) {
    const id = SECTIE_TITELS[i][0];
    if (typeof obj[id] !== 'string' || !tidy(obj[id])) return null;
  }
  const joined = SECTIE_TITELS.map(function (pair) { return obj[pair[0]]; }).join('\n');
  if (VERBODEN.test(joined) || /ECLI\s*:/i.test(joined) || vindMedisch(joined)) return null;
  return naarSecties(obj);
}

function systeemPrompt() {
  return [
    'Je schrijft een vrijblijvend, indicatief advies voor een Nederlandse werkgever over de Werkhervattingskas. Je bent geen arts.',
    'Schrijf uitsluitend in het Nederlands. Gebruik geen emdash en geen endash.',
    'Gebruik alleen de feiten uit de invoer en het meegestuurde stoplicht. Verzin geen bedragen, percentages, boetes, statistieken, ECLI-nummers of klantnamen.',
    'Noem nooit de zin 8 van de 10. Noem nooit het bedrag 47000. Gebruik de term no cure no pay niet.',
    'Eigenrisicodragerschap is alleen een feitelijke status uit de invoer. Adviseer niet om wel of niet over te stappen. Dat is geen verkoophaak.',
    'Medische gegevens horen niet in de invoer. Ga er niet op in en noem geen diagnose.',
    'Het advies is indicatief, geen medisch advies en geen garantie op adequaatheid. De vervolgstap is een gratis check van de WHK-beschikking door een specialist.',
    'Antwoord alleen met JSON, zonder markdown, in precies deze velden: samenvatting, aandachtspunten, beschikking, wga, ziektewet, vervolgstappen.',
    'Houd elk veld beknopt. Samen ongeveer 500 woorden.'
  ].join('\n');
}

function gebruikersPrompt(lead) {
  return [
    'Organisatie: ' + (lead.organisatie || 'niet ingevuld'),
    'Whk-premie, zoals de werkgever het beschrijft: ' + lead.premie,
    'Toelichting: ' + (lead.toelichting || 'geen'),
    'Regeling: ' + lead.regelingLabel,
    'WGA-instroom: ' + lead.wgaInstroomLabel,
    'WGA-risico, inschatting van de werkgever: ' + lead.wgaRisicoLabel,
    'Ziektewet-uitkeringen na einde dienstverband: ' + lead.ziektewetLabel,
    'Stand van de WHK-beschikking: ' + lead.beschikkingLabel,
    'Stoplicht, al bepaald. Gebruik deze kleur en verzin geen andere: ' + lead.stoplicht.titel,
    'Redenen bij het stoplicht: ' + lead.stoplicht.redenen.join(' ')
  ].join('\n');
}

function rateLimited(ip, now) {
  const max = num('WHK_ADVIES_RATE_MAX', 6);
  const windowMs = num('WHK_ADVIES_RATE_WINDOW_MS', 60 * 60 * 1000);
  const key = ip || 'unknown';
  const list = (rateHits.get(key) || []).filter(function (t) { return now - t < windowMs; });
  if (list.length >= max) {
    rateHits.set(key, list);
    return true;
  }
  list.push(now);
  rateHits.set(key, list);
  return false;
}

async function vraagModel(lead, fetchImpl) {
  const key = apiKey();
  if (!key) {
    const err = new Error('nokey');
    err.code = 'nokey';
    throw err;
  }
  const doFetch = fetchImpl || globalThis.fetch;
  const url = (process.env.XAI_API_BASE || 'https://api.x.ai/v1').replace(/\/$/, '') + '/chat/completions';
  const body = {
    model: process.env.XAI_MODEL || 'grok-4.20-0309-non-reasoning',
    messages: [
      { role: 'system', content: systeemPrompt() },
      { role: 'user', content: gebruikersPrompt(lead) }
    ],
    max_tokens: num('WHK_ADVIES_MAX_TOKENS', 1200),
    temperature: 0.2,
    stream: false
  };
  const timeoutMs = num('WHK_ADVIES_TIMEOUT_MS', 25000);
  const r = await doFetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) {
    console.error('[whk-advies] xAI HTTP', r.status);
    const err = new Error('api');
    err.code = 'api';
    throw err;
  }
  const json = await r.json();
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  const secties = parseModel(typeof content === 'string' ? content : '');
  if (!secties) {
    const err = new Error('parse');
    err.code = 'parse';
    throw err;
  }
  return secties;
}

function mailTekst(lead) {
  return [
    'Aanvraag: WHK-adviesgenerator',
    'Bron: whk-advies-generator',
    'Naam: ' + lead.naam,
    'E-mail: ' + (lead.email || 'niet ingevuld'),
    'Telefoon: ' + (lead.telefoon || 'niet ingevuld'),
    'Organisatie: ' + (lead.organisatie || 'niet ingevuld'),
    'Regeling: ' + lead.regelingLabel,
    'Whk-premie: ' + lead.premie,
    'Toelichting: ' + (lead.toelichting || 'geen'),
    'WGA-instroom: ' + lead.wgaInstroomLabel,
    'WGA-risico: ' + lead.wgaRisicoLabel,
    'Ziektewet na einde dienstverband: ' + lead.ziektewetLabel,
    'Beschikking: ' + lead.beschikkingLabel,
    'Stoplicht: ' + lead.stoplicht.titel,
    'AVG-toestemming: ja'
  ].join('\n');
}

function pruneReports(now) {
  const t = now || Date.now();
  for (const pair of reports) {
    if (t - pair[1].created > REPORT_TTL_MS) reports.delete(pair[0]);
  }
  while (reports.size > 400) {
    const oldest = reports.keys().next().value;
    reports.delete(oldest);
  }
}

function storeReport(rec) {
  pruneReports();
  const id = crypto.randomBytes(16).toString('hex');
  reports.set(id, Object.assign({ created: Date.now() }, rec));
  return id;
}

function getReport(id) {
  pruneReports();
  if (!/^[a-f0-9]{32}$/.test(String(id || ''))) return null;
  return reports.get(String(id)) || null;
}

function pdfEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function pdfSafe(text) {
  return redact(tidy(text))
    .replace(/\u20ac/g, 'EUR ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, ' ');
}

function wrapLines(text, width) {
  const lines = [];
  String(text || '').split('\n').forEach(function (para) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }
    let line = '';
    words.forEach(function (word) {
      const next = line ? line + ' ' + word : word;
      if (next.length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
  });
  return lines;
}

function schrijfPdf(rec) {
  const blocks = [];
  blocks.push('Indicatief WHK-advies');
  blocks.push('werkhervattingskas.nl');
  blocks.push('');
  blocks.push('Stoplicht: ' + ((rec.stoplicht && rec.stoplicht.titel) || ''));
  (rec.stoplicht && rec.stoplicht.redenen || []).forEach(function (reden) {
    blocks.push(reden);
  });
  blocks.push('');
  blocks.push('Regeling: ' + (rec.regelingLabel || ''));
  blocks.push('WGA-instroom: ' + (rec.wgaInstroomLabel || ''));
  blocks.push('WGA-risico: ' + (rec.wgaRisicoLabel || ''));
  blocks.push('Ziektewet na einde dienstverband: ' + (rec.ziektewetLabel || ''));
  blocks.push('Beschikking: ' + (rec.beschikkingLabel || ''));
  if (rec.fallback) {
    blocks.push('');
    blocks.push('De automatische generator was even niet beschikbaar. Dit is een basisadvies op basis van de invoer.');
  }
  (rec.secties || []).forEach(function (sectie) {
    blocks.push('');
    blocks.push(sectie.titel);
    blocks.push(sectie.tekst || '');
  });
  blocks.push('');
  blocks.push(DISCLAIMER);
  const lines = wrapLines(blocks.join('\n'), 90);
  const pages = [];
  let chunk = [];
  lines.forEach(function (line) {
    if (chunk.length >= 46) {
      pages.push(chunk);
      chunk = [];
    }
    chunk.push(line);
  });
  if (chunk.length) pages.push(chunk);
  if (!pages.length) pages.push(['Indicatief WHK-advies']);

  const objects = [];
  function add(body) {
    objects.push(body);
    return objects.length;
  }

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const pageIds = [];
  pages.forEach(function (pageLines) {
    const commands = ['BT', '/F1 11 Tf', '14 TL', '50 800 Td'];
    pageLines.forEach(function (line, index) {
      if (index) commands.push('T*');
      commands.push('(' + pdfEscape(pdfSafe(line)) + ') Tj');
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = add('<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream');
    const pageId = add('<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 595 842] /Contents ' + contentId + ' 0 R /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> >>');
    pageIds.push(pageId);
  });
  const pagesId = add('<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] >>');
  const catalogId = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
  objects[pagesId - 1] = objects[pagesId - 1].replace('PAGES 0 R', pagesId + ' 0 R');
  objects.forEach(function (body, index) {
    objects[index] = body.replace(/PAGES 0 R/g, pagesId + ' 0 R');
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(function (body, index) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf, 'latin1');
}

function resetForTests() {
  reports.clear();
  rateHits.clear();
}

function publiekAntwoord(lead, id, secties, extra) {
  const body = {
    ok: true,
    saved: true,
    id: id,
    disclaimer: DISCLAIMER,
    stoplicht: {
      kleur: lead.stoplicht.kleur,
      titel: lead.stoplicht.titel,
      redenen: lead.stoplicht.redenen
    },
    kop: {
      regeling: lead.regelingLabel,
      wgaInstroom: lead.wgaInstroomLabel,
      wgaRisico: lead.wgaRisicoLabel,
      ziektewet: lead.ziektewetLabel,
      beschikking: lead.beschikkingLabel
    },
    secties: secties
  };
  return Object.assign(body, extra || {});
}

function register(app, deps) {
  const persistLead = deps.persistLead;
  const spamGuard = deps.spamGuard;
  const fetchImpl = deps.fetchImpl;

  app.post('/api/whk-advies', async function (req, res) {
    try {
      const body = req.body || {};
      const verdict = spamGuard.evaluate({ body: body, ip: spamGuard.clientIp(req) });
      if (verdict.spam) {
        console.log('[whk-advies] spam gedropt');
        return res.json({ ok: true });
      }
      const parsed = validateAdviesLead(body);
      if (!parsed.ok) {
        console.log('[whk-advies] afgewezen');
        return res.status(400).json({ ok: false, error: parsed.errors[0] });
      }
      const lead = parsed.lead;
      if (vindMedisch(alleVrijeTekst(body) + '\n' + lead.premie + '\n' + lead.toelichting + '\n' + lead.organisatie + '\n' + lead.naam)) {
        console.log('[whk-advies] medische invoer of BSN tegengehouden');
        return res.status(400).json({ ok: false, error: MEDISCH_FOUT });
      }
      if (rateLimited(spamGuard.clientIp(req))) {
        return res.status(429).json({
          ok: false,
          error: 'U heeft te vaak een advies aangevraagd. Probeer het over een uur opnieuw, of bel 085-0870307.'
        });
      }

      let stored;
      try {
        stored = await persistLead({
          name: lead.naam,
          phone: lead.telefoon,
          email: lead.email,
          source: 'whk-advies-generator',
          message: mailTekst(lead),
          page: '/whk-advies-generator'
        });
      } catch (err) {
        console.error('[whk-advies] lead doorsturen mislukt');
        stored = { http: 500, body: { error: 'lead' } };
      }
      if (!stored || stored.http >= 400) {
        return res.status(500).json({
          ok: false,
          error: 'Uw aanvraag kon niet veilig worden doorgezet. Probeer het opnieuw of bel 085-0870307.'
        });
      }

      if (!apiKey()) {
        console.error('[whk-advies] generator niet gelukt nokey');
        return res.status(503).json({ ok: false, saved: true, error: GEEN_SLEUTEL });
      }

      let secties;
      let fallback = false;
      try {
        secties = await vraagModel(lead, fetchImpl);
      } catch (err) {
        const code = (err && err.code) || 'fout';
        console.error('[whk-advies] generator niet gelukt', code === 'nokey' ? 'nokey' : code);
        fallback = true;
        secties = naarSecties(fallbackSecties(lead));
      }

      const id = storeReport({
        secties: secties,
        stoplicht: lead.stoplicht,
        regelingLabel: lead.regelingLabel,
        wgaInstroomLabel: lead.wgaInstroomLabel,
        wgaRisicoLabel: lead.wgaRisicoLabel,
        ziektewetLabel: lead.ziektewetLabel,
        beschikkingLabel: lead.beschikkingLabel,
        fallback: fallback
      });
      const notified = stored.body && stored.body.notified;
      res.json(publiekAntwoord(lead, id, secties, {
        fallback: fallback,
        test: stored.body && stored.body.status === 'test'
      }));
      if (notified === false && stored.body && stored.body.status === 'test') {
        console.log('[whk-advies] testaanvraag, geen mail');
      }
    } catch (err) {
      console.error('[whk-advies] onverwachte fout');
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Er ging iets mis. Probeer het opnieuw of bel 085-0870307.' });
      }
    }
  });

  app.post('/api/whk-advies-pdf', function (req, res) {
    try {
      const id = req.body && req.body.id;
      const rec = getReport(id);
      if (!rec) {
        return res.status(404).json({ ok: false, error: 'Dit rapport is verlopen. Genereer het opnieuw.' });
      }
      const pdf = schrijfPdf(rec);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="whk-advies-werkhervattingskas.pdf"');
      res.send(pdf);
    } catch (err) {
      console.error('[whk-advies] pdf mislukt');
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'De PDF kon niet worden gemaakt. Het advies blijft wel op het scherm staan.' });
      }
    }
  });
}

module.exports = {
  DISCLAIMER: DISCLAIMER,
  WAARSCHUWING: WAARSCHUWING,
  MEDISCH_FOUT: MEDISCH_FOUT,
  GEEN_SLEUTEL: GEEN_SLEUTEL,
  ADVIES_FAQS: ADVIES_FAQS,
  vindMedisch: vindMedisch,
  elfproef: elfproef,
  validateAdviesLead: validateAdviesLead,
  berekenStoplicht: berekenStoplicht,
  fallbackSecties: fallbackSecties,
  mailTekst: mailTekst,
  register: register,
  resetForTests: resetForTests,
  getReport: getReport
};
