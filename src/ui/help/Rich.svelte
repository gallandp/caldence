<script lang="ts">
  import { translate as t } from '../../i18n';
  import { label as labelOf, type Label } from './label';

  /**
   * A text from the catalogue whose placeholders are filled with the real labels of the UI
   * (shown in bold, or as a link with `href`) or with keys (shown as <kbd>).
   */
  let {
    key,
    labels = {},
    keys = {},
  }: { key: string; labels?: Record<string, Label>; keys?: Record<string, string> } = $props();

  type Part =
    | { kind: 'text'; value: string }
    | { kind: 'label'; value: string; href?: string }
    | { kind: 'kbd'; value: string };

  const parts = $derived.by(() => {
    const text = $t(key);
    const out: Part[] = [];
    let last = 0;
    for (const m of text.matchAll(/\{(\w+)\}/g)) {
      if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
      const name = m[1]!;
      const l = labels[name];
      if (l !== undefined)
        out.push({
          kind: 'label',
          value: $labelOf(l),
          href: typeof l === 'string' ? undefined : l.href,
        });
      else if (name in keys) out.push({ kind: 'kbd', value: keys[name]! });
      else out.push({ kind: 'text', value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
    return out;
  });
</script>

{#each parts as part, i (i)}{#if part.kind === 'label'}{#if part.href}<a href={part.href}
        >{part.value}</a
      >{:else}<span class="ui">{part.value}</span>{/if}{:else if part.kind === 'kbd'}<kbd
      >{part.value}</kbd
    >{:else}{part.value}{/if}{/each}

<style>
  .ui {
    font-weight: 600;
  }
</style>
