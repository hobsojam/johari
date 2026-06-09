<script>
  export let words = [];
  export let selected = [];
  export let label = '';
  export let disabled = false;

  function toggle(word) {
    if (disabled) return;
    selected = selected.includes(word)
      ? selected.filter(w => w !== word)
      : [...selected, word];
  }

  function onKeydown(e, word) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(word);
    }
  }
</script>

<fieldset class="word-grid-fieldset">
  <legend class="grid-label">{label} <span class="count">({selected.length} selected)</span></legend>
  <div class="grid">
    {#each words as word}
      <button
        type="button"
        class="chip"
        class:selected={selected.includes(word)}
        aria-pressed={selected.includes(word)}
        {disabled}
        on:click={() => toggle(word)}
        on:keydown={(e) => onKeydown(e, word)}
      >{word}</button>
    {/each}
  </div>
</fieldset>

<style>
  .word-grid-fieldset {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin: 0;
  }
  .grid-label {
    font-weight: 700;
    font-size: 0.95rem;
    color: #1e293b;
    padding: 0 0.25rem;
  }
  .count { font-weight: 400; color: #4b5563; font-size: 0.85rem; }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.75rem;
  }
  .chip {
    padding: 0.3rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 9999px;
    background: #f8fafc;
    font-size: 0.85rem;
    cursor: pointer;
    color: #374151;
    transition: background 0.1s, border-color 0.1s, color 0.1s;
  }
  .chip:hover:not(:disabled) { background: #e0e7ff; border-color: #a5b4fc; color: #3730a3; }
  .chip.selected { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .chip.selected:hover:not(:disabled) { background: #4338ca; border-color: #4338ca; }
  .chip:focus-visible { outline: 2px solid #4f46e5; outline-offset: 2px; }
  .chip:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
