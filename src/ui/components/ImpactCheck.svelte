<script lang="ts">
  import { commitmentImpact } from '../../core/impact';
  import type { Workspace } from '../../core/model';
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';

  /**
   * The effect check (#320): a person's hours in a product, how many of them go into the
   * product's meetings and what is left for product work, the state against the Mindestzusage and
   * the person's overall share in meetings. `ws` is the workspace as it would be.
   */
  let {
    ws,
    teamId,
    personId,
    roleId,
    name,
    overall = true,
  }: {
    ws: Workspace;
    teamId: string;
    personId: string;
    roleId: string;
    name: string;
    /** False where the view already shows the person's overall share (Team view preview). */
    overall?: boolean;
  } = $props();

  const impact = $derived(commitmentImpact(ws, teamId, personId, roleId));
  const team = $derived(ws.teams.find((x) => x.id === teamId));
  const product = $derived(team?.name ?? '');
  const max = $derived(ws.settings.thresholds.maxFte);
  const h = (n: number) => formatNumber($locale, n, 1);
  const pct = (n: number) => formatPercent($locale, n);
  const unitName = (id: string) =>
    id === teamId ? '' : (ws.areas.find((a) => a.id === id)?.name ?? '');

  /** Meetings and the rest as shares of the bar; the bar is the product hours (or the meetings, if more). */
  const bar = $derived.by(() => {
    if (!impact) return null;
    const total = Math.max(impact.hours, impact.meetingHours);
    if (total <= 0) return null;
    return {
      meetings: (Math.min(impact.meetingHours, impact.hours) / total) * 100,
      short: (Math.max(0, impact.meetingHours - impact.hours) / total) * 100,
      left: (impact.left / total) * 100,
      limit: impact.hours > 0 ? (impact.hours * max * 100) / total : null,
    };
  });
</script>

{#if impact && team}
  <div class="impact" data-impact={impact.state}>
    {#if bar}
      <div class="bar-wrap" aria-hidden="true">
        {#if bar.limit !== null}
          <span class="limit-label" style:left="{bar.limit}%">{pct(max)}</span>
        {/if}
        <div class="bar">
          <i class="meet" style:width="{bar.meetings}%"></i>
          <i class="short" style:width="{bar.short}%"></i>
          <i class="left" style:width="{bar.left}%"></i>
          {#if bar.limit !== null}<b style:left="{bar.limit}%"></b>{/if}
        </div>
      </div>
    {/if}

    <div aria-live="polite">
      <p class="sentence" data-impact-sentence>
        <strong>{$t('impact.hours', { hours: h(impact.hours), team: product })}</strong>
        {$t('impact.meetings', { hours: h(impact.meetingHours) })}
        <strong>{$t('impact.left', { hours: h(impact.left) })}</strong>
      </p>

      <div class="state {impact.state}" data-impact-state={impact.state}>
        <span class="mark" aria-hidden="true">{impact.state === 'enough' ? '✓' : '!'}</span>
        <p>
          <strong
            >{$t(`impact.state.${impact.state}`, {
              team: product,
              share: pct(Math.min(impact.share, 1)),
              hours: h(impact.hours),
              meetings: h(impact.meetingHours),
            })}</strong
          >
          {#if impact.state !== 'enough' && impact.min}
            {$t('impact.from', {
              fte: formatNumber($locale, impact.min.fte, 1),
              name,
              max: pct(max),
            })}
          {/if}
        </p>
      </div>

      {#if overall}
        <p class="overall" data-impact-overall>
          {$t('impact.overall', { name, share: pct(impact.overall.share) })}
          {#if impact.overall.over}
            <span class="over-tag" data-impact-over>{$t('load.over')}</span>
            <span class="muted">{$t('impact.overall.over', { max: pct(max) })}</span>
          {/if}
        </p>
      {/if}
    </div>

    {#if impact.meetings.length > 0}
      <details class="list">
        <summary>{$t('impact.list', { team: product, hours: h(impact.meetingHours) })}</summary>
        <table>
          <caption class="sr-only">{$t('impact.list.caption', { team: product })}</caption>
          <thead>
            <tr>
              <th scope="col">{$t('demand.meetings.meeting')}</th>
              <th scope="col" class="num">{$t('demand.meetings.hours')}</th>
            </tr>
          </thead>
          <tbody>
            {#each impact.meetings as m (m.unitId + m.event.id)}
              <tr>
                <th scope="row"
                  >{m.event.name}{#if unitName(m.unitId)}<span class="muted">
                      · {unitName(m.unitId)}</span
                    >{/if}</th
                >
                <td class="num">{$t('demand.hoursValue', { n: h(m.hours) })}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </div>
{/if}

<style>
  .impact {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .bar-wrap {
    position: relative;
    padding-top: 1.1rem;
  }
  .limit-label {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 0.75rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    position: relative;
    display: flex;
    height: 1.4rem;
    border-radius: 0.45rem;
    overflow: hidden;
    background: var(--surface-2);
  }
  .bar i {
    display: block;
    height: 100%;
  }
  .meet {
    background: repeating-linear-gradient(
      -45deg,
      var(--accent) 0 6px,
      color-mix(in srgb, var(--accent) 78%, var(--bg)) 6px 12px
    );
  }
  .short {
    background: repeating-linear-gradient(
      -45deg,
      var(--danger) 0 6px,
      color-mix(in srgb, var(--danger) 70%, var(--bg)) 6px 12px
    );
  }
  .left {
    background: var(--ok-soft);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok) 35%, transparent);
  }
  .bar b {
    position: absolute;
    top: -0.15rem;
    bottom: -0.15rem;
    width: 2px;
    margin-left: -1px;
    background: var(--text);
  }
  p {
    margin: 0;
  }
  .sentence {
    line-height: 1.45;
  }
  .state {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.75rem;
    padding: 0.7rem 0.9rem;
    border-radius: var(--radius);
    background: var(--ok-soft);
  }
  .state.under {
    background: var(--warn-soft);
  }
  .state.meetingsOnly {
    background: var(--danger-soft);
  }
  .mark {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 50%;
    background: var(--bg);
    color: var(--ok);
    font-size: 0.8rem;
    font-weight: 800;
  }
  .under .mark {
    color: var(--warn);
  }
  .meetingsOnly .mark {
    color: var(--danger);
  }
  .overall {
    margin-top: 0.6rem;
    font-size: 0.9rem;
  }
  .muted {
    color: var(--text-muted);
  }
  .over-tag {
    display: inline-block;
    padding: 0 0.45rem;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 0.8rem;
    font-weight: 650;
  }
  .list summary {
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    color: var(--accent-text);
    cursor: pointer;
  }
  .list summary::before {
    content: '▸';
    margin-right: 0.4rem;
  }
  .list[open] summary::before {
    content: '▾';
  }
  .list summary::-webkit-details-marker {
    display: none;
  }
  .list summary {
    list-style: none;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
    text-align: left;
    font-weight: 400;
  }
  thead th {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
