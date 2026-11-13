// The structured data of a page (JSON-LD), read in one bounded pass. A page is whatever a
// stranger's server sends, so what is read of its structured data has a limit at every turn: so
// many bytes of it, so many blocks, so many entries looked at, so many nodes kept, and lists inside
// lists followed only so deep. What is past a limit is not read. Nothing here calls itself, no
// list is taken apart from the front and no list is spread into a call, so the time this takes
// grows with the length of the page and no faster.
//
// This is the reader of the app's fix engine (bw-client-data functions/lib/fix/site-read.js,
// nodesOfBlock and jsonLdNodes, with LD_LIMITS of engine-config.js), moved here line for line with
// its limits beside it. The order is the one the free check has always read in: the block itself or
// its entries, then the entries of each @graph. Tests on both sides hold the limits equal and read
// the same recorded pages.

import { ldJsonBlocks } from './html-scan.js';

export const LD_LIMITS = Object.freeze({ bytes: 200_000, blocks: 20, visited: 2_000, nodes: 60, depth: 4 });

// The nodes of one parsed block. One forward walk by index over a list that never grows past the
// number of entries that may be looked at. Every entry looked at is counted, whatever it is.
function nodesOfBlock(parsed, room) {
  const nodes = [];
  const most = Math.max(0, Math.min(LD_LIMITS.visited, room.visits));
  const queue = (Array.isArray(parsed) ? parsed.slice(0, most) : [parsed]).map((value) => ({ value, depth: 0 }));
  let at = 0;
  for (; at < queue.length && at < most && nodes.length < room.nodes; at += 1) {
    const { value: node, depth } = queue[at];
    if (!node || typeof node !== 'object') continue;
    const graph = node['@graph'];
    if (Array.isArray(graph) && depth < LD_LIMITS.depth) {
      for (let index = 0; index < graph.length && queue.length < most; index += 1) queue.push({ value: graph[index], depth: depth + 1 });
    }
    nodes.push(node);
  }
  return { nodes, visited: at };
}

// Every node of the page's structured data, inside the limits. A block that would pass the byte
// limit is not parsed at all, and a block that is not JSON is passed over.
export function jsonLdNodes(html) {
  const nodes = [];
  let bytes = 0, visits = LD_LIMITS.visited;
  for (const block of ldJsonBlocks(html, LD_LIMITS.blocks)) {
    if (nodes.length >= LD_LIMITS.nodes || visits <= 0) break;
    if (bytes + block.length > LD_LIMITS.bytes) continue;
    bytes += block.length;
    let parsed;
    try { parsed = JSON.parse(block.trim()); } catch { continue; }
    const read = nodesOfBlock(parsed, { visits, nodes: LD_LIMITS.nodes - nodes.length });
    visits -= read.visited;
    for (const node of read.nodes) nodes.push(node);
  }
  return nodes;
}
