// The one Broadcastwell Organization (brief 13.4 and 13.5), word for word from brand/ENTITY.md, as the
// main site's footer carries it: one full block per page, and every other mention a reference by @id.
// scripts/build-page.mjs writes it into the page's JSON-LD; tests/entity.test.mjs holds it there.
export const ORGANIZATION_ID = 'https://broadcastwell.com/#organization';

export const ORGANIZATION = Object.freeze({
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'Broadcastwell',
  legalName: 'Broadcastwell LLC',
  description: "Broadcastwell asks ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode your buyers' questions, records who they name, and fixes the pages they read.",
  slogan: 'When you broadcast, broadcast well.',
  logo: 'https://framerusercontent.com/images/j6xX2NJoWncy5Askq1FGOGo0Vo.png',
  image: 'https://framerusercontent.com/images/j6xX2NJoWncy5Askq1FGOGo0Vo.png',
  url: 'https://broadcastwell.com/',
  telephone: '+18123457272',
  email: 'hello@broadcastwell.com',
  address: Object.freeze({
    '@type': 'PostalAddress',
    streetAddress: '517 E Kirkwood Ave',
    addressLocality: 'Bloomington',
    addressRegion: 'IN',
    postalCode: '47408',
    addressCountry: 'US'
  }),
  founder: Object.freeze({ '@type': 'Person', name: 'Sairam Sivakumar', jobTitle: 'Founder' }),
  sameAs: Object.freeze([
    'https://www.linkedin.com/company/broadcastwell',
    'https://x.com/broadcastwellhq',
    'https://www.youtube.com/@Broadcastwell',
    'https://www.instagram.com/broadcastwell/',
    'https://www.tiktok.com/@broadcastwell.com',
    'https://broadcastwell.substack.com/'
  ])
});

const isBroadcastwell = node => node && typeof node === 'object' && [].concat(node['@type'] || []).includes('Organization')
  && (node['@id'] === ORGANIZATION_ID || /^Broadcastwell(?: LLC)?$/.test(node.name || ''));

// Every Broadcastwell Organization below the top of the graph becomes a reference by @id.
function references(value) {
  if (Array.isArray(value)) return value.map(references);
  if (!value || typeof value !== 'object') return value;
  if (isBroadcastwell(value)) return { '@id': ORGANIZATION_ID };
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, references(inner)]));
}

// A JSON-LD document with the one full Organization first in its graph, and references elsewhere.
export function withOrganization(document) {
  const graph = (document['@graph'] || []).filter(node => !isBroadcastwell(node)).map(references);
  return { '@context': document['@context'], '@graph': [JSON.parse(JSON.stringify(ORGANIZATION)), ...graph] };
}

// The same, applied to every JSON-LD block of an HTML page.
export function withOrganizationInPage(html) {
  return html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, body) => `<script type="application/ld+json">${JSON.stringify(withOrganization(JSON.parse(body))).replaceAll('<', '\\u003c')}</script>`);
}
