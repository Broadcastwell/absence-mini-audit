// One renderer for the public navigation and footer, from brand/nav.json (brief 9.1 and 9.2).
// Pure string output, static-HTML friendly: menus are <details> elements that open on click and
// Enter without script; brand/nav.js adds Escape, outside click and one-menu-at-a-time. No focus trap.
// Every surface calls this same function; the Framer constants file carries its output.

const ICONS = {
  chevron: '<svg class="bw-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4"/></svg>',
  search: '<svg class="bw-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  menu: '<svg class="bw-icon bw-icon--24" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
};

export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return String(url);
  }
}

function isCurrent(href, current) {
  if (!current || !href) return false;
  if (/#/.test(href) && !/#/.test(current)) return false;
  return normalizeUrl(href) === normalizeUrl(current) && (href.split('#')[1] || '') === (current.split('#')[1] || '');
}

function attrCurrent(href, current) {
  return isCurrent(href, current) ? ' aria-current="page"' : '';
}

function link(cls, item, current) {
  return `<a${cls ? ` class="${cls}"` : ""} href="${escapeHtml(item.href)}"${attrCurrent(item.href, current)}>${escapeHtml(item.label)}</a>`;
}

function action(nav, id) {
  const found = nav.actions.find(a => a.id === id);
  if (!found) throw new Error(`nav.json has no action ${id}`);
  return found;
}

function buttonClass(style) {
  return style === 'primary' ? 'bw-button bw-button--primary' : 'bw-button bw-button--secondary';
}

export function renderSkip(nav, target = nav.skip.target) {
  return `<a class="bw-skip" href="${escapeHtml(target)}">${escapeHtml(nav.skip.label)}</a>`;
}

function desktopItems(nav, current, prefix, section) {
  return nav.items.map((item, i) => {
    if (!item.menu) return `<li>${link(item.label === section ? 'bw-site-nav__trigger is-current' : 'bw-site-nav__trigger', item, current)}</li>`;
    const holdsCurrent = item.label === section || item.menu.some(entry => isCurrent(entry.href, current));
    const entries = item.menu.map(entry => `<li>${link('bw-site-nav__link', entry, current)}</li>`).join('');
    return `<li><details class="bw-site-nav__menu" data-bw-menu><summary class="bw-site-nav__trigger${holdsCurrent ? ' is-current' : ''}" id="${prefix}-menu-${i}">${escapeHtml(item.label)}${ICONS.chevron}</summary><ul class="bw-site-nav__panel" aria-labelledby="${prefix}-menu-${i}">${entries}</ul></details></li>`;
  }).join('');
}

function phoneItems(nav, current, section) {
  return nav.items.map(item => {
    if (!item.menu) return `<li>${link('bw-site-nav__link', item, current)}</li>`;
    const entries = item.menu.map(entry => `<li>${link('bw-site-nav__link', entry, current)}</li>`).join('');
    const holdsCurrent = item.menu.some(entry => isCurrent(entry.href, current));
    const inSection = holdsCurrent || item.label === section;
    return `<li><details class="bw-site-nav__group" data-bw-menu${holdsCurrent ? ' open' : ''}><summary${inSection ? ' class="is-current"' : ''}>${escapeHtml(item.label)}${ICONS.chevron}</summary><ul>${entries}</ul></details></li>`;
  }).join('');
}

// options: { current: absolute URL of this page, idPrefix, skipTarget }
// section: the label of the top-level item whose area this page belongs to (marks it as current).
export function renderNav(nav, { current = '', section = '', idPrefix = 'bw-nav', skipTarget } = {}) {
  const prefix = String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '');
  const search = action(nav, 'search');
  const signin = action(nav, 'signin');
  const talk = action(nav, 'talk');
  const start = action(nav, 'start');
  const navAction = a => `<a class="bw-site-nav__action" href="${escapeHtml(a.href)}"${attrCurrent(a.href, current)}>${a.icon ? ICONS[a.icon] : ''}${escapeHtml(a.label)}</a>`;
  const doorButton = (a, extra = '') => `<a class="${buttonClass(a.style)}${extra}" href="${escapeHtml(a.href)}">${escapeHtml(a.label)}</a>`;
  return [
    renderSkip(nav, skipTarget),
    `<header class="bw-site-nav" data-bw-nav>`,
    `<div class="bw-container bw-site-nav__bar">`,
    `<a class="bw-logotype" href="${escapeHtml(nav.wordmark.href)}"${attrCurrent(nav.wordmark.href, current)}>${escapeHtml(nav.wordmark.label)}</a>`,
    `<nav class="bw-site-nav__primary" aria-label="Main"><ul class="bw-site-nav__list">${desktopItems(nav, current, prefix, section)}</ul></nav>`,
    `<div class="bw-site-nav__actions">${navAction(search)}${navAction(signin)}${doorButton(talk)}${doorButton(start)}</div>`,
    doorButton(start, ' bw-site-nav__phone-start'),
    `<details class="bw-site-nav__phone" data-bw-phone-menu><summary class="bw-site-nav__menu-button">${ICONS.menu}<span>${escapeHtml(nav.phone.menu_label)}</span></summary>`,
    `<div class="bw-site-nav__sheet"><nav aria-label="Main">`,
    `<div class="bw-site-nav__doors">${doorButton(start, ' bw-button--block')}${doorButton(talk, ' bw-button--block')}</div>`,
    `<ul class="bw-site-nav__groups">${phoneItems(nav, current, section)}</ul>`,
    `<ul class="bw-site-nav__more"><li>${link('bw-site-nav__link', signin, current)}</li><li><a class="bw-site-nav__link" href="${escapeHtml(search.href)}"${attrCurrent(search.href, current)}>${escapeHtml(search.label)}</a></li></ul>`,
    `</nav></div></details>`,
    `</div>`,
    `</header>`
  ].join('');
}

