import React, { useEffect, useState } from 'react';
import { SALES_SHORTCUTS } from '../../utils/shortcuts.ts';

export const ShortcutsCheatsheet: React.FC = () => {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [open]);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="btn-icon text-text-muted hover:text-text-primary"
                title="Keyboard shortcuts"
                aria-label="Keyboard shortcuts"
                aria-expanded={open}
            >
                ?
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-2 z-50 w-56 bg-bg-secondary border border-border-color rounded-lg shadow-xl p-3 text-sm">
                        <p className="font-bold text-text-primary mb-2">Keyboard Shortcuts</p>
                        <ul className="space-y-1">
                            {SALES_SHORTCUTS.map(s => (
                                <li key={s.keys} className="flex justify-between gap-2 text-text-secondary">
                                    <kbd className="font-mono text-xs bg-bg-tertiary px-1.5 py-0.5 rounded">{s.keys}</kbd>
                                    <span className="text-xs">{s.description}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
};
