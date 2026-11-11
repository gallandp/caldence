<script lang="ts">
  import { isoWeek } from '../../core/date';
  import { fte, loadPerWeek, warnings } from '../../core/load';
  import { loadSummary } from '../../core/views';
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';
  import { filter, index, workspace } from '../state/workspace';

  const summary = $derived(loadSummary($workspace, $filter));
  const weeks = $derived(loadPerWeek($workspace, $index));
  const hpw = $derived($workspace.settings.hoursPerWeek);

  const roleName = (id: string): string => $workspace.roles.find((r) => r.id === id)?.name ?? id;
  const categoryName = (id: string): string =>
    $workspace.categories.find((c) => c.id === id)?.name ?? id;

  const hours = (n: number): string => formatNumber($locale, n, 1);
  const weekLabel = (monday: string): string =>
    $t('weeks.week', { n: formatNumber($locale, isoWeek(monday), 0) });

  const people = $derived(
    $filter.personId
      ? $workspace.people.filter((p) => p.id === $filter.personId)
      : $workspace.people,
  );

  const perPerson = $derived(
    people.map((person) => {
      const total = weeks.reduce((sum, w) => sum + (w.byPerson[person.id] ?? 0), 0);
      const average = weeks.length > 0 ? total / weeks.length : 0;
      let peak: { monday: string; hours: number } | undefined;
      for (const w of weeks) {
        const h = w.byPerson[person.id] ?? 0;
        if (h > 0 && (peak === undefined || h > peak.hours)) peak = { monday: w.monday, hours: h };
      }
      return { person, average, fte: fte(average, person.hoursPerWeek), peak };
    }),
  );

  const warningItems = $derived.by(() => {
    const byMonday = new Map(weeks.map((w) => [w.monday, w]));
    return warnings(weeks, $workspace)
      .filter((w) => !$filter.personId || w.personId === $filter.personId)
      .map((w) => ({
        key: `${w.monday}/${w.personId}/${w.kind}`,
        text: $t(`load.warn.${w.kind}`, {
          week: weekLabel(w.monday),
          person: $workspace.people.find((p) => p.id === w.personId)?.name ?? w.personId,
          hours: hours(byMonday.get(w.monday)?.byPerson[w.personId] ?? 0),
        }),
      }));
  });

  const uid = $props.id();
</script>

<div class="load">
  {#if summary.byCategory.length === 0 && summary.byRole.length === 0}
    <p class="hint">{$t('load.empty')}</p>
  {/if}

  {#snippet region(id: string, title: string, body: import('svelte').Snippet)}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (scrollable region must be keyboard reachable) -->
    <div class="scroll" role="region" aria-labelledby="{uid}-{id}" tabindex="0">
      <table>
        <caption id="{uid}-{id}">{title}</caption>
        {@render body()}
      </table>
    </div>
  {/snippet}

  {#snippet baseBody()}
    <thead>
      <tr>
        <th scope="col">{$t('load.col.category')}</th>
        {#each summary.byRole as r (r.roleId)}
          <th scope="col" class="num">{roleName(r.roleId)}</th>
        {/each}
        <th scope="col" class="num">{$t('load.col.total')}</th>
      </tr>
    </thead>
    <tbody>
      {#each summary.byCategory as c (c.categoryId)}
        <tr data-category={c.categoryId}>
          <th scope="row">
            <span
              class="dot"
              aria-hidden="true"
              style:background={$workspace.categories.find((x) => x.id === c.categoryId)?.colour}
            ></span>{categoryName(c.categoryId)}
          </th>
          {#each summary.byRole as r (r.roleId)}
            <td class="num">{hours(summary.matrix[c.categoryId]?.[r.roleId] ?? 0)}</td>
          {/each}
          <td class="num total">{hours(c.hours)}</td>
        </tr>
      {/each}
    </tbody>
  {/snippet}

  {#snippet roleBody()}
    <thead>
      <tr>
        <th scope="col">{$t('load.col.role')}</th>
        <th scope="col" class="num">{$t('load.col.hours')}</th>
        <th scope="col" class="num"
          >{$t('load.col.percent', { hours: formatNumber($locale, hpw, 0) })}</th
        >
        <th scope="col" class="num">{$t('load.col.fte')}</th>
      </tr>
    </thead>
    <tbody>
      {#each summary.byRole as r (r.roleId)}
        <tr data-role={r.roleId}>
          <th scope="row">{roleName(r.roleId)}</th>
          <td class="num">{hours(r.hours)}</td>
          <td class="num">
            <span class="meter" aria-hidden="true"
              ><span style:width="{Math.min(100, r.percent)}%"></span></span
            >{formatPercent($locale, r.percent / 100)}
          </td>
          <td class="num">{formatNumber($locale, r.fte, 2)}</td>
        </tr>
      {/each}
    </tbody>
  {/snippet}

  {#snippet personBody()}
    <thead>
      <tr>
        <th scope="col">{$t('load.col.person')}</th>
        <th scope="col" class="num">{$t('load.col.hours')}</th>
        <th scope="col" class="num">{$t('load.col.fte')}</th>
        <th scope="col" class="num">{$t('load.col.peak')}</th>
      </tr>
    </thead>
    <tbody>
      {#each perPerson as p (p.person.id)}
        <tr data-person={p.person.id}>
          <th scope="row">{p.person.name}</th>
          <td class="num">{hours(p.average)}</td>
          <td class="num">{formatNumber($locale, p.fte, 2)}</td>
          <td class="num">
            {#if p.peak}
              {$t('load.peak', { week: weekLabel(p.peak.monday), hours: hours(p.peak.hours) })}
            {:else}
              {$t('load.none')}
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  {/snippet}

  {@render region('base', $t('load.table.base'), baseBody)}
  {@render region('role', $t('load.table.role'), roleBody)}
  {#if $workspace.people.length > 0}
    {@render region('person', $t('load.table.person'), personBody)}
  {/if}

  <section aria-labelledby="{uid}-warn">
    <h3 id="{uid}-warn">{$t('load.warnings')}</h3>
    {#if warningItems.length === 0}
      <p>{$t('load.warnings.none')}</p>
    {:else}
      <ul class="warnings">
        {#each warningItems as w (w.key)}
          <li class="warning">{w.text}</li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .meter {
    display: inline-block;
    width: 6rem;
    height: 0.45rem;
    margin-right: 0.75rem;
    border-radius: 999px;
    background: var(--surface-2);
    box-shadow: inset 0 0 0 1px var(--border);
    vertical-align: middle;
    overflow: hidden;
  }
  .meter > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-gradient);
  }
  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    margin-right: 0.55rem;
    border-radius: 50%;
  }
  .load {
    max-width: 72rem;
    min-width: 0;
  }
  .hint {
    padding: 0.75rem var(--space);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .scroll {
    overflow-x: auto;
    margin-bottom: calc(var(--space) * 1.5);
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  caption {
    text-align: left;
    font-weight: 600;
    padding-bottom: 0.25rem;
  }
  th,
  td {
    border: 1px solid var(--border);
    padding: 0.3rem 0.5rem;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    background: var(--surface);
  }
  tbody th {
    font-weight: 600;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .total {
    font-weight: 600;
  }
  h3 {
    margin: 0 0 0.25rem;
  }
  .warnings {
    margin: 0;
    padding-left: 0;
    list-style: none;
  }
  .warnings li {
    padding: 0.2rem 0;
  }
  .warning::before {
    content: '⚠ ';
    color: var(--danger);
    font-weight: 700;
  }
</style>
