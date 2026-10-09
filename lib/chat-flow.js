'use strict';

// Kwalificatie en prijsregel, afgeleid van de Matchvermogen-chat (0.1.2):
// eerst de situatie begrijpen, pas daarna om contact vragen, en pas daarna een tarief.
// Eigenrisicodragerschap blijft informatief: geen verkoop en geen verzekeringshaak.

const config = require('./chat-config');

const MIN_ANSWERS = 2;

const SERVICE_TARIFFS = [850, 950, 1050, 1095, 1295, 1450, 1695, 2950, 3595];

function lower(s) {
  return String(s || '').toLowerCase();
}

function isPriceQuestion(text) {
  return /\bkost|\bkosten\b|prijs|prijzen|tarie[fv]|wat betaal|hoeveel betaal|wat reken|\bbudget\b|\bofferte\b/i.test(String(text || ''));
}

function wantsContact(text) {
  return /offerte|terug\s?bel|bel me|belt u|contact opnemen|neem contact|afspraak|kennismak|formulier|gegevens achter|laat.{0,24}bellen|ik wil starten/i.test(String(text || ''));
}

function asksContact(text) {
  return /e-?mailadres|telefoonnummer|contactgegevens|uw naam en/i.test(String(text || ''));
}

function topicOf(text) {
  const t = lower(text);
  if (/arbeidsdeskund|\bad-onderzoek\b|poortwachter|tweede spoor|spoor 2/.test(t)) return 'ad';
  if (/bezwaar/.test(t)) return 'bezwaar';
  if (/eigenrisico|\berd\b/.test(t)) return 'erd';
  if (/beschikking|whk-check|whk check|no-risk|norisk|toerekening/.test(t)) return 'beschikking';
  if (/\bwga\b|\bzw\b|ziektewet|\bpremie\b/.test(t)) return 'premie';
  return '';
}

function sizeOf(text) {
  const t = lower(text);
  if (/middelgroot/.test(t)) return 'middelgroot';
  if (/kleine werkgever|mkb klein|\bklein\b/.test(t)) return 'klein';
  if (/grote werkgever|\bgroot\b/.test(t) && !/middelgroot/.test(t)) return 'groot';
  const m = t.match(/(\d{1,6})\s*(?:medewerkers|werknemers|mensen|fte|collega)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n < 25) return 'klein';
    if (n >= 25 && n < 100) return 'middelgroot';
    if (n >= 100) return 'groot';
  }
  if (/loonsom|miljoen/.test(t)) return 'loonsom';
  return '';
}

function detailOf(text) {
  return /bijlage|zes weken|6 weken|dagtekening|poortwachter|tweede spoor|wga-deel|zw-deel|allebei|beide delen|specificatie|flex/.test(lower(text));
}

function factsIn(text) {
  return {
    topic: topicOf(text),
    size: sizeOf(text),
    detail: detailOf(text)
  };
}

function analyse(history) {
  const list = Array.isArray(history) ? history : [];
  let price = false;
  let answers = 0;
  const known = { topic: '', size: '', detail: false };
  let last = { topic: '', size: '', detail: false };
  let prev = '';
  list.forEach(function (m, i) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
    if (m.role === 'assistant') {
      prev = String(m.content || '');
      return;
    }
    const content = String(m.content || '');
    if (!price && isPriceQuestion(content)) price = true;
    else if (price && prev && !isPriceQuestion(content)) answers += 1;
    const f = factsIn(content);
    if (f.topic) known.topic = f.topic;
    if (f.size) known.size = f.size;
    if (f.detail) known.detail = true;
    if (i === list.length - 1) last = f;
    prev = '';
  });
  return {
    price: price,
    answers: answers,
    known: known,
    last: last,
    next: nextStep(known, answers)
  };
}

function nextStep(known, answers) {
  if (!known.topic) return 'topic';
  if (!known.size) return 'size';
  if (!known.detail && answers < MIN_ANSWERS) return 'detail';
  if (answers < MIN_ANSWERS) return 'extra';
  return 'contact';
}

