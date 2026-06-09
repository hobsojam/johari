<script>
  import { onDestroy, tick } from 'svelte';
  import { sessionState, myId, send } from '../ws.js';
  import WordGrid from './WordGrid.svelte';

  $: me = $sessionState?.participants.find(p => p.id === $myId);
  $: peers = $sessionState?.participants.filter(p => p.id !== $myId) ?? [];
  $: alreadySubmitted = me?.submitted ?? false;
  $: submittedCount = $sessionState?.participants.filter(p => p.submitted).length ?? 0;
  $: totalCount = $sessionState?.participants.length ?? 0;
  $: isAdmin = $sessionState?.adminId === $myId;

  let selfSelections = [];
  let peerSelections = {};
  let submittedCard;
  let focusedAfterSubmit = false;
  $: if (alreadySubmitted && !focusedAfterSubmit) {
    focusedAfterSubmit = true;
    tick().then(() => submittedCard?.focus());
  }
  $: if (!alreadySubmitted) focusedAfterSubmit = false;

  // Keep peerSelections keys in sync as participants list may change
  $: if ($sessionState) {
    for (const p of peers) {
      if (!(p.id in peerSelections)) peerSelections[p.id] = [];
    }
  }

  $: canSubmit = !alreadySubmitted && selfSelections.length > 0
    && peers.every(p => (peerSelections[p.id] ?? []).length > 0);

  // Timer countdown — visual updates every second; screen reader announcement at most once per minute
  let remaining = null;
  let interval = null;
  let lastAnnouncedMinute = -1;
  let timerAnnouncement = '';

  $: if ($sessionState?.timerStartedAt && $sessionState?.timerDuration) {
    if (!interval) {
      interval = setInterval(() => {
        const elapsed = (Date.now() - $sessionState.timerStartedAt) / 1000;
        remaining = Math.max(0, Math.ceil($sessionState.timerDuration - elapsed));
        const m = Math.floor(remaining / 60);
        if (m !== lastAnnouncedMinute) {
          lastAnnouncedMinute = m;
          timerAnnouncement = remaining < 60
            ? 'Less than a minute remaining'
            : `${m} minute${m === 1 ? '' : 's'} remaining`;
        }
      }, 1000);
    }
  } else {
    if (interval) { clearInterval(interval); interval = null; }
    remaining = null;
    lastAnnouncedMinute = -1;
    timerAnnouncement = '';
  }

  onDestroy(() => { if (interval) clearInterval(interval); });

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function submit() {
    send('submit_selections', { selfSelections, peerSelections });
  }

  function revealNow() {
    send('advance_phase');
  }
</script>

<div class="container">
  <header>
    <h1 tabindex="-1">Select phase</h1>
    <div class="meta">
      <span aria-live="polite">{submittedCount} of {totalCount} participants submitted</span>
      {#if remaining !== null}
        <span class="timer" aria-hidden="true">⏱ {formatTime(remaining)}</span>
        <span class="sr-only" aria-live="polite" aria-atomic="true">{timerAnnouncement}</span>
      {/if}
    </div>
  </header>

  {#if alreadySubmitted}
    <div class="card submitted" bind:this={submittedCard} tabindex="-1">
      <p>Your selections have been submitted. Waiting for others…</p>
      {#if isAdmin}
        <button type="button" class="btn primary" on:click={revealNow}>Reveal now</button>
      {/if}
    </div>
  {:else}
    <div class="instructions card">
      <p>
        Choose the adjectives you feel describe <strong>each person</strong>, including yourself.
        Your choices are private until the facilitator reveals them.
        Select at least one word per person.
      </p>
    </div>

    <form on:submit|preventDefault={submit}>
      <WordGrid
        words={$sessionState.wordList}
        label="Yourself"
        bind:selected={selfSelections}
      />

      {#each peers as peer (peer.id)}
        <WordGrid
          words={$sessionState.wordList}
          label={peer.name}
          bind:selected={peerSelections[peer.id]}
        />
      {/each}

      <button type="submit" class="btn primary submit-btn" disabled={!canSubmit}>
        Submit my selections
      </button>
      {#if !canSubmit}
        <p class="hint" aria-live="polite">Select at least one word for each person to enable submit.</p>
      {/if}
    </form>
  {/if}
</div>

<style>
  .container {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  header { display: flex; flex-direction: column; gap: 0.5rem; }
  h1 { margin: 0; font-size: 1.6rem; }
  .meta { display: flex; align-items: center; gap: 1rem; color: #4b5563; font-size: 0.9rem; }
  .timer { font-weight: 700; color: #1e293b; font-size: 1.05rem; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border-width: 0;
  }
  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
  }
  .submitted { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
  .submitted p { margin: 0; color: #4b5563; }
  .instructions p { margin: 0; color: #4b5563; font-size: 0.9rem; line-height: 1.6; }
  form { display: flex; flex-direction: column; gap: 1.25rem; }
  .submit-btn { align-self: flex-start; }
  .btn {
    padding: 0.65rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .btn.primary { background: #4f46e5; color: #fff; }
  .btn.primary:hover:not(:disabled) { background: #4338ca; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .hint { margin: 0; font-size: 0.8rem; color: #4b5563; }
</style>
