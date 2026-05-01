/**
 * Returns true when a keyboard event should NOT be treated as a global
 * shortcut — i.e. the user is typing in an input / textarea / contenteditable.
 *
 * Shared between the reviews surface and the messaging surface so j/k/r/
 * shortcuts behave consistently. If the messaging agent ships its own version
 * with the same semantics we can collapse to one in a follow-up.
 */
export function shouldSkipShortcut(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