function question(step, known) {
  if (step === 'topic') {
    return 'Gaat het om uw WHK-beschikking, de WGA- of ZW-premie, bezwaar, een arbeidsdeskundig onderzoek, of een informatieve vraag over eigenrisicodragerschap?';
  }
  if (step === 'size') {
    return 'Bent u een kleine, middelgrote of grote werkgever? Een ruwe loonsom of het aantal medewerkers is genoeg.';
  }
  if (step === 'contact') {
    return 'Mag ik uw naam en een e-mailadres of telefoonnummer? Dan geef ik een prijsindicatie die bij uw vraag past, en kan een specialist contact opnemen. We gebruiken dit alleen om contact met u op te nemen over uw vraag ([privacyverklaring](' + config.privacyPath + ')).';
  }
  if (step === 'extra') {
    return 'Is er nog iets dat uitmaakt voor de planning, bijvoorbeeld spoed of een termijn die bijna afloopt?';
  }
  const byTopic = {
    beschikking: 'Heeft u de beschikking én de bijlage met toegerekende personen bij de hand?',
    premie: 'Gaat het om het WGA-deel, het ZW-deel, of allebei?',
    bezwaar: 'Is de dagtekening van de beschikking minder dan zes weken geleden?',
    ad: 'Gaat het om een poortwachter-onderzoek, tweede spoor, of een ander arbeidsdeskundig onderzoek?',
    erd: 'Wilt u vooral begrijpen wat eigenrisicodragerschap inhoudt, of hoe de publieke premie zich daartoe verhoudt?'
  };
  return byTopic[known.topic] || byTopic.beschikking;
}

function reaction(flow) {
  const last = flow.last || {};
  const known = flow.known || {};
  if (flow.answers === 0) {
    return 'Goede vraag. Ik denk eerst even mee, zodat een indicatie straks bij uw situatie past.';
  }
  if (last.topic === 'erd' || known.topic === 'erd') {
    return 'Eigenrisicodragerschap betekent dat u de WGA- of ZW-lasten zelf draagt in plaats van via de publieke premie. Dat is een afweging, geen product dat ik hier aanbied.';
  }
  if (last.topic === 'bezwaar') {
    return 'Bezwaar tegen de WHK-beschikking loopt bij de Belastingdienst. De termijn is zes weken vanaf de dagtekening, niet vanaf de dag dat de post binnenkwam.';
  }
  if (last.topic === 'ad') {
    return 'Een arbeidsdeskundig onderzoek kijkt naar belastbaarheid en de volgende stap in het dossier, bijvoorbeeld rond de eerstejaarsevaluatie.';
  }
  if (last.topic === 'premie') {
    return 'De WGA-premie en de ZW-premie staan apart op de beschikking. Welk deel speelt, bepaalt waar u in de bijlage kijkt.';
  }
  if (last.topic === 'beschikking' || last.detail) {
    return 'De bijlage met personen is meestal het stuk waar een controle iets oplevert. Het voorblad noemt alleen het percentage.';
  }
  if (last.size) {
    return 'Dank u. De grootteklasse bepaalt of u een sectorpremie, een mix of een individueel percentage betaalt.';
  }
  return 'Dank u, dat helpt.';
}

function reply(history) {
  const flow = analyse(history);
  const end = history && history[history.length - 1];
  let lead = reaction(flow);
  if (end && end.role === 'user' && isPriceQuestion(end.content) && flow.answers > 0) {
    lead = flow.next === 'contact'
      ? 'Ik snap dat u graag meteen een bedrag wilt zien.'
      : 'Ik snap dat u graag meteen een bedrag wilt zien. Eerst nog een korte vraag, dan past de indicatie bij uw situatie.';
  }
  return lead + ' ' + question(flow.next, flow.known);
}

function eur(n) {
  return '€ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function priceReply(history, thanks) {
  const flow = analyse(history);
  const topic = flow.known.topic;
  const tail = ' U kunt bellen op ' + config.phoneDisplay + ' of uw gegevens achterlaten, dan nemen we contact op.';
  let body;
  if (topic === 'ad') {
    body = 'Op de tarievenpagina staan voor een arbeidsdeskundig onderzoek twee richtbedragen: ' + eur(1095) + ' voor een standaard onderzoek en ' + eur(1295) + ' voor een onderzoek door een geregistreerde arbeidsdeskundige. Het precieze bedrag leggen we vooraf vast.';
  } else if (topic === 'erd') {
    body = 'Eigenrisicodragerschap leggen we op de site alleen informatief uit: u draagt dan zelf de WGA- of ZW-lasten in plaats van de publieke premie. Een bedrag voor advies staat daar als op aanvraag. Ik bied hier geen verzekering en geen overstap aan. Meer uitleg staat op /blog/erd-terug-naar-publiek-beslisboom-2026 en /diensten/erd-partneradvies. Voor de premie zelf is de gratis WHK-check de volgende stap.';
  } else if (topic === 'premie') {
    body = 'De WGA- en ZW-premie is een publieke premie, geen tarief van ons. Op de site staat het landelijk gemiddelde van de gedifferentieerde WGA-premie in 2026 op 0,96%. Onze hulp begint bij de gratis controle van uw beschikking.';
  } else if (topic === 'bezwaar' || topic === 'beschikking') {
    body = 'De indicatieve controle van uw WHK-beschikking is gratis. Is er een vervolgstap, dan leggen we die schriftelijk vast voordat u iets toezegt.';
  } else {
    body = 'De indicatieve WHK-check is gratis. Voor een arbeidsdeskundig onderzoek staan op /tarieven de richtbedragen ' + eur(1095) + ' en ' + eur(1295) + '. Tweede spoor staat daar op ' + eur(1695) + ' (kort traject) en ' + eur(3595) + ' (volledig traject). Verzuimconsultancy staat op ' + eur(105) + ' per uur exclusief btw. Een opdracht leggen we altijd vooraf vast.';
  }
  return (thanks ? 'Dank u. ' : '') + body + tail;
}

