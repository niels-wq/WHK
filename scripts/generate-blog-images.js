'use strict';

// Builds assets/blog/<slug>.webp for every markdown and seed article.
// npm test fails when a sitemap blog has no own image, so run this after
// adding an article (or set frontmatter image to an existing 1200x630 file).

const { spawnSync } = require('child_process');
const path = require('path');
const blogImages = require('../lib/blog-images');

const posts = blogImages.allPosts()
  .filter(function (post) { return post && post.slug && !post.archived; })
  .map(blogImages.decoratePost)
  .map(function (post) {
    return {
      slug: post.slug,
      title: post.title,
      motif: post.motif,
      tone: post.tone
    };
  });

const script = path.join(__dirname, 'generate-blog-images.py');
const child = spawnSync('python3', [script], {
  input: JSON.stringify(posts),
  encoding: 'utf8'
});

if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}
process.exit(child.status == null ? 1 : child.status);
