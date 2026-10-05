'use strict';

// The site is one HTML document with a section per route. Serving that whole
// document made every URL contain every heading. This module keeps the shell
// (header, footer, modals, script) and only the section for the requested URL.
// The homepage also keeps the calculator result step (not its own URL, no h1).
// /admin keeps the login form and the admin panel (panel uses h2).

const ROUTE_VIEWS = {
  '/': 'home-view',
  '/over-ons': 'overons-view',
  '/aanpak': 'aanpak-view',
  '/diensten': 'diensten-view',
  '/faq': 'faq-view',
  '/blog': 'blog-view',
  '/tools': 'tools-view',
  '/tarieven': 'pricing-view',
  '/sectoren': 'sectors-view',
  '/casestudies': 'casestudies-view',
  '/beschikking-uitleg': 'beschikking-uitleg-view',
  '/vergelijking': 'vergelijking-view',
  '/tools/poortwachter': 'poortwachter-view',
  '/tools/wia-calculator': 'wia-calc-view',
  '/tools/subsidie-scan': 'subsidie-scan-view',
  '/tools/jaarkalender': 'kalender-view',
  '/tools/premiehistorie': 'premiehistorie-view',
  '/tools/interventie-check': 'interventie-check-view',
  '/tools/preventie-calculator': 'preventie-calculator-view',
  '/besparingen': 'besparingen-overzicht-view',
  '/lexicon': 'lexicon-view',
  '/quiz': 'quiz-view',
  '/privacy': 'privacy-view',
  '/voor/controller': 'controller-view',
  '/voor/hr-manager': 'doelgroep-hr-view',
  '/voor/casemanager': 'doelgroep-casemanager-view',
  '/voor/directeur': 'doelgroep-directeur-view',
  '/voor/tussenpersoon': 'doelgroep-tussenpersoon-view',
  '/diensten/whk-controle': 'dienst-whkreductie-view',
  '/diensten/besparingsonderzoek': 'dienst-besparingsonderzoek-view',
  '/diensten/letselschade': 'dienst-letselschade-view',
  '/diensten/arbeidsdeskundig-onderzoek': 'dienst-arbeidsdeskundig-view',
  '/diensten/tweede-spoor': 'dienst-tweedespoor-view',
  '/diensten/consultancy': 'dienst-consultancy-view',
  '/diensten/erd-partneradvies': 'dienst-partneradvies-view',
  '/admin': 'login-view'
};

// Sections that belong to the same URL but are not the visible landing step.
const COMPANIONS = {
  '/': ['results-view'],
  '/admin': ['admin-view']
};

function viewsFor(canonPath) {
  if (ROUTE_VIEWS[canonPath]) {
    return { primary: ROUTE_VIEWS[canonPath], extra: COMPANIONS[canonPath] || [] };
  }
  if (canonPath.indexOf('/blog/') === 0 && canonPath.length > '/blog/'.length) {
    return { primary: 'blogpost-view', extra: [] };
  }
  if (/^\/sectoren\/[a-z0-9-]+$/.test(canonPath)) {
    return { primary: 'sector-view', extra: [] };
  }
  return null;
}

function endOfElement(html, from, tag) {
  const openRe = new RegExp('<' + tag + '\\b', 'gi');
  const close = '</' + tag + '>';
  let depth = 1;
  let i = from;
  while (i < html.length && depth > 0) {
    const nextClose = html.toLowerCase().indexOf(close, i);
    if (nextClose === -1) return -1;
    openRe.lastIndex = i;
    const om = openRe.exec(html);
    const nextOpen = om ? om.index : -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + tag.length + 1;
    } else {
      depth -= 1;
      i = nextClose + close.length;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findPageSections(html) {
  const re = /<(main|section|div)\b[^>]*\bclass="[^"]*\bpage-section\b[^"]*"[^>]*>/g;
  const found = [];
  let m;
  while ((m = re.exec(html))) {
    const open = m[0];
    const idm = open.match(/\bid="([^"]+)"/);
    if (!idm) continue;
    const start = m.index;
    const end = endOfElement(html, start + open.length, m[1]);
    if (end < 0) continue;
    found.push({ id: idm[1], tag: m[1], start: start, end: end });
    re.lastIndex = end;
  }
  return found;
}

function withShow(openTag, on) {
  return openTag.replace(/class="([^"]*)"/, function (_, cls) {
    const parts = cls.split(/\s+/).filter(function (c) { return c && c !== 'show'; });
    if (on) parts.push('show');
    return 'class="' + parts.join(' ') + '"';
  });
}