function statusLines(history, hasContact, justNow) {
  const flow = analyse(history);
  if (!flow.price) {
    return hasContact
      ? '\n- Er loopt geen prijsgesprek. Beantwoord de vraag vanuit de KENNIS. Vraag niet uit uzelf om contactgegevens. Zet [[LEADFORM]] alleen als de bezoeker zelf een terugbelverzoek, offerte of kennismaking wil.'
      : '\n- Er loopt geen prijsgesprek. Beantwoord de vraag vanuit de KENNIS. Noem geen tarief van onze diensten. Vraag niet uit uzelf om contactgegevens.';
  }
  const k = flow.known;
  let b = '\n- PRIJSGESPREK: actief. Antwoorden sinds de prijsvraag: ' + flow.answers + ' (minimaal ' + MIN_ANSWERS + ' voordat u om contactgegevens vraagt).';
  b += '\n- Bekend: onderwerp ' + (k.topic || 'onbekend') + ', grootte ' + (k.size || 'onbekend') + ', detail ' + (k.detail ? 'ja' : 'nee') + '.';
  if (hasContact) {
    b += '\n- VOLGENDE STAP: bedank kort zonder de gegevens te herhalen. Geef daarna alleen de richtbedragen uit de KENNIS die bij dit onderwerp horen.';
    if (k.topic === 'erd') {
      b += ' Bij eigenrisicodragerschap blijft u informatief: geen verzekering, geen overstap, geen provisie.';
    }
    b += ' Stel voor te bellen (' + config.phoneDisplay + ') of gegevens achter te laten. Zet geen [[LEADFORM]] alleen omdat het een prijsvraag was.';
    if (justNow) b += ' De bezoeker gaf het contactgegeven in het laatste bericht.';
    return b;
  }
  if (flow.next === 'contact') {
    b += '\n- VOLGENDE STAP: reageer eerst kort inhoudelijk. Vraag daarna om naam én e-mailadres of telefoonnummer, met de privacyzin. Nog geen bedrag. Geen [[LEADFORM]].';
  } else {
    b += '\n- VOLGENDE STAP: reageer eerst inhoudelijk. Stel daarna precies één vraag, over: ' + flow.next + '. Nog niet om contactgegevens vragen. Geen [[LEADFORM]].';
  }
  return b;
}

function hasForbiddenClaim(text) {
  const t = String(text || '');
  if (/no[\s-]*cure[\s,]*no[\s-]*pay/i.test(t)) return true;
  if (/8\s+van\s+de\s+10/i.test(t)) return true;
  if (/(?:€|eur)\s*47[.\s]?000\b/i.test(t) || /\b47\.000\b/.test(t) || /\b47000\b/.test(t)) return true;
  return false;
}

function hasErdSales(text) {
  return /provisie|verzekering afsluiten|private verzekering|wij regelen de overstap|stap over naar|word(?:t|en) eigenrisicodrager via/i.test(String(text || ''));
}

