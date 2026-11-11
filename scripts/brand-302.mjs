// Brand 3.0.2 on audit.broadcastwell.com, drawn over the vendored 3.0.1 package (vendor/brand stays
// byte for byte as synced): the footer legal row gains Procurement, after Integrity Standard. Nothing
// else in the navigation changes. A package that already lists Procurement is returned unchanged, so
// re-vendoring 3.0.2 makes this a no-op. The wordmark's no-wrap rule sits in the page's own styles.
export const PROCUREMENT = Object.freeze({ label: 'Procurement', href: 'https://broadcastwell.com/procurement' });

export function withBrand302(nav) {
  const legal = nav.footer.legal;
  if (legal.some(item => item.href === PROCUREMENT.href)) return nav;
  const after = legal.findIndex(item => item.label === 'Integrity Standard');
  const at = after < 0 ? legal.length : after + 1;
  return { ...nav, footer: { ...nav.footer, legal: [...legal.slice(0, at), { ...PROCUREMENT }, ...legal.slice(at)] } };
}
