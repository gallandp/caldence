<script lang="ts">
  import { commitmentImpact } from '../../core/impact';
  import type { Workspace } from '../../core/model';
  import { formatPercent, locale, translate as t } from '../../i18n';

  /**
   * The effect check in one line (#320), wherever an assignment is shown: the state in the
   * product and "davon in X: n % in Terminen". Never "über Grenze": that is the person's overall
   * status, shown where their whole load is.
   */
  let {
    ws,
    teamId,
    personId,
    roleId,
    withTeam = false,
    short = false,
  }: {
    ws: Workspace;
    teamId: string;
    personId: string;
    roleId: string;
    withTeam?: boolean;
    /** Inside the product's own card: "n % in Terminen" without the product's name. */
    short?: boolean;
  } = $props();

  const impact = $derived(commitmentImpact(ws, teamId, personId, roleId));
  const team = $derived(ws.teams.find((x) => x.id === teamId)?.name ?? '');
</script>

{#if impact && impact.meetingHours > 0}
  <span class="tag {impact.state}" data-impact-tag={impact.state}>
    {#if withTeam}<span class="team">{team}:</span>{/if}
    <span>{$t(`impact.tag.${impact.state}`)}</span>
    <span class="share"
      >· {$t(short ? 'impact.tag.shareShort' : 'impact.tag.share', {
        team,
        share: formatPercent($locale, Math.min(impact.share, 1)),
      })}</span
    >
  </span>
{/if}

<style>
  .tag {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.3rem;
    font-size: 0.82rem;
    color: var(--ok);
    font-weight: 600;
  }
  .tag.under {
    color: var(--warn);
  }
  .tag.meetingsOnly {
    color: var(--danger);
  }
  .share,
  .team {
    color: var(--text-muted);
    font-weight: 400;
  }
</style>
