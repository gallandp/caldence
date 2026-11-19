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
  /** The words around the name in "Open {name} in the line", for screen readers. */
  const around = $derived.by(() => {
    const MARK = '\u0001';
    const text = $t(line ? 'cross.openLine' : 'cross.openProduct', { name: MARK });
    const [before = '', after = ''] = text.split(MARK);
    return [before, after] as const;
  });
</script>

{#if !(line && $presenting)}
  <!-- The name says where it leads ("Open … in the line"); only the unit's name shows. -->
  <button
    type="button"
    class="unit-chip"
    class:line
    data-unit-chip
    onclick={() => openPlace(selection)}
    ><span class="dot" aria-hidden="true"></span><span class="sr-only">{around[0]}</span><span
      class="name">{name}</span
    ><span class="sr-only">{detail ? `${around[1]} ` : around[1]}</span>{#if detail}<span
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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: pre;
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
