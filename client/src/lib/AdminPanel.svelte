<script>
  import { sessionState, wsError, send } from '../ws.js';

  const DEFAULT_WORDS = [
    'able', 'accepting', 'adaptable', 'bold', 'brave', 'calm', 'caring', 'cheerful',
    'clever', 'complex', 'confident', 'dependable', 'dignified', 'energetic', 'extroverted',
    'friendly', 'giving', 'happy', 'helpful', 'idealistic', 'independent', 'ingenious',
    'intelligent', 'introverted', 'kind', 'knowledgeable', 'logical', 'loving', 'mature',
    'modest', 'nervous', 'observant', 'organised', 'patient', 'powerful', 'proud',
    'quiet', 'reflective', 'relaxed', 'religious', 'responsive', 'searching', 'self-assertive',
    'self-conscious', 'sensible', 'sentimental', 'shy', 'silly', 'smart', 'spontaneous',
    'sympathetic', 'tense', 'trustworthy', 'warm', 'wise', 'witty',
  ];

  let wordText = $sessionState.wordList.join('\n');
  let timerMinutes = $sessionState.timerDuration ? Math.round($sessionState.timerDuration / 60) : '';
  let configError = '';

  function configure() {
    configError = '';
    const words = wordText.split('\n').map(w => w.trim()).filter(Boolean);
    if (words.length < 2) { configError = 'Word list needs at least 2 words.'; return; }
    const timerDuration = timerMinutes ? parseInt(timerMinutes, 10) * 60 : null;
    if (timerMinutes && (isNaN(timerDuration) || timerDuration < 60 || timerDuration > 3600)) {
      configError = 'Timer must be 1–60 minutes.';
      return;
    }
    send('configure', { wordList: words, timerDuration });
  }

  function resetWords() {
    wordText = DEFAULT_WORDS.join('\n');
  }

  function startSession() {
    send('advance_phase');
  }
</script>

<div class="card admin-panel">
  <h2>Admin controls</h2>

  <section aria-label="Word list">
    <div class="field-header">
      <label for="word-list">Word list <span class="muted">(one per line)</span></label>
      <button type="button" class="link-btn" on:click={resetWords}>Reset to defaults</button>
    </div>
    <textarea
      id="word-list"
      rows="8"
      bind:value={wordText}
      spellcheck="false"
    ></textarea>
  </section>

  <section aria-label="Timer" class="timer-row">
    <label for="timer">Timer</label>
    <div class="timer-input">
      <input
        id="timer"
        type="number"
        min="1"
        max="60"
        placeholder="—"
        bind:value={timerMinutes}
        aria-label="Timer duration in minutes"
      />
      <span class="muted">minutes (optional)</span>
    </div>
  </section>

  {#if configError}
    <p role="alert" class="form-error">{configError}</p>
  {/if}

  <div class="actions">
    <button type="button" class="btn secondary" on:click={configure}>Save configuration</button>
    <button
      type="button"
      class="btn primary"
      on:click={startSession}
      disabled={$sessionState.participants.length < 2}
    >
      Start session
    </button>
  </div>
  {#if $sessionState.participants.length < 2}
    <p class="hint" aria-live="polite">Need at least 2 participants to start.</p>
  {/if}
</div>

<style>
  .admin-panel { display: flex; flex-direction: column; gap: 1.25rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  .field-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.35rem;
  }
  label { font-size: 0.85rem; font-weight: 600; color: #374151; }
  .muted { color: #4b5563; font-weight: 400; }
  textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.85rem;
    font-family: inherit;
    resize: vertical;
    outline: none;
  }
  textarea:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px #e0e7ff; }
  .timer-row { display: flex; align-items: center; gap: 0.75rem; }
  .timer-input { display: flex; align-items: center; gap: 0.5rem; }
  input[type="number"] {
    width: 5rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  input[type="number"]:focus { border-color: #4f46e5; box-shadow: 0 0 0 2px #e0e7ff; }
  .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .btn {
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .btn.primary { background: #4f46e5; color: #fff; }
  .btn.primary:hover:not(:disabled) { background: #4338ca; }
  .btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0; }
  .btn.secondary:hover { background: #e2e8f0; }
  .link-btn {
    background: none;
    border: none;
    color: #4f46e5;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .link-btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .form-error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #b91c1c;
    font-size: 0.875rem;
  }
  .hint { margin: 0; font-size: 0.8rem; color: #4b5563; }
</style>
