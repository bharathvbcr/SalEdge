import React from 'react';
import { IconSearch, IconX } from './icons.tsx';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    id?: string;
    'aria-label'?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder = 'Search...',
    className = '',
    id,
    'aria-label': ariaLabel,
}) => (
    <div className={`search-input-wrap ${className}`}>
        <IconSearch className="search-icon" aria-hidden="true" />
        <input
            type="search"
            id={id}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={ariaLabel ?? placeholder}
            className="form-input w-full md:w-64"
        />
        {value && (
            <button
                type="button"
                onClick={() => onChange('')}
                className="search-clear btn-icon"
                aria-label="Clear search"
            >
                <IconX className="h-4 w-4" />
            </button>
        )}
    </div>
);
