<script lang="ts">
  import type { Area } from '../../core/model';
  import { translate as t } from '../../i18n';
  import Rich from '../help/Rich.svelte';
  import AreaIcon from './AreaIcon.svelte';

  /** Shown once right after an area was created: the next three steps, like "Your team is ready". */
  let {
    area,
    onTeams,
    onPeople,
    onMeetings,
    onClose,
  }: {
    area: Area;
    onTeams: () => void;
    onPeople: () => void;
    onMeetings: () => void;
    onClose: () => void;
  } = $props();

  const uid = $props.id();
</script>

<section class="ready" aria-labelledby="{uid}-h">
  <h3 id="{uid}-h">
    <span class="mark"><AreaIcon /></span>
    {$t('area.ready.title', { name: area.name })}
  </h3>
  <p>{$t('area.ready.intro')}</p>
  <ol>
    <li>
      <span>{$t('area.ready.teams')}</span>
      <button type="button" onclick={onTeams}>{$t('area.teams')}</button>
    </li>
    <li>
      <span>{$t('area.ready.people')}</span>
      <button type="button" onclick={onPeople}>{$t('area.structure.add')}</button>
    </li>
    <li>
      <span>{$t('area.ready.meetings', { fromTeams: $t('area.participants.fromTeams') })}</span>
      <button type="button" onclick={onMeetings}>{$t('area.ready.meetings.button')}</button>
    </li>
  </ol>
  <p class="hint">{$t('area.ready.time')}</p>
  <p class="hint"><Rich key="area.ready.names" labels={{ settings: 'view.settings' }} /></p>
  <div class="buttons">
    <button type="button" class="primary" onclick={onClose}>{$t('setup.done.close')}</button>
  </div>
</section>

<style>
  .ready {
    max-width: 52rem;
    padding: 1.25rem 1.5rem;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(
        80% 120% at 100% 0%,
        color-mix(in srgb, var(--area) 18%, transparent),
        transparent 60%
      ),
      var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }
  .mark {
    display: inline-flex;
    color: var(--area);
  }
  ol {
    display: grid;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
    padding-left: 1.4rem;
  }
  li {
    padding-left: 0.25rem;
  }
  li span {
    margin-right: 0.5rem;
  }
  li button {
    margin-top: 0.25rem;
  }
  p {
    margin: 0 0 0.6rem;
  }
  .hint {
    color: var(--text-muted);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
