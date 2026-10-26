// SITE shared chrome source. Fixed public destinations, no network or account behavior.
export const SITE_UPDATED = '2026-10-26';
export const NAV = [
  ['Product', 'https://broadcastwell.com/platform'],
  ['Research', 'https://broadcastwell.com/research'],
  ['Free tools', 'https://broadcastwell.com/free-tools'],
  ['Pricing', 'https://broadcastwell.com/pricing'],
  ['Exchange', 'https://exchange.broadcastwell.com/'],
  ['Company', 'https://broadcastwell.com/about']
];
export const FOOTER = [
  ['Product', [
    ['Answer Repair, $490', 'https://broadcastwell.com/answer-repair'],
    ['Fix Sprint', 'https://broadcastwell.com/fix-sprint'],
    ['The program', 'https://broadcastwell.com/pricing#monthly'],
    ['Agency Deadline Audit, $490', 'https://broadcastwell.com/for-agencies'],
    ['Pricing', 'https://broadcastwell.com/pricing'],
    ['Connect an assistant', 'https://app.broadcastwell.com/connect']
  ]],
  ['Research', [
    ['Absence Index', 'https://broadcastwell.com/absence-index'],
    ['Public Fix', 'https://broadcastwell.com/public-fix'],
    ['The 2026 State of GEO', 'https://broadcastwell.com/state-of-geo'],
    ['Studies', 'https://broadcastwell.com/research'],
    ['Methodology', 'https://broadcastwell.com/methodology'],
    ['Data and citations', 'https://broadcastwell.com/data']
  ]],
  ['Free tools', [
    ['Free 10-question check (one engine)', 'https://audit.broadcastwell.com/'],
    ['llms.txt generator', 'https://app.broadcastwell.com/tools/llms-txt'],
    ['Record check (free)', 'https://app.broadcastwell.com/tools/record-check'],
    ['Agency comparisons', 'https://broadcastwell.com/best-geo-agencies'],
    ['Sample account', 'https://app.broadcastwell.com/sample'],
    ['Developers', 'https://broadcastwell.com/developers']
  ]],
  ['Company', [
    ['About', 'https://broadcastwell.com/about'],
    ['Company facts', 'https://broadcastwell.com/company-facts'],
    ['Careers', 'https://broadcastwell.com/careers'],
    ['Exchange', 'https://exchange.broadcastwell.com/'],
    ['Partner Network', 'https://broadcastwell.com/partners'],
    ['Security', 'https://broadcastwell.com/security']
  ]],
  ['Contact', [
    ['hello@broadcastwell.com', 'mailto:hello@broadcastwell.com'],
    ['Contact page', 'https://broadcastwell.com/contact'],
    ['LinkedIn', 'https://www.linkedin.com/company/broadcastwell'],
    ['Writing', 'https://broadcastwell.substack.com/'],
    ['Sitemap', 'https://broadcastwell.com/sitemap'],
    ['Questions and answers', 'https://broadcastwell.com/faq']
  ]]
];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const link = ([label, href]) => `<a href="${escape(href)}">${href === "mailto:hello@broadcastwell.com" && label === "hello@broadcastwell.com" ? "hello@<wbr>broadcastwell.com" : escape(label)}</a>`;
export function siteHeader({className = 'site-header', localLinks = ''} = {}) {
  return `<header class="${className}" data-bw-site-header>
  <div class="bw-shared-bar">
    <a class="bw-shared-wordmark" href="https://broadcastwell.com/" aria-label="Broadcastwell home">Broadcastwell</a>
    <nav class="bw-shared-nav" aria-label="Broadcastwell">${NAV.map(link).join('')}</nav>
    <a class="bw-shared-signin" href="https://app.broadcastwell.com/signin">Sign in</a>
    <a class="bw-shared-audit" href="https://broadcastwell.com/buy/answer-repair">Fix one answer, $490</a>
    <details class="bw-shared-menu" data-bw-site-menu><summary aria-label="Open Broadcastwell navigation"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span class="bw-shared-sr">Menu</span></summary><nav aria-label="Broadcastwell mobile">${NAV.map(link).join('')}<a href="https://app.broadcastwell.com/signin">Sign in</a>${localLinks}</nav></details>
  </div>
</header>`;
}
export function siteFooter({className = 'site-footer', provenance = '', date = SITE_UPDATED} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected a publication date');
  const dateLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'});
  return `<footer class="${className}">
${provenance ? `  <div class="bw-shared-provenance">${provenance}</div>` : ''}
  <div class="bw-shared-footer">
    <div class="bw-shared-brand"><a class="bw-shared-wordmark" href="https://broadcastwell.com/">Broadcastwell</a><p>AI search visibility for B2B software companies.</p><address>517 E Kirkwood Ave<br>Bloomington, IN 47408<br>United States</address><a href="tel:+18123457272">(812) 345 7272</a></div>
    <nav class="bw-shared-columns" aria-label="Broadcastwell footer">${FOOTER.map(([title, links], i) => `<details class="bw-shared-group" data-bw-footer-group open><summary><h2 id="bw-footer-${i}">${title}</h2></summary><ul aria-labelledby="bw-footer-${i}">${links.map(item => `<li>${link(item)}</li>`).join('')}</ul></details>`).join('')}</nav>
    <p class="bw-shared-allowance"><strong>Free 10-question check (one engine):</strong> No email is needed; runs are limited per network and per day, and by the site's daily allowance.</p>
    <div class="bw-shared-bottom"><p>Copyright ${date.slice(0,4)} Broadcastwell LLC.</p><nav aria-label="Legal"><a href="https://broadcastwell.com/privacy">Privacy</a><a href="https://broadcastwell.com/terms">Terms</a><a href="https://broadcastwell.com/cookies">Cookies</a></nav><p>Last updated <time datetime="${date}">${dateLabel}</time></p></div>
  </div>
</footer>`;
}
