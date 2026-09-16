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

Voeg hier geen grote nieuwe content toe tenzij het een echt artikel is; dit is het onderhoudspatroon.
