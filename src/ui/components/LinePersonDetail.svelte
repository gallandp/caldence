<script lang="ts">
  import { contextLoss } from '../../core/contextSwitch';
  import { updateLinePerson } from '../../core/lineEdit';
  import { lineTree, type StaffRow } from '../../core/lineStaff';
  import { capacity, fte as share } from '../../core/load';
  import { formatNumber, formatPercent, levels, locale, translate as t } from '../../i18n';
  import { workspace } from '../state/workspace';

  /**
   * One person of the line opened (#316): per team their FTE and hours, the meeting hours and the
   * time after meetings there, their one "über Grenze" status over all teams (the Load view's),
   * the context-switch hint (#321), and their line fields to edit.
   */
  let { row, idPrefix }: { row: StaffRow; idPrefix: string } = $props();

  const ws = $derived($workspace);
  const maxFte = $derived(ws.settings.thresholds.maxFte);
  const hours = (n: number) => formatNumber($locale, n, 1);
  const fte = (n: number) => formatNumber($locale, n, 1);
  const pct = (n: number) => formatPercent($locale, n);

  /** All meetings ÷ all hours, as an average week: the Load view's figure. */
  const total = $derived.by(() => {
    const meetings = row.meetings;
    const cap = capacity(ws, row.person.id);
    return { meetings, cap, share: share(meetings, cap) };
  });

  const families = $derived(ws.skillFamilies ?? []);
  const skillsOf = (familyId: string) => (ws.skills ?? []).filter((s) => s.familyId === familyId);
  const own = $derived(new Set(row.person.skillIds ?? []));
  const units = $derived(lineTree(ws));
  let error = $state('');

  function set(patch: Parameters<typeof updateLinePerson>[2]) {
    const id = row.person.id;
    const result = workspace.apply((w) => updateLinePerson(w, id, patch));
    error = result.ok ? '' : (result.errors[0]?.key ?? 'error.type');
  }

  function onContract(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const n = Number(input.value.replace(',', '.'));
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      error = 'error.number.invalid';
      return;
    }
    set({ contractFte: n === 1 ? null : n });
  }

  function addSkill(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    select.value = '';
    if (id) set({ skillIds: [...(row.person.skillIds ?? []), id] });
  }
  const removeSkill = (id: string) =>
    set({ skillIds: (row.person.skillIds ?? []).filter((x) => x !== id) });
  const skillName = (id: string) => ws.skills?.find((s) => s.id === id)?.name ?? id;
</script>

