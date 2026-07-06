import React from 'react';
import { ReportPeriod, REPORT_PERIOD_LABELS } from '../utils/reportPeriods.ts';

type PeriodFilterBarProps = {
    value: ReportPeriod;
    onChange: (period: ReportPeriod) => void;
    periods?: ReportPeriod[];
    className?: string;
};

const DEFAULT_PERIODS: ReportPeriod[] = [
    'today',
    'last7',
    'last30',
    'this_week',
    'prev_week',
    'month',
    'prev_month',
    'this_year',
    'prev_year',
];

export const PeriodFilterBar: React.FC<PeriodFilterBarProps> = ({
    value,
    onChange,
    periods = DEFAULT_PERIODS,
    className = '',
}) => (
    <div className={`filter-group overflow-x-auto max-w-full ${className}`}>
        {periods.map(period => (
            <button
                key={period}
                type="button"
                onClick={() => onChange(period)}
                className={`filter-pill ${value === period ? 'active' : ''}`}
            >
                {REPORT_PERIOD_LABELS[period]}
            </button>
        ))}
    </div>
);

export type { ReportPeriod };
