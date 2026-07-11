import React from 'react';

export const SharedStockHint: React.FC<{ className?: string }> = ({ className = '' }) => (
    <p className={`text-xs text-text-muted ${className}`.trim()}>
        Stock is shared across all billing firms — only the invoice header changes.
    </p>
);
