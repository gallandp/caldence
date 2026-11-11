<script lang="ts">
  import { translate as t } from '../../i18n';
  import { label } from './label';
  import Rich from './Rich.svelte';
  import { sectionLink } from './sections';
  import { MANUAL_STEPS } from './steps';
</script>

<section aria-labelledby="manual-first">
  <h3 id="manual-first">{$t('help.first.title')}</h3>
  <p>{$t('help.first.intro')}</p>
  <ol data-manual-steps>
    {#each MANUAL_STEPS as step (step.text)}
      <li
        data-control-role={step.control?.role}
        data-control-name={step.control ? $label(step.control.name) : undefined}
      >
        <Rich
          key={step.text}
          labels={{ ...step.labels, ...(step.control ? { control: step.control.name } : {}) }}
        />
      </li>
    {/each}
  </ol>
  <p><Rich key="help.first.next" labels={{ ics: sectionLink('manual-ics') }} /></p>
  <p>
    <Rich
      key="help.first.other"
      labels={{
        example: 'start.example',
        file: 'start.file',
      }}
    />
  </p>
</section>
