import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useAppData } from '../context/AppDataContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import type { AiChatAction, AiChatMessage, Page } from '../types.ts';
import { aiChat } from '../utils/api.ts';
import { buildAiActionContext } from '../utils/aiActionContext.ts';
import { type AiActionDeps, resolveParty } from '../utils/aiActions.ts';
import { AI_PERIOD_LABELS, AiSnapshotPeriod, buildAiBusinessSnapshot } from '../utils/aiBusinessSnapshot.ts';
import { AiActionCard } from './AiActionCard.tsx';
import { LoadingSpinner } from './LoadingSpinner.tsx';
import { IconSparkles, IconX } from './icons.tsx';

const SUGGESTED_QUESTIONS = [
    'Log ₹5000 rent expense in cash',
    'Pay supplier ₹10000 by UPI',
    'Show low stock batteries',
    'Open reports for this month',
    'How are sales this month?',
];

type ActionStatus = 'pending' | 'done' | 'dismissed';

interface AiChatPanelProps {
    onNavigate: (page: Page) => void;
}

export const AiChatPanel: React.FC<AiChatPanelProps> = ({ onNavigate }) => {
    const { userRole } = useAuth();
    const { config } = useConfig();
    const { transactions, expenses, purchases, inventory, paymentVouchers, addExpense, addPaymentVoucher } = useAppData();
    const { productTypes, suppliers } = useMasterData();
    const aiSettings = config.preferences.aiSettings;

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionStatuses, setActionStatuses] = useState<Record<string, ActionStatus>>({});
    const [period] = useState<AiSnapshotPeriod>(
        config.preferences.defaultDashboardView || 'last30',
    );
    const scrollRef = useRef<HTMLDivElement>(null);

    const isAdmin = userRole === 'admin';
    const aiEnabled = isAdmin && (aiSettings?.enabled ?? false);
    const currencySymbol = config.firms.find(f => f.id === config.preferences.defaultFirmId)?.financials.currencySymbol || '₹';

    const snapshot = useMemo(
        () => buildAiBusinessSnapshot(period, transactions, expenses, purchases, inventory, productTypes, suppliers),
        [period, transactions, expenses, purchases, inventory, productTypes, suppliers],
    );

    const actionContext = useMemo(
        () => buildAiActionContext(
            userRole ?? 'admin',
            config.preferences.defaultFirmId,
            transactions,
            expenses,
            purchases,
            paymentVouchers,
            suppliers,
        ),
        [userRole, config.preferences.defaultFirmId, transactions, expenses, purchases, paymentVouchers, suppliers],
    );

    const actionDeps: AiActionDeps = useMemo(() => ({
        onNavigate,
        defaultFirmId: config.preferences.defaultFirmId,
        suppliers,
        transactions,
        addExpense,
        addPaymentVoucher,
    }), [onNavigate, config.preferences.defaultFirmId, suppliers, transactions, addExpense, addPaymentVoucher]);

    const getActionWarning = useCallback((action: AiChatAction): string | undefined => {
        if (action.type !== 'add_payment_voucher') return undefined;
        const party = resolveParty(action.partyType, action.partyName, suppliers, transactions);
        if (!party) {
            return `Could not match ${action.partyType.toLowerCase()} "${action.partyName}". Confirm opens Banking to pick the party.`;
        }
        return undefined;
    }, [suppliers, transactions]);

    const sendMessage = useCallback(async (text: string) => {
        if (!aiSettings?.enabled || !text.trim() || loading) return;

        const userMessage: AiChatMessage = { role: 'user', content: text.trim() };
        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInput('');
        setLoading(true);
        setError(null);

        try {
            const result = await aiChat({
                aiSettings,
                messages: nextMessages,
                businessSnapshot: snapshot,
                actionContext,
            });
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: result.reply,
                actions: result.actions,
            }]);
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get a response.');
            setMessages(prev => prev.slice(0, -1));
        } finally {
            setLoading(false);
        }
    }, [aiSettings, loading, messages, snapshot, actionContext]);

    const handleActionStatusChange = useCallback((key: string, status: 'done' | 'dismissed') => {
        setActionStatuses(prev => ({ ...prev, [key]: status }));
        if (status === 'done') {
            setIsOpen(false);
        }
    }, []);

    if (!aiEnabled) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(open => !open)}
                className="btn-icon relative"
                aria-label={isOpen ? 'Close AI chat' : 'Open AI chat'}
                title="Ask or run quick actions"
            >
                <IconSparkles className="h-5 w-5 text-brand-red" />
            </button>

            {isOpen && (
                <div className="fixed bottom-20 md:bottom-6 right-4 z-50 w-[min(100vw-2rem,24rem)] h-[min(70vh,32rem)] flex flex-col bg-bg-secondary border border-border-color rounded-2xl shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-color bg-bg-tertiary/60">
                        <div>
                            <h2 className="font-bold text-text-primary flex items-center gap-2">
                                <IconSparkles className="h-4 w-4 text-brand-red" /> AI Assistant
                            </h2>
                            <p className="text-xs text-text-muted">Quick actions & Q&A · {AI_PERIOD_LABELS[period]}</p>
                        </div>
                        <button type="button" onClick={() => setIsOpen(false)} className="btn-icon" aria-label="Close">
                            <IconX className="h-5 w-5" />
                        </button>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 && !loading && (
                            <div className="space-y-3">
                                <p className="text-sm text-text-muted">
                                    Ask about your business or run actions like logging expenses, payments, and navigation.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {SUGGESTED_QUESTIONS.map(q => (
                                        <button
                                            key={q}
                                            type="button"
                                            onClick={() => sendMessage(q)}
                                            className="text-xs px-2 py-1 rounded-full border border-border-color bg-bg-primary hover:bg-bg-tertiary text-text-secondary"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} className="space-y-2">
                                <div
                                    className={`text-sm rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-wrap ${
                                        msg.role === 'user'
                                            ? 'ml-auto bg-brand-red text-white'
                                            : 'mr-auto bg-bg-tertiary text-text-primary border border-border-color'
                                    }`}
                                >
                                    {msg.content}
                                </div>
                                {msg.role === 'assistant' && msg.actions?.map((action, actionIndex) => {
                                    const actionKey = `${i}-${actionIndex}-${action.type}`;
                                    const status = actionStatuses[actionKey] ?? 'pending';
                                    return (
                                        <AiActionCard
                                            key={actionKey}
                                            action={action}
                                            actionKey={actionKey}
                                            currencySymbol={currencySymbol}
                                            status={status}
                                            warning={getActionWarning(action)}
                                            deps={actionDeps}
                                            onStatusChange={handleActionStatusChange}
                                        />
                                    );
                                })}
                            </div>
                        ))}

                        {loading && (
                            <div className="py-2">
                                <LoadingSpinner message="Thinking…" size="sm" />
                            </div>
                        )}

                        {error && (
                            <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}
                    </div>

                    <form
                        className="p-3 border-t border-border-color flex gap-2"
                        onSubmit={e => {
                            e.preventDefault();
                            sendMessage(input);
                        }}
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask or run an action…"
                            className="form-input flex-1 text-sm"
                            disabled={loading}
                        />
                        <button type="submit" className="btn-primary btn-sm" disabled={loading || !input.trim()}>
                            Send
                        </button>
                    </form>
                </div>
            )}
        </>
    );
};
