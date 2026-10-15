'use strict';

// Featured image for every knowledge-base article.
// Convention: /assets/blog/<slug>.webp (1200x630). Frontmatter `image` and
// `imageAlt` may point at another file in that folder. The generic
// /og-image.png is never treated as an article image.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT, 'content', 'articles');
const HTML_PATH = path.join(ROOT, 'whk_verzuim.html');
const IMAGE_DIR = path.join(ROOT, 'assets', 'blog');
const PUBLIC_PREFIX = '/assets/blog/';
const ALT_PREFIX = 'Uitgelichte afbeelding bij het artikel: ';

function readJsField(window, key) {
  const single = window.match(new RegExp(key + ":\\s*'((?:\\\\'|[^'])*)'"));
  if (single) return unescapeJs(single[1]);
  const dbl = window.match(new RegExp(key + ':\\s*"((?:\\\\"|[^"])*)"'));
  if (dbl) return unescapeJs(dbl[1]);
  return '';
}

function unescapeJs(s) {
  return String(s || '')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\\\/g, '\\');
}

function parseFrontmatter(raw) {
  const m = String(raw || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const meta = {};
  m[1].split(/\r?\n/).forEach(function (line) {
    const i = line.indexOf(':');
    if (i === -1) return;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    meta[line.slice(0, i).trim()] = v;
  });
  return meta;
}

function loadMarkdownPosts() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs.readdirSync(ARTICLES_DIR).filter(function (file) {
    return file.endsWith('.md') && file.toLowerCase() !== 'readme.md';
  }).map(function (file) {
    const meta = parseFrontmatter(fs.readFileSync(path.join(ARTICLES_DIR, file), 'utf8'));
    if (!meta || !meta.title) return null;
    const tags = meta.tags ? meta.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
    return {
      slug: meta.slug || file.replace(/\.md$/, ''),
      title: meta.title,
      metaDescription: meta.description || meta.title,
      tags: tags,
      image: meta.image || '',
      imageAlt: meta.imageAlt || '',
      publishedAt: meta.publishedAt || '',
      archived: meta.archived === 'true',
      source: 'markdown'
    };
  }).filter(Boolean);
}

function loadSeedPosts(html) {
  const source = html != null ? String(html) : (fs.existsSync(HTML_PATH) ? fs.readFileSync(HTML_PATH, 'utf8') : '');
  const start = source.indexOf('var SEED_POSTS = [');
  if (start === -1) return [];
  const end = source.indexOf('\n  var posts =', start);
  const chunk = source.slice(start, end === -1 ? source.length : end);
  const posts = [];
  const re = /^\s+slug:\s*'((?:\\'|[^'])*)'/gm;
  let m;
  while ((m = re.exec(chunk))) {
    const slug = unescapeJs(m[1]);
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const window = chunk.slice(m.index, m.index + 2200);
    const title = readJsField(window, 'title');
    if (!title) continue;
    const desc = readJsField(window, 'metaDescription');
    const publishedAt = window.match(/publishedAt:\s*'([^']*)'/);
    const tagBlock = window.match(/tags:\s*\[([^\]]*)\]/);
    const tags = [];
    if (tagBlock) {
      const tr = /'((?:\\'|[^'])*)'/g;
      let tm;
      while ((tm = tr.exec(tagBlock[1]))) tags.push(unescapeJs(tm[1]));
    }
    posts.push({
      slug: slug,
      title: title,
      metaDescription: desc || title,
      tags: tags,
      image: '',
      imageAlt: '',
      publishedAt: publishedAt ? publishedAt[1] : '',
      archived: /archived:\s*true/.test(window.slice(0, 700)),
      source: 'seed'
    });
  }
  return posts;
}

function allPosts(html) {
  const bySlug = new Map();
  loadSeedPosts(html).forEach(function (post) {
    if (post.slug) bySlug.set(post.slug, post);
  });
  loadMarkdownPosts().forEach(function (post) {
    if (!post.slug) return;
    const prev = bySlug.get(post.slug) || {};
    bySlug.set(post.slug, Object.assign({}, prev, post, {
      title: post.title || prev.title,
      metaDescription: post.metaDescription || prev.metaDescription,
      tags: (post.tags && post.tags.length) ? post.tags : (prev.tags || []),
      image: post.image || prev.image || '',
      imageAlt: post.imageAlt || prev.imageAlt || '',
      publishedAt: post.publishedAt || prev.publishedAt || '',
      source: 'markdown'
    }));
  });
  return Array.from(bySlug.values());
}