function digitsOf(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizePhone(raw) {
  let d = digitsOf(raw);
  const text = String(raw || '');
  if (/^(?:\+|00)\s*31/.test(text) || d.indexOf('0031') === 0 || (d.indexOf('31') === 0 && d.length >= 11)) {
    d = d.replace(/^00/, '').replace(/^31/, '');
    d = '0' + d.replace(/^0/, '');
  }
  if (!/^0[1-9]\d{8}$/.test(d)) return '';
  if (config.ownPhones.indexOf(d) !== -1) return '';
  return d;
}

function findContact(text) {
  const src = String(text || '');
  const out = { email: '', phone: '' };
  const emails = src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g) || [];
  for (let i = 0; i < emails.length; i++) {
    const e = emails[i].toLowerCase();
    if (config.ownEmails.indexOf(e) !== -1) continue;
    if (/@werkhervattingskas\.nl$/i.test(e)) continue;
    out.email = e;
    break;
  }
  const phones = src.match(/(?<![\d])(?:(?:\+|00)\s*31[\s.-]?(?:\(0\)[\s.-]?)?|0)(?:[\s.()-]*\d){8,10}(?![\d])/g) || [];
  for (let j = 0; j < phones.length; j++) {
    const n = normalizePhone(phones[j]);
    if (n) {
      out.phone = n;
      break;
    }
  }
  return out;
}

function scanHistory(history) {
  const out = { email: '', phone: '' };
  (history || []).forEach(function (m) {
    if (!m || m.role !== 'user') return;
    const found = findContact(m.content);
    if (found.email) out.email = found.email;
    if (found.phone) out.phone = found.phone;
  });
  return out;
}

function findName(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || m.role !== 'user') continue;
    const text = String(m.content || '');
    const labeled = text.match(/(?:mijn naam is|ik heet|ik ben|naam\s*:\s*)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]+){0,3})/i);
    if (labeled) return cleanName(labeled[1]);
    const before = text.split(/,|\s+en\s+mijn\s+e-?mail/i)[0];
    if (findContact(text).email || findContact(text).phone) {
      const guess = before.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ').replace(/(?:\+|00)?\d[\d\s().-]{7,}\d/g, ' ').trim();
      const parts = guess.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4 && parts.every(function (p) { return /^[A-Za-zÀ-ÿ'’.-]{2,}$/.test(p); })) {
        return cleanName(parts.join(' '));
      }
    }
  }
  return '';
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function euroAmounts(text) {
  const found = [];
  const re = /(?:€|&euro;)\s*(\d{1,3}(?:\.\d{3})+|\d{2,6})(?:,\d{1,2})?/gi;
  let m;
  const src = String(text || '');
  while ((m = re.exec(src))) {
    found.push(parseInt(m[1].replace(/\./g, ''), 10));
  }
  return found;
}

function mentionsServiceTariff(text) {
  const src = ' ' + String(text || '') + ' ';
  if (euroAmounts(src).some(function (n) { return SERVICE_TARIFFS.indexOf(n) !== -1 || n === 105; })) {
    const nearHour = /€\s*105\b/.test(src) || /105\s*euro/i.test(src);
    if (euroAmounts(src).some(function (n) { return SERVICE_TARIFFS.indexOf(n) !== -1; })) return true;
    if (nearHour && /uur|consultancy|tarief/i.test(src)) return true;
  }
  const bare = src.match(/(?<![\d.])(\d{1,3}(?:\.\d{3})+|\d{3,5})(?![\d])/g) || [];
  for (let i = 0; i < bare.length; i++) {
    const n = parseInt(bare[i].replace(/\./g, ''), 10);
    if (SERVICE_TARIFFS.indexOf(n) === -1) continue;
    const idx = src.indexOf(bare[i]);
    const win = src.slice(Math.max(0, idx - 40), idx + bare[i].length + 24).toLowerCase();
    if (/kost|prijs|tarief|euro|€|onderzoek|traject|vanaf|bedrag/.test(win)) return true;
  }
  if (/\b105\b/.test(src) && /per uur|uurtarief|consultancy/i.test(src)) return true;
  if (/korting|staffel|voordeel/i.test(src) && /\d+\s*(?:%|procent)/i.test(src)) return true;
  return false;
}

module.exports = {
  MIN_ANSWERS: MIN_ANSWERS,
  SERVICE_TARIFFS: SERVICE_TARIFFS,
  isPriceQuestion: isPriceQuestion,
  wantsContact: wantsContact,
  asksContact: asksContact,
  analyse: analyse,
  reply: reply,
  priceReply: priceReply,
  statusLines: statusLines,
  hasForbiddenClaim: hasForbiddenClaim,
  hasErdSales: hasErdSales,
  findContact: findContact,
  scanHistory: scanHistory,
  findName: findName,
  mentionsServiceTariff: mentionsServiceTariff,
  euroAmounts: euroAmounts
};
