<script>
  import { sessionState, wsError, myId } from './ws.js';
  import JoinForm from './lib/JoinForm.svelte';
  import AdminPanel from './lib/AdminPanel.svelte';
  import SelectPhase from './lib/SelectPhase.svelte';
  import RevealPhase from './lib/RevealPhase.svelte';

  $: isAdmin = $sessionState && $myId && $sessionState.adminId === $myId;
  $: submittedCount = $sessionState ? $sessionState.participants.filter(p => p.submitted).length : 0;
  $: totalCount = $sessionState ? $sessionState.participants.length : 0;
</script>

<div class="app">
  {#if $wsError}
    <div role="alert" class="banner error">{$wsError}</div>
  {/if}

  {#if !$sessionState}
    <JoinForm />

  {:else if $sessionState.phase === 'lobby'}
    <div class="container">
      <header>
        <h1>Johari Window</h1>
        <p class="session-code">Session code: <strong>{$sessionState.id}</strong></p>
      </header>

      <section aria-label="Participants" class="card">
        <h2>Participants ({totalCount})</h2>
        {#if $sessionState.participants.length === 0}
          <p class="muted">No one has joined yet.</p>
        {:else}
          <ul class="participant-list">
            {#each $sessionState.participants as p}
              <li>
                {p.name}
                {#if p.id === $sessionState.adminId}
                  <span class="badge">admin</span>
                {/if}
                {#if p.id === $myId}
                  <span class="badge self">you</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if isAdmin}
        <AdminPanel />
      {:else}
        <div class="card waiting">
          <p>Waiting for the admin to configure and start the session…</p>
        </div>
      {/if}
    </div>

  {:else if $sessionState.phase === 'select'}
    <SelectPhase />

  {:else if $sessionState.phase === 'reveal'}
    <RevealPhase />
  {/if}
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .container {
    width: 100%;
    max-width: 680px;
    padding: 2rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  header { text-align: center; }
  h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
  h2 { margin: 0 0 1rem; font-size: 1.1rem; }
  .session-code { margin: 0; color: #4b5563; font-size: 0.9rem; }
  .session-code strong { font-size: 1.2rem; color: #1e293b; letter-spacing: 0.08em; }
  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1.25rem 1.5rem;
  }
  .banner {
    width: 100%;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    text-align: center;
  }
  .error { background: #fef2f2; color: #b91c1c; border-bottom: 1px solid #fecaca; }
  .muted { color: #4b5563; margin: 0; }
  .waiting { text-align: center; color: #4b5563; }
  .waiting p { margin: 0; }
  .participant-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .participant-list li { display: flex; align-items: center; gap: 0.5rem; }
  .badge {
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    background: #e0e7ff;
    color: #4338ca;
    font-weight: 600;
  }
  .badge.self { background: #dcfce7; color: #15803d; }
</style>