function lookupPost(slug, html) {
  if (!slug) return null;
  const found = allPosts(html).find(function (post) { return post.slug === slug; });
  return found ? Object.assign({}, found) : null;
}

function isOwnBlogImage(publicPath) {
  const value = String(publicPath || '').trim();
  if (!value || /og-image\.png/i.test(value)) return false;
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    try { pathname = new URL(value).pathname; } catch (e) { return false; }
  }
  return /^\/assets\/blog\/[a-z0-9][a-z0-9-]*\.(webp|jpg|jpeg)$/i.test(pathname);
}

function pathnameOf(publicPath) {
  const value = String(publicPath || '').trim();
  if (/^https?:\/\//i.test(value)) {
    try { return new URL(value).pathname; } catch (e) { return ''; }
  }
  return value.split('?')[0];
}

function publicImagePath(post) {
  const raw = pathnameOf(post && post.image);
  if (isOwnBlogImage(raw)) return raw;
  const slug = post && post.slug ? post.slug : '';
  return PUBLIC_PREFIX + slug + '.webp';
}

function altText(post) {
  const custom = String((post && post.imageAlt) || '').trim();
  if (custom) return custom;
  const title = String((post && post.title) || '').trim();
  return ALT_PREFIX + (title || 'WHK-artikel');
}

function absoluteImageUrl(publicPath, siteUrl) {
  const base = String(siteUrl || 'https://werkhervattingskas.nl').replace(/\/$/, '');
  const value = String(publicPath || '');
  if (/^https?:\/\//i.test(value)) return value;
  return base + (value.charAt(0) === '/' ? value : '/' + value);
}

function fileForPublicPath(publicPath) {
  return path.join(IMAGE_DIR, path.basename(pathnameOf(publicPath)));
}

function pickMotif(text) {
  const rules = [
    [/no-risk|norisk|polis/, 'shield', 'savings'],
    [/dossier|poortwachter/, 'folder', 'savings'],
    [/checklist|stappenplan|checkpunt/, 'checklist', 'ink'],
    [/deadline|kalender|termijn/, 'calendar', 'risk'],
    [/bezwaar|regres|aansprak|procedure|loonsanctie/, 'scale', 'risk'],
    [/premie|loonsom|percentage|schadelast|kosten/, 'chart', 'gold'],
    [/re-?integr|tweede-spoor|tweedespoor|werkhervat/, 'path', 'savings'],
    [/sector|fusie|overname|werkgever|horeca|bouw|retail|faillissement|organisatie/, 'building', 'ink'],
    [/wia|wga|iva|uwv|keuring|beoordel|herstel|ziekte/, 'document', 'ink']
  ];
  for (let i = 0; i < rules.length; i++) {
    if (rules[i][0].test(text)) return { motif: rules[i][1], tone: rules[i][2] };
  }
  return null;
}

function motifFor(post) {
  const primary = [post && post.slug, post && post.title].join(' ').toLowerCase();
  const tags = ((post && post.tags) || []).join(' ').toLowerCase();
  return pickMotif(primary) || pickMotif(tags) || { motif: 'document', tone: 'risk' };
}

function decoratePost(post) {
  const style = motifFor(post || {});
  const image = publicImagePath(post || {});
  return Object.assign({}, post, {
    image: image,
    imageAlt: altText(post || {}),
    motif: style.motif,
    tone: style.tone
  });
}

module.exports = {
  ALT_PREFIX: ALT_PREFIX,
  IMAGE_DIR: IMAGE_DIR,
  PUBLIC_PREFIX: PUBLIC_PREFIX,
  allPosts: allPosts,
  lookupPost: lookupPost,
  decoratePost: decoratePost,
  publicImagePath: publicImagePath,
  altText: altText,
  absoluteImageUrl: absoluteImageUrl,
  fileForPublicPath: fileForPublicPath,
  isOwnBlogImage: isOwnBlogImage,
  motifFor: motifFor
};
