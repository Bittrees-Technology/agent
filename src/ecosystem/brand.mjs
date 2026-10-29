// One flat-color geometry source for the header, favicon and social artwork.
export const BRAND_VERSION = 'robot-elf-20261029';
export const BRAND_COLORS = Object.freeze({ forest: '#183f35', lime: '#d8ee7e' });
export const BRAND_SHAPES = Object.freeze([
  { type: 'rect', x: 0, y: 0, width: 64, height: 64, rx: 16, fill: 'forest' },
  { type: 'polygon', points: [[7, 22], [23, 28], [19, 43], [11, 35]], fill: 'lime' },
  { type: 'polygon', points: [[57, 22], [41, 28], [45, 43], [53, 35]], fill: 'lime' },
  { type: 'rect', x: 30, y: 13, width: 4, height: 9, rx: 2, fill: 'lime' },
  { type: 'circle', cx: 32, cy: 12, r: 3, fill: 'lime' },
  { type: 'rect', x: 18, y: 21, width: 28, height: 32, rx: 11, fill: 'lime' },
  { type: 'rect', x: 22, y: 29, width: 20, height: 12, rx: 5, fill: 'forest' },
  { type: 'rect', x: 26, y: 33, width: 3, height: 4, rx: 1.5, fill: 'lime' },
  { type: 'rect', x: 35, y: 33, width: 3, height: 4, rx: 1.5, fill: 'lime' },
  { type: 'rect', x: 27, y: 45, width: 10, height: 3, rx: 1.5, fill: 'forest' },
]);

export const LOGO_SVG_BODY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title"><title id="title">Bittrees Agent robot elf</title>${BRAND_SHAPES.map(shape => {
  const { type, fill, points, ...attributes } = shape;
  return `<${type} ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(' ')}${points ? ` points="${points.map(p => p.join(',')).join(' ')}"` : ''} fill="${BRAND_COLORS[fill]}"/>`;
}).join('')}</svg>\n`;

export const BRAND_STRUCTURED_DATA = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': 'https://agent.bittrees.org/#publisher', name: 'Bittrees, Inc.', url: 'https://bittrees.org/', logo: { '@type': 'ImageObject', url: `https://agent.bittrees.org/logo.svg?v=${BRAND_VERSION}`, width: 64, height: 64 } },
    { '@type': 'WebSite', '@id': 'https://agent.bittrees.org/#website', name: 'Bittrees Agent', url: 'https://agent.bittrees.org/', description: 'AI tools, agent connections, workflows and learning resources.', publisher: { '@id': 'https://agent.bittrees.org/#publisher' } },
  ],
});
