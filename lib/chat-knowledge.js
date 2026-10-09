'use strict';

// Kennisindex uit deze repo: markdown-artikelen, FAQ en pagina's in whk_verzuim.html.
// Externe bronnen komen hier niet in. Marketingzinnen die de bot niet mag herhalen
// worden uit de tekst gehaald voordat het model ze ziet.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'content', 'articles');
const HTML_FILE = path.join(ROOT, 'whk_verzuim.html');

const SECTION_IDS = [
  ['home-view', '/'],
  ['overons-view', '/over-ons'],
  ['aanpak-view', '/aanpak'],
  ['diensten-view', '/diensten'],
  ['faq-view', '/faq'],
  ['blog-view', '/blog'],
  ['tools-view', '/tools'],
  ['pricing-view', '/tarieven'],
  ['sectors-view', '/sectoren'],
  ['beschikking-uitleg-view', '/beschikking-uitleg'],
  ['poortwachter-view', '/tools/poortwachter'],
  ['wia-calc-view', '/tools/wia-calculator'],
  ['subsidie-scan-view', '/tools/subsidie-scan'],
  ['kalender-view', '/tools/jaarkalender'],
  ['premiehistorie-view', '/tools/premiehistorie'],
  ['interventie-check-view', '/tools/interventie-check'],
  ['dienst-whkreductie-view', '/diensten/whk-controle'],
  ['dienst-besparingsonderzoek-view', '/diensten/besparingsonderzoek'],
  ['dienst-letselschade-view', '/diensten/letselschade'],
  ['dienst-arbeidsdeskundig-view', '/diensten/arbeidsdeskundig-onderzoek'],
  ['dienst-tweedespoor-view', '/diensten/tweede-spoor'],
  ['dienst-consultancy-view', '/diensten/consultancy'],
  ['dienst-partneradvies-view', '/diensten/erd-partneradvies'],
  ['quiz-view', '/quiz'],
  ['privacy-view', '/privacy'],
  ['lexicon-view', '/lexicon'],
  ['controller-view', '/voor/controller'],
  ['doelgroep-hr-view', '/voor/hr-manager'],
  ['doelgroep-directeur-view', '/voor/directeur']
];

const STOP = Object.create(null);
'de het een van en of maar die dat dit deze voor met naar op bij uit ook als nog wel niet geen uw je jij wij we u om te is zijn was worden wordt kan kunt mijn onze hun er dan tot over door naar aan meer heel veel waar wat hoe waarom wanneer wie welke'.split(/\s+/).forEach(function (w) {
  STOP[w] = true;
});

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&euro;/gi, '€')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&mdash;|&ndash;/gi, ' ');
}

