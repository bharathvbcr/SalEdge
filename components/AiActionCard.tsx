import React from 'react';
import type { AiChatAction } from '../types.ts';
import {
    actionToEditForm,
    executeAiAction,
    formatActionSummary,
    getActionEditLabel,
    isWriteAction,
    type AiActionDeps,
} from '../utils/aiActions.ts';

interface AiActionCardProps {
    action: AiChatAction;
    actionKey: string;
    currencySymbol: string;
    status: 'pending' | 'done' | 'dismissed';
    warning?: string;
    deps: AiActionDeps;
    onStatusChange: (key: string, status: 'done' | 'dismissed') => void;
}

export const AiActionCard: React.FC<AiActionCardProps> = ({
    action,
    actionKey,
    currencySymbol,
    status,
    warning,
    deps,
    onStatusChange,
}) => {
    if (status === 'dismissed') return null;

    const summary = formatActionSummary(action, currencySymbol);
    const writeAction = isWriteAction(action);
    const editAction = actionToEditForm(action);
    const editLabel = getActionEditLabel(action);

    const markDone = () => onStatusChange(actionKey, 'done');

    const handleRun = () => {
        const result = executeAiAction(action, deps);
        if (result.ok) {
            markDone();
            return;
        }
        if (result.needsPartyResolution && editAction) {
            executeAiAction(editAction, deps);
            markDone();
        }
    };

    const handleEdit = () => {
        const target = editAction ?? action;
        executeAiAction(target, deps);
        markDone();
    };

    if (status === 'done') {
        return (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2">
                <p className="text-sm text-green-800 dark:text-green-200">Done: {summary}</p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border-color bg-bg-primary p-3 space-y-2">
            <p className="text-sm font-medium text-text-primary">{summary}</p>
            {warning && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{warning}</p>
            )}
            <div className="flex flex-wrap gap-2">
                {writeAction ? (
                    <>
                        <button type="button" onClick={handleRun} className="btn-primary btn-sm">
                            Confirm
                        </button>
                        {editAction && editLabel && (
                            <button type="button" onClick={handleEdit} className="btn-secondary btn-sm">
                                {editLabel}
                            </button>
                        )}
                    </>
                ) : (
                    <button type="button" onClick={handleRun} className="btn-primary btn-sm">
                        Run
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onStatusChange(actionKey, 'dismissed')}
                    className="btn-secondary btn-sm"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
};