export function renderFooter(nav, { current = '', idPrefix = 'bw-footer' } = {}) {
  const f = nav.footer;
  const c = f.company;
  const prefix = String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '');
  const columns = f.columns.map((column, i) => {
    const id = `${prefix}-${i}`;
    const links = column.links.map(item => `<li>${link('', item, current)}</li>`).join('');
    return `<div><h2 class="bw-site-footer__title" id="${id}">${escapeHtml(column.title)}</h2><ul class="bw-site-footer__list" aria-labelledby="${id}">${links}</ul></div>`;
  }).join('');
  const legal = f.legal.map(item => `<li>${link('', item, current)}</li>`).join('');
  return [
    `<footer class="bw-site-footer">`,
    `<div class="bw-container">`,
    `<div class="bw-site-footer__top">`,
    `<div class="bw-site-footer__brand">`,
    `<a class="bw-logotype" href="${escapeHtml(nav.wordmark.href)}">${escapeHtml(nav.wordmark.label)}</a>`,
    `<p class="bw-site-footer__line">${escapeHtml(f.brand_line)}</p>`,
    `<address class="bw-site-footer__address">${escapeHtml(c.name)}, ${escapeHtml(c.street)}, ${escapeHtml(c.locality)}, ${escapeHtml(c.country)}<br><a href="${escapeHtml(c.phone_href)}">${escapeHtml(c.phone)}</a><br><a href="${escapeHtml(c.email_href)}">${escapeHtml(c.email)}</a></address>`,
    `</div>`,
    `<nav class="bw-site-footer__columns" aria-label="Footer">${columns}</nav>`,
    `</div>`,
    `<div class="bw-site-footer__last"><ul class="bw-site-footer__legal" aria-label="Legal and site">${legal}</ul><p>${escapeHtml(f.copyright)}</p></div>`,
    `</div>`,
    `</footer>`
  ].join('');
}

export function renderChrome(nav, options = {}) {
  return { header: renderNav(nav, options), footer: renderFooter(nav, options) };
}
