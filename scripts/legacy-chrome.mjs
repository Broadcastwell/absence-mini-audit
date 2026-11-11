// Today's navigation and footer links of audit.broadcastwell.com, drawn in the brand system's markup
// (brief 11.1: through steps 2 to 8 each surface keeps the links it has today, in the new style, so
// no fifth variant appears). The markup and class names are the ones vendor/brand/nav-render.mjs
// writes, so the one stylesheet (vendor/brand/components.css) and the one script (vendor/brand/nav.js)
// serve both. The shared nav.json replaces this data when SHARED_NAV in scripts/site-chrome.mjs is on.
//
// A copy of the shared legacy renderer (step33/sa-sites/shared/legacy-chrome.mjs), extended in three
// ways only: an action may carry attributes (the header purchase action keeps data-buy, the hook the
// page uses to carry a result reference to checkout); the footer address keeps today's three lines
// and phone; the footer keeps today's notes (the research disclosure above the columns, the
// allowance line under them) and today's dated publication line in the last row.
//
// data: {
//   wordmark: { label, href },
//   items: [{ label, href }],
//   actions: [{ label, href, style: 'nav' | 'secondary' | 'primary', attrs?: { name: value | true } }],
//   menuLabel: 'Menu',
//   footer: { brand_line, address: [line], phone, phone_href, columns: [{ title, links: [{ label, href, html? }] }],
//             legal: [{ label, href }], copyright, updated: 'YYYY-MM-DD',
//             before?: [html string], after?: [html string] }   // trusted, pre-escaped paragraphs
// }
import { escapeHtml, normalizeUrl } from '../vendor/brand/nav-render.mjs';

const ICONS = {
  menu: '<svg class="bw-icon bw-icon--24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function current(href, page) {
  return page && href && !/#/.test(href) && normalizeUrl(href) === normalizeUrl(page) ? ' aria-current="page"' : '';
}
function attrs(extra) {
  return Object.entries(extra || {}).map(([k, v]) => v === true ? ` ${escapeHtml(k)}` : ` ${escapeHtml(k)}="${escapeHtml(v)}"`).join('');
}
function link(cls, item, page) {
  return `<a${cls ? ` class="${cls}"` : ''} href="${escapeHtml(item.href)}"${current(item.href, page)}${attrs(item.attrs)}>${item.html || escapeHtml(item.label)}</a>`;
}
function button(a, extra = '') {
  const cls = a.style === 'primary' ? 'bw-button bw-button--primary' : 'bw-button bw-button--secondary';
  return `<a class="${cls}${extra}" href="${escapeHtml(a.href)}"${attrs(a.attrs)}>${escapeHtml(a.label)}</a>`;
}
function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) throw new Error('Expected a publication date');
  return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

export function renderLegacyNav(data, { current: page = '', skipTarget = '#main', skipLabel = 'Skip to content' } = {}) {
  const navActions = data.actions.filter(a => a.style === 'nav');
  const buttons = data.actions.filter(a => a.style !== 'nav');
  const first = buttons.find(a => a.style === 'primary') || buttons[0];
  const desktop = data.items.map(item => `<li>${link('bw-site-nav__trigger', item, page)}</li>`).join('');
  const phone = data.items.map(item => `<li>${link('bw-site-nav__link', item, page)}</li>`).join('');
  return [
    `<a class="bw-skip" href="${escapeHtml(skipTarget)}">${escapeHtml(skipLabel)}</a>`,
    `<header class="bw-site-nav" data-bw-nav>`,
    `<div class="bw-container bw-site-nav__bar">`,
    `<a class="bw-logotype" href="${escapeHtml(data.wordmark.href)}"${current(data.wordmark.href, page)}>${escapeHtml(data.wordmark.label)}</a>`,
    `<nav class="bw-site-nav__primary" aria-label="Main"><ul class="bw-site-nav__list">${desktop}</ul></nav>`,
    `<div class="bw-site-nav__actions">${navActions.map(a => link('bw-site-nav__action', a, page)).join('')}${buttons.map(a => button(a)).join('')}</div>`,
    first ? button(first, ' bw-site-nav__phone-start') : '',
    `<details class="bw-site-nav__phone" data-bw-phone-menu><summary class="bw-site-nav__menu-button">${ICONS.menu}<span>${escapeHtml(data.menuLabel || 'Menu')}</span></summary>`,
    `<div class="bw-site-nav__sheet"><nav aria-label="Main">`,
    buttons.length ? `<div class="bw-site-nav__doors">${buttons.map(a => button(a, ' bw-button--block')).join('')}</div>` : '',
    `<ul class="bw-site-nav__groups">${phone}</ul>`,
    navActions.length ? `<ul class="bw-site-nav__more">${navActions.map(a => `<li>${link('bw-site-nav__link', a, page)}</li>`).join('')}</ul>` : '',
    `</nav></div></details>`,
    `</div>`,
    `</header>`
  ].join('');
}

export function renderLegacyFooter(data, { current: page = '', idPrefix = 'bw-footer' } = {}) {
  const f = data.footer;
  const prefix = String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '');
  const columns = f.columns.map((column, i) => `<div><h2 class="bw-site-footer__title" id="${prefix}-${i}">${escapeHtml(column.title)}</h2><ul class="bw-site-footer__list" aria-labelledby="${prefix}-${i}">${column.links.map(item => `<li>${link('', item, page)}</li>`).join('')}</ul></div>`).join('');
  const address = f.address.map(escapeHtml).join('<br>') + `<br><a href="${escapeHtml(f.phone_href)}">${escapeHtml(f.phone)}</a>`;
  const updated = f.updated ? `<p>Last updated <time datetime="${escapeHtml(f.updated)}">${longDate(f.updated)}</time></p>` : '';
  return [
    `<footer class="bw-site-footer">`,
    `<div class="bw-container">`,
    (f.before || []).join(''),
    `<div class="bw-site-footer__top">`,
    `<div class="bw-site-footer__brand">`,
    `<a class="bw-logotype" href="${escapeHtml(data.wordmark.href)}">${escapeHtml(data.wordmark.label)}</a>`,
    f.brand_line ? `<p class="bw-site-footer__line">${escapeHtml(f.brand_line)}</p>` : '',
    `<address class="bw-site-footer__address">${address}</address>`,
    `</div>`,
    `<nav class="bw-site-footer__columns" aria-label="Footer">${columns}</nav>`,
    `</div>`,
    (f.after || []).join(''),
    `<div class="bw-site-footer__last">${f.copyright ? `<p>${escapeHtml(f.copyright)}</p>` : ''}<ul class="bw-site-footer__legal" aria-label="Legal">${f.legal.map(item => `<li>${link('', item, page)}</li>`).join('')}</ul>${updated}</div>`,
    `</div>`,
    `</footer>`
  ].join('');
}
