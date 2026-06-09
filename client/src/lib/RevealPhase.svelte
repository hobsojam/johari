<script>
  import { sessionState, myId, send } from '../ws.js';
  import { computeQuadrants } from './johari.js';

  $: isAdmin = $sessionState?.adminId === $myId;
  $: participants = $sessionState?.participants ?? [];
  $: wordList = $sessionState?.wordList ?? [];

  let viewingId = null;
  $: if (!viewingId && $myId) viewingId = $myId;

  $: viewingParticipant = participants.find(p => p.id === viewingId) ?? participants[0];

  $: quadrants = viewingParticipant
    ? computeQuadrants(viewingParticipant, participants, wordList)
    : { open: [], blindSpot: [], hidden: [], unknown: [] };

  function reset() {
    send('reset');
  }
</script>

<div class="container">
  <header>
    <h1 tabindex="-1">Reveal</h1>
    {#if isAdmin}
      <button type="button" class="btn secondary" on:click={reset}>Reset session</button>
    {/if}
  </header>

  {#if participants.length > 1}
    <nav aria-label="View participant windows" class="participant-tabs">
      {#each participants as p}
        <button
          type="button"
          class="tab"
          class:active={p.id === viewingId}
          aria-pressed={p.id === viewingId}
          on:click={() => viewingId = p.id}
        >
          {p.name}
          {#if p.id === $myId}<span class="you"> (you)</span>{/if}
        </button>
      {/each}
    </nav>
  {/if}

  {#if viewingParticipant}
    <h2 class="viewing-name" aria-live="polite" aria-atomic="true">{viewingParticipant.name}'s Johari Window</h2>

    <div class="window-grid">
      <div class="quadrant open" role="region" aria-labelledby="q-open">
        <h3 id="q-open">Open</h3>
        <p class="q-desc">Known to self · Known to others</p>
        <div class="chips">
          {#each quadrants.open as w}<span class="chip">{w}</span>{/each}
          {#if quadrants.open.length === 0}<span class="empty">—</span>{/if}
        </div>
      </div>

      <div class="quadrant blind-spot" role="region" aria-labelledby="q-blind">
        <h3 id="q-blind">Blind Spot</h3>
        <p class="q-desc">Unknown to self · Known to others</p>
        <div class="chips">
          {#each quadrants.blindSpot as w}<span class="chip">{w}</span>{/each}
          {#if quadrants.blindSpot.length === 0}<span class="empty">—</span>{/if}
        </div>
      </div>

      <div class="quadrant hidden" role="region" aria-labelledby="q-hidden">
        <h3 id="q-hidden">Hidden</h3>
        <p class="q-desc">Known to self · Unknown to others</p>
        <div class="chips">
          {#each quadrants.hidden as w}<span class="chip">{w}</span>{/each}
          {#if quadrants.hidden.length === 0}<span class="empty">—</span>{/if}
        </div>
      </div>

      <div class="quadrant unknown" role="region" aria-labelledby="q-unknown">
        <h3 id="q-unknown">Unknown</h3>
        <p class="q-desc">Unknown to self · Unknown to others</p>
        <div class="chips">
          {#each quadrants.unknown as w}<span class="chip">{w}</span>{/each}
          {#if quadrants.unknown.length === 0}<span class="empty">—</span>{/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h1 { margin: 0; font-size: 1.6rem; }
  h2 { margin: 0; }
  .viewing-name { font-size: 1.2rem; color: #374151; text-align: center; }
  .participant-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .tab {
    padding: 0.4rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 9999px;
    background: #f8fafc;
    font-size: 0.9rem;
    cursor: pointer;
    color: #374151;
  }
  .tab.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
  .tab:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .you { font-size: 0.8em; opacity: 0.8; }
  .window-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 1rem;
  }
  @media (max-width: 560px) {
    .window-grid { grid-template-columns: 1fr; }
  }
  .quadrant {
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 140px;
  }
  .quadrant h3 { margin: 0; font-size: 1rem; }
  .q-desc { margin: 0; font-size: 0.75rem; color: #4b5563; }
  .open       { background: #dcfce7; border: 1px solid #bbf7d0; }
  .blind-spot { background: #fef9c3; border: 1px solid #fde68a; }
  .hidden     { background: #dbeafe; border: 1px solid #bfdbfe; }
  .unknown    { background: #f1f5f9; border: 1px solid #e2e8f0; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.25rem; }
  .chip {
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    background: rgba(255,255,255,0.7);
    font-size: 0.82rem;
    border: 1px solid rgba(0,0,0,0.08);
    color: #1e293b;
  }
  .empty { font-size: 0.85rem; color: #4b5563; font-style: italic; }
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .btn.secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; }
  .btn.secondary:hover { background: #e2e8f0; }
</style>
