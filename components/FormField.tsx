import React from 'react';

interface FormFieldProps {
    label: string;
    children: React.ReactNode;
    hint?: string;
    error?: string;
    required?: boolean;
    className?: string;
    htmlFor?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
    label,
    children,
    hint,
    error,
    required,
    className = '',
    htmlFor,
}) => (
    <div className={`form-group ${error ? 'has-error' : ''} ${className}`}>
        <label htmlFor={htmlFor}>
            {label}
            {required && <span className="required-mark" aria-hidden="true">*</span>}
        </label>
        {children}
        {error ? (
            <p className="form-error" role="alert">{error}</p>
        ) : hint ? (
            <p className="text-xs text-text-muted mt-0.5">{hint}</p>
        ) : null}
    </div>
);
