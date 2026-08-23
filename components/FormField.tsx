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

interface FieldControlProps {
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
    label,
    children,
    hint,
    error,
    required,
    className = '',
    htmlFor,
}) => {
    const autoId = React.useId();
    const describedById = `${autoId}-description`;

    let fieldChildren: React.ReactNode = children;
    if (
        !htmlFor &&
        React.isValidElement(children) &&
        (children.type as unknown) !== React.Fragment &&
        (children.props as FieldControlProps).id === undefined
    ) {
        fieldChildren = React.cloneElement(children as React.ReactElement<FieldControlProps>, {
            id: autoId,
            'aria-invalid': !!error,
            ...(error || hint ? { 'aria-describedby': describedById } : {}),
        });
    }

    return (
        <div className={`form-group ${error ? 'has-error' : ''} ${className}`}>
            <label htmlFor={htmlFor ?? autoId}>
                {label}
                {required && <span className="required-mark" aria-hidden="true">*</span>}
            </label>
            {fieldChildren}
            {error ? (
                <p id={describedById} className="form-error" role="alert">{error}</p>
            ) : hint ? (
                <p id={describedById} className="text-xs text-text-muted mt-0.5">{hint}</p>
            ) : null}
        </div>
    );
};
