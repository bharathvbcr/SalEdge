export const SALES_SHORTCUTS = [
    { keys: 'N', description: 'New sale' },
    { keys: '/', description: 'Focus item search' },
    { keys: 'Ctrl+Enter', description: 'Record sale' },
    { keys: 'Esc', description: 'Close / back step' },
    { keys: '1 / 2 / 3', description: 'Jump wizard step' },
] as const;

export function isTypingTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
