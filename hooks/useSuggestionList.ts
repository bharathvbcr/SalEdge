import { useState, useCallback, KeyboardEvent } from 'react';

export function useSuggestionList<T>(items: T[], onSelect: (item: T) => void) {
    const [highlightIndex, setHighlightIndex] = useState(-1);

    const resetHighlight = useCallback(() => setHighlightIndex(-1), []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(i => (i + 1) % items.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(i => (i <= 0 ? items.length - 1 : i - 1));
        } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            onSelect(items[highlightIndex]);
            resetHighlight();
        } else if (e.key === 'Escape') {
            resetHighlight();
        }
    }, [items, highlightIndex, onSelect, resetHighlight]);

    return { highlightIndex, setHighlightIndex, resetHighlight, handleKeyDown };
}
