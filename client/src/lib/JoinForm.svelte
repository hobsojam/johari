<script>
  import { tick } from 'svelte';
  import { connect, send, disconnect, myId, wsError } from '../ws.js';

  let mode = 'join'; // 'join' | 'create'
  let name = '';
  let sessionCode = '';
  let adminPin = '';
  let loading = false;
  let error = '';

  async function handleCreate() {
    error = '';
    if (!name.trim()) { error = 'Enter your name.'; return; }
    if (!adminPin.trim()) { error = 'Enter an admin PIN.'; return; }
    loading = true;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPin: adminPin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? 'Failed to create session.'; return; }
      wsError.set(null);
      await connect();
      const joined = waitForJoinResult();
      send('join', { sessionId: data.sessionId, name: name.trim() });
      await joined;
      send('claim_admin', { pin: adminPin.trim() });
    } catch (e) {
      error = e.message ?? 'Could not connect. Is the server running?';
      disconnect();
    } finally {
      loading = false;
    }
  }

  async function handleJoin() {
    error = '';
    if (!sessionCode.trim()) { error = 'Enter a session code.'; return; }
    if (!name.trim()) { error = 'Enter your name.'; return; }
    loading = true;
    try {
      wsError.set(null);
      await connect();
      const joined = waitForJoinResult();
      send('join', { sessionId: sessionCode.trim().toUpperCase(), name: name.trim() });
      await joined;
    } catch (e) {
      error = e.message ?? 'Could not connect. Is the server running?';
      disconnect();
    } finally {
      loading = false;
    }
  }

  // maxlength alone corrupts pasted codes: the browser truncates " AB3K7P"
  // to 6 chars before any trim can run. Normalise on input instead.
  function handleCodeInput(e) {
    const cleaned = e.target.value.replace(/\s+/g, '').toUpperCase().slice(0, 6);
    sessionCode = cleaned;
    if (e.target.value !== cleaned) e.target.value = cleaned;
  }

  function waitForJoinResult() {
    return new Promise((resolve, reject) => {
      const unsubId = myId.subscribe(id => {
        if (id) { unsubId(); unsubErr(); resolve(); }
      });
      const unsubErr = wsError.subscribe(err => {
        if (err) { unsubId(); unsubErr(); reject(new Error(err)); }
      });
    });
  }

  const tabs = ['join', 'create'];

  function switchTab(newMode) {
    mode = newMode;
    error = '';
  }

  function handleTabKeydown(e) {
    const idx = tabs.indexOf(mode);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = tabs[(idx + 1) % tabs.length];
      switchTab(next);
      tick().then(() => document.getElementById(`tab-${next}`)?.focus());
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      switchTab(prev);
      tick().then(() => document.getElementById(`tab-${prev}`)?.focus());
    } else if (e.key === 'Home') {
      e.preventDefault();
      switchTab(tabs[0]);
      tick().then(() => document.getElementById(`tab-${tabs[0]}`)?.focus());
    } else if (e.key === 'End') {
      e.preventDefault();
      switchTab(tabs[tabs.length - 1]);
      tick().then(() => document.getElementById(`tab-${tabs[tabs.length - 1]}`)?.focus());
    }
  }
</script>

<div class="container">
  <h1>Johari Window</h1>
  <p class="subtitle">A self-awareness activity for teams</p>

  <div class="card">
    <div class="tabs" role="tablist">
      <button
        id="tab-join"
        role="tab"
        aria-selected={mode === 'join'}
        aria-controls="panel-join"
        tabindex={mode === 'join' ? 0 : -1}
        class:active={mode === 'join'}
        on:click={() => switchTab('join')}
        on:keydown={handleTabKeydown}
      >Join a session</button>
      <button
        id="tab-create"
        role="tab"
        aria-selected={mode === 'create'}
        aria-controls="panel-create"
        tabindex={mode === 'create' ? 0 : -1}
        class:active={mode === 'create'}
        on:click={() => switchTab('create')}
        on:keydown={handleTabKeydown}
      >Facilitate</button>
    </div>

    {#if error}
      <p role="alert" class="form-error">{error}</p>
    {/if}

    <div id="panel-join" role="tabpanel" aria-labelledby="tab-join" hidden={mode !== 'join'}>
      <form on:submit|preventDefault={handleJoin}>
        <label for="session-code">Session code</label>
        <input
          id="session-code"
          type="text"
          bind:value={sessionCode}
          on:input={handleCodeInput}
          placeholder="e.g. AB3K7P"
          autocomplete="off"
          spellcheck="false"
          style="text-transform: uppercase; letter-spacing: 0.1em;"
        />
        <label for="join-name">Your name</label>
        <input id="join-name" type="text" bind:value={name} placeholder="Display name" maxlength="30" />
        <button type="submit" class="btn primary" disabled={loading}>
          {loading ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>

    <div id="panel-create" role="tabpanel" aria-labelledby="tab-create" hidden={mode !== 'create'}>
      <form on:submit|preventDefault={handleCreate}>
        <label for="create-name">Your name</label>
        <input id="create-name" type="text" bind:value={name} placeholder="Display name" maxlength="30" />
        <label for="admin-pin">Admin PIN</label>
        <input
          id="admin-pin"
          type="password"
          bind:value={adminPin}
          placeholder="Choose a PIN to manage the session"
          maxlength="8"
        />
        <p class="hint">You'll need this PIN to control the session. Share the session code (not this PIN) with participants.</p>
        <button type="submit" class="btn primary" disabled={loading}>
          {loading ? 'Creating…' : 'Create & join'}
        </button>
      </form>
    </div>
  </div>
</div>

<style>
  .container {
    max-width: 440px;
    margin: 4rem auto;
    padding: 0 1rem;
    text-align: center;
  }
  h1 { font-size: 2rem; margin: 0 0 0.25rem; }
  .subtitle { color: #4b5563; margin: 0 0 2rem; }
  .card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    text-align: left;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid #e2e8f0;
  }
  .tabs button {
    flex: 1;
    padding: 0.75rem;
    border: none;
    background: #f8fafc;
    cursor: pointer;
    font-size: 0.9rem;
    color: #4b5563;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }
  .tabs button.active {
    background: #fff;
    color: #4f46e5;
    border-bottom-color: #4f46e5;
    font-weight: 600;
  }
  .tabs button:focus-visible { outline: 2px solid #4f46e5; outline-offset: -2px; }
  form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  [role="tabpanel"] { display: block; }
  [role="tabpanel"][hidden] { display: none; }
  label { font-size: 0.85rem; font-weight: 600; color: #374151; }
  input {
    padding: 0.6rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
    width: 100%;
  }
  input:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px #e0e7ff; }
  .hint { font-size: 0.8rem; color: #4b5563; margin: 0; }
  .form-error {
    margin: 0.75rem 1.5rem 0;
    padding: 0.6rem 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #b91c1c;
    font-size: 0.875rem;
  }
  .btn {
    margin-top: 0.5rem;
    padding: 0.65rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    font-weight: 600;
  }
  .btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .btn.primary { background: #4f46e5; color: #fff; }
  .btn.primary:hover:not(:disabled) { background: #4338ca; }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
