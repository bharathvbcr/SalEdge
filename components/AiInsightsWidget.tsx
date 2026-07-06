import React, { useCallback, useMemo, useState } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { AiInsightsResult } from '../types.ts';
import { aiGetInsights } from '../utils/api.ts';
import { buildAiBusinessSnapshot } from '../utils/aiBusinessSnapshot.ts';
import type { ReportPeriod } from '../utils/reportPeriods.ts';
import { LoadingSpinner } from './LoadingSpinner.tsx';
import { IconAlertTriangle, IconTrendingUp } from './icons.tsx';

type FilterPeriod = ReportPeriod;

export const AiInsightsWidget: React.FC<{ period: FilterPeriod }> = ({ period }) => {
    const { userRole } = useAuth();
    const { transactions, expenses, purchases, inventory } = useAppData();
    const { productTypes, suppliers } = useMasterData();
    const { config } = useConfig();
    const aiSettings = config.preferences.aiSettings;

    const [insights, setInsights] = useState<(AiInsightsResult & { generatedAt?: string }) | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const snapshot = useMemo(
        () => buildAiBusinessSnapshot(period, transactions, expenses, purchases, inventory, productTypes, suppliers),
        [period, transactions, expenses, purchases, inventory, productTypes, suppliers],
    );

    const fetchInsights = useCallback(async () => {
        if (!aiSettings?.enabled) return;
        setLoading(true);
        setError(null);
        try {
            const result = await aiGetInsights({
                aiSettings,
                period: snapshot.period,
                businessSnapshot: snapshot,
            });
            setInsights(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to generate insights.';
            setError(message.includes('disabled') ? 'AI assistant is disabled in Settings.' : message);
        } finally {
            setLoading(false);
        }
    }, [aiSettings, snapshot]);

    if (userRole !== 'admin') {
        return null;
    }

    if (!aiSettings?.enabled) {
        return (
            <div className="card-section-padded border border-dashed border-border-color">
                <h3 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
                    <IconTrendingUp className="h-5 w-5 text-brand-red" /> AI Insights
                </h3>
                <p className="text-sm text-text-muted">Enable the AI Assistant in Settings to get narrative business insights.</p>
            </div>
        );
    }

    return (
        <div className="card-section-padded">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                    <IconTrendingUp className="h-5 w-5 text-brand-red" /> AI Insights
                </h3>
                <div className="flex items-center gap-3">
                    {insights?.generatedAt && (
                        <span className="text-xs text-text-muted">
                            Updated {new Date(insights.generatedAt).toLocaleString()}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={fetchInsights}
                        disabled={loading || !aiSettings.enabled}
                        className="btn-secondary btn-sm"
                    >
                        {loading ? 'Generating…' : insights ? 'Refresh insights' : 'Generate insights'}
                    </button>
                </div>
            </div>

            {loading && (
                <div className="py-8">
                    <LoadingSpinner message="Analyzing business data…" size="sm" />
                </div>
            )}

            {error && !loading && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {!loading && !error && !insights && (
                <p className="text-sm text-text-muted">Click &quot;Generate insights&quot; for AI-powered highlights and recommendations.</p>
            )}

            {insights && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <h4 className="text-sm font-bold text-green-600 mb-2">Highlights</h4>
                        <ul className="space-y-2 text-sm text-text-secondary">
                            {insights.highlights.map((h, i) => (
                                <li key={i} className="flex gap-2"><span className="text-green-500">•</span>{h}</li>
                            ))}
                            {insights.highlights.length === 0 && <li className="text-text-muted italic">No highlights returned.</li>}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-yellow-600 mb-2 flex items-center gap-1">
                            <IconAlertTriangle className="h-4 w-4" /> Risks
                        </h4>
                        <ul className="space-y-2 text-sm text-text-secondary">
                            {insights.risks.map((r, i) => (
                                <li key={i} className="flex gap-2"><span className="text-yellow-500">•</span>{r}</li>
                            ))}
                            {insights.risks.length === 0 && <li className="text-text-muted italic">No risks flagged.</li>}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-blue-600 mb-2">Suggested Actions</h4>
                        <ul className="space-y-2 text-sm text-text-secondary">
                            {insights.suggestedActions.map((a, i) => (
                                <li key={i} className="flex gap-2"><span className="text-blue-500">•</span>{a}</li>
                            ))}
                            {insights.suggestedActions.length === 0 && <li className="text-text-muted italic">No actions suggested.</li>}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};
