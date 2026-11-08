<script lang="ts">
  import { BUILTIN_TEMPLATES, builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
  import { locale, translate as t } from '../../i18n';
  import ApplyDialog from '../templates/ApplyDialog.svelte';

  let {
    onOpenFile,
    onOpenExample,
    onEmpty,
    onManual,
    onCreated,
  }: {
    onOpenFile: () => void;
    onOpenExample: () => void;
    /** Switches to the Team view. */
    onEmpty: () => void;
    /** Switches to Help. */
    onManual: () => void;
    /** A team was created from a template. */
    onCreated: () => void;
  } = $props();

  const uid = $props.id();
  const ids = Object.keys(BUILTIN_TEMPLATES) as BuiltinTemplateId[];
  let applyDialog: ApplyDialog | undefined;
</script>

<section class="welcome" aria-labelledby="{uid}-h">
  <h3 id="{uid}-h">{$t('start.title')}</h3>
  <p class="intro">{$t('start.intro')}</p>

  <div class="group" role="group" aria-labelledby="{uid}-tpl">
    <h4 id="{uid}-tpl">{$t('start.template')}</h4>
    <div class="buttons">
      {#each ids as id (id)}
        <button type="button" class="primary" onclick={() => applyDialog?.show(id)}
          >{builtinTemplate(id, $locale).name}</button
        >
      {/each}
    </div>
  </div>

  <div class="buttons">
    <button type="button" onclick={onOpenFile}>{$t('start.file')}</button>
    <button type="button" onclick={onOpenExample}>{$t('start.example')}</button>
  </div>

  <p class="links">
    <button type="button" class="link" onclick={onEmpty}>{$t('start.empty')}</button>
    <button type="button" class="link" onclick={onManual}>{$t('start.manual')}</button>
  </p>
</section>

<ApplyDialog bind:this={applyDialog} oncreated={onCreated} />

<style>
  .welcome {
    max-width: 44rem;
    padding: 2.5rem;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(80% 120% at 100% 0%, rgb(139 123 255 / 0.18), transparent 60%), var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  h3 {
    margin-top: 0;
    font-size: 1.35rem;
  }
  h4 {
    margin: 0 0 0.5rem;
  }
  .intro {
    color: var(--text-muted);
  }
  .group {
    margin-block: var(--space);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-block: var(--space);
  }
  .group .buttons {
    margin-block: 0;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin-bottom: 0;
  }
  :global(#app) .welcome button.link {
    padding: 0.25rem 0;
    border: 0;
    background: none;
    box-shadow: none;
    color: var(--accent-text);
    font-weight: 500;
    text-decoration: underline;
  }
  @media (max-width: 40rem) {
    .welcome {
      padding: 1.25rem;
    }
  }
</style>