function stripTags(html) {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function scrub(text) {
  const parts = String(text || '').split(/(?<=[.!?])\s+/);
  return parts.filter(function (sentence) {
    if (/no[\s-]*cure[\s,]*no[\s-]*pay/i.test(sentence)) return false;
    if (/8\s+van\s+de\s+10/i.test(sentence)) return false;
    if (/(?:€|eur)\s*47[.\s]?000\b/i.test(sentence) || /\b47\.000\b/.test(sentence) || /\b47000\b/.test(sentence)) return false;
    if (/provisie/i.test(sentence)) return false;
    return true;
  }).join(' ').replace(/\s+/g, ' ').trim();
}

function windows(text, size, overlap) {
  const src = String(text || '').trim();
  if (!src) return [];
  if (src.length <= size) return [src];
  const out = [];
  const step = Math.max(200, size - overlap);
  for (let i = 0; i < src.length; i += step) {
    out.push(src.slice(i, i + size).trim());
    if (i + size >= src.length) break;
  }
  return out;
}

function parseFrontmatter(raw) {
  const m = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  m[1].split(/\r?\n/).forEach(function (line) {
    const i = line.indexOf(':');
    if (i === -1) return;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  });
  return { meta: meta, body: m[2] };
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

function extractSection(html, id) {
  const re = new RegExp('<(section|div|main)\\b[^>]*\\bid="' + id + '"[^>]*>', 'i');
  const m = re.exec(html);
  if (!m) return '';
  const end = endOfElement(html, m.index + m[0].length, m[1]);
  if (end < 0) return '';
  return html.slice(m.index, end);
}

function pushChunk(chunks, item) {
  const text = scrub(item.text);
  if (text.length < 40) return;
  windows(text, 1400, 180).forEach(function (part, idx) {
    chunks.push({
      id: item.id + (idx ? '-' + idx : ''),
      path: item.path,
      title: item.title,
      text: part
    });
  });
}

function loadArticles(chunks) {
  if (!fs.existsSync(ARTICLES)) return;
  fs.readdirSync(ARTICLES).forEach(function (file) {
    if (!file.endsWith('.md') || file.toLowerCase() === 'readme.md') return;
    const parsed = parseFrontmatter(fs.readFileSync(path.join(ARTICLES, file), 'utf8'));
    if (!parsed) return;
    const slug = parsed.meta.slug || file.replace(/\.md$/, '');
    const title = parsed.meta.title || slug;
    const body = parsed.body
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/[*_#>`]/g, ' ');
    pushChunk(chunks, {
      id: 'blog-' + slug,
      path: '/blog/' + slug,
      title: title,
      text: title + '. ' + (parsed.meta.description || '') + ' ' + body
    });
  });
}

function loadFaq(chunks, html) {
  const section = extractSection(html, 'faq-view');
  if (!section) return;
  const items = section.split('<div class="faq-item">').slice(1);
  items.forEach(function (block, i) {
    const qMatch = block.match(/<button class="faq-q">([\s\S]*?)<\/button>/i);
    const aMatch = block.match(/<div class="faq-a">([\s\S]*?)<\/div>/i);
    if (!qMatch || !aMatch) return;
    const q = stripTags(qMatch[1]);
    const a = stripTags(aMatch[1]);
    pushChunk(chunks, {
      id: 'faq-' + i,
      path: '/faq',
      title: q,
      text: 'Vraag: ' + q + ' Antwoord: ' + a
    });
  });
}

function loadSections(chunks, html) {
  SECTION_IDS.forEach(function (pair) {
    const raw = extractSection(html, pair[0]);
    if (!raw) return;
    const text = stripTags(raw);
    const heading = (raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
    pushChunk(chunks, {
      id: pair[0],
      path: pair[1],
      title: stripTags(heading || pair[1]),
      text: text
    });
  });
}

function buildIndex() {
  const chunks = [];
  let html = '';
  if (fs.existsSync(HTML_FILE)) html = fs.readFileSync(HTML_FILE, 'utf8');
  loadArticles(chunks);
  if (html) {
    loadFaq(chunks, html);
    loadSections(chunks, html);
  }
  chunks.unshift({
    id: 'contact',
    path: '/privacy',
    title: 'Contact',
    text: 'Contact met Werkhervattingskas.nl: telefoon 06-50213593, e-mail info@werkhervattingskas.nl, WhatsApp via hetzelfde nummer, en een terugbelverzoek op de site. De indicatieve WHK-check staat op de homepage. Privacyverklaring: /privacy. Tarieven: /tarieven. Diensten: /diensten/whk-controle, /diensten/arbeidsdeskundig-onderzoek, /diensten/erd-partneradvies. Bij twijfel doorverwijzen naar de WHK-check of contact. Eigenrisicodragerschap alleen uitleggen, niet verkopen.'
  });
  return chunks;
}

let cache = null;
function getIndex() {
  if (!cache) cache = buildIndex();
  return cache;
}

function tokens(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s-]/gi, ' ')
    .split(/\s+/)
    .filter(function (t) { return t.length > 2 && !STOP[t]; });
}

function retrieve(query, limit) {
  const index = getIndex();
  const want = tokens(query);
  const scored = index.map(function (chunk) {
    const bag = tokens(chunk.title + ' ' + chunk.text.slice(0, 800));
    let score = chunk.id === 'contact' ? 0.2 : 0;
    want.forEach(function (t) {
      if (bag.indexOf(t) !== -1) score += 1;
      if (chunk.title.toLowerCase().indexOf(t) !== -1) score += 0.5;
      if (chunk.path.toLowerCase().indexOf(t) !== -1) score += 0.4;
    });
    return { chunk: chunk, score: score };
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  const picked = [];
  const contact = index[0];
  if (contact && contact.id === 'contact') picked.push(contact);
  const max = limit || 5;
  for (let i = 0; i < scored.length && picked.length < max; i++) {
    if (scored[i].score <= 0) continue;
    if (picked.some(function (c) { return c.id === scored[i].chunk.id; })) continue;
    picked.push(scored[i].chunk);
  }
  if (picked.length < 3) {
    index.slice(0, 4).forEach(function (chunk) {
      if (picked.length < max && !picked.some(function (c) { return c.id === chunk.id; })) picked.push(chunk);
    });
  }
  return picked;
}

function promptBlock(query) {
  const chunks = retrieve(query, 5);
  let total = 0;
  const parts = [];
  chunks.forEach(function (chunk) {
    const block = '[bron: ' + chunk.path + '] ' + chunk.title + '\n' + chunk.text;
    if (total + block.length > 7000) return;
    total += block.length;
    parts.push(block);
  });
  return parts.join('\n\n');
}

function resetCache() {
  cache = null;
}

module.exports = {
  buildIndex: buildIndex,
  getIndex: getIndex,
  retrieve: retrieve,
  promptBlock: promptBlock,
  scrub: scrub,
  resetCache: resetCache
};
