/* Broadcastwell navigation behavior, brand system 3.0.0. No dependencies, no inline styles.
   Menus are <details> elements, so they open on click and on Enter without this script.
   This adds: Escape closes the open menu and returns focus to its button; a click or focus
   outside closes it; opening one desktop menu closes the others. Nothing traps focus. */
(function () {
  "use strict";
  function closeMenu(menu, returnFocus) {
    if (!menu || !menu.open) return;
    menu.open = false;
    if (returnFocus) {
      var summary = menu.querySelector("summary");
      if (summary) summary.focus();
    }
  }
  function openMenus(scope) {
    return Array.prototype.slice.call(scope.querySelectorAll("details[data-bw-menu][open], details[data-bw-phone-menu][open]"));
  }
  function wire(nav) {
    if (nav.getAttribute("data-bw-nav-ready") === "1") return;
    nav.setAttribute("data-bw-nav-ready", "1");
    var menus = Array.prototype.slice.call(nav.querySelectorAll(".bw-site-nav__menu[data-bw-menu]"));
    menus.forEach(function (menu) {
      menu.addEventListener("toggle", function () {
        if (!menu.open) return;
        menus.forEach(function (other) { if (other !== menu) other.open = false; });
      });
    });
    nav.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" && event.key !== "Esc") return;
      var open = openMenus(nav);
      if (!open.length) return;
      var target = event.target && event.target.closest ? event.target.closest("details[open]") : null;
      var inner = target && open.indexOf(target) >= 0 ? target : open[open.length - 1];
      closeMenu(inner, true);
      event.preventDefault();
    });
    document.addEventListener("click", function (event) {
      openMenus(nav).forEach(function (menu) {
        if (!menu.contains(event.target)) closeMenu(menu, false);
      });
    });
    nav.addEventListener("focusout", function (event) {
      var next = event.relatedTarget;
      if (!next) return;
      menus.forEach(function (menu) { if (menu.open && !menu.contains(next)) closeMenu(menu, false); });
      var phone = nav.querySelector("details[data-bw-phone-menu][open]");
      if (phone && !phone.contains(next)) closeMenu(phone, false);
    });
  }
  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-bw-nav]"), wire);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
