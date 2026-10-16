/* Shared disclosure behavior. No requests, storage, tracking or account access. */
(function () {
  if (!document.querySelectorAll || !window.matchMedia) return;
  if (window.BroadcastwellSiteChrome) { window.BroadcastwellSiteChrome.init(); return; }
  var mobileFooter = window.matchMedia('(max-width: 809px)');
  var mobileHeader = window.matchMedia('(max-width: 1099px)');
  var groupState = new WeakMap();
  var boundMenus = new WeakSet();
  var headerFocus = new WeakMap();
  function matching(root, selector) {
    var nodes = Array.prototype.slice.call(root.querySelectorAll(selector));
    if (root.matches && root.matches(selector)) nodes.unshift(root);
    return nodes;
  }
  function contains(node, target) { return !!(target && node.contains && node.contains(target)); }
  function syncGroup(group) {
    var state = groupState.get(group);
    if (!state) return;
    var summary = group.querySelector('summary');
    // Resizing must never hide the link a keyboard user is currently reading.
    if (mobileFooter.matches && document.activeElement !== summary && contains(group, document.activeElement)) state.mobileOpen = true;
    group.open = mobileFooter.matches ? state.mobileOpen : true;
    if (mobileFooter.matches) { summary.removeAttribute('tabindex'); summary.removeAttribute('aria-disabled'); }
    else { summary.setAttribute('tabindex', '-1'); summary.setAttribute('aria-disabled', 'true'); }
  }
  function menuLabel(menu) { menu.querySelector('summary').setAttribute('aria-label', (menu.open ? 'Close' : 'Open') + ' Broadcastwell navigation'); }
  function dismiss(menu, focus) { menu.open = false; menuLabel(menu); if (focus) menu.querySelector('summary').focus(); }
  function rememberHeaderFocus(target) {
    matching(document, '[data-bw-site-header]').forEach(function (header) {
      headerFocus.set(header, contains(header, target) ? target : null);
    });
  }
  function syncMenu(menu) {
    var active = document.activeElement;
    var header = menu.closest && menu.closest('[data-bw-site-header]');
    // CSS can hide the old breakpoint before matchMedia dispatches its change.
    // Only recover focus lost to the document; never override another control.
    if (header && (active === document.body || active === document.documentElement)) {
      var previous = headerFocus.get(header);
      if (contains(header, previous)) active = previous;
    }
    if (!mobileHeader.matches) {
      var destination = header && contains(menu, active) ? header.querySelector('.bw-shared-wordmark') : null;
      dismiss(menu, false);
      if (destination) destination.focus();
    } else if (header && contains(header, active) && active.closest && active.closest('.bw-shared-nav, .bw-shared-signin')) {
      menu.querySelector('summary').focus();
    }
  }
  function init(root) {
    root = root || document;
    matching(root, '[data-bw-footer-group]').forEach(function (group) {
      if (!groupState.has(group)) {
        var state = {mobileOpen:false};
        groupState.set(group, state);
        group.querySelector('summary').addEventListener('click', function (event) {
          if (!mobileFooter.matches) { event.preventDefault(); return; }
          state.mobileOpen = !group.open;
        });
        group.addEventListener('toggle', function () { if (!mobileFooter.matches && !group.open) group.open = true; });
      }
      syncGroup(group);
    });
    matching(root, '[data-bw-site-menu]').forEach(function (menu) {
      if (!boundMenus.has(menu)) {
        boundMenus.add(menu);
        menu.addEventListener('toggle', function () { menuLabel(menu); });
        menu.addEventListener('keydown', function (event) {
          if (event.key === 'Escape' && menu.open) { event.preventDefault(); dismiss(menu, true); }
        });
        menu.addEventListener('click', function (event) {
          if (event.target.closest && event.target.closest('a[href]')) dismiss(menu, false);
        });
      }
      menuLabel(menu); syncMenu(menu);
    });
    rule();
  }
  function rule() {
    matching(document, '[data-bw-site-header]').forEach(function (header) { header.setAttribute('data-scrolled', window.scrollY > 0 ? 'true' : 'false'); });
  }
  // Global listeners query current nodes. Replaced app views are not retained.
  function footerResize() { matching(document, '[data-bw-footer-group]').forEach(syncGroup); }
  function headerResize() { matching(document, '[data-bw-site-menu]').forEach(syncMenu); }
  if (mobileFooter.addEventListener) mobileFooter.addEventListener('change', footerResize);
  else if (mobileFooter.addListener) mobileFooter.addListener(footerResize);
  if (mobileHeader.addEventListener) mobileHeader.addEventListener('change', headerResize);
  else if (mobileHeader.addListener) mobileHeader.addListener(headerResize);
  document.addEventListener('focusin', function (event) { rememberHeaderFocus(event.target); });
  document.addEventListener('click', function (event) {
    rememberHeaderFocus(event.target);
    matching(document, '[data-bw-site-menu]').forEach(function (menu) { if (menu.open && !contains(menu, event.target)) dismiss(menu, contains(menu, document.activeElement)); });
  });
  window.BroadcastwellSiteChrome = {init:init};
  init();
  window.addEventListener('scroll', rule, {passive:true});
})();
