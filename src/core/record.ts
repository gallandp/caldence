/**
 * An empty record without a prototype. Ids from files are used as its keys, so an id such as
 * `__proto__` or `constructor` must be an ordinary key, never a member of `Object.prototype`
 * (security #40).
 */
export const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
