import { describe, test, expect } from 'vitest';
import { computeQuadrants } from './johari.js';

const WORDS = ['bold', 'calm', 'clever', 'kind', 'shy', 'warm'];

// Helpers
function target(selfSelections = [], peerSelectionsForOthers = {}) {
  return { id: 'alice', selfSelections, peerSelections: peerSelectionsForOthers };
}
function peer(selectionsForAlice = [], id = 'bob') {
  return { id, peerSelections: { alice: selectionsForAlice } };
}

describe('computeQuadrants', () => {
  test('splits words into the correct four quadrants', () => {
    // alice chose bold + calm for herself
    // bob chose calm + kind for alice
    const result = computeQuadrants(
      target(['bold', 'calm']),
      [target(['bold', 'calm']), peer(['calm', 'kind'])],
      WORDS,
    );
    expect(result.open).toEqual(['calm']);       // self ∩ peer
    expect(result.hidden).toEqual(['bold']);     // self \ peer
    expect(result.blindSpot).toEqual(['kind']);  // peer \ self
    expect(result.unknown).toEqual(['clever', 'shy', 'warm']); // neither
  });

  test('every word appears in exactly one quadrant', () => {
    const result = computeQuadrants(
      target(['bold', 'calm']),
      [target(['bold', 'calm']), peer(['calm', 'kind'])],
      WORDS,
    );
    const all = [...result.open, ...result.hidden, ...result.blindSpot, ...result.unknown];
    expect(all.sort()).toEqual([...WORDS].sort());
  });

  test('output order follows wordList, not selection order', () => {
    // selfSelections in reverse order — output must still follow WORDS order
    const result = computeQuadrants(
      target(['warm', 'bold']),
      [target(['warm', 'bold']), peer([])],
      WORDS,
    );
    expect(result.hidden).toEqual(['bold', 'warm']);
  });

  test('empty self-selections: all peer words become blind spot', () => {
    const result = computeQuadrants(
      target([]),
      [target([]), peer(['bold', 'calm'])],
      WORDS,
    );
    expect(result.open).toEqual([]);
    expect(result.hidden).toEqual([]);
    expect(result.blindSpot).toEqual(['bold', 'calm']);
    expect(result.unknown).toEqual(['clever', 'kind', 'shy', 'warm']);
  });

  test('empty peer selections: all self words become hidden', () => {
    const result = computeQuadrants(
      target(['bold', 'calm']),
      [target(['bold', 'calm']), peer([])],
      WORDS,
    );
    expect(result.open).toEqual([]);
    expect(result.hidden).toEqual(['bold', 'calm']);
    expect(result.blindSpot).toEqual([]);
    expect(result.unknown).toEqual(['clever', 'kind', 'shy', 'warm']);
  });

  test('multiple peers: peerSet is the union of all their selections for target', () => {
    const bob   = { id: 'bob',   peerSelections: { alice: ['bold'] } };
    const carol = { id: 'carol', peerSelections: { alice: ['calm'] } };
    const alice = target([]);
    const result = computeQuadrants(alice, [alice, bob, carol], WORDS);
    expect(result.blindSpot).toEqual(['bold', 'calm']);
  });

  test("target's own peerSelections for others do not affect their own quadrants", () => {
    // alice selected 'warm' for bob — must not appear in alice's peerSet
    const alice = { id: 'alice', selfSelections: [], peerSelections: { bob: ['warm'] } };
    const bob   = { id: 'bob',   peerSelections: {} }; // chose nothing for alice
    const result = computeQuadrants(alice, [alice, bob], WORDS);
    expect(result.blindSpot).toEqual([]);
    expect(result.open).toEqual([]);
  });

  test('handles missing selfSelections gracefully', () => {
    const alice = { id: 'alice' }; // no selfSelections property
    const result = computeQuadrants(alice, [alice, peer(['bold'])], WORDS);
    expect(result.blindSpot).toEqual(['bold']);
    expect(result.open).toEqual([]);
    expect(result.hidden).toEqual([]);
  });

  test('handles peer with no peerSelections entry for target', () => {
    const alice = target(['bold']);
    const bob   = { id: 'bob', peerSelections: {} }; // no entry for alice
    const result = computeQuadrants(alice, [alice, bob], WORDS);
    expect(result.hidden).toEqual(['bold']);
    expect(result.open).toEqual([]);
  });

  test('no peers: no open or blind spot, self → hidden, rest → unknown', () => {
    const alice = target(['bold']);
    const result = computeQuadrants(alice, [alice], WORDS);
    expect(result.open).toEqual([]);
    expect(result.hidden).toEqual(['bold']);
    expect(result.blindSpot).toEqual([]);
    expect(result.unknown).toEqual(['calm', 'clever', 'kind', 'shy', 'warm']);
  });

  test('all words in both self and peer: everything is open', () => {
    const alice = target(WORDS);
    const bob   = peer(WORDS);
    const result = computeQuadrants(alice, [alice, bob], WORDS);
    expect(result.open).toEqual(WORDS);
    expect(result.hidden).toEqual([]);
    expect(result.blindSpot).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  test('words outside the wordList are silently excluded from all quadrants', () => {
    // stale word removed from wordList — must not surface in any quadrant
    const alice = target(['bold', 'old-word']);
    const bob   = peer(['bold', 'another-stale']);
    const result = computeQuadrants(alice, [alice, bob], WORDS);
    const allWords = [...result.open, ...result.hidden, ...result.blindSpot, ...result.unknown];
    expect(allWords).not.toContain('old-word');
    expect(allWords).not.toContain('another-stale');
    expect(result.open).toEqual(['bold']);
  });

  test('duplicate words across multiple peers are treated as one selection', () => {
    const carol = { id: 'carol', peerSelections: { alice: ['bold'] } };
    const dave  = { id: 'dave',  peerSelections: { alice: ['bold'] } }; // same word
    const alice = target([]);
    const result = computeQuadrants(alice, [alice, carol, dave], WORDS);
    expect(result.blindSpot).toEqual(['bold']); // bold appears once, not twice
  });
});
