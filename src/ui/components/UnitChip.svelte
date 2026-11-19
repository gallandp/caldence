<script lang="ts">
  import { translate as t } from '../../i18n';
  import { openPlace } from '../state/jump';
  import { presenting } from '../state/present';

  /**
   * A link into the other world (#397): a line unit from the products, a product from the line.
   * One click switches world and selection; the page header then offers the way back. Line chips
   * stay out while presenting.
   */
  let {
    selection,
    name,
    line = false,
    detail = '',
  }: {
    /** What opens: a team or area id, or a line unit's selection. */
    selection: string;
    name: string;
    /** A line unit: pink, "… in the line", hidden while presenting. */
    line?: boolean;
    /** Shown after the name, e.g. the FTE. */
    detail?: string;
  } = $props();
</script>

{#if !(line && $presenting)}
  <button
    type="button"
    class="unit-chip"
    class:line
    data-unit-chip
    aria-label={[$t(line ? 'cross.openLine' : 'cross.openProduct', { name }), detail]
      .filter(Boolean)
      .join(', ')}
    onclick={() => openPlace(selection)}
    ><span class="dot" aria-hidden="true"></span><span class="name">{name}</span>{#if detail}<span
        class="detail">{detail}</span
      >{/if}</button
  >
{/if}

<style>
  :global(#app) .unit-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    max-width: 100%;
    min-height: 1.6rem;
    padding: 0.05rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    box-shadow: none;
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 550;
    line-height: 1.3;
    text-align: start;
    vertical-align: middle;
  }
  :global(#app) .unit-chip:hover {
    background: var(--surface-2);
  }
  .dot {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--accent);
  }
  .line .dot {
    background: var(--line);
  }
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .detail {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  @media (forced-colors: active) {
    .dot {
      forced-color-adjust: none;
      background: CanvasText;
    }
  }
</style>
