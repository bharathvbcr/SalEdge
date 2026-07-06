import React from 'react';
import { useAppData } from '../context/AppDataContext.tsx';

export const AuditLogViewer: React.FC = () => {
    const { auditLogs } = useAppData();

    if (auditLogs.length === 0) {
        return <p className="text-sm text-text-muted">No audit entries yet. Deletes and critical actions are logged here.</p>;
    }

    return (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-bg-tertiary text-text-muted font-semibold sticky top-0">
                    <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Action</th>
                        <th className="p-2">Entity</th>
                        <th className="p-2">User</th>
                        <th className="p-2">Details</th>
                    </tr>
                </thead>
                <tbody>
                    {auditLogs.map(log => (
                        <tr key={log.id} className="border-b border-border-color">
                            <td className="p-2 whitespace-nowrap text-text-muted">
                                {new Date(log.date).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                                    log.action === 'STOCK_REVERSAL' ? 'bg-orange-100 text-orange-800' :
                                    'bg-blue-100 text-blue-800'
                                }`}>
                                    {log.action}
                                </span>
                            </td>
                            <td className="p-2">{log.entityType} <span className="font-mono text-xs">{log.entityId}</span></td>
                            <td className="p-2 capitalize">{log.userRole}</td>
                            <td className="p-2 text-text-secondary max-w-xs truncate" title={log.details}>{log.details}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
