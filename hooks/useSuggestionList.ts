import { useState, useCallback, useEffect, KeyboardEvent } from 'react';

export function useSuggestionList<T>(items: T[], onSelect: (item: T | undefined) => void) {
    const [highlightIndex, setHighlightIndex] = useState(-1);

    const resetHighlight = useCallback(() => setHighlightIndex(-1), []);

    // The list shrinks as the user keeps typing — a stale index >= length
    // used to select `undefined` on Enter and crash the customer field.
    useEffect(() => {
        setHighlightIndex(i => (i >= items.length ? items.length - 1 : i));
    }, [items.length]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i => (Math.min(i, items.length - 1) + 1) % items.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i => {
                const clamped = i < 0 || i >= items.length ? items.length : i;
                return (clamped <= 0 ? items.length - 1 : clamped - 1);
            });
        } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < items.length) {
            e.preventDefault();
            onSelect(items[highlightIndex]);
            resetHighlight();
        } else if (e.key === 'Escape') {
            resetHighlight();
        }
    }, [items, highlightIndex, onSelect, resetHighlight]);

    return { highlightIndex, setHighlightIndex, resetHighlight, handleKeyDown };
}
