import React from 'react';
import { ReportPeriod, REPORT_PERIOD_LABELS } from '../utils/reportPeriods.ts';

type PeriodFilterBarProps = {
    value: ReportPeriod;
    onChange: (period: ReportPeriod) => void;
    periods?: ReportPeriod[];
    className?: string;
    fullWidth?: boolean;
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

const PERIOD_GROUPS: ReportPeriod[][] = [
    ['today', 'last7', 'last30'],
    ['this_week', 'prev_week'],
    ['month', 'prev_month'],
    ['this_year', 'prev_year'],
];

export const PeriodFilterBar: React.FC<PeriodFilterBarProps> = ({
    value,
    onChange,
    periods = DEFAULT_PERIODS,
    className = '',
    fullWidth = false,
}) => {
    const periodSet = new Set(periods);
    const groups = PERIOD_GROUPS
        .map(group => group.filter(period => periodSet.has(period)))
        .filter(group => group.length > 0);

    return (
        <div
            className={`filter-group ${fullWidth ? 'w-full' : ''} ${className}`}
            role="tablist"
            aria-label="Report period"
        >
            {groups.map((group, groupIndex) => (
                <React.Fragment key={group.join('-')}>
                    {groupIndex > 0 && <span className="filter-group-divider" aria-hidden="true" />}
                    {group.map(period => (
                        <button
                            key={period}
                            type="button"
                            role="tab"
                            aria-selected={value === period}
                            onClick={() => onChange(period)}
                            className={`filter-pill ${value === period ? 'active' : ''}`}
                        >
                            {REPORT_PERIOD_LABELS[period]}
                        </button>
                    ))}
                </React.Fragment>
            ))}
        </div>
    );
};

export type { ReportPeriod };
