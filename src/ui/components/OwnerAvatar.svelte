<script lang="ts">
  import type { OwnerHalf } from '../../core/model';
  import { translate as t } from '../../i18n';
  import { initials } from '../avatar';

  /** One owner (#331): initials with a small F or T badge, or a dashed "?" when `name` is null. */
  let {
    name,
    half,
    large = false,
  }: { name: string | null; half: OwnerHalf; large?: boolean } = $props();
</script>

<span
  class="av {half}"
  class:gap={name === null}
  class:large
  aria-hidden="true"
  title={`${name ?? $t('owner.missing')} (${$t(`owner.half.${half}`)})`}
  >{name === null ? '?' : initials(name)}<i>{$t(`owner.badge.${half}`)}</i></span
>

<style>
  .av {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
  }
  .large {
    width: 2.25rem;
    height: 2.25rem;
    font-size: 0.8rem;
  }
  .large i {
    width: 1rem;
    height: 1rem;
    font-size: 0.6rem;
  }
  .business {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .technical {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .gap {
    border: 1.5px dashed var(--danger);
    background: var(--surface);
    color: var(--danger);
  }
  i {
    position: absolute;
    right: -0.25rem;
    bottom: -0.25rem;
    display: grid;
    place-items: center;
    width: 0.8rem;
    height: 0.8rem;
    border: 1.5px solid var(--surface);
    border-radius: 50%;
    color: var(--surface);
    font-size: 0.5rem;
    font-style: normal;
  }
  .business i {
    background: var(--ok);
  }
  .technical i {
    background: var(--accent);
  }
  .gap i {
    background: var(--danger);
  }
  @media (forced-colors: active) {
    .av,
    i {
      border: 1px solid CanvasText;
    }
  }
</style>