<div class="detail">
  {#if row.commitments.length === 0}
    <p class="muted">{$t('line.detail.none', { teams: $levels.teamsLc })}</p>
  {:else}
    <ul class="commitments">
      {#each row.commitments as c (c.unitId)}
        {@const inMeetings = c.hours > 0 ? c.meetings / c.hours : 0}
        <li>
          <p class="line">
            <b>{c.name}</b>
            {$t('line.detail.hours', {
              fte: fte(c.fte),
              hours: hours(c.hours),
              meetings: hours(c.meetings),
              after: hours(Math.max(0, c.hours - c.meetings)),
            })}
          </p>
          <div class="meter" aria-hidden="true">
            <span class="used" style:width="{Math.min(100, inMeetings * 100)}%"></span>
            <span class="limit" style:left="{Math.min(100, maxFte * 100)}%"></span>
          </div>
          <p class="share">
            {$t('line.detail.share', { name: c.name, share: pct(inMeetings) })}
          </p>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="status" class:bad={row.overLimit}>
    {$t(row.overLimit ? 'line.detail.over' : 'line.detail.under', {
      meetings: hours(total.meetings),
      hours: hours(total.cap),
      share: pct(total.share),
      limit: pct(maxFte),
    })}
  </p>
  {#if row.context}
    <p class="status warn">
      {$t('context.short', {
        count: row.context.teams,
        loss: pct(contextLoss(row.context.teams)),
      })}
    </p>
  {/if}
  {#if row.free < 0}
    <p class="status bad">{$t('line.detail.overbooked', { fte: fte(-row.free) })}</p>
  {/if}

  <div class="edit">
    <div class="field">
      <label for="{idPrefix}-contract">{$t('line.detail.contract')}</label>
      <input
        id="{idPrefix}-contract"
        type="number"
        min="0.1"
        max="1"
        step="0.05"
        value={row.contract}
        onchange={onContract}
      />
    </div>
    {#if (ws.companies?.length ?? 0) > 0}
      <div class="field">
        <label for="{idPrefix}-company">{$t('line.company')}</label>
        <select
          id="{idPrefix}-company"
          value={row.person.companyId ?? ''}
          onchange={(e) => set({ companyId: (e.currentTarget as HTMLSelectElement).value || null })}
        >
          <option value="">{$t('line.company.none')}</option>
          {#each ws.companies ?? [] as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </div>
    {/if}
    <div class="field">
      <label for="{idPrefix}-unit">{$t('line.detail.unit')}</label>
      <select
        id="{idPrefix}-unit"
        value={row.person.lineUnitId ?? ''}
        onchange={(e) => set({ lineUnitId: (e.currentTarget as HTMLSelectElement).value || null })}
      >
        <option value="">{$t('line.detail.noUnit')}</option>
        {#each units as u (u.unit.id)}
          <option value={u.unit.id}>{' '.repeat(u.depth * 3)}{u.unit.name}</option>
        {/each}
      </select>
    </div>
    <div class="field skills">
      <label for="{idPrefix}-skill">{$t('line.detail.skills')}</label>
      <div class="chips">
        {#each row.person.skillIds ?? [] as s (s)}
          <span class="chip"
            >{skillName(s)}<button
              type="button"
              class="remove"
              aria-label={$t('line.skill.remove', { skill: skillName(s), name: row.person.name })}
              onclick={() => removeSkill(s)}>×</button
            ></span
          >
        {/each}
        <select id="{idPrefix}-skill" onchange={addSkill} disabled={families.length === 0}>
          <option value=""
            >{$t(families.length === 0 ? 'line.skill.noneYet' : 'line.skill.add')}</option
          >
          {#each families as f (f.id)}
            <optgroup label={f.name}>
              {#each skillsOf(f.id) as s (s.id)}
                {#if !own.has(s.id)}<option value={s.id}>{s.name}</option>{/if}
              {/each}
            </optgroup>
          {/each}
        </select>
      </div>
    </div>
  </div>
  {#if error}
    <p class="field-error" role="alert">{$t(error, { path: row.person.name })}</p>
  {/if}
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
  }
  .commitments {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  p {
    margin: 0;
  }
  .line b {
    margin-right: 0.4rem;
  }
  .meter {
    position: relative;
    height: 0.75rem;
    margin: 0.35rem 0 0.2rem;
    border-radius: 999px;
    background: var(--ok-soft);
    overflow: visible;
  }
  .used {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    background: repeating-linear-gradient(
      135deg,
      var(--accent) 0 6px,
      color-mix(in srgb, var(--accent) 70%, var(--surface)) 6px 9px
    );
  }
  .limit {
    position: absolute;
    top: -0.25rem;
    bottom: -0.25rem;
    width: 2px;
    background: var(--text);
  }
  .share,
  .muted {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .status {
    font-weight: 600;
  }
  .status.bad {
    color: var(--danger);
  }
  .status.warn {
    color: var(--warn);
  }
  .edit {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .field input[type='number'] {
    width: 6rem;
  }
  .field.skills {
    flex: 1 1 18rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem 0.15rem 0.1rem 0.6rem;
    border-radius: 999px;
    background: var(--line-soft);
    color: var(--line);
    font-size: 0.85rem;
    font-weight: 600;
  }
  :global(#app) .detail button.remove {
    min-width: 1.75rem;
    min-height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    box-shadow: none;
    font-size: 1rem;
    line-height: 1;
  }
</style>
