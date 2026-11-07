<script lang="ts" module>
  /** Eight colours that each reach 3:1 against white (checked by `contrastOk`). */
  export const PALETTE = [
    { hex: '#1d4ed8', key: 'colour.name.blue' },
    { hex: '#047857', key: 'colour.name.green' },
    { hex: '#b91c1c', key: 'colour.name.red' },
    { hex: '#7c3aed', key: 'colour.name.violet' },
    { hex: '#b45309', key: 'colour.name.orange' },
    { hex: '#0e7490', key: 'colour.name.teal' },
    { hex: '#be185d', key: 'colour.name.pink' },
    { hex: '#4b5563', key: 'colour.name.grey' },
  ] as const;
</script>

<script lang="ts">
  import { contrastOk } from '../../core/colour';
  import { translate as t } from '../../i18n';

  let {
    value,
    label,
    onchange,
  }: { value: string; label: string; onchange: (value: string) => void } = $props();

  const uid = $props.id();
  const warnId = `${uid}-warn`;
  const warn = $derived(!contrastOk(value));

  function pick(hex: string) {
    if (hex.toLowerCase() !== value.toLowerCase()) onchange(hex);
  }
</script>

<fieldset aria-describedby={warn ? warnId : undefined}>
  <legend>{label}</legend>
  <div class="row">
    {#each PALETTE as c (c.hex)}
      <label class="swatch">
        <input
          type="radio"
          name={uid}
          value={c.hex}
          checked={value.toLowerCase() === c.hex}
          style:--swatch={c.hex}
          onchange={() => pick(c.hex)}
        />
        <span class="sr-only">{$t(c.key)}</span>
      </label>
    {/each}
    <label class="custom">
      <span>{$t('colour.custom')}</span>
      <input type="color" {value} onchange={(e) => pick(e.currentTarget.value)} />
    </label>
  </div>
  {#if warn}
    <p class="warning" id={warnId}>{$t('colour.warning')}</p>
  {/if}
</fieldset>

<style>
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    color: var(--text-muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .swatch input {
    appearance: none;
    margin: 0;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--swatch);
    border: 2px solid var(--bg);
    box-shadow: 0 0 0 1px var(--border);
    cursor: pointer;
    display: grid;
    place-content: center;
  }
  .swatch input:checked {
    box-shadow:
      0 0 0 2px var(--text),
      0 0 0 4px var(--bg);
  }
  .swatch input:checked::after {
    content: '✓';
    color: #fff;
    font-size: 0.9rem;
    line-height: 1;
  }
  .custom {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: 0.5rem;
  }
  .custom input {
    width: 2.5rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg);
    cursor: pointer;
  }
  .warning {
    margin: 0.25rem 0 0;
    color: var(--danger);
  }
</style>
