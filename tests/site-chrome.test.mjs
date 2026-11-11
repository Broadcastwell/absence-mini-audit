// The navigation and footer of audit.broadcastwell.com on brand system 3 (brief 9.1, 9.2, 11.1).
// Through this branch the page keeps today's links, drawn in the brand markup by
// scripts/legacy-chrome.mjs; SHARED_NAV in scripts/site-chrome.mjs switches to brand/nav.json.
// The behavior is the brand's one script, vendor/brand/nav.js, inlined byte for byte: menus are
// details elements that open on click and Enter without script; the script adds Escape (focus back
// to the menu's button), outside click, focus leaving, and one desktop menu at a time. Nothing traps focus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SHARED_NAV, SHARED, LEGACY } from '../scripts/site-chrome.mjs';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const html = read('public/index.html');
const script = read('vendor/brand/nav.js');
const data = SHARED_NAV ? SHARED : LEGACY;

test('the navigation of the committed switch, in the brand markup, after a skip link', () => {
  assert.ok(html.includes('/* brand nav: begin */\n' + script.trim() + '\n/* brand nav: end */'), 'the one inline navigation script is the vendored nav.js');
  const header = html.match(/<header class="bw-site-nav" data-bw-nav>[\s\S]*?<\/header>/)[0];
  assert.ok(html.indexOf('<a class="bw-skip" href="#main">Skip to content</a>') < html.indexOf('<header class="bw-site-nav"'));
  const desktop = header.match(/<ul class="bw-site-nav__list">([\s\S]*?)<\/ul><\/nav>/)[1];
  assert.deepEqual([...desktop.matchAll(/<(?:a|summary) class="bw-site-nav__trigger[^"]*"[^>]*>([^<]+)</g)].map(x => x[1]), data.items.map(item => item.label));
  assert.match(header, /<a class="bw-site-nav__action" href="https:\/\/app.broadcastwell.com\/signin">Sign in<\/a>/);
  if (!SHARED_NAV) {
    assert.deepEqual(data.items.map(item => item.label), ['Product', 'Research', 'Free tools', 'Pricing', 'Exchange', 'Company']);
    assert.equal((header.match(/<a class="bw-button bw-button--secondary[^"]*" href="https:\/\/broadcastwell.com\/buy\/answer-repair" data-buy>Fix one answer, \$490<\/a>/g) || []).length, 3);
  }
  // The phone bar and its sheet: the menu button names itself, the sheet holds the actions first.
  assert.match(header, /<details class="bw-site-nav__phone" data-bw-phone-menu><summary class="bw-site-nav__menu-button"><svg class="bw-icon bw-icon--24"[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg><span>Menu<\/span><\/summary>/);
  const sheet = header.slice(header.indexOf('bw-site-nav__sheet'));
  assert.ok(sheet.indexOf('bw-site-nav__doors') < sheet.indexOf('bw-site-nav__groups'));
  // The brand's 48 px controls and its 2 px focus with offset.
  assert.match(html, /\.bw-site-nav__trigger\{display:inline-flex;align-items:center;gap:var\(--bw-space-4\);min-height:var\(--bw-space-48\)/);
  assert.match(html, /--bw-focus-width:2px;--bw-focus-offset:2px;/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon|document\.cookie/);
});

test('the footer of the committed switch: columns, contact and legal details', () => {
  const footer = html.match(/<footer class="bw-site-footer">[\s\S]*?<\/footer>/)[0];
  const columns = [...footer.matchAll(/<h2 class="bw-site-footer__title" id="[^"]+">([^<]+)<\/h2><ul class="bw-site-footer__list"[^>]*>([\s\S]*?)<\/ul>/g)];
  assert.equal(columns.length, 5);
  columns.forEach((column, i) => {
    assert.equal(column[1], data.footer.columns[i].title);
    assert.deepEqual([...column[2].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(x => x[1].replace(/<wbr\s*\/?>/g, '').replace(/&amp;/g, '&')), data.footer.columns[i].links.map(link => link.label));
  });
  assert.match(footer, /href="tel:\+18123457272">\(812\) 345 7272/);
  for (const slug of ['terms', 'privacy', 'cookies']) assert.ok(footer.includes(`href="https://broadcastwell.com/${slug}"`));
  if (!SHARED_NAV) {
    assert.match(footer, /<a href="mailto:hello@broadcastwell.com">hello@<wbr>broadcastwell.com<\/a>/);
    assert.match(footer, /517 E Kirkwood Ave<br>Bloomington, IN 47408<br>United States/);
    assert.match(footer, /<time datetime="\d{4}-\d{2}-\d{2}">/);
    assert.match(footer, /<p class="bw-site-footer__note footer-allowance"><strong>Free 10-question check \(one engine\):<\/strong> No email is needed; runs are limited per network and per day, and by the site's daily allowance\.<\/p>/);
  } else {
    assert.match(footer, /Broadcastwell LLC, 517 E Kirkwood Ave, Bloomington, IN 47408, United States/);
    assert.doesNotMatch(footer, /Last updated|<time/);
  }
  assert.match(html, /\.bw-site-footer__columns\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
});

// A small DOM for nav.js: details elements with summaries and links inside one [data-bw-nav].
function simulate() {
  const listeners = { document: {} };
  function node(name, parent) {
    const el = { name, parent, open: false, attrs: {}, children: [], listeners: {}, focused: false,
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
      addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      contains(other) { for (let n = other; n; n = n.parent) if (n === this) return true; return false; },
      focus() { this.focused = true; doc.activeElement = this; },
      closest(selector) { for (let n = this; n; n = n.parent) if (selector === 'details[open]' && n.details && n.open) return n; return null; } };
    if (parent) parent.children.push(el);
    return el;
  }
  const nav = node('nav', null);
  const menus = [0, 1].map(i => { const d = node('menu' + i, nav); d.details = true; d.kind = 'menu'; d.summary = node('summary' + i, d); d.link = node('link' + i, d); return d; });
  const phone = node('phone', nav); phone.details = true; phone.kind = 'phone'; phone.summary = node('phone-summary', phone); phone.link = node('phone-link', phone);
  const outside = node('outside', null);
  const all = [...menus, phone];
  for (const d of all) d.querySelector = sel => sel === 'summary' ? d.summary : null;
  nav.querySelectorAll = sel => {
    if (sel === '.bw-site-nav__menu[data-bw-menu]') return menus;
    if (sel === 'details[data-bw-menu][open], details[data-bw-phone-menu][open]') return all.filter(d => d.open);
    return [];
  };
  nav.querySelector = sel => sel === 'details[data-bw-phone-menu][open]' ? (phone.open ? phone : null) : null;
  const doc = { readyState: 'complete', activeElement: null, querySelectorAll: sel => sel === '[data-bw-nav]' ? [nav] : [], addEventListener(type, fn) { (listeners.document[type] = listeners.document[type] || []).push(fn); } };
  vm.runInNewContext(script, { document: doc });
  const fire = (target, type, event) => (target.listeners[type] || []).forEach(fn => fn(event));
  return { nav, menus, phone, outside, doc, fire, docFire: (type, event) => (listeners.document[type] || []).forEach(fn => fn(event)) };
}

test('Escape closes the open menu and returns focus to its button', () => {
  const ui = simulate();
  ui.menus[0].open = true;
  let prevented = false;
  ui.fire(ui.nav, 'keydown', { key: 'Escape', target: ui.menus[0].link, preventDefault() { prevented = true; } });
  assert.equal(ui.menus[0].open, false);
  assert.equal(ui.menus[0].summary.focused, true);
  assert.equal(prevented, true);
  ui.phone.open = true;
  ui.fire(ui.nav, 'keydown', { key: 'Escape', target: ui.phone.link, preventDefault() {} });
  assert.equal(ui.phone.open, false);
  assert.equal(ui.doc.activeElement, ui.phone.summary);
  ui.fire(ui.nav, 'keydown', { key: 'Tab', target: ui.menus[1].summary, preventDefault() { throw new Error('nothing traps focus'); } });
});

test('opening one desktop menu closes the other; a click outside closes every open menu', () => {
  const ui = simulate();
  ui.menus[0].open = true; ui.fire(ui.menus[0], 'toggle', {});
  ui.menus[1].open = true; ui.fire(ui.menus[1], 'toggle', {});
  assert.equal(ui.menus[0].open, false);
  assert.equal(ui.menus[1].open, true);
  ui.phone.open = true;
  ui.docFire('click', { target: ui.outside });
  assert.equal(ui.menus[1].open, false);
  assert.equal(ui.phone.open, false);
  ui.menus[0].open = true;
  ui.docFire('click', { target: ui.menus[0].link });
  assert.equal(ui.menus[0].open, true, 'a click inside the open menu keeps it open');
});

test('focus leaving a menu closes it; focus staying inside keeps it open', () => {
  const ui = simulate();
  ui.menus[0].open = true;
  ui.fire(ui.nav, 'focusout', { relatedTarget: ui.menus[0].link });
  assert.equal(ui.menus[0].open, true);
  ui.fire(ui.nav, 'focusout', { relatedTarget: ui.menus[1].summary });
  assert.equal(ui.menus[0].open, false);
  ui.phone.open = true;
  ui.fire(ui.nav, 'focusout', { relatedTarget: ui.outside });
  assert.equal(ui.phone.open, false);
  ui.menus[1].open = true;
  ui.fire(ui.nav, 'focusout', { relatedTarget: null });
  assert.equal(ui.menus[1].open, true, 'focus leaving the window closes nothing');
});

test('the script wires each navigation once', () => {
  const ui = simulate();
  assert.equal(ui.nav.getAttribute('data-bw-nav-ready'), '1');
  assert.equal(ui.nav.listeners.keydown.length, 1);
});
