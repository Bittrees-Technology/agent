# Agent brand assets

The matte forest-green (`#183f35`) and lime (`#d8ee7e`) robot elf mark is defined
once in `src/ecosystem/brand.mjs`. SVG geometry supplies `/logo.svg` and
`/favicon.svg`; the social-image generator uses the same shapes and colors.
The header and favicon include a brand revision so browsers refresh the old mark.

`public/social-preview.png` is the 1200×630 generated source. Metadata uses the
versioned `/social-preview-robot-elf.png` URL; `/social-preview.png` remains a
compatible alias. Open Graph and Twitter metadata include the logo description,
and Organization/WebSite structured data identifies Bittrees, Inc. and the
canonical Agent site. Indexing controls remain separate.

Regenerate with `node scripts/generate-social-preview-image.mjs`. No external
image service, font download or additional dependency is needed.
