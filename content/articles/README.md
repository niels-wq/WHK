# Artikelen toevoegen

De kennisbank draait op drie lagen. Nieuwe stukken hoeven niet in `whk_verzuim.html`.

1. **Bestaande artikelen** staan als `SEED_POSTS` in `whk_verzuim.html` (client) en worden bij eerste load met de CMS-data gemerged.
2. **CMS** (beheerderslogin → Blog) schrijft naar `PUT /api/posts` (PostgreSQL `kv_store`).
3. **Markdown-bestanden in deze map** worden door `server.js` ingelezen en meegestuurd in `GET /api/posts` en `sitemap.xml`.

## Nieuw artikel via markdown

Maak een bestand `mijn-slug.md` in deze map:

```markdown
---
title: Titel van het artikel
slug: mijn-slug
description: Unieke meta-description tot ca. 155 tekens.
publishedAt: 2026-09-16
tags: WHK-basics, Bezwaar & procedure
---

Eerste alinea.

## Kop

Verdere tekst. Links: [WHK-check](https://werkhervattingskas.nl/diensten/whk-controle).
```

Na deploy verschijnt het op `/blog/mijn-slug`. `README.md` wordt genegeerd. Bij dezelfde slug wint de CMS/database-versie.

Optioneel, als de afbeelding niet het standaardpad moet volgen:

```yaml
image: /assets/blog/mijn-slug.webp
imageAlt: Uitgelichte afbeelding bij het artikel: Titel van het artikel
```

## Uitgelichte afbeelding

Elk artikel in de sitemap heeft een eigen bestand `assets/blog/<slug>.webp` van 1200×630. Dat pad is de uitgelichte afbeelding bovenaan het artikel, de thumbnail op de blogkaarten, `og:image`, `twitter:image` en `BlogPosting.image`. Zonder frontmatter-veld `image` geldt dit pad automatisch.

Na een nieuw artikel:

```bash
node scripts/generate-blog-images.js
```

De generator tekent een titelkaart in de huisstijl, met de artikeltitel en een eenvoudig icoon. Geen stockfoto's. `npm test` faalt als een blog-URL in de sitemap geen eigen afbeelding heeft.

Voeg hier geen grote nieuwe content toe tenzij het een echt artikel is; dit is het onderhoudspatroon.
