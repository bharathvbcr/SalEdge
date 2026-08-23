import React, { useEffect, useRef, useState } from 'react';
import { IconSearch, IconX } from './icons.tsx';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    id?: string;
    'aria-label'?: string;
}

const SEARCH_DEBOUNCE_MS = 250;

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder = 'Search...',
    className = '',
    id,
    'aria-label': ariaLabel,
}) => {
    const [localValue, setLocalValue] = useState(value);
    const debounceRef = useRef<number | null>(null);
    const lastEmittedRef = useRef(value);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
        onChangeRef.current = onChange;
    });

    useEffect(() => () => {
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
        }
    }, []);

    useEffect(() => {
        if (value !== lastEmittedRef.current) {
            if (debounceRef.current !== null) {
                window.clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
            lastEmittedRef.current = value;
            setLocalValue(value);
        }
    }, [value]);

    const handleChange = (next: string) => {
        setLocalValue(next);
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => {
            debounceRef.current = null;
            lastEmittedRef.current = next;
            onChangeRef.current(next);
        }, SEARCH_DEBOUNCE_MS);
    };

    const handleClear = () => {
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        lastEmittedRef.current = '';
        setLocalValue('');
        onChange('');
    };

    return (
        <div className={`search-input-wrap ${className}`}>
            <IconSearch className="search-icon" aria-hidden="true" />
            <input
                type="search"
                id={id}
                placeholder={placeholder}
                value={localValue}
                onChange={(e) => handleChange(e.target.value)}
                aria-label={ariaLabel ?? placeholder}
                className="form-input w-full md:w-64"
            />
            {localValue && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="search-clear btn-icon"
                    aria-label="Clear search"
                >
                    <IconX className="h-4 w-4" />
                </button>
            )}
        </div>
    );
};