function escText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nlLongDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const month = months[parseInt(m[2], 10) - 1];
  if (!month) return '';
  return String(parseInt(m[3], 10)) + ' ' + month + ' ' + m[1];
}

function fillBlog(sectionHtml, post) {
  if (!post || !post.title) return sectionHtml;
  const title = escText(post.title);
  let out = sectionHtml.replace(
    /<h1 id="blogpost-title"><\/h1>/,
    '<h1 id="blogpost-title">' + title + '</h1>'
  );
  if (post.publishedAt) {
    const published = nlLongDate(post.publishedAt);
    const modified = nlLongDate(post.updatedAt || post.publishedAt);
    let meta = 'Door Niels Alderding · Gepubliceerd op ' + published;
    if (modified) meta += ' · Bijgewerkt op ' + modified;
    out = out.replace(
      '<div class="meta" id="blogpost-meta"></div>',
      '<div class="meta" id="blogpost-meta">' + escText(meta) + '</div>'
    );
    out = out.replace(
      '<div id="blogpost-author"></div>',
      '<div id="blogpost-author"><div class="author-bar"><div class="author-info"><strong>Niels Alderding</strong><span>Directeur &amp; erkend arbeidsdeskundige</span></div></div></div>'
    );
  }
  if (post.bodyHtml) {
    out = out.replace(
      '<div class="blogpost-body" id="blogpost-body"></div>',
      '<div class="blogpost-body" id="blogpost-body">' + post.bodyHtml + '</div>'
    );
  }
  return out;
}

function articleSchema(post, canonPath) {
  const url = 'https://werkhervattingskas.nl' + canonPath;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription || '',
    datePublished: String(post.publishedAt),
    dateModified: String(post.updatedAt || post.publishedAt),
    author: {
      '@type': 'Person',
      name: 'Niels Alderding',
      jobTitle: 'Directeur & erkend arbeidsdeskundige',
      url: 'https://www.linkedin.com/in/niels-alderding/'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Matchvermogen / Werkhervattingskas.nl',
      url: 'https://werkhervattingskas.nl'
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url: url,
    inLanguage: 'nl-NL'
  };
}

function appendJsonLd(html, id, schema) {
  const tag = '<script type="application/ld+json" id="' + id + '">\n' + JSON.stringify(schema, null, 2) + '\n</script>';
  if (html.indexOf('</head>') === -1) return html + tag;
  return html.replace('</head>', tag + '\n</head>');
}

