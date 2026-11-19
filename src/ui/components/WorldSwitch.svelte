<script lang="ts">
  import {
    hasOrgLevel,
    LINE_ROOT,
    ORG_UNIT,
    selectedLineUnit,
    type Workspace,
  } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { activeTeamId, workspace } from '../state/workspace';

  /**
   * The two worlds of a file with a line (#393): the product organisation and the line. A
   * segmented control (a radio group) of two nouns at the top of the sidebar; each world keeps its own selection,
   * so switching back returns to where you were. The page of each world is kept by the shell.
   */
  type World = 'product' | 'line';
  const WORLDS: readonly World[] = ['product', 'line'];

  const current = $derived<World>(
    selectedLineUnit($activeTeamId) !== undefined ? 'line' : 'product',
  );

  /** The last selection in each world, while it still exists. */
  const last: Record<World, string | undefined> = { product: undefined, line: undefined };
  $effect(() => {
    const sel = $activeTeamId;
    if (sel) last[selectedLineUnit(sel) !== undefined ? 'line' : 'product'] = sel;
  });

  function known(ws: Workspace, sel: string | undefined, world: World): boolean {
    if (sel === undefined) return false;
    if (world === 'line') {
      const id = selectedLineUnit(sel);
      return sel === LINE_ROOT || !!ws.lineUnits?.some((u) => u.id === id);
    }
    if (sel === ORG_UNIT) return hasOrgLevel(ws);
    return [...ws.teams, ...ws.areas].some((u) => u.id === sel);
  }

  function go(world: World) {
    if (world === current) return;
    const ws = $workspace;
    const remembered = last[world];
    const fallback =
      world === 'line' ? LINE_ROOT : hasOrgLevel(ws) ? ORG_UNIT : (ws.teams[0]?.id ?? null);
    activeTeamId.set(known(ws, remembered, world) ? remembered! : fallback);
  }

  /** Arrow keys move between the two segments, as in a radio group. */
  function onKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = current === 'product' ? 'line' : 'product';
    go(next);
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>(`button[data-world="${next}"]`)
      ?.focus();
  }
</script>

<!-- A radio group: one world is chosen, Tab reaches the chosen one, the arrow keys move. -->
<div
  class="worlds"
  role="radiogroup"
  aria-label={$t('world.label')}
  tabindex="-1"
  onkeydown={onKeydown}
>
  {#each WORLDS as world (world)}
    <button
      type="button"
      role="radio"
      data-world={world}
      aria-checked={current === world}
      tabindex={current === world ? 0 : -1}
      onclick={() => go(world)}
    >
      <span class="dot {world}" aria-hidden="true"></span>{$t('world.' + world)}
    </button>
  {/each}
</div>

<style>
  .worlds {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 3px;
    border-radius: 0.7rem;
    background: rgb(255 255 255 / 0.06);
    border: 1px solid rgb(255 255 255 / 0.12);
  }
  :global(#app) .worlds button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2rem;
    min-width: 0;
    padding: 0.3rem 0.4rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    box-shadow: none;
    color: #c3c7de;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
  }
  :global(#app) .worlds button:hover {
    color: #fff;
    background: rgb(255 255 255 / 0.05);
  }
  :global(#app) .worlds button[aria-checked='true'] {
    background: #fff;
    color: #14183a;
  }
  :global(#app) .worlds button[aria-checked='true'][data-world='line'] {
    color: #8a2050;
  }
  :global(#app) .worlds button:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex: none;
  }
  .dot.product {
    background: #6b5cff;
  }
  .dot.line {
    background: #e0569b;
  }
  @media (forced-colors: active) {
    :global(#app) .worlds button[aria-checked='true'] {
      outline: 2px solid ButtonText;
    }
  }
</style>
