// Confirmed names are supplied by the visitor. A host match keeps its original rule.
export const COMMON_NAMES = new Set('foundation canopy epic point sage zoom box notion monday click up team teams slack wave square fresh works gusto fleet toast ramp bolt simple cloud easy smart basic field next exact insight champion current clear core apex matrix spectrum vista pioneer pulse origin compass atlas mercury spark workday service now one open quality connect advance enterprise success impact practice front office ascend avail blend caret close copper cornerstone curve eclipse encompass ideal instinct leap maestro mews needles nimble path shepherd synapse timberline via base time build software systems technologies solutions group company'.split(' '));

export function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/(?:\s+(?:incorporated|inc|llc|ltd|limited|corporation|corp|company|co|software|systems|technologies|technology|solutions|group))+$/g, '').trim();
}

export function confirmedNames(brand, products) {
  return [...new Set([brand, ...(Array.isArray(products) ? products.slice(0, 5) : [])].filter(v => typeof v === 'string').map(v => v.trim().slice(0, 120)).filter(Boolean))];
}

export function hostMatch(host, text) {
  const esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const label = host.split('.')[0];
  return !!host && (new RegExp('(^|[^a-z0-9])' + esc(label) + '([^a-z0-9]|$)', 'i').test(text) || new RegExp('(^|[^a-z0-9.])' + esc(host) + '([^a-z0-9.]|$)', 'i').test(text));
}

export function matchIdentity(row, meta) {
  const names = confirmedNames(meta.brand, meta.product_names);
  const entities = row.names_status === 'extracted' && Array.isArray(row.named_companies) ? row.named_companies : [];
  const matches = [];
  for (const name of names) {
    const norm = normalizeName(name);
    if (!norm) continue;
    const entity = entities.find(value => normalizeName(value) === norm);
    if (entity) { matches.push(entity); continue; }
    const words = name.trim().split(/\s+/);
    if (words.length === 1 && COMMON_NAMES.has(norm)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp('(?<![\\p{L}\\p{N}_])(' + escaped + ')(?![\\p{L}\\p{N}_])', 'giu');
    for (const found of String(row.answer || '').matchAll(re)) {
      if (/^\p{Lu}/u.test(found[1])) { matches.push(found[1]); break; }
    }
  }
  const legacy = hostMatch(meta.host || '', row.answer || '');
  return { named: legacy || matches.length > 0, matched_names: [...new Set(matches.length ? matches : legacy ? [meta.host] : [])] };
}

export function ownEntity(name, meta) {
  const norm = normalizeName(name);
  return hostMatch(meta.host || '', name) || !!norm && confirmedNames(meta.brand, meta.product_names).some(value => normalizeName(value) === norm);
}
