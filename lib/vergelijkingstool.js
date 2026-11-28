// Vergelijkingstool voor interventies, WHK-variant.
// Zelfde bestand voor Node (SSR) en de browser (filters, sortering, berekening).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    root.VergelijkTool = api;
    var start = function () { api.boot(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PEILDATUM = '28-11-2026';
  var EIGEN_AD = 'Vanaf €999,- excl. btw, in sommige gevallen bij een vroegtijdig onderzoek';
  var CTA_LABEL = 'Vraag een vrijblijvende offerte aan';
  var DISCLAIMER = 'Peildatum 28 november 2026. De gegevens komen uit openbare bronnen; per prijs staat de bron en de datum van raadpleging. Prijzen kunnen afwijken van de actuele tarieven en zijn geen offerte. De getoonde bandbreedte is een steekproef van openbaar gepubliceerde prijzen en geen landelijk marktgemiddelde. Prijs niet openbaar betekent dat de aanbieder op de geraadpleegde pagina\'s geen prijs noemt. Bedragen zijn exclusief btw, tenzij anders vermeld. Ziet u een onjuistheid? Laat het ons weten, dan passen we het aan.';

  var TABS = {
    'arbeidsdeskundig-onderzoek': 'AD-onderzoek',
    'tweede-spoor': 'Tweede spoor',
    coaching: 'Coaching',
    outplacement: 'Outplacement',
    'whk-onderzoek': 'WHK-onderzoek',
    'bezwaar-uwv': 'Bezwaar',
    arbodienstverlening: 'Losse arbodienst',
    casemanagement: 'Casemanagement',
    verzuimsysteem: 'Verzuimsysteem'
  };

  var NAMEN = {
    'bezwaar-uwv': 'Bezwaar bij het UWV'
  };

  function publicId(id) {
    if (id === 'no-cure-no-pay-bezwaar') return 'bezwaar-uwv';
    return id;
  }

  var SKIP_PARAM = {
    bedrijfsgrootte: true,
    aantal_dossiers: true,
    aantal_trajecten: true,
    medewerkers: true,
    aantal_personen: true,
    landelijk: true,
    no_cure_no_pay: true,
    ncnp: true,
    premie: true,
    aantal_wga: true
  };

  var EIGEN_IDS = { mv: true, bm: true, wkk: true };

  var FAQS = [
    [
      'Waar komen de prijzen in deze vergelijking vandaan?',
      'Uit openbare pagina\'s en prijslijsten van aanbieders, geraadpleegd op 28 november 2026. Bij elk bedrag staat de bron. Ontbreekt een openbare prijs, dan staat er prijs niet openbaar. Er is geen bedrag geschat.'
    ],
    [
      'Wat betekent prijs niet openbaar?',
      'De aanbieder noemt op de geraadpleegde pagina\'s geen prijs. De tool vult dat niet aan. U ziet dan de tekst prijs niet openbaar.'
    ],
    [
      'Telt het aanbod van werkhervattingskas.nl mee in de bandbreedte?',
      'Nee. Laag, midden en hoog zijn het minimum, de mediaan en het maximum van openbare tarieven van derden. Ons eigen aanbod telt niet mee. De richttarieven op de pagina Tarieven van deze site staan niet in deze vergelijking.'
    ],
    [
      'Wat betekent de interventiekeuze voor de Whk-premie?',
      'Bij een publiek verzekerde werkgever kan WGA-instroom de gedifferentieerde Whk-premie beïnvloeden. Bij een eigenrisicodrager raakt dezelfde keuze de uitkeringslast die de werkgever zelf draagt, niet het publieke premiepercentage. Deze tool rekent daar geen bedrag bij.'
    ],
    [
      'Hoe vraag ik een offerte aan?',
      'Met het formulier op deze pagina. De bron van de aanvraag is vergelijkingstool. Wij reageren binnen 1 werkdag.'
    ]
  ];

  function plain(value) {
    return String(value == null ? '' : value)
      .replace(/[—–]/g, ', ')
      .replace(/no[\s-]*cure[\s-]*no[\s-]*pay/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+,/g, ',')
      .replace(/\(\s*\)/g, '')
      .trim();
  }

  function esc(value) {
    return plain(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(url) {
    if (typeof url !== 'string') return '';
    if (!/^https:\/\//i.test(url)) return '';
    if (/no[\s-]*cure[\s-]*no[\s-]*pay/i.test(url)) return '';
    return url;
  }

  function formatEuro(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    var neg = n < 0;
    var abs = Math.abs(n);
    var rounded = Math.round(abs * 100) / 100;
    var fixed = rounded.toFixed(2);
    var parts = fixed.split('.');
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var wholeSource = Math.abs(abs - Math.round(abs)) < 1e-9;
    var body = wholeSource ? whole : whole + ',' + parts[1];
    return (neg ? '-' : '') + '€' + body;
  }

  function formatCijfer(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return String(n).replace('.', ',');
  }

  function mul(a, b) {
    var text = String(a);
    var dec = (text.split('.')[1] || '').length;
    var scale = Math.pow(10, dec);
    var prod = Math.round(Number(a) * scale) * b;
    return dec === 0 ? prod : prod / scale;
  }

  function parseCount(raw) {
    var text = String(raw == null ? '' : raw).trim();
    if (!/^\d+$/.test(text)) return null;
    var n = Number(text);
    return n >= 1 ? n : null;
  }

  function bucket(n) {
    if (!n) return '';
    if (n <= 5) return 'tot 5';
    if (n <= 100) return '6 tot 100';
    return 'meer dan 100';
  }

  function jaarTekst(prijs, medewerkers, dossiers) {
    var eenheid = String(prijs.eenheid || '').toLowerCase();
    var bedrag = prijs.bedrag;
    if (!isFinite(bedrag)) return null;
    if (eenheid.indexOf('%') !== -1 || /periode niet/.test(eenheid)) return null;
    if (/per medewerker per jaar|per werknemer per jaar/.test(eenheid)) {
      if (!medewerkers) return null;
      var tot = mul(bedrag, medewerkers);
      return formatEuro(bedrag) + ' per medewerker per jaar × ' + medewerkers + ' medewerkers = ' + formatEuro(tot) + ' per jaar';
    }
    if (/per medewerker per maand|per actieve medewerker per maand/.test(eenheid)) {
      if (!medewerkers) return null;
      var perJaar = mul(bedrag, 12);
      var totMaand = mul(perJaar, medewerkers);
      return formatEuro(bedrag) + ' per medewerker per maand × 12 × ' + medewerkers + ' medewerkers = ' + formatEuro(totMaand) + ' per jaar';
    }
    if (/per persoon/.test(eenheid)) {
      if (!medewerkers) return null;
      return formatEuro(bedrag) + ' per persoon × ' + medewerkers + ' medewerkers = ' + formatEuro(mul(bedrag, medewerkers));
    }
    if (/per traject/.test(eenheid)) {
      if (!dossiers) return null;
      return formatEuro(bedrag) + ' per traject × ' + dossiers + ' dossiers per jaar = ' + formatEuro(mul(bedrag, dossiers)) + ' per jaar';
    }
    return null;
  }

  function bronTitel(bron) {
    var raw = String((bron && bron.titel) || 'Bron');
    if (/no[\s-]*cure[\s-]*no[\s-]*pay/i.test(raw)) {
      return 'WENB/Schouten Zekerheid, nieuwsbericht 2022';
    }
    return plain(raw);
  }

  function formatPrijsBedrag(prijs) {
    var eenheid = String(prijs.eenheid || '').trim();
    if (eenheid.charAt(0) === '%') return formatCijfer(prijs.bedrag) + '%';
    return formatEuro(prijs.bedrag);
  }

  function formatBandWaarde(band, n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (String(band.eenheid || '').trim().charAt(0) === '%') return formatCijfer(n) + '%';
    return formatEuro(n);
  }

  function marksOf(certs) {
    var labels = [];
    var bow = false;
    var sbca = false;
    (certs || []).forEach(function (cert) {
      var status = String(cert.status || '');
      if (!/^aangetroffen/i.test(status)) return;
      var naam = String(cert.naam || '');
      if (/blik op werk/i.test(naam)) {
        bow = true;
        labels.push('Blik op Werk keurmerk: ja');
      } else if (/sbca|certificatieschema arbodiensten/i.test(naam)) {
        sbca = true;
        labels.push('SBCA-certificaat: ja');
      }
    });
    var uniq = [];
    labels.forEach(function (label) {
      if (uniq.indexOf(label) === -1) uniq.push(label);
    });
    return { labels: uniq, bow: bow, sbca: sbca };
  }

  function reviewsOf(profile, bronnen) {
    var bow = profile && profile.blik_op_werk;
    if (!bow) return [];
    var bron = bronnen[bow.bron] || {};
    var url = safeUrl(bron.url);
    if (!url) return [];
    var rows = [
      ['cliënten', bow.clienten],
      ['opdrachtgevers', bow.opdrachtgevers]
    ];
    var out = [];
    rows.forEach(function (pair) {
      var row = pair[1];
      if (!row || typeof row.cijfer !== 'number') return;
      out.push({
        groep: pair[0],
        cijfer: row.cijfer,
        respondenten: typeof row.respondenten === 'number' ? row.respondenten : null,
        periode: plain(bow.periode || ''),
        bronUrl: url,
        bronTitel: plain(bron.titel || 'Bron')
      });
    });
    return out;
  }

  function priceMode(ivId, id) {
    if (EIGEN_IDS[id]) {
      if (id === 'mv' && ivId === 'arbeidsdeskundig-onderzoek') return 'eigen-ad';
      return 'eigen';
    }
    return 'show';
  }

  function mapPrices(rawPrices, bronnen, leukOk) {
    var prijzen = [];
    var leukWeg = false;
    (rawPrices || []).forEach(function (prijs) {
      if (typeof prijs.bedrag !== 'number') return;
      if (prijs.bron === 'leuk_2026' && !leukOk) {
        leukWeg = true;
        return;
      }
      var bron = bronnen[prijs.bron];
      if (!bron) return;
      var url = safeUrl(bron.url);
      var titel = bronTitel(bron);
      if (!url && !titel) return;
      prijzen.push({
        label: plain(prijs.label),
        bedrag: prijs.bedrag,
        eenheid: plain(prijs.eenheid),
        btw: plain(prijs.btw || ''),
        tariefjaar: plain(prijs.tariefjaar || ''),
        prijsbasis: plain(prijs.prijsbasis || ''),
        bronUrl: url,
        bronTitel: titel
      });
    });
    return { prijzen: prijzen, leukWeg: leukWeg };
  }

  function isClosed(raw) {
    return raw.prijs_tekst_tool === 'prijs niet openbaar' || raw.prijs_status === 'niet openbaar';
  }

  function prepareModel(data, opts) {
    var leukOk = !!(opts && opts.leukBereikbaar);
    var bronnen = data.bronnen || {};
    var catalog = data.aanbieders || {};
    var interventies = (data.interventies || []).map(function (iv) {
      var leukWeggelaten = false;
      var banden = ((iv.marktbandbreedte && iv.marktbandbreedte.banden) || []).map(function (band) {
        return {
          id: band.id,
          eenheid: plain(band.eenheid),
          laag: typeof band.laag === 'number' ? band.laag : null,
          midden: typeof band.midden === 'number' ? band.midden : null,
          hoog: typeof band.hoog === 'number' ? band.hoog : null,
          n: typeof band.n === 'number' ? band.n : null,
          karakter: plain(band.karakter || '')
        };
      });
      var aanbieders = (iv.aanbieders || []).map(function (raw) {
        var mode = priceMode(iv.id, raw.aanbieder_id);
        var profile = catalog[raw.aanbieder_id] || {};
        var marks = marksOf(profile.certificeringen);
        var prijzen = [];
        if (mode === 'show') {
          var mapped = mapPrices(raw.prijzen, bronnen, leukOk);
          prijzen = mapped.prijzen;
          if (mapped.leukWeg) leukWeggelaten = true;
        }
        var garantieBron = raw.garantie && bronnen[raw.garantie.bron];
        var resultaatJa = !!(raw.no_cure_no_pay && String(raw.no_cure_no_pay.waarde || '').indexOf('ja') === 0);
        var eigenBron = null;
        if (mode === 'eigen-ad') {
          var eerste = (raw.prijzen || [])[0];
          var eigenBronData = eerste && bronnen[eerste.bron];
          if (eigenBronData && safeUrl(eigenBronData.url)) {
            eigenBron = { url: safeUrl(eigenBronData.url), titel: plain(eigenBronData.titel || 'Bron') };
          }
        }
        return {
          id: raw.aanbieder_id,
          naam: plain(profile.naam || raw.aanbieder_id),
          website: safeUrl(profile.website),
          mode: mode,
          prijzen: prijzen,
          nietOpenbaar: mode !== 'eigen-ad' && isClosed(raw),
          eigenAd: mode === 'eigen-ad',
          eigen: mode === 'eigen' || mode === 'eigen-ad',
          landelijkJa: !!(profile.landelijk && profile.landelijk.waarde === 'ja'),
          keurmerken: marks.labels,
          bow: marks.bow,
          sbca: marks.sbca,
          resultaatJa: resultaatJa,
          garantieJa: !!(raw.garantie && typeof raw.garantie === 'object'),
          garantieUrl: garantieBron ? safeUrl(garantieBron.url) : '',
          reviews: mode === 'show' ? reviewsOf(profile, bronnen) : [],
          eigenBron: eigenBron
        };
      });
      var parameters = (iv.parameters || []).filter(function (param) {
        return !SKIP_PARAM[param.id];
      }).map(function (param) {
        return {
          id: param.id,
          type: param.type,
          label: plain(param.label),
          opties: (param.opties || []).map(plain)
        };
      }).filter(function (param) { return param.label; });
      var id = publicId(iv.id);
      return {
        id: id,
        naam: NAMEN[id] || plain(iv.naam),
        tab: TABS[id] || plain(iv.naam),
        omschrijving: plain(iv.omschrijving),
        prijsbasis: plain(iv.prijsbasis_standaard),
        banden: banden,
        leukWeggelaten: leukWeggelaten,
        parameters: parameters,
        aanbieders: aanbieders
      };
    });
    return {
      peildatum: PEILDATUM,
      leukBereikbaar: leukOk,
      interventies: interventies
    };
  }

  function defaultState() {
    return {
      interventie: 'arbeidsdeskundig-onderzoek',
      medewerkers: '',
      dossiers: '',
      alleenOpenbaar: false,
      landelijk: false,
      keurmerken: false,
      sort: 'prijs-op',
      extra: {},
      vergelijk: [],
      melding: '',
      financiering: 'publiek'
    };
  }

  function hasOpenbarePrijs(aanbieder) {
    return aanbieder.eigenAd || aanbieder.prijzen.length > 0;
  }

  function passes(aanbieder, state) {
    if (state.alleenOpenbaar && !hasOpenbarePrijs(aanbieder)) return false;
    if (state.landelijk && !aanbieder.landelijkJa) return false;
    if (state.keurmerken && !aanbieder.keurmerken.length) return false;
    var extra = state.extra || {};
    if (extra.blik_op_werk && !aanbieder.bow) return false;
    if (extra.sbca && !aanbieder.sbca) return false;
    if (extra.garantie && !aanbieder.garantieJa) return false;
    return true;
  }

  function sortKey(aanbieder) {
    if (!aanbieder.prijzen.length) return null;
    var min = null;
    aanbieder.prijzen.forEach(function (prijs) {
      if (min == null || prijs.bedrag < min) min = prijs.bedrag;
    });
    return min;
  }

  function sorted(list, sort) {
    return list.slice().sort(function (a, b) {
      if (sort === 'naam') return a.naam.localeCompare(b.naam, 'nl');
      var ka = sortKey(a);
      var kb = sortKey(b);
      if (ka == null && kb == null) return a.naam.localeCompare(b.naam, 'nl');
      if (ka == null) return 1;
      if (kb == null) return -1;
      return sort === 'prijs-af' ? kb - ka : ka - kb;
    });
  }

  function focusedBandId(iv, extra) {
    var keuze = extra || {};
    if (keuze.tariefvorm === 'uurtarief') {
      var uur = null;
      iv.banden.forEach(function (item) {
        if (!uur && (item.id === 'per_uur' || /per uur/i.test(item.eenheid))) uur = item;
      });
      return uur ? uur.id : null;
    }
    if (keuze.tariefvorm === 'vast tarief per onderzoek') {
      var vast = null;
      iv.banden.forEach(function (item) {
        if (!vast && item.id === 'per_onderzoek') vast = item;
      });
      return vast ? vast.id : null;
    }
    var duur = keuze.duur || '';
    var want = duur === '6 maanden' ? '6'
      : duur === '9 maanden' ? '9'
        : (duur === '12 maanden' || duur === 'tot 12 maanden') ? '12'
          : '';
    if (!want) return null;
    var band = null;
    iv.banden.forEach(function (item) {
      if (band) return;
      if (String(item.id).indexOf(want + '_') === 0 || new RegExp('(^|\\D)' + want + ' maanden').test(item.eenheid)) band = item;
    });
    return band ? band.id : null;
  }

  function dossiersLabel(iv) {
    var found = '';
    (iv.parameters || []).forEach(function (item) {
      if (!found && (item.id === 'aantal_dossiers' || item.id === 'aantal_trajecten')) found = item.label;
    });
    return found || 'Aantal dossiers per jaar';
  }

  function medewerkersLabel(iv) {
    var found = '';
    (iv.parameters || []).forEach(function (item) {
      if (!found && (item.id === 'medewerkers' || item.id === 'aantal_personen' || item.id === 'bedrijfsgrootte')) found = item.label;
    });
    if (!found || found === 'Aantal medewerkers') return 'Aantal medewerkers';
    return found;
  }

  function renderBron(prijs) {
    var titel = esc(prijs.bronTitel) + ', peildatum ' + PEILDATUM;
    if (!prijs.bronUrl) return titel;
    return '<a href="' + esc(prijs.bronUrl) + '" rel="noopener noreferrer">' + titel + '</a>';
  }

  function renderPrijs(prijs, medewerkers, dossiers) {
    var meta = [prijs.eenheid, prijs.btw, prijs.tariefjaar ? 'tariefjaar ' + prijs.tariefjaar : ''].filter(Boolean).join(', ');
    var berekening = jaarTekst(prijs, medewerkers, dossiers);
    return '<div class="vgl-prijs">'
      + '<p class="vgl-prijs-label">' + esc(prijs.label) + '</p>'
      + '<p class="vgl-bedrag">' + esc(formatPrijsBedrag(prijs)) + '</p>'
      + '<p class="vgl-meta">' + esc(meta) + '</p>'
      + '<p class="vgl-bron">Bron: ' + renderBron(prijs) + '</p>'
      + '<p class="vgl-jaar">Jaarkosten: ' + (berekening ? esc(berekening) + '. Indicatie op basis van openbare tarieven.' : 'niet te berekenen') + '</p>'
      + '</div>';
  }

  function renderCard(aanbieder, state, compact) {
    var medewerkers = parseCount(state.medewerkers);
    var dossiers = parseCount(state.dossiers);
    var checked = state.vergelijk.indexOf(aanbieder.id) !== -1;
    var prijzen = '';
    if (aanbieder.eigenAd) {
      var eigenBronHtml = 'Bron: arbeidsdeskundig.com, peildatum ' + PEILDATUM;
      if (aanbieder.eigenBron && aanbieder.eigenBron.url) {
        eigenBronHtml = 'Bron: <a href="' + esc(aanbieder.eigenBron.url) + '" rel="noopener noreferrer">' + esc(aanbieder.eigenBron.titel) + ', peildatum ' + PEILDATUM + '</a>';
      }
      prijzen = '<p class="vgl-eigen">' + esc(EIGEN_AD) + '</p><p class="vgl-bron">' + eigenBronHtml + '</p>';
    } else if (aanbieder.prijzen.length) {
      prijzen = aanbieder.prijzen.map(function (prijs) {
        return renderPrijs(prijs, medewerkers, dossiers);
      }).join('');
    } else if (aanbieder.nietOpenbaar) {
      prijzen = '<p class="vgl-gesloten">prijs niet openbaar</p>';
    } else if (aanbieder.eigen) {
      prijzen = '<p class="vgl-note">Voor dit aanbod vraagt u een offerte aan. Er staat hier geen eigen richttarief.</p>';
    } else {
      prijzen = '<p class="vgl-jaar">Jaarkosten: niet te berekenen</p>';
    }
    var feiten = [];
    aanbieder.keurmerken.forEach(function (label) { feiten.push(esc(label)); });
    if (aanbieder.landelijkJa) feiten.push('Landelijk: ja');
    if (aanbieder.garantieJa) {
      feiten.push(aanbieder.garantieUrl
        ? 'Garantie gepubliceerd: ja (<a href="' + esc(aanbieder.garantieUrl) + '" rel="noopener noreferrer">bron, peildatum ' + PEILDATUM + '</a>)'
        : 'Garantie gepubliceerd: ja');
    }
    var reviews = (aanbieder.reviews || []).map(function (review) {
      var resp = review.respondenten != null ? ', ' + review.respondenten + ' respondenten' : '';
      var periode = review.periode ? ', ' + esc(review.periode) : '';
      return '<p class="vgl-review">Blik op Werk, ' + esc(review.groep) + ': ' + esc(formatCijfer(review.cijfer)) + esc(resp) + periode
        + '. Bron: <a href="' + esc(review.bronUrl) + '" rel="noopener noreferrer">' + esc(review.bronTitel) + ', peildatum ' + PEILDATUM + '</a></p>';
    }).join('');
    var naam = aanbieder.website
      ? '<a href="' + esc(aanbieder.website) + '" rel="noopener noreferrer">' + esc(aanbieder.naam) + '</a>'
      : esc(aanbieder.naam);
    var compare = compact ? '' : (
      '<label class="vgl-check"><input class="vgl-cmp" type="checkbox" value="' + esc(aanbieder.id) + '"' + (checked ? ' checked' : '') + '> Vergelijk</label>'
    );
    return '<article class="vgl-card">'
      + '<h3>' + naam + '</h3>'
      + compare
      + prijzen
      + (feiten.length ? '<ul class="vgl-feiten">' + feiten.map(function (feit) { return '<li>' + feit + '</li>'; }).join('') + '</ul>' : '')
      + reviews
      + '</article>';
  }

  function renderBands(iv, state) {
    if (!iv.banden.length) {
      return '<p class="vgl-note">Voor deze interventie staat geen bandbreedte in de bron.</p>';
    }
    var focus = focusedBandId(iv, state.extra);
    var duur = (state.extra || {}).duur || '';
    var duurZonderBand = duur && !focus && /maand/.test(duur);
    var rows = iv.banden.map(function (band) {
      var hoog = typeof band.hoog === 'number' && band.hoog > 0 ? band.hoog : null;
      var items = [
        ['laag', band.laag],
        ['midden', band.midden],
        ['hoog', band.hoog]
      ].filter(function (pair) { return typeof pair[1] === 'number'; });
      var bars = items.map(function (pair) {
        var width = hoog ? Math.max(4, Math.round((pair[1] / hoog) * 100)) : 100;
        return '<div class="vgl-bar-row"><span>' + pair[0] + '</span><span class="vgl-bar-track"><span class="vgl-bar" style="width:' + width + '%"></span></span><span>' + esc(formatBandWaarde(band, pair[1])) + '</span></div>';
      }).join('');
      var aria = items.map(function (pair) { return pair[0] + ' ' + formatBandWaarde(band, pair[1]); }).join(', ');
      var n = band.n != null ? 'n = ' + band.n : '';
      return '<figure class="vgl-band' + (focus === band.id ? ' is-focus' : '') + '">'
        + '<figcaption>' + esc(band.eenheid) + (n ? '. ' + n : '') + '</figcaption>'
        + '<div class="vgl-bars" role="img" aria-label="' + esc(aria) + '">' + bars + '</div>'
        + (band.karakter ? '<p class="vgl-note">' + esc(band.karakter) + '</p>' : '')
        + '</figure>';
    }).join('');
    var letop = duurZonderBand
      ? '<p class="vgl-note">Voor deze duur staat geen aparte bandbreedte in de bron.</p>'
      : '';
    var leuk = iv.leukWeggelaten
      ? '<p class="vgl-note">De prijslijst van Leuk Personeel was niet bereikbaar. Die prijzen staan niet in deze lijst. De bandbreedte blijft de gepubliceerde steekproef.</p>'
      : '';
    return '<div class="vgl-banden"><h2>Bandbreedte</h2>' + rows + letop + leuk + '</div>';
  }

  function renderParams(iv, state) {
    var extra = state.extra || {};
    var fields = (iv.parameters || []).map(function (param) {
      if (param.type === 'ja/nee') {
        var on = extra[param.id] === true;
        return '<label class="vgl-check"><input class="vgl-extra-check" type="checkbox" name="' + esc(param.id) + '"' + (on ? ' checked' : '') + '> ' + esc(param.label) + '</label>';
      }
      if (param.type === 'keuze') {
        var options = ['<option value="">Geen voorkeur</option>'].concat((param.opties || []).map(function (optie) {
          var selected = extra[param.id] === optie ? ' selected' : '';
          return '<option value="' + esc(optie) + '"' + selected + '>' + esc(optie) + '</option>';
        }));
        return '<label class="vgl-field"><span>' + esc(param.label) + '</span><select class="vgl-extra-select" name="' + esc(param.id) + '">' + options.join('') + '</select></label>';
      }
      var value = extra[param.id] ? esc(extra[param.id]) : '';
      return '<label class="vgl-field"><span>' + esc(param.label) + '</span><input class="vgl-extra-num" id="vgl-extra-' + esc(param.id) + '" name="' + esc(param.id) + '" type="number" min="1" inputmode="numeric" value="' + value + '"></label>';
    }).join('');
    var groep = bucket(parseCount(state.medewerkers));
    return '<div class="vgl-params">'
      + '<label class="vgl-field"><span>' + esc(medewerkersLabel(iv)) + '</span><input id="vgl-medewerkers" type="number" min="1" inputmode="numeric" value="' + esc(state.medewerkers) + '"></label>'
      + '<label class="vgl-field"><span>' + esc(dossiersLabel(iv)) + '</span><input id="vgl-dossiers" type="number" min="1" max="50" inputmode="numeric" value="' + esc(state.dossiers) + '"></label>'
      + (groep ? '<p class="vgl-note">Bedrijfsgrootte: ' + esc(groep) + ' medewerkers.</p>' : '')
      + fields
      + '</div>';
  }

  function renderApp(model, state) {
    var iv = null;
    (model.interventies || []).forEach(function (item) {
      if (!iv && item.id === state.interventie) iv = item;
    });
    if (!iv) iv = (model.interventies || [])[0];
    if (!iv) return '';
    var tabs = model.interventies.map(function (item) {
      var on = item.id === iv.id ? ' is-on' : '';
      var selected = item.id === iv.id ? 'true' : 'false';
      return '<button type="button" class="vgl-tab' + on + '" role="tab" data-vgl-tab="' + esc(item.id) + '" aria-selected="' + selected + '">' + esc(item.tab) + '</button>';
    }).join('');
    var lijst = sorted(iv.aanbieders.filter(function (item) { return passes(item, state); }), state.sort);
    var gekozen = [];
    state.vergelijk.forEach(function (id) {
      if (gekozen.length >= 3) return;
      iv.aanbieders.forEach(function (item) {
        if (item.id === id && gekozen.length < 3) gekozen.push(item);
      });
    });
    var compare = gekozen.length
      ? '<div class="vgl-naast"><h2>Naast elkaar</h2><div class="vgl-compare cols-' + gekozen.length + '">'
        + gekozen.map(function (item) { return renderCard(item, state, true); }).join('')
        + '</div></div>'
      : '';
    return '<div class="vgl-tools">'
      + '<div class="vgl-tabs" role="tablist">' + tabs + '</div>'
      + '<div class="vgl-filters">'
      + '<label class="vgl-check"><input class="vgl-flag" type="checkbox" name="alleenOpenbaar"' + (state.alleenOpenbaar ? ' checked' : '') + '> Alleen openbare prijs</label>'
      + '<label class="vgl-check"><input class="vgl-flag" type="checkbox" name="landelijk"' + (state.landelijk ? ' checked' : '') + '> Landelijk</label>'
      + '<label class="vgl-check"><input class="vgl-flag" type="checkbox" name="keurmerken"' + (state.keurmerken ? ' checked' : '') + '> Keurmerken</label>'
      + '<label class="vgl-field vgl-sort-field"><span>Sorteer op prijs</span><select class="vgl-sort">'
      + '<option value="prijs-op"' + (state.sort === 'prijs-op' ? ' selected' : '') + '>Prijs oplopend</option>'
      + '<option value="prijs-af"' + (state.sort === 'prijs-af' ? ' selected' : '') + '>Prijs aflopend</option>'
      + '<option value="naam"' + (state.sort === 'naam' ? ' selected' : '') + '>Naam</option>'
      + '</select></label>'
      + '</div>'
      + renderParams(iv, state)
      + (state.melding ? '<p class="vgl-melding" role="status">' + esc(state.melding) + '</p>' : '')
      + '</div>'
      + '<div class="vgl-result">'
      + '<h2>' + esc(iv.naam) + '</h2>'
      + '<p>' + esc(iv.omschrijving) + '</p>'
      + '<p class="vgl-note">Prijsbasis: ' + esc(iv.prijsbasis) + '</p>'
      + renderBands(iv, state)
      + '<p class="vgl-cta-row"><a class="btn btn-risk vgl-cta" href="#vgl-offerte">' + esc(CTA_LABEL) + '</a></p>'
      + compare
      + '<div class="vgl-list">' + (lijst.length ? lijst.map(function (item) { return renderCard(item, state, false); }).join('') : '<p>Geen aanbieders met deze filters.</p>') + '</div>'
      + '<p class="vgl-cta-row"><a class="btn btn-risk vgl-cta" href="#vgl-offerte">' + esc(CTA_LABEL) + '</a></p>'
      + '</div>';
  }

  function disclaimerHtml() {
    var linked = DISCLAIMER.replace(
      'Laat het ons weten, dan passen we het aan.',
      '<a href="mailto:info@werkhervattingskas.nl?subject=Onjuistheid%20in%20de%20vergelijkingstool">Laat het ons weten</a>, dan passen we het aan.'
    );
    return '<p class="vgl-disclaimer">' + linked + '</p>';
  }

  function faqHtml() {
    var items = FAQS.map(function (pair) {
      return '<h3>' + esc(pair[0]) + '</h3><p>' + esc(pair[1]) + '</p>';
    }).join('');
    return '<h2>Veelgestelde vragen</h2><div id="vgl-faq-list">' + items + '</div>';
  }

  function datasetJsonLd(data) {
    var citations = [];
    Object.keys(data.bronnen || {}).forEach(function (key) {
      var bron = data.bronnen[key];
      var url = bron && safeUrl(bron.url);
      if (!url) return;
      if (/werkhervattingskas\.nl\/tarieven/i.test(url)) return;
      var name = bronTitel(bron);
      if (!name) return;
      citations.push({ '@type': 'CreativeWork', name: name, url: url });
    });
    return {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Openbare tarieven van interventies bij verzuim',
      description: 'Steekproef van openbare tarieven van derden, peildatum 28 november 2026. Elk bedrag heeft een bron. Eigen aanbod telt niet mee in de bandbreedte.',
      dateModified: '2026-11-28',
      inLanguage: 'nl-NL',
      creator: { '@type': 'Organization', name: 'werkhervattingskas.nl', url: 'https://werkhervattingskas.nl/' },
      url: 'https://werkhervattingskas.nl/tools/vergelijken-interventies',
      citation: citations
    };
  }

  function webAppJsonLd() {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Interventies vergelijken: kosten, kwaliteit en de Whk-premie',
      url: 'https://werkhervattingskas.nl/tools/vergelijken-interventies',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'nl-NL',
      isAccessibleForFree: true,
      description: 'Vergelijk openbare tarieven van interventies bij verzuim, met bron en peildatum 28 november 2026, en lees wat de keuze betekent voor WGA-instroom en de Whk-premie.',
      provider: { '@type': 'Organization', name: 'werkhervattingskas.nl', url: 'https://werkhervattingskas.nl/' }
    };
  }

  function faqPairs() {
    return FAQS.map(function (pair) {
      return { question: pair[0], answer: pair[1] };
    });
  }

  function modelJson(model) {
    return JSON.stringify(model).replace(/</g, '\\u003c');
  }

  function leukUrl(data) {
    var bron = data && data.bronnen && data.bronnen.leuk_2026;
    return bron ? safeUrl(bron.url) : '';
  }

  var leukCache = { at: 0, ok: null };

  function bronBereikbaar(url) {
    if (!url) return Promise.resolve(false);
    var now = Date.now();
    if (leukCache.ok !== null && now - leukCache.at < 10 * 60 * 1000) {
      return Promise.resolve(leukCache.ok);
    }
    var fetcher = typeof fetch === 'function' ? fetch : null;
    if (!fetcher) return Promise.resolve(false);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 2000);
    var opts = { method: 'HEAD', redirect: 'follow' };
    if (ctrl) opts.signal = ctrl.signal;
    return fetcher(url, opts).then(function (res) {
      if (res.status === 405 || res.status === 501) {
        var getOpts = { method: 'GET', redirect: 'follow' };
        if (ctrl) getOpts.signal = ctrl.signal;
        return fetcher(url, getOpts);
      }
      return res;
    }).then(function (res) {
      var ok = !!(res && res.ok);
      leukCache = { at: Date.now(), ok: ok };
      return ok;
    }).catch(function () {
      leukCache = { at: Date.now(), ok: false };
      return false;
    }).then(function (ok) {
      clearTimeout(timer);
      return ok;
    });
  }

  function loadData() {
    var fs = require('fs');
    var path = require('path');
    var file = path.join(__dirname, '..', 'data', 'vergelijkingstool.json');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  function ga(name) {
    try {
      var w = typeof window !== 'undefined' ? window : null;
      if (!w) return;
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({ event: name });
      if (typeof w.gtag === 'function') w.gtag('event', name);
    } catch (err) { /* meting mag de tool niet stoppen */ }
  }

  function formToken() {
    var node = document.querySelector('input[name="whk_ts"]');
    if (node && node.value) return node.value;
    var boot = window.WHK_FORM_GUARD;
    return boot && boot.token ? boot.token : '';
  }

  function financieringLabel(value) {
    return value === 'eigenrisicodrager' ? 'eigenrisicodrager' : 'publiek verzekerd';
  }

  function boot() {
    var rootEl = document.getElementById('vgl-app');
    var modelEl = document.getElementById('vgl-model');
    if (!rootEl || !modelEl || !rootEl.isConnected) return;
    if (rootEl.getAttribute('data-vgl-booted') === '1') return;
    var raw = (modelEl.textContent || '').trim();
    if (!raw) return;
    var model;
    try { model = JSON.parse(raw); } catch (err) { return; }
    if (!model || !model.interventies || !model.interventies.length) return;
    rootEl.setAttribute('data-vgl-booted', '1');
    var state = defaultState();
    var params = new URLSearchParams(window.location.search);
    var gekozen = params.get('interventie');
    var bekend = false;
    model.interventies.forEach(function (item) { if (item.id === gekozen) bekend = true; });
    if (bekend) state.interventie = gekozen;
    if (parseCount(params.get('medewerkers'))) state.medewerkers = String(parseCount(params.get('medewerkers')));
    if (parseCount(params.get('dossiers'))) state.dossiers = String(parseCount(params.get('dossiers')));
    var fin = document.querySelector('input[name="vgl-financiering"]:checked');
    if (fin) state.financiering = fin.value;

    function paint() {
      var focus = document.activeElement;
      var fid = focus && focus.id;
      var sel = focus && typeof focus.selectionStart === 'number' ? focus.selectionStart : null;
      rootEl.innerHTML = renderApp(model, state);
      if (fid) {
        var next = document.getElementById(fid);
        if (next) {
          next.focus();
          if (sel != null && next.setSelectionRange) {
            try { next.setSelectionRange(sel, sel); } catch (err) { /* number inputs */ }
          }
        }
      }
    }

    rootEl.addEventListener('click', function (ev) {
      var tab = ev.target.closest && ev.target.closest('[data-vgl-tab]');
      if (tab) {
        state.interventie = tab.getAttribute('data-vgl-tab');
        state.vergelijk = [];
        state.extra = {};
        state.melding = '';
        ga('vgl_filter');
        paint();
        return;
      }
      var cta = ev.target.closest && ev.target.closest('.vgl-cta');
      if (cta) ga('vgl_cta_click');
    });
    rootEl.addEventListener('change', function (ev) {
      var target = ev.target;
      if (target.classList.contains('vgl-sort')) {
        state.sort = target.value;
        ga('vgl_filter');
        paint();
        return;
      }
      if (target.classList.contains('vgl-flag')) {
        state[target.name] = target.checked;
        ga('vgl_filter');
        paint();
        return;
      }
      if (target.classList.contains('vgl-extra-check')) {
        state.extra[target.name] = target.checked;
        ga('vgl_filter');
        paint();
        return;
      }
      if (target.classList.contains('vgl-extra-select')) {
        state.extra[target.name] = target.value;
        ga('vgl_filter');
        paint();
        return;
      }
      if (target.classList.contains('vgl-cmp')) {
        var id = target.value;
        if (target.checked) {
          if (state.vergelijk.indexOf(id) === -1) {
            if (state.vergelijk.length >= 3) state.melding = 'Maximaal 3 aanbieders naast elkaar.';
            else {
              state.vergelijk.push(id);
              state.melding = '';
            }
          }
        } else {
          state.vergelijk = state.vergelijk.filter(function (item) { return item !== id; });
          state.melding = '';
        }
        ga('vgl_filter');
        paint();
      }
    });
    var paintTimer = null;
    rootEl.addEventListener('input', function (ev) {
      var target = ev.target;
      if (target.id === 'vgl-medewerkers') state.medewerkers = target.value;
      else if (target.id === 'vgl-dossiers') state.dossiers = target.value;
      else if (target.classList.contains('vgl-extra-num')) state.extra[target.name] = target.value;
      else return;
      clearTimeout(paintTimer);
      paintTimer = setTimeout(function () {
        ga('vgl_filter');
        paint();
      }, 220);
    });

    var finInputs = document.querySelectorAll('input[name="vgl-financiering"]');
    finInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        state.financiering = input.value;
        var panels = document.querySelectorAll('[data-vgl-fin]');
        panels.forEach(function (panel) {
          panel.classList.toggle('is-on', panel.getAttribute('data-vgl-fin') === input.value);
        });
        ga('vgl_filter');
      });
    });

    var form = document.getElementById('vgl-offerte');
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        ga('vgl_cta_click');
        var naam = (document.getElementById('vgl-naam') || {}).value || '';
        var tel = (document.getElementById('vgl-tel') || {}).value || '';
        var email = (document.getElementById('vgl-email') || {}).value || '';
        var hp = (document.getElementById('vgl-hp') || {}).value || '';
        var ivNaam = state.interventie;
        model.interventies.forEach(function (item) {
          if (item.id === state.interventie) ivNaam = item.naam;
        });
        var message = 'Interventie: ' + ivNaam
          + '. Financiering: ' + financieringLabel(state.financiering)
          + (parseCount(state.medewerkers) ? '. Medewerkers: ' + parseCount(state.medewerkers) : '')
          + (parseCount(state.dossiers) ? '. Dossiers per jaar: ' + parseCount(state.dossiers) : '');
        var fields = {
          name: naam,
          phone: tel,
          email: email,
          honeypot: hp,
          source: 'vergelijkingstool',
          message: message,
          page: window.location.href
        };
        var err = document.getElementById('vgl-offerte-err');
        var ok = document.getElementById('vgl-offerte-ok');
        if (window.LeadGuard && LeadGuard.classify) {
          var classified = LeadGuard.classify(fields);
          if (!classified.ok) {
            if (err) {
              err.hidden = false;
              err.textContent = classified.error || 'Naam en telefoon of e-mail zijn verplicht.';
            }
            return;
          }
        }
        if (err) err.hidden = true;
        var body = {
          name: String(naam).trim(),
          phone: String(tel).trim(),
          email: String(email).trim(),
          source: 'vergelijkingstool',
          message: message,
          page: window.location.href,
          website: hp,
          whk_ts: formToken()
        };
        var leadUrl = form.getAttribute('data-lead-url') || '/api/leads';
        fetch(leadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        }).then(function (res) {
          if (!res.ok) {
            if (err) {
              err.hidden = false;
              err.textContent = (res.data && res.data.error) || 'Versturen is niet gelukt. Probeer het opnieuw.';
            }
            return;
          }
          if (ok) ok.hidden = false;
          form.reset();
        }).catch(function () {
          if (err) {
            err.hidden = false;
            err.textContent = 'Versturen is niet gelukt. Probeer het opnieuw of bel 085-0870307.';
          }
        });
      });
    }

    ga('vgl_start');
    paint();
  }

  return {
    PEILDATUM: PEILDATUM,
    EIGEN_AD: EIGEN_AD,
    CTA_LABEL: CTA_LABEL,
    DISCLAIMER: DISCLAIMER,
    FAQS: FAQS,
    prepareModel: prepareModel,
    defaultState: defaultState,
    renderApp: renderApp,
    disclaimerHtml: disclaimerHtml,
    faqHtml: faqHtml,
    faqPairs: faqPairs,
    datasetJsonLd: datasetJsonLd,
    webAppJsonLd: webAppJsonLd,
    modelJson: modelJson,
    leukUrl: leukUrl,
    bronBereikbaar: bronBereikbaar,
    loadData: loadData,
    boot: boot,
    formatEuro: formatEuro,
    jaarTekst: jaarTekst,
    parseCount: parseCount
  };
});
