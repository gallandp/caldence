<script lang="ts">
  import { tick } from 'svelte';
  import { contextHint, contextOverride, setContextOverride } from '../../core/contextSwitch';
  import { LIMITS } from '../../core/limits';
  import { formatPercent, locale, translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';

  /**
   * The context-switch hint on one person's membership in a team (#321): Weinberg's estimate in
   * percent, and the override that belongs to this membership. Never blocks anything.
   */
  let { personId, teamId, name }: { personId: string; teamId: string; name: string } = $props();

  const uid = $props.id();
  const hint = $derived(contextHint($workspace, personId));
  const own = $derived(contextOverride($workspace, teamId, personId));
  const team = $derived($workspace.teams.find((x) => x.id === teamId));
  const otherTeam = $derived(
    hint?.overriddenIn && hint.overriddenIn !== teamId
      ? $workspace.teams.find((x) => x.id === hint.overriddenIn)?.name
      : undefined,
  );

  let open = $state(false);
  let reason = $state('');
  let root: HTMLElement | undefined = $state();

  async function start() {
    open = true;
    reason = '';
    await tick();
    root?.querySelector<HTMLInputElement>('input')?.focus();
  }

  async function save(event: Event) {
    event.preventDefault();
    workspace.apply((ws) => setContextOverride(ws, teamId, personId, reason));
    open = false;
    await tick();
    root?.querySelector<HTMLButtonElement>('[data-context-undo]')?.focus();
  }

  async function undo() {
    workspace.apply((ws) => setContextOverride(ws, teamId, personId, null));
    await tick();
    root?.querySelector<HTMLButtonElement>('[data-context-override]')?.focus();
  }
</script>

{#if hint && team}
  <div class="ctx-note" class:muted={hint.overriddenIn} data-context-hint bind:this={root}>
    <p class="text">
      <span class="mark" aria-hidden="true">!</span>
      <span
        >{$t('context.short', {
          count: hint.teams,
          loss: formatPercent($locale, hint.loss),
        })}{#if own}<span class="pill">{$t('context.overridden')}</span>{#if own.reason}<span
              class="reason">{own.reason}</span
            >{/if}{:else if otherTeam}<span class="pill"
            >{$t('context.overriddenIn', { team: otherTeam })}</span
          >{/if}</span
      >
    </p>
    {#if own}
      <button
        type="button"
        class="link"
        data-context-undo
        aria-label={$t('context.undo.named', { person: name, team: team.name })}
        onclick={undo}>{$t('context.undo')}</button
      >
    {:else if !hint.overriddenIn && !open}
      <button
        type="button"
        class="link"
        data-context-override
        aria-label={$t('context.override.named', { person: name, team: team.name })}
        onclick={start}>{$t('context.override')}</button
      >
    {/if}
    {#if open}
      <form class="why" onsubmit={save}>
        <label for="{uid}-reason">{$t('context.reason')}</label>
        <input
          id="{uid}-reason"
          maxlength={LIMITS.textChars}
          autocomplete="off"
          bind:value={reason}
          aria-describedby="{uid}-reason-hint"
        />
        <p class="help" id="{uid}-reason-hint">{$t('context.reason.hint')}</p>
        <div class="actions">
          <button type="submit" class="secondary">{$t('context.save')}</button>
          <button type="button" class="link" onclick={() => (open = false)}
            >{$t('context.cancel')}</button
          >
        </div>
      </form>
    {/if}
  </div>
{/if}

<style>
  .ctx-note {
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    margin-left: 3rem;
    font-size: 0.85rem;
  }
  .text {
    display: flex;
    gap: 0.45rem;
    align-items: baseline;
    margin: 0;
    color: var(--warn);
    font-weight: 600;
  }
  .mark {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--warn-soft);
    font-size: 0.75rem;
    font-weight: 800;
  }
  /* An overridden hint stays visible, muted (#321). */
  .muted .text {
    color: var(--text-muted);
    font-weight: 400;
  }
  .muted .mark {
    background: var(--surface-2, var(--border));
  }
  .pill {
    margin-left: 0.4rem;
    padding: 0.05rem 0.45rem;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    font-size: 0.75rem;
    white-space: nowrap;
  }
  .reason {
    margin-left: 0.4rem;
    font-style: italic;
  }
  :global(#app) .link {
    min-height: 2.75rem;
    padding: 0 0.25rem;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font-weight: 600;
    font-size: 0.85rem;
  }
  .why {
    flex-basis: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-width: 32rem;
  }
  .help {
    margin: 0;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  @media (max-width: 600px) {
    .ctx-note {
      margin-left: 0;
    }
  }
</style>
