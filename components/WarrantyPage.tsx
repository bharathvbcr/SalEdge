import React, { useState, useMemo, useCallback } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { EmptyState } from './EmptyState.tsx';
import { IconShieldCheck } from './icons.tsx';
import { getWarrantyStatus, searchWarrantyLogs } from '../utils/warrantyLookup.ts';
import { PageHeader } from './PageHeader.tsx';
import { SearchInput } from './SearchInput.tsx';
import { consumeWarrantySearchRequest } from '../utils/pageActions.ts';
import { usePageIntent } from '../hooks/usePageIntent.ts';

type WarrantyStatusFilter = 'all' | 'guarantee' | 'warranty' | 'expired';

export const WarrantyPage: React.FC = () => {
    const { warrantyLogs } = useAppData();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<WarrantyStatusFilter>('all');

    const applyWarrantySearchIntent = useCallback(() => {
        const prefill = consumeWarrantySearchRequest();
        if (prefill) setSearchQuery(prefill);
    }, []);

    usePageIntent(applyWarrantySearchIntent);

    const filteredLogs = useMemo(() => {
        let logs = searchWarrantyLogs(searchQuery, warrantyLogs);

        if (statusFilter !== 'all') {
            logs = logs.filter(log => getWarrantyStatus(log).phase === statusFilter);
        }

        return logs;
    }, [warrantyLogs, searchQuery, statusFilter]);

    const statusFilters: { id: WarrantyStatusFilter; label: string }[] = [
        { id: 'all', label: 'All' },
        { id: 'guarantee', label: 'In Guarantee' },
        { id: 'warranty', label: 'In Warranty' },
        { id: 'expired', label: 'Expired' },
    ];

    return (
        <div className="page-shell">
            <PageHeader title="Warranty Check">
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search serial, customer, phone..."
                    className="md:w-80"
                />
            </PageHeader>

            <div className="toolbar mb-4">
                {statusFilters.map(f => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className={`filter-pill ${statusFilter === f.id ? 'active' : ''}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
            
            <div className="card-section-padded">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-text-secondary">
                        <thead className="text-xs text-text-primary uppercase bg-bg-tertiary sticky top-0 z-10">
                            <tr>
                                <th scope="col" className="px-6 py-3">Serial Number</th>
                                <th scope="col" className="px-6 py-3">Product Name</th>
                                <th scope="col" className="px-6 py-3">Category / Vehicle</th>
                                <th scope="col" className="px-6 py-3">Customer</th>
                                <th scope="col" className="px-6 py-3">Sale Date</th>
                                <th scope="col" className="px-6 py-3">Guarantee End</th>
                                <th scope="col" className="px-6 py-3">Warranty End</th>
                                <th scope="col" className="px-6 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.length > 0 ? filteredLogs.map(log => {
                                const status = getWarrantyStatus(log);
                                return (
                                    <tr key={log.id} className="bg-bg-secondary border-b border-border-color hover:bg-bg-tertiary">
                                        <td className="px-6 py-4 font-mono font-medium text-text-primary">{log.serialNumber}</td>
                                        <td className="px-6 py-4">{log.productName}</td>
                                        <td className="px-6 py-4">
                                            {log.saleCategory && (
                                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs rounded-full">{log.saleCategory}</span>
                                            )}
                                            {(log.vehicleModel || log.vehicleNumber) && (
                                                <p className="text-xs text-text-muted mt-1">{[log.vehicleModel, log.vehicleNumber].filter(Boolean).join(' · ')}</p>
                                            )}
                                            {!log.saleCategory && !log.vehicleModel && !log.vehicleNumber && (
                                                <span className="text-text-muted text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div>{log.customerName}</div>
                                            <div className="text-xs text-text-muted">{log.customerPhone}</div>
                                        </td>
                                        <td className="px-6 py-4">{new Date(log.saleDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">{new Date(log.guaranteeEndDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4">{new Date(log.warrantyEndDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${status.className}`}>
                                                {status.text}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            }) : (
                                <tr>
                                    <td colSpan={8}>
                                        <EmptyState
                                            icon={<IconShieldCheck />}
                                            title="No Warranty Records Found"
                                            message="Warranty logs are created automatically when you sell an item with a serial number."
                                        />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};