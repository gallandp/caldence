<script lang="ts">
  import { translate as t } from '../../i18n';
  import type { Problems } from '../state/problems.svelte';

  let { problems, id }: { problems: Problems; id: string } = $props();
  const problem = $derived(problems.errors[id]);
</script>

{#if problem}
  <p class="field-error" id={problems.dom(id)}>
    {$t(problem.key, { path: problem.path, ...problem.params })}
  </p>
{/if}
