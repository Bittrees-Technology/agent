# Social preview image

`public/social-preview.png` is the Open Graph / Twitter Card image referenced
by every HTML page's metadata (`SOCIAL_PREVIEW_IMAGE_PATH` in `src/portal.mjs`,
served at `/social-preview.png`). It closes the gap identified in the
2026-07-19 marketing review SEO/metadata audit: no page shipped an
`og:image`/`twitter:image`, so link unfurls in chat/social tools rendered
without a preview.

It is a placeholder brand asset — a green/gold roundel plus a pixel-font
wordmark reusing the portal's existing CSS palette (`#1f6b4f`, `#8b5c10`,
`#f6f7f2`, `#5e6963`) — generated with zero external dependencies via
`scripts/generate-social-preview-image.mjs` (a from-scratch PNG encoder using
Node's builtin `zlib`, since the repo has no image-processing dependency).

To regenerate after editing the generator:

```
node scripts/generate-social-preview-image.mjs
```

To replace it with an approved design asset instead: drop a 1200x630 PNG at
`public/social-preview.png`. Nothing else needs to change — the image is
served from that path and referenced by path, not regenerated at request
time.
