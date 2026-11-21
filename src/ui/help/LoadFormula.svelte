<script lang="ts">
  import { formatNumber, formatPercent, locale, translate as t } from '../../i18n';

  /**
   * The worked example of the load calculation as a picture: one meeting -> hours a week -> share
   * of the working week against the limit. The sentence below says the same for screen readers.
   */
  const LIMIT = 0.6;
  const SHARE = 0.3;
</script>

<figure class="formula">
  <div class="rows" aria-hidden="true">
    <div class="row">
      <span class="term">
        <b>{$t('meet.duration.fixed', { n: 60 })}</b><small>{$t('help.formula.duration')}</small>
      </span>
      <span class="op">×</span>
      <span class="term"><b>1</b><small>{$t('help.formula.share')}</small></span>
      <span class="op">×</span>
      <span class="term">
        <b>{formatNumber($locale, 1.5, 1)}</b><small>{$t('help.formula.prep')}</small>
      </span>
      <span class="op">=</span>
      <span class="term result">
        <b>{$t('cal.hours', { hours: formatNumber($locale, 1.5, 1) })}</b><small>
          {$t('help.formula.meeting')}
        </small>
      </span>
    </div>
    <div class="row">
      <span class="term">
        <b>{$t('cal.hours', { hours: 12 })}</b><small>{$t('help.formula.week')}</small>
      </span>
      <span class="op">÷</span>
      <span class="term">
        <b>{$t('cal.hours', { hours: 40 })}</b><small>{$t('help.formula.hours')}</small>
      </span>
      <span class="op">=</span>
      <span class="term result">
        <b>{formatPercent($locale, SHARE)}</b><small>{$t('help.formula.result')}</small>
      </span>
    </div>
    <div class="meter">
      <span class="fill" style:width="{SHARE * 100}%"></span>
      <span class="limit" style:left="{LIMIT * 100}%">
        <small>{$t('help.formula.limit', { value: formatPercent($locale, LIMIT) })}</small>
      </span>
    </div>
  </div>
  <figcaption>{$t('help.calc.example')}</figcaption>
</figure>

<style>
  .formula {
    margin: 0;
    padding: 1rem 1.1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }
  .rows {
    display: grid;
    gap: 0.75rem;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.5rem;
  }
  .term {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    min-width: 4.5rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .term b {
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  .term small,
  .limit small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .result {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .result b {
    color: var(--accent-text);
  }
  .op {
    color: var(--text-muted);
    font-weight: 600;
  }
  .meter {
    position: relative;
    height: 0.6rem;
    margin: 0.25rem 0 1.75rem;
    border-radius: 999px;
    background: var(--border);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 999px;
    background: var(--accent);
  }
  .limit {
    position: absolute;
    top: -0.3rem;
    bottom: -0.3rem;
    border-left: 2px solid var(--warn);
  }
  .limit small {
    position: absolute;
    top: 1.15rem;
    left: 0;
    transform: translateX(-50%);
    white-space: nowrap;
    color: var(--warn);
    font-weight: 600;
  }
  figcaption {
    margin-top: 0.25rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
</style>
