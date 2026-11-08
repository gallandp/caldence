import { derived } from 'svelte/store';
import { builtinTemplate, type BuiltinTemplateId } from '../../data/templates';
import { locale, translate } from '../../i18n';

/**
 * A label the manual names: an i18n key, `template:<id>` for the name of a built-in template, or a
 * key with params. With `href`, the label is a link inside the manual.
 */
export type Label = string | { key: string; params?: Record<string, string>; href?: string };

/** Store of a function that returns the label as the UI shows it, in the UI language. */
export const label = derived([translate, locale], ([$t, $locale]) => (l: Label): string => {
  const key = typeof l === 'string' ? l : l.key;
  if (key.startsWith('template:'))
    return builtinTemplate(key.slice('template:'.length) as BuiltinTemplateId, $locale).name;
  return $t(key, typeof l === 'string' ? undefined : l.params);
});

type NavigatorWithData = Navigator & { userAgentData?: { platform?: string } };

/** 'mac' on Apple devices, where shortcuts use ⌘; 'other' elsewhere. */
export function platformKind(): 'mac' | 'other' {
  const platform =
    typeof navigator === 'undefined'
      ? ''
      : (navigator as NavigatorWithData).userAgentData?.platform || navigator.platform || '';
  return /mac|iphone|ipad/i.test(platform) ? 'mac' : 'other';
}

export type Shortcut = 'save' | 'saveAs' | 'open' | 'undo';

/** Store of a function that spells a keyboard shortcut for this platform, e.g. Ctrl+Z. */
export const shortcut = derived(translate, ($t) => {
  const kind = platformKind();
  return (id: Shortcut): string =>
    $t('help.keys.' + id, {
      mod: $t('help.key.mod.' + kind),
      shift: $t('help.key.shift.' + kind),
    });
});
