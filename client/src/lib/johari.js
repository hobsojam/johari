/**
 * Computes the four Johari quadrants for a target participant.
 *
 * @param {{ id: string, selfSelections?: string[] }} target
 * @param {Array<{ id: string, peerSelections?: Record<string, string[]> }>} all
 * @param {string[]} words  The session word list (determines output order)
 * @returns {{ open: string[], hidden: string[], blindSpot: string[], unknown: string[] }}
 */
export function computeQuadrants(target, all, words) {
  const selfSet = new Set(target.selfSelections ?? []);
  const peerSet = new Set();
  for (const p of all) {
    if (p.id === target.id) continue;
    for (const w of (p.peerSelections?.[target.id] ?? [])) {
      peerSet.add(w);
    }
  }
  return {
    open:      words.filter(w =>  selfSet.has(w) &&  peerSet.has(w)),
    hidden:    words.filter(w =>  selfSet.has(w) && !peerSet.has(w)),
    blindSpot: words.filter(w => !selfSet.has(w) &&  peerSet.has(w)),
    unknown:   words.filter(w => !selfSet.has(w) && !peerSet.has(w)),
  };
}
