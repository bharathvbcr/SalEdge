import React from 'react';
import { WizardStep } from './types.ts';

const STEPS = [
    { id: 0 as WizardStep, label: 'Items', short: '1' },
    { id: 1 as WizardStep, label: 'Customer', short: '2' },
    { id: 2 as WizardStep, label: 'Payment', short: '3' },
];

interface SalesFormWizardProps {
    step: WizardStep;
    onStepChange: (step: WizardStep) => void;
}

export const SalesFormWizard: React.FC<SalesFormWizardProps> = ({ step, onStepChange }) => (
    <div className="flex items-center gap-1 sm:gap-2 pb-4 border-b border-border-color">
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
);

export { STEPS };
