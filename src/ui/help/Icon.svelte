<script lang="ts">
  import type { Tint } from './topics';

  /** A rounded tile with a line icon, tinted by topic (decorative). */
  let {
    path,
    tint = 'accent',
    size = 'md',
  }: { path: string; tint?: Tint; size?: 'sm' | 'md' | 'lg' } = $props();
</script>

<span class="tile {tint} {size}" aria-hidden="true">
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d={path} />
  </svg>
</span>

<style>
  .tile {
    flex: none;
    display: inline-grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
  }
  .sm {
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
  }
  .lg {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 0.95rem;
  }
  svg {
    width: 55%;
    height: 55%;
  }
  .accent {
    color: var(--accent-text);
    background: var(--accent-soft);
  }
  .area {
    color: var(--area);
    background: var(--area-soft);
  }
  .ok {
    color: var(--ok);
    background: var(--ok-soft);
  }
  .warn {
    color: var(--warn);
    background: var(--warn-soft);
  }
  .hot {
    color: var(--danger);
    background: var(--danger-soft);
  }
</style>
