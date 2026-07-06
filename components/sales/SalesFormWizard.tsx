import React from 'react';
import { WizardStep, SaleFormMode } from './types.ts';

const STEPS = [
    { id: 0 as WizardStep, label: 'Items', short: '1' },
    { id: 1 as WizardStep, label: 'Customer', short: '2' },
    { id: 2 as WizardStep, label: 'Payment', short: '3' },
];

interface SalesFormWizardProps {
    step: WizardStep;
    onStepChange: (step: WizardStep) => void;
    saleFormMode: SaleFormMode;
    onSaleFormModeChange: (mode: SaleFormMode) => void;
}

export const SalesFormWizard: React.FC<SalesFormWizardProps> = ({
    step, onStepChange, saleFormMode, onSaleFormModeChange,
}) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-color">
        <div className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((s, i) => (
                <React.Fragment key={s.id}>
                    <button
                        type="button"
                        onClick={() => onStepChange(s.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                            step === s.id
                                ? 'bg-brand-red text-white'
                                : step > s.id
                                    ? 'wizard-step-done'
                                    : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
                        }`}
                    >
                        <span className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center text-xs">{s.short}</span>
                        {s.label}
                    </button>
                    {i < STEPS.length - 1 && <div className="hidden sm:block w-6 h-px bg-border-color" />}
                </React.Fragment>
            ))}
        </div>
        <div className="flex rounded-lg border border-border-color overflow-hidden text-sm font-semibold">
            <button
                type="button"
                onClick={() => onSaleFormModeChange('quick')}
                className={`px-3 py-1.5 ${saleFormMode === 'quick' ? 'bg-brand-red text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'}`}
            >
                Quick Sale
            </button>
            <button
                type="button"
                onClick={() => onSaleFormModeChange('full')}
                className={`px-3 py-1.5 ${saleFormMode === 'full' ? 'bg-brand-red text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'}`}
            >
                Full Sale
            </button>
        </div>
    </div>
);

export { STEPS };
