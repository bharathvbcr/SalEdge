import { useEffect } from 'react';
import { isTypingTarget } from '../utils/shortcuts.ts';

type ShortcutHandler = {
    key: string;
    ctrlOrMeta?: boolean;
    handler: () => void;
    enabled?: boolean;
};

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            for (const shortcut of shortcuts) {
                if (shortcut.enabled === false) continue;

                const needsModifier = shortcut.ctrlOrMeta ?? false;
                const modifierPressed = e.ctrlKey || e.metaKey;

                if (needsModifier) {
                    if (!modifierPressed || e.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
                } else {
                    if (modifierPressed || e.altKey) continue;
                    if (e.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
                }

                if (!needsModifier && isTypingTarget(e.target)) continue;

                e.preventDefault();
                shortcut.handler();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}
