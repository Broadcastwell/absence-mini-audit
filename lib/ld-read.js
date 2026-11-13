// The structured data of a page (JSON-LD), read in one bounded pass. A page is whatever a
// stranger's server sends, so what is read of its structured data has a limit at every turn: so
// many blocks, so many entries looked at, so many nodes kept, and lists inside lists followed only
// so deep. What is past a limit is not read. Nothing here calls itself, no list is taken apart
// from the front and no list is spread into a call, so the time this takes grows with the length
// of the page and no faster.
//
// The limits stand where an ordinary page never meets them (ruling R-222): a catalog page with a
// block for each of its products, or a long list of questions and answers, reads as it always
// did. The bytes of structured data have no limit of their own: a page has its size limit, and
// the structured data is part of the page.
//
// The same bytes are lib/ld-read.js of the audit site (absence-mini-audit) and
// functions/lib/fix/ld-read.js of the app. A test on each side pins the SHA-256 of this file
// (tests/reader-drift.test.mjs in the audit site, test/fix-freecheck-drift.test.js in the app).
// The file changes in both repositories in the same release, or the test of the side that was
// left behind fails.

import { ldJsonBlocks } from './html-scan.js';

export const LD_LIMITS = Object.freeze({ blocks: 100, visited: 20_000, nodes: 60, depth: 4 });

// The nodes of one parsed block, in the order they were always read: the block itself or its
// entries, then the entries of each @graph. One forward walk by index over a list that never
// grows past the number of entries that may be looked at. Every entry looked at is counted,
// whatever it is.
// It adds the nodes to `nodes` and answers with the number of entries it looked at.
function nodesOfBlock(parsed, nodes, visits) {
  const most = Math.max(0, Math.min(LD_LIMITS.visited, visits));
  // The usual block is one node with no list in it: it is looked at, kept, and that is all.
  if (most > 0 && parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !Array.isArray(parsed['@graph'])) {
    nodes.push(parsed);
    return 1;
  }
  const queue = Array.isArray(parsed) ? parsed.slice(0, most) : [parsed];
  // How deep each entry of the queue stands: 0 for the block's own, one more for each @graph.
  const depths = new Array(queue.length).fill(0);
  let at = 0;
  for (; at < queue.length && at < most && nodes.length < LD_LIMITS.nodes; at += 1) {
    const node = queue[at];
    if (!node || typeof node !== 'object') continue;
    const graph = node['@graph'];
    if (Array.isArray(graph) && depths[at] < LD_LIMITS.depth) {
      for (let index = 0; index < graph.length && queue.length < most; index += 1) { queue.push(graph[index]); depths.push(depths[at] + 1); }
    }
    nodes.push(node);
  }
  return at;
}

// Every node of the page's structured data, inside the limits. A block that is not JSON is passed
// over.
export function jsonLdNodes(html) {
  const nodes = [];
  let visits = LD_LIMITS.visited;
  for (const block of ldJsonBlocks(html, LD_LIMITS.blocks)) {
    if (nodes.length >= LD_LIMITS.nodes || visits <= 0) break;
    let parsed;
    try { parsed = JSON.parse(block.trim()); } catch { continue; }
    visits -= nodesOfBlock(parsed, nodes, visits);
  }
  return nodes;
}

// A value of structured data as text: what String gives, and nothing for a value that cannot be
// set as text. JSON can spell an object whose toString is a number, and a list nested deeper than
// the runtime will walk: either would throw, and a page must never make its reader throw.
export function textOf(value) {
  try { return String(value || ''); } catch { return ''; }
}

// The types of a node, as text. A node has one type or a list of them.
export function typesOf(node) {
  const type = node['@type'];
  return (Array.isArray(type) ? type : [type]).map(textOf);
}
