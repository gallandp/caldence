<script lang="ts">
  import { translate as t } from '../../i18n';
  import ColourField, { PALETTE } from './ColourField.svelte';
  import ListEditor from './ListEditor.svelte';
  import { workspace } from '../state/workspace';

  /** The workspace's roles (name, colour, order): on the team page and the area's structure page. */
</script>

<ListEditor
  kind="roles"
  items={$workspace.roles}
  heading={$t('settings.roles')}
  hint={$t('team.roles.hint')}
  addLabel={$t('settings.roles.add')}
  create={(name) => ({
    name,
    colour: PALETTE[$workspace.roles.length % PALETTE.length]!.hex,
  })}
>
  {#snippet extra(role, ctx)}
    <ColourField
      value={role.colour}
      label={$t('colour.of', { name: role.name })}
      onchange={(colour) => ctx.update({ colour })}
    />
    <!-- One half of an owner tandem (#331): business or technical owner of its unit. -->
    <select
      class="half"
      aria-label={$t('owner.roleHalf.label', { name: role.name })}
      value={role.owner ?? ''}
      onchange={(e) => {
        const v = e.currentTarget.value;
        ctx.update({ owner: v === 'business' || v === 'technical' ? v : undefined });
      }}
    >
      <option value="">{$t('owner.roleHalf.none')}</option>
      <option value="business">{$t('owner.roleHalf.business')}</option>
      <option value="technical">{$t('owner.roleHalf.technical')}</option>
    </select>
  {/snippet}
</ListEditor>

<style>
  .half {
    width: auto;
    max-width: 10rem;
  }
</style>
