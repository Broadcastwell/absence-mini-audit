// STEP 3.3 batch B118 (SA-SITES3): one Organization (brief 13.4), one description of the company
// (13.5), brand 3.0.2 as vendored (B146), and the buyer objection pass, round 1 (R-154).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ORGANIZATION, ORGANIZATION_ID, withOrganization } from '../scripts/entity.mjs';
import { SHARED } from '../scripts/site-chrome.mjs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const page = read('public/index.html');
const ld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const SIX = ['https://www.linkedin.com/company/broadcastwell', 'https://x.com/broadcastwellhq', 'https://www.youtube.com/@Broadcastwell',
  'https://www.instagram.com/broadcastwell/', 'https://www.tiktok.com/@broadcastwell.com', 'https://broadcastwell.substack.com/'];

function organizations(value, found = []) {
  if (Array.isArray(value)) value.forEach(v => organizations(v, found));
  else if (value && typeof value === 'object') {
    if ([].concat(value['@type'] || []).includes('Organization')) found.push(value);
    Object.values(value).forEach(v => organizations(v, found));
  }
  return found;
}
function references(value, found = []) {
  if (Array.isArray(value)) value.forEach(v => references(v, found));
  else if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value['@id'] === ORGANIZATION_ID) found.push(value);
    Object.values(value).forEach(v => references(v, found));
  }
  return found;
}

test('the Organization carries the ENTITY.md fields word for word', () => {
  assert.equal(ORGANIZATION['@id'], 'https://broadcastwell.com/#organization');
  assert.equal(ORGANIZATION.name, 'Broadcastwell');
  assert.equal(ORGANIZATION.legalName, 'Broadcastwell LLC');
  assert.equal(ORGANIZATION.description, "Broadcastwell asks ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode your buyers' questions, records who they name, and fixes the pages they read.");
  assert.equal(ORGANIZATION.url, 'https://broadcastwell.com/');
  assert.equal(ORGANIZATION.telephone, '+18123457272');
  assert.deepEqual({ ...ORGANIZATION.address }, { '@type': 'PostalAddress', streetAddress: '517 E Kirkwood Ave', addressLocality: 'Bloomington', addressRegion: 'IN', postalCode: '47408', addressCountry: 'US' });
  assert.deepEqual({ ...ORGANIZATION.founder }, { '@type': 'Person', name: 'Sairam Sivakumar', jobTitle: 'Founder' });
  assert.deepEqual([...ORGANIZATION.sameAs], SIX);
  assert.match(ORGANIZATION.logo, /^https:\/\//);
});

test('the page and its embed carry one full Organization and refer to it by @id everywhere else', () => {
  for (const file of ['public/index.html', 'public/embed.html']) {
    const blocks = ld(read(file));
    assert.equal(blocks.length, 1, file);
    const orgs = organizations(blocks);
    assert.equal(orgs.length, 1, file + ' one Organization block');
    assert.deepEqual(orgs[0], JSON.parse(JSON.stringify(ORGANIZATION)), file);
    assert.equal(blocks[0]['@graph'][0]['@id'], ORGANIZATION_ID, file);
    assert.ok(references(blocks).length >= 2, file + ' the WebApplication and the Service name their provider by @id');
    const offers = JSON.stringify(blocks).match(/"price":"(\d+)"/g);
    assert.deepEqual(offers, ['"price":"0"', '"price":"490"'], file + ' prices unchanged');
  }
  const again = withOrganization(ld(page)[0]);
  assert.deepEqual(again, ld(page)[0], 'applying the Organization again changes nothing');
});

test('llms.txt opens with an ENTITY.md description word for word', () => {
  assert.match(read('public/llms.txt'), /^# Broadcastwell Free 10-question check \(one engine\)\n\n> Broadcastwell measures and fixes whether AI search engines name B2B software companies\. /);
});

test('brand 3.0.2: the vendored footer legal row carries Procurement after Integrity Standard, and the page draws it as shipped', () => {
  const vendored = JSON.parse(read('vendor/brand/nav.json'));
  assert.deepEqual(SHARED, vendored, 'the shared navigation is the vendored nav.json, with nothing drawn over it');
  assert.deepEqual(vendored.footer.legal.map(item => item.label), ['Privacy', 'Terms', 'Cookies', 'Security', 'Integrity Standard', 'Procurement', 'Sitemap']);
  assert.equal(vendored.footer.legal.find(item => item.label === 'Procurement').href, 'https://broadcastwell.com/procurement');
  assert.equal(fs.existsSync(new URL('../scripts/brand-302.mjs', import.meta.url)), false, 'the B118 overlay is gone');
  for (const file of ['public/index.html', 'public/embed.html', 'public/404.html']) {
    const legal = read(file).match(/<ul class="bw-site-footer__legal"[^>]*>([\s\S]*?)<\/ul>/)[1];
    assert.ok(legal.includes('<a href="https://broadcastwell.com/integrity">Integrity Standard</a></li><li><a href="https://broadcastwell.com/procurement">Procurement</a></li><li><a href="https://broadcastwell.com/sitemap">'), file);
  }
});

test('brand 3.0.2: the wordmark never wraps, from the vendored components alone', () => {
  const css = page.match(/<style>([\s\S]*?)<\/style>/)[1];
  const brand = css.slice(css.indexOf('/* brand: begin */'), css.indexOf('/* brand: end */'));
  assert.match(brand, /\.bw-logotype\{display:inline-flex;align-items:center;flex-shrink:0;white-space:nowrap;/);
  const own = css.slice(css.indexOf('/* brand: end */'));
  assert.doesNotMatch(own, /\.bw-logotype \{ white-space: nowrap; flex-shrink: 0; \}/, 'no hand copy of the brand rule');
});

test('R-154 round 1: the front door explains itself to a first-time visitor', () => {
  assert.doesNotMatch(page, /Published ladder positions|Choose one completed job|Read my website|PHP2Shell: company statement/);
  assert.match(page, /<li><strong>4<\/strong><span>Result bands: named in 0, 1 to 3, 4 to 6 or 7 to 10 answers<\/span><\/li>/);
  assert.match(page, /<h2 id="full-title">Want us to fix what the check finds\?<\/h2>/);
  assert.match(page, /<option value="php2shell">Security notice \(PHP2Shell\): one question<\/option>/);
  assert.match(page, /PHP2Shell is the PHP vulnerability pair CVE-2026-109618 and CVE-2026-109619\./);
  assert.equal(page.split("'Read your website'").length - 1, 3);
  // The review sentence stays word for word where an Audit is sold; the free check sells none.
  assert.doesNotMatch(page, /Priya Nair/);
});
