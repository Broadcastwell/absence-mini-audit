// The navigation and footer of audit.broadcastwell.com (public/index.html, public/embed.html and
// public/404.html), on brand system 3.
//
// SHARED_NAV is the one switch (brief 11.1 step 9). Off, the default through this branch: today's
// links, drawn in the brand markup by scripts/legacy-chrome.mjs, so no fifth navigation variant
// appears. On: the shared navigation and footer of vendor/brand/nav.json, drawn by
// vendor/brand/nav-render.mjs, with the free check's own two notes set just above the footer.
// To flip it: set SHARED_NAV = true, run `node scripts/build-page.mjs`, run `npm test`, commit.
import { readFileSync } from 'node:fs';
import { renderNav, renderFooter } from '../vendor/brand/nav-render.mjs';
import { renderLegacyNav, renderLegacyFooter } from './legacy-chrome.mjs';

export const SHARED_NAV = false;

export const SHARED = JSON.parse(readFileSync(new URL('../vendor/brand/nav.json', import.meta.url), 'utf8'));

// The page this chrome is drawn for, so the shared navigation can mark it.
export const PAGE_URL = 'https://audit.broadcastwell.com/';

// Today's publication line in the footer (removed with the shared footer, brief 9.2).
export const SITE_UPDATED = '2026-10-26';

// The free check's research disclosure and its limits line, word for word as today's footer
// carries them.
export const DISCLOSURE = 'Broadcastwell ran the measurement behind The Absence Manual and sells services in the category it measures. Broadcastwell is excluded from its own sample and from every ranking. The raw data and the analysis code are public.';
export const ALLOWANCE = "<strong>Free 10-question check (one engine):</strong> No email is needed; runs are limited per network and per day, and by the site's daily allowance.";

// The header purchase action keeps data-buy: the page carries a result reference and the visitor's
// own typed address to checkout through every link that has it.
const BUY = { label: 'Fix one answer, $490', href: 'https://broadcastwell.com/buy/answer-repair', style: 'secondary', attrs: { 'data-buy': true } };

// Today's links, exactly as public/index.html carried them on main (3d9ef37), in their order.
export const LEGACY = {
  wordmark: { label: 'Broadcastwell', href: 'https://broadcastwell.com/' },
  items: [
    { label: 'Product', href: 'https://broadcastwell.com/platform' },
    { label: 'Research', href: 'https://broadcastwell.com/research' },
    { label: 'Free tools', href: 'https://broadcastwell.com/free-tools' },
    { label: 'Pricing', href: 'https://broadcastwell.com/pricing' },
    { label: 'Exchange', href: 'https://exchange.broadcastwell.com/' },
    { label: 'Company', href: 'https://broadcastwell.com/about' }
  ],
  actions: [
    { label: 'Sign in', href: 'https://app.broadcastwell.com/signin', style: 'nav' },
    BUY
  ],
  menuLabel: 'Menu',
  footer: {
    brand_line: 'AI search visibility for B2B software companies.',
    address: ['517 E Kirkwood Ave', 'Bloomington, IN 47408', 'United States'],
    phone: '(812) 345 7272',
    phone_href: 'tel:+18123457272',
    columns: [
      { title: 'Product', links: [
        { label: 'Answer Repair, $490', href: 'https://broadcastwell.com/answer-repair' },
        { label: 'Fix Sprint', href: 'https://broadcastwell.com/fix-sprint' },
        { label: 'The program', href: 'https://broadcastwell.com/pricing#monthly' },
        { label: 'Agency Deadline Audit, $490', href: 'https://broadcastwell.com/for-agencies' },
        { label: 'Pricing', href: 'https://broadcastwell.com/pricing' },
        { label: 'Connect an assistant', href: 'https://app.broadcastwell.com/connect' }
      ] },
      { title: 'Research', links: [
        { label: 'Absence Index', href: 'https://broadcastwell.com/absence-index' },
        { label: 'Public Fix', href: 'https://broadcastwell.com/public-fix' },
        { label: 'The 2026 State of GEO', href: 'https://broadcastwell.com/state-of-geo' },
        { label: 'Studies', href: 'https://broadcastwell.com/research' },
        { label: 'Methodology', href: 'https://broadcastwell.com/methodology' },
        { label: 'Data and citations', href: 'https://broadcastwell.com/data' }
      ] },
      { title: 'Free tools', links: [
        { label: 'Free 10-question check (one engine)', href: 'https://audit.broadcastwell.com/' },
        { label: 'llms.txt generator', href: 'https://app.broadcastwell.com/tools/llms-txt' },
        { label: 'Record check (free)', href: 'https://app.broadcastwell.com/tools/record-check' },
        { label: 'Agency comparisons', href: 'https://broadcastwell.com/best-geo-agencies' },
        { label: 'Sample account', href: 'https://app.broadcastwell.com/sample' },
        { label: 'Developers', href: 'https://broadcastwell.com/developers' }
      ] },
      { title: 'Company', links: [
        { label: 'About', href: 'https://broadcastwell.com/about' },
        { label: 'Company facts', href: 'https://broadcastwell.com/company-facts' },
        { label: 'Careers', href: 'https://broadcastwell.com/careers' },
        { label: 'Exchange', href: 'https://exchange.broadcastwell.com/' },
        { label: 'Partner Network', href: 'https://broadcastwell.com/partners' },
        { label: 'Security', href: 'https://broadcastwell.com/security' }
      ] },
      { title: 'Contact', links: [
        { label: 'hello@broadcastwell.com', html: 'hello@<wbr>broadcastwell.com', href: 'mailto:hello@broadcastwell.com' },
        { label: 'Contact page', href: 'https://broadcastwell.com/contact' },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/company/broadcastwell' },
        { label: 'Writing', href: 'https://broadcastwell.substack.com/' },
        { label: 'Sitemap', href: 'https://broadcastwell.com/sitemap' },
        { label: 'Questions and answers', href: 'https://broadcastwell.com/faq' }
      ] }
    ],
    legal: [
      { label: 'Privacy', href: 'https://broadcastwell.com/privacy' },
      { label: 'Terms', href: 'https://broadcastwell.com/terms' },
      { label: 'Cookies', href: 'https://broadcastwell.com/cookies' }
    ],
    copyright: 'Copyright 2026 Broadcastwell LLC.',
    updated: SITE_UPDATED,
    before: [`<p class="bw-site-footer__note footer-disclosure">${DISCLOSURE}</p>`],
    after: [`<p class="bw-site-footer__note footer-allowance">${ALLOWANCE}</p>`]
  }
};

// The free check's two notes when the shared footer is drawn: the same words, set in a band just
// above the footer, because the shared footer carries the same content on every surface.
function sharedNotes() {
  return `<aside class="page-notes" aria-label="About this check"><div class="bw-container"><p class="bw-site-footer__note footer-disclosure">${DISCLOSURE}</p><p class="bw-site-footer__note footer-allowance">${ALLOWANCE}</p></div></aside>`;
}

// header: the skip link and the navigation; notes: '' or the band above the footer; footer.
export function renderChrome({ sharedNav = SHARED_NAV, current = PAGE_URL } = {}) {
  if (sharedNav) return { header: renderNav(SHARED, { current }), notes: sharedNotes(), footer: renderFooter(SHARED, { current }) };
  return { header: renderLegacyNav(LEGACY, { current }), notes: '', footer: renderLegacyFooter(LEGACY, { current }) };
}