function readSector(html, key) {
  if (!key || !/^[a-z0-9-]+$/.test(key)) return null;
  const blockAt = html.indexOf('var SECTOR_DATA = {');
  if (blockAt === -1) return null;
  const block = html.slice(blockAt, blockAt + 120000);
  const at = block.indexOf('\n    ' + key + ': {');
  if (at === -1) return null;
  const chunk = block.slice(at, at + 4000);
  const title = chunk.match(/\btitle:\s*'((?:\\'|[^'])*)'/);
  const intro = chunk.match(/\bintro:\s*'((?:\\'|[^'])*)'/);
  if (!title) return null;
  return {
    title: title[1].replace(/\\'/g, "'"),
    intro: intro ? intro[1].replace(/\\'/g, "'") : ''
  };
}

function fillSector(sectionHtml, sector) {
  if (!sector || !sector.title) return sectionHtml;
  let out = sectionHtml.replace(
    /<h1 id="sector-title"[^>]*><\/h1>/,
    '<h1 id="sector-title" style="font-size:clamp(1.6rem,3vw,2.4rem);margin-bottom:14px;max-width:760px;">' + escText(sector.title) + '</h1>'
  );
  if (sector.intro) {
    out = out.replace(
      /<p class="lede" id="sector-intro"[^>]*><\/p>/,
      '<p class="lede" id="sector-intro" style="max-width:640px;margin-bottom:40px;">' + escText(sector.intro) + '</p>'
    );
  }
  return out;
}

function isFaqType(node) {
  if (!node) return false;
  const t = node['@type'];
  if (t === 'FAQPage') return true;
  return Array.isArray(t) && t.indexOf('FAQPage') !== -1;
}

function stripSiteFaq(html, keep) {
  if (keep) return html;
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, function (full, json) {
    let data;
    try { data = JSON.parse(json); } catch (e) { return full; }
    if (!data || !Array.isArray(data['@graph'])) return full;
    const next = data['@graph'].filter(function (n) { return !isFaqType(n); });
    if (next.length === data['@graph'].length) return full;
    data['@graph'] = next;
    return '<script type="application/ld+json">\n' + JSON.stringify(data, null, 2) + '\n</script>';
  });
}

// Same shape as the client extractor: only questions that are in the article HTML.
function extractFaqPairs(bodyHtml) {
  // "vragen" is not a substring of the stem "vraag" (aa versus a).
  const idx = String(bodyHtml || '').indexOf('Veelgestelde vra');
  if (idx === -1) return [];
  const faqSection = bodyHtml.slice(idx);
  const pairs = [];
  const re = /<p><strong>(.*?)<\/strong>\s*(.*?)<\/p>/g;
  let m;
  while ((m = re.exec(faqSection)) !== null) {
    const question = m[1].replace(/<[^>]+>/g, '').trim();
    const answer = m[2].replace(/<[^>]+>/g, '').trim();
    if (question && answer) pairs.push({ question: question, answer: answer });
  }
  return pairs;
}

function appendFaqSchema(html, pairs) {
  if (!pairs.length) return html;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(function (p) {
      return {
        '@type': 'Question',
        name: p.question,
        acceptedAnswer: { '@type': 'Answer', text: p.answer }
      };
    })
  };
  const tag = '<script type="application/ld+json" id="route-faq-schema">\n' + JSON.stringify(schema, null, 2) + '\n</script>';
  if (html.indexOf('</head>') === -1) return html + tag;
  return html.replace('</head>', tag + '\n</head>');
}

function stripInline(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/\s+/g, ' ')
    .trim();
}

// Visible Q&A under the calculator. Stops before the CTA so the schema
// matches the questions a crawler can read, not the closing button.
function extractWiaFaqPairs(html) {
  const start = String(html || '').indexOf('id="wia-faq"');
  if (start === -1) return [];
  const cta = html.indexOf('id="wia-faq-cta"', start);
  const block = html.slice(start, cta === -1 ? start + 12000 : cta);
  const pairs = [];
  const re = /<h3\b[^>]*>([\s\S]*?)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(block)) !== null) {
    const question = stripInline(m[1]);
    const answer = stripInline(m[2]);
    if (question && answer) pairs.push({ question: question, answer: answer });
  }
  return pairs;
}

function renderRoute(html, canonPath, page) {
  const spec = viewsFor(canonPath);
  if (!spec || !html) return html;
  const keep = [spec.primary].concat(spec.extra);
  const sections = findPageSections(html);
  if (!sections.length) return html;
  const present = {};
  sections.forEach(function (sec) { present[sec.id] = true; });
  if (!present[spec.primary]) return html;

  let out = '';
  let cursor = 0;
  sections.forEach(function (sec) {
    out += html.slice(cursor, sec.start);
    if (keep.indexOf(sec.id) !== -1) {
      let chunk = html.slice(sec.start, sec.end);
      const openEnd = chunk.indexOf('>') + 1;
      const open = withShow(chunk.slice(0, openEnd), sec.id === spec.primary);
      chunk = open + chunk.slice(openEnd);
      if (sec.id === 'blogpost-view' && page && page.post) chunk = fillBlog(chunk, page.post);
      if (sec.id === 'sector-view' && page && page.sectorKey) {
        const sector = readSector(html, page.sectorKey);
        if (sector) chunk = fillSector(chunk, sector);
      }
      out += chunk;
    }
    cursor = sec.end;
  });
  out += html.slice(cursor);
  out = stripSiteFaq(out, spec.primary === 'faq-view');
  if (page && page.post && page.post.bodyHtml && spec.primary === 'blogpost-view') {
    const pairs = extractFaqPairs(page.post.bodyHtml);
    if (pairs.length && out.indexOf('>' + pairs[0].question) !== -1) {
      out = appendFaqSchema(out, pairs);
    }
  }
  if (page && page.post && page.post.publishedAt && page.post.title && spec.primary === 'blogpost-view') {
    out = appendJsonLd(out, 'route-article-schema', articleSchema(page.post, canonPath));
  }
  if (spec.primary === 'wia-calc-view') {
    const wiaPairs = extractWiaFaqPairs(out);
    if (wiaPairs.length) out = appendFaqSchema(out, wiaPairs);
  }
  return out;
}

module.exports = {
  ROUTE_VIEWS: ROUTE_VIEWS,
  renderRoute: renderRoute,
  findPageSections: findPageSections,
  extractFaqPairs: extractFaqPairs,
  extractWiaFaqPairs: extractWiaFaqPairs
};
