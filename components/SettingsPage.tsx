import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { AuditLogViewer } from './AuditLogViewer.tsx';
import { UserManagement } from './UserManagement.tsx';
import { IconSun, IconMoon, IconX } from './icons.tsx';
import { api, aiTestConnection, aiOllamaModels } from '../utils/api.ts';
import { Firm, AiSettings, ReportPeriodPreference } from '../types.ts';
import { detectLegacyLocalStorage, readLegacyLocalStorageData, clearLegacyLocalStorage } from '../utils/localStorageMigration.ts';
import { PageHeader } from './PageHeader.tsx';
import { MobileConnectPanel } from './MobileConnectPanel.tsx';

const SettingsSection: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <div className="card-section-padded">
        <h3 className="text-lg font-bold text-text-primary mb-1">{title}</h3>
        <p className="text-sm text-text-muted mb-6">{description}</p>
        <div className="space-y-4">
            {children}
        </div>
    </div>
);

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-2">
        <label className="font-medium text-text-secondary">{label}</label>
        <div className="md:col-span-2">{children}</div>
    </div>
);


export const SettingsPage: React.FC = () => {
    const { theme, setTheme } = useTheme();
    const { config, updateFirm, updatePreferences } = useConfig();
    const { addToast } = useToast();
    const { userRole } = useAuth();
    const importFileRef = useRef<HTMLInputElement>(null);
    const [legacyKeys, setLegacyKeys] = useState<string[]>([]);

    const [editingFirmId, setEditingFirmId] = useState<string>(config.firms[0]?.id || '');
    const [firmData, setFirmData] = useState<Firm | null>(config.firms.find(f => f.id === editingFirmId) || null);
    const [preferences, setPreferences] = useState(config.preferences);
    const [newSaleCategory, setNewSaleCategory] = useState('');
    const [isResetModalOpen, setResetModalOpen] = useState(false);
    const [showImportConfirm, setShowImportConfirm] = useState(false);
    const [aiTesting, setAiTesting] = useState(false);
    
    useEffect(() => {
        setFirmData(config.firms.find(f => f.id === editingFirmId) || null);
    }, [editingFirmId, config.firms]);

    useEffect(() => {
        setPreferences(config.preferences);
    }, [config.preferences]);

    useEffect(() => {
        setLegacyKeys(detectLegacyLocalStorage());
    }, []);

    const handleFirmDataChange = (field: 'shopDetails' | 'financials', key: string, value: any) => {
        if (!firmData) return;
        setFirmData({
            ...firmData,
            [field]: {
                ...firmData[field],
                [key]: value
            }
        });
    };
    
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 1024 * 1024) { // 1MB limit
                 addToast("File too large. Max 1MB.", 'error');
                 return;
            }
            try {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                handleFirmDataChange('shopDetails', 'logo', base64);
            } catch (error) {
                console.error(error);
                addToast("Failed to upload logo", 'error');
            }
        }
    };

    const handleSaveFirm = () => {
        if (firmData) {
            updateFirm(firmData);
            addToast(`${firmData.shopDetails.name} settings saved!`, 'success');
        }
    };

    const handleSavePreferences = () => {
        updatePreferences({
             ...preferences,
             defaultLowStockAlert: Number(preferences.defaultLowStockAlert),
             loyaltyProgram: {
                 ...preferences.loyaltyProgram,
                 earnRate: Number(preferences.loyaltyProgram.earnRate),
                 redemptionValue: Number(preferences.loyaltyProgram.redemptionValue),
                 tiers: {
                     silver: Number(preferences.loyaltyProgram.tiers.silver),
                     gold: Number(preferences.loyaltyProgram.tiers.gold),
                     platinum: Number(preferences.loyaltyProgram.tiers.platinum),
                 },
                 tierDiscounts: {
                     silver: Number(preferences.loyaltyProgram.tierDiscounts?.silver ?? 0),
                     gold: Number(preferences.loyaltyProgram.tierDiscounts?.gold ?? 2),
                     platinum: Number(preferences.loyaltyProgram.tierDiscounts?.platinum ?? 5),
                 }
             }
        });
        addToast('Preferences saved!', 'success');
    };

    const handleAddSaleCategory = () => {
        const trimmed = newSaleCategory.trim();
        if (!trimmed) return;
        const existing = preferences.saleCategories ?? [];
        if (existing.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
            addToast('Category already exists.', 'warning');
            return;
        }
        setPreferences(p => ({ ...p, saleCategories: [...(p.saleCategories ?? []), trimmed] }));
        setNewSaleCategory('');
    };

    const handleRemoveSaleCategory = (category: string) => {
        setPreferences(p => ({
            ...p,
            saleCategories: (p.saleCategories ?? []).filter(c => c !== category),
        }));
    };

    const aiSettings: AiSettings = preferences.aiSettings ?? {
        enabled: false,
        provider: 'gemini',
        geminiModel: 'gemini-2.0-flash',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaVisionModel: 'auto',
        ollamaTextModel: 'auto',
        semanticLayerEnabled: true,
        semanticLayerUrl: 'http://127.0.0.1:8090',
    };

    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
    const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);

    useEffect(() => {
        if (!aiSettings.enabled || aiSettings.provider !== 'ollama') {
            setOllamaModels([]);
            setOllamaModelsError(null);
            return;
        }

        let cancelled = false;
        const loadModels = async () => {
            setOllamaModelsLoading(true);
            setOllamaModelsError(null);
            try {
                const result = await aiOllamaModels({ aiSettings });
                if (cancelled) return;
                setOllamaModels(result.available ?? []);
            } catch (err) {
                if (cancelled) return;
                setOllamaModels([]);
                setOllamaModelsError(err instanceof Error ? err.message : 'Could not load Ollama models');
            } finally {
                if (!cancelled) setOllamaModelsLoading(false);
            }
        };

        const timer = window.setTimeout(loadModels, 400);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [aiSettings.enabled, aiSettings.provider, aiSettings.ollamaBaseUrl, aiSettings.ollamaVisionModel, aiSettings.ollamaTextModel]);

    const updateAiSettings = (partial: Partial<AiSettings>) => {
        setPreferences(p => ({
            ...p,
            aiSettings: { ...(p.aiSettings ?? aiSettings), ...partial },
        }));
    };

    const handleAiEnabledChange = (enabled: boolean) => {
        const nextAiSettings: AiSettings = { ...(preferences.aiSettings ?? aiSettings), enabled };
        setPreferences(p => ({ ...p, aiSettings: nextAiSettings }));
        updatePreferences({ aiSettings: nextAiSettings });
    };

    const handleSaveAiSettings = () => {
        updatePreferences({ aiSettings: preferences.aiSettings ?? aiSettings });
        addToast('AI settings saved!', 'success');
    };

    const handleTestAiConnection = async () => {
        setAiTesting(true);
        try {
            const result = await aiTestConnection({ aiSettings: preferences.aiSettings ?? aiSettings });
            addToast(result.message, result.ok ? 'success' : 'error');
        } catch (err) {
            addToast(err instanceof Error ? err.message : 'Connection test failed', 'error');
        } finally {
            setAiTesting(false);
        }
    };
    const handleImportLegacyLocalStorage = async () => {
        const data = readLegacyLocalStorageData();
        if (Object.keys(data).length === 0) {
            addToast('No legacy browser data found.', 'warning');
            return;
        }
        setShowImportConfirm(true);
    };

    const confirmImportLegacy = async () => {
        const data = readLegacyLocalStorageData();
        setShowImportConfirm(false);
        if (Object.keys(data).length === 0) return;
        try {
            await api.importData(data);
            clearLegacyLocalStorage();
            setLegacyKeys([]);
            addToast('Legacy data imported! Reload the page.', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            addToast(err instanceof Error ? err.message : 'Import failed', 'error');
        }
    };

    const handleExportData = async () => {
        try {
            const data = await api.getAllData();
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
            const link = document.createElement("a");
            link.href = jsonString;
            link.download = `bsms-backup-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            addToast('Data exported successfully!', 'success');
        } catch (error) {
            console.error("Failed to export data:", error);
            addToast('Failed to export data.', 'error');
        }
    };
    
    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("Invalid file content");
                const data = JSON.parse(text);
                const expectedKeys = ['inventory', 'transactions', 'productTypes', 'config'];
                if (!expectedKeys.some(key => key in data)) {
                    throw new Error("Invalid backup file format.");
                }

                await api.importData(data);
                addToast('Data imported successfully! App will now reload.', 'success');
                setTimeout(() => window.location.reload(), 2000);
            } catch (error) {
                console.error("Failed to import data:", error);
                addToast(error instanceof Error ? error.message : 'Failed to import data.', 'error');
            }
        };
        reader.readAsText(file);
    };
    
    const confirmResetApp = async () => {
        try {
            await api.resetData();
            setResetModalOpen(false);
            addToast('Application has been reset. Reloading...', 'warning');
            setTimeout(() => window.location.reload(), 2000);
        } catch (error) {
            console.error("Failed to reset data:", error);
            addToast('Failed to reset application data.', 'error');
        }
    };

    return (
        <div className="page-shell">
            <PageHeader title="Settings" />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    {/* Firm Settings */}
                    <div className="card-section">
                        <div className="p-4 border-b border-border-color">
                            <h3 className="text-lg font-bold text-text-primary">Firm Management</h3>
                            <p className="text-sm text-text-muted">Configure invoice and GST details for each billing entity.</p>
                            {config.firms.length > 1 && (
                                <p className="text-xs text-status-blue-text mt-2 bg-status-blue-bg/40 border border-status-blue-text/20 rounded-lg px-3 py-2">
                                    Inventory is shared — all firms draw from the same physical stock. Firm settings only affect invoices, purchases, and reports.
                                </p>
                            )}
                            <div className="mt-4 firm-switcher">
                                {config.firms.map(firm => (
                                    <button 
                                        key={firm.id} 
                                        onClick={() => setEditingFirmId(firm.id)}
                                        className={`firm-switcher-btn ${editingFirmId === firm.id ? 'active' : ''}`}
                                    >
                                        {firm.shopDetails.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {firmData && (
                            <div className="p-4 md:p-6 space-y-6">
                                <div className="space-y-4">
                                     <h4 className="font-bold text-text-primary">Shop & Invoice Details</h4>
                                    <FormField label="Shop Name"><input type="text" value={firmData.shopDetails.name} onChange={e => handleFirmDataChange('shopDetails', 'name', e.target.value)} className="form-input" /></FormField>
                                    <FormField label="Address"><input type="text" value={firmData.shopDetails.address} onChange={e => handleFirmDataChange('shopDetails', 'address', e.target.value)} className="form-input" /></FormField>
                                    <FormField label="Phone"><input type="text" value={firmData.shopDetails.phone} onChange={e => handleFirmDataChange('shopDetails', 'phone', e.target.value)} className="form-input" /></FormField>
                                    <FormField label="Email"><input type="email" value={firmData.shopDetails.email} onChange={e => handleFirmDataChange('shopDetails', 'email', e.target.value)} className="form-input" /></FormField>
                                    <FormField label="GSTIN"><input type="text" value={firmData.shopDetails.gstin} onChange={e => handleFirmDataChange('shopDetails', 'gstin', e.target.value)} className="form-input" /></FormField>
                                    <FormField label="Invoice Terms (Footer)">
                                        <textarea 
                                            value={firmData.shopDetails.invoiceTerms || ''} 
                                            onChange={e => handleFirmDataChange('shopDetails', 'invoiceTerms', e.target.value)} 
                                            className="form-input h-24"
                                            placeholder="e.g., Goods once sold will not be taken back."
                                        />
                                    </FormField>
                                    <FormField label="Shop Logo">
                                        <div className="flex items-center gap-4">
                                            {firmData.shopDetails.logo && (
                                                <div className="relative group">
                                                    <img src={firmData.shopDetails.logo} alt="Logo Preview" className="h-16 w-16 object-contain border border-border-color rounded bg-white" />
                                                    <button 
                                                        onClick={() => handleFirmDataChange('shopDetails', 'logo', undefined)}
                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remove Logo"
                                                    >
                                                        <IconX className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            )}
                                            <label className="cursor-pointer bg-bg-tertiary hover:bg-border-color text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition">
                                                <span>Upload Logo</span>
                                                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                            </label>
                                            <span className="text-xs text-text-muted">Max 1MB</span>
                                        </div>
                                    </FormField>
                                </div>
                                <div className="space-y-4 pt-6 border-t border-border-color">
                                    <h4 className="font-bold text-text-primary">Financial & Tax</h4>
                                    <FormField label="Tax Regime">
                                        <select value={firmData.financials.taxRegime} onChange={e => handleFirmDataChange('financials', 'taxRegime', e.target.value)} className="form-input">
                                            <option value="Regular">Regular</option><option value="Composition">Composition</option>
                                        </select>
                                    </FormField>
                                    <FormField label="GST Rate (%)">
                                        <input type="number" value={firmData.financials.gstRate} onChange={e => handleFirmDataChange('financials', 'gstRate', Number(e.target.value))} className="form-input" />
                                    </FormField>
                                    <FormField label="UPI ID (VPA) for QR Code">
                                        <input 
                                            type="text" 
                                            value={firmData.financials.upiId || ''} 
                                            onChange={e => handleFirmDataChange('financials', 'upiId', e.target.value)} 
                                            className="form-input" 
                                            placeholder="e.g. mobile@upi"
                                        />
                                        <p className="text-xs text-text-muted mt-1">Customers can scan a generated QR code on the bill to pay directly to this ID.</p>
                                    </FormField>
                                </div>
                                <div className="flex justify-end"><button onClick={handleSaveFirm} className="btn-primary btn-sm">Save {firmData.shopDetails.name} Details</button></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                     <SettingsSection title="Appearance" description="Choose how the application looks.">
                        <FormField label="Theme">
                             <div className="flex items-center gap-2 p-1 bg-bg-primary rounded-lg border border-border-color">
                                <button onClick={() => setTheme('light')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition w-full justify-center ${theme === 'light' ? 'bg-bg-secondary shadow-sm text-text-primary' : 'text-text-muted hover:bg-bg-secondary/50'}`} aria-pressed={theme === 'light'}><IconSun className="h-5 w-5" /> Light</button>
                                <button onClick={() => setTheme('dark')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition w-full justify-center ${theme === 'dark' ? 'bg-bg-secondary shadow-sm text-text-primary' : 'text-text-muted hover:bg-bg-secondary/50'}`} aria-pressed={theme === 'dark'}><IconMoon className="h-5 w-5" /> Dark</button>
                            </div>
                        </FormField>
                    </SettingsSection>

                    <SettingsSection title="Application Preferences" description="Customize your user experience.">
                        <FormField label="Default Firm for New Sales">
                            <select value={preferences.defaultFirmId} onChange={e => setPreferences(p => ({...p, defaultFirmId: e.target.value as any}))} className="form-input">
                                {config.firms.map(f => <option key={f.id} value={f.id}>{f.shopDetails.name}</option>)}
                            </select>
                            {config.firms.length > 1 && (
                                <p className="text-xs text-text-muted mt-1">Default invoice firm only — stock is shared across all firms.</p>
                            )}
                        </FormField>
                        <FormField label="Default Dashboard View">
                            <select value={preferences.defaultDashboardView} onChange={e => setPreferences(p => ({...p, defaultDashboardView: e.target.value as ReportPeriodPreference}))} className="form-input">
                                <option value="today">Today</option>
                                <option value="last7">Last 7 Days</option>
                                <option value="last30">Last 30 Days</option>
                                <option value="this_week">This Week</option>
                                <option value="prev_week">Last Week</option>
                                <option value="month">This Month</option>
                                <option value="prev_month">Last Month</option>
                                <option value="this_year">This Year</option>
                                <option value="prev_year">Last Year</option>
                            </select>
                        </FormField>
                         <FormField label="Default Low Stock Alert">
                            <input type="number" value={preferences.defaultLowStockAlert} onChange={e => setPreferences(p => ({...p, defaultLowStockAlert: Number(e.target.value)}))} className="form-input" />
                        </FormField>
                        <FormField label="Browser Due-Date Notifications">
                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    checked={preferences.browserNotificationsEnabled || false}
                                    onChange={async e => {
                                        const enabled = e.target.checked;
                                        if (enabled && 'Notification' in window && Notification.permission === 'default') {
                                            const perm = await Notification.requestPermission();
                                            if (perm !== 'granted') {
                                                addToast('Browser notification permission denied.', 'warning');
                                                return;
                                            }
                                        }
                                        setPreferences(p => ({ ...p, browserNotificationsEnabled: enabled }));
                                    }}
                                    className="h-5 w-5 rounded border-border-color text-brand-red focus:ring-brand-red"
                                />
                                <span className="text-sm text-text-secondary">Show desktop alerts for due dates</span>
                            </div>
                        </FormField>
                    </SettingsSection>

                    <SettingsSection title="Sale Categories" description="Categories shown when recording a sale (2-Wheeler, Truck, Inverter, etc.).">
                        <div className="space-y-2">
                            {(preferences.saleCategories ?? []).map(cat => (
                                <div key={cat} className="flex items-center justify-between gap-2 p-2 bg-bg-primary rounded-lg border border-border-color">
                                    <span className="text-sm text-text-primary">{cat}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSaleCategory(cat)}
                                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                            {(preferences.saleCategories ?? []).length === 0 && (
                                <p className="text-sm text-text-muted">No categories configured. Add one below.</p>
                            )}
                        </div>
                        <FormField label="Add Category">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newSaleCategory}
                                    onChange={e => setNewSaleCategory(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSaleCategory())}
                                    className="form-input"
                                    placeholder="e.g. Truck, Inverter, Generator"
                                />
                                <button type="button" onClick={handleAddSaleCategory} className="btn-secondary btn-sm whitespace-nowrap">Add</button>
                            </div>
                            <p className="text-xs text-text-muted mt-1">These categories appear in sales, products, and reports.</p>
                        </FormField>
                        <div className="flex justify-end mt-4"><button onClick={handleSavePreferences} className="btn-primary btn-sm">Save Categories</button></div>
                    </SettingsSection>

                    {userRole === 'admin' && (
                    <SettingsSection title="AI Assistant" description="Configure Gemini or local Ollama for invoice OCR, dashboard insights, and business Q&A (admin-only).">
                        <FormField label="Enable AI">
                            <label className="flex items-center gap-2 pt-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={aiSettings.enabled}
                                    onChange={e => handleAiEnabledChange(e.target.checked)}
                                    className="h-5 w-5 rounded border-border-color text-brand-red focus:ring-brand-red"
                                />
                                <span className="text-sm text-text-secondary">Enable AI features</span>
                            </label>
                        </FormField>
                        {aiSettings.enabled && (
                            <>
                                <FormField label="Provider">
                                    <select
                                        value={aiSettings.provider}
                                        onChange={e => updateAiSettings({ provider: e.target.value as AiSettings['provider'] })}
                                        className="form-input w-auto"
                                    >
                                        <option value="gemini">Google Gemini</option>
                                        <option value="ollama">Ollama (local)</option>
                                    </select>
                                </FormField>
                                {aiSettings.provider === 'gemini' && (
                                    <>
                                        <FormField label="Gemini API Key">
                                            <input
                                                type="password"
                                                value={aiSettings.geminiApiKey || ''}
                                                onChange={e => updateAiSettings({ geminiApiKey: e.target.value })}
                                                className="form-input"
                                                placeholder="Or set GEMINI_API_KEY on server"
                                            />
                                        </FormField>
                                        <FormField label="Gemini Model">
                                            <input
                                                type="text"
                                                value={aiSettings.geminiModel || 'gemini-2.0-flash'}
                                                onChange={e => updateAiSettings({ geminiModel: e.target.value })}
                                                className="form-input"
                                                placeholder="gemini-2.0-flash"
                                            />
                                        </FormField>
                                    </>
                                )}
                                {aiSettings.provider === 'ollama' && (
                                    <>
                                        <FormField label="Ollama Base URL">
                                            <input
                                                type="url"
                                                value={aiSettings.ollamaBaseUrl || 'http://127.0.0.1:11434'}
                                                onChange={e => updateAiSettings({ ollamaBaseUrl: e.target.value })}
                                                className="form-input"
                                                placeholder="http://127.0.0.1:11434"
                                            />
                                        </FormField>
                                        <FormField label="Vision Model">
                                            <select
                                                value={aiSettings.ollamaVisionModel || 'auto'}
                                                onChange={e => updateAiSettings({ ollamaVisionModel: e.target.value })}
                                                className="form-input w-auto min-w-[16rem]"
                                                disabled={ollamaModelsLoading}
                                            >
                                                <option value="auto">Auto (recommended)</option>
                                                {ollamaModels.map(model => (
                                                    <option key={`vision-${model}`} value={model}>{model}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-text-muted mt-1">
                                                Used for invoice OCR. Auto picks a vision-capable model if installed, otherwise your smallest model.
                                            </p>
                                            {ollamaModelsLoading && (
                                                <p className="text-xs text-text-muted mt-1">Loading models from Ollama…</p>
                                            )}
                                            {ollamaModelsError && (
                                                <p className="text-xs text-red-600 mt-1">{ollamaModelsError}</p>
                                            )}
                                        </FormField>
                                        <FormField label="Text Model">
                                            <select
                                                value={aiSettings.ollamaTextModel || 'auto'}
                                                onChange={e => updateAiSettings({ ollamaTextModel: e.target.value })}
                                                className="form-input w-auto min-w-[16rem]"
                                                disabled={ollamaModelsLoading}
                                            >
                                                <option value="auto">Auto (recommended)</option>
                                                {ollamaModels.map(model => (
                                                    <option key={`text-${model}`} value={model}>{model}</option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-text-muted mt-1">
                                                Used for chat and insights when smart caching falls back to direct Ollama. Auto picks the smallest non-vision model.
                                            </p>
                                        </FormField>
                                    </>
                                )}
                                <div className="flex justify-end gap-2 mt-4">
                                    <button type="button" onClick={handleTestAiConnection} disabled={aiTesting} className="btn-secondary btn-sm">
                                        {aiTesting ? 'Testing…' : 'Test connection'}
                                    </button>
                                    <button type="button" onClick={handleSaveAiSettings} className="btn-primary btn-sm">Save AI Settings</button>
                                </div>
                            </>
                        )}
                        {!aiSettings.enabled && (
                            <div className="flex justify-end mt-4">
                                <button type="button" onClick={handleSaveAiSettings} className="btn-primary btn-sm">Save AI Settings</button>
                            </div>
                        )}
                    </SettingsSection>
                    )}

                    <SettingsSection title="E-Invoice / GSP Integration" description="Configure GSP credentials for live IRN generation (optional).">
                        <FormField label="GSP API Key">
                            <input type="password" value={preferences.eInvoiceApiKey || ''} onChange={e => setPreferences(p => ({ ...p, eInvoiceApiKey: e.target.value }))} className="form-input" placeholder="Leave empty to use mock generation" />
                        </FormField>
                        <FormField label="GSP Endpoint URL">
                            <input type="url" value={preferences.eInvoiceGspUrl || ''} onChange={e => setPreferences(p => ({ ...p, eInvoiceGspUrl: e.target.value }))} className="form-input" placeholder="https://gsp.example.com/api" />
                        </FormField>
                        <div className="flex justify-end mt-4"><button onClick={handleSavePreferences} className="btn-primary btn-sm">Save GSP Settings</button></div>
                    </SettingsSection>
                    
                    <SettingsSection title="Loyalty Program" description="Configure point system tiers.">
                        <FormField label="Enable Loyalty Program">
                             <div className="flex items-center gap-2 pt-2">
                                <input type="checkbox" checked={preferences.loyaltyProgram.enabled} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, enabled: e.target.checked}}))} className="h-5 w-5 rounded border-border-color text-brand-red focus:ring-brand-red" />
                                <span className="text-sm text-text-secondary">Enable Points</span>
                            </div>
                        </FormField>
                        {preferences.loyaltyProgram.enabled && (
                            <>
                                <FormField label="Spend to Earn 1 Point">
                                   <div className="flex items-center gap-2">
                                     <span className="text-sm text-text-muted">Spend</span>
                                     <input type="number" value={preferences.loyaltyProgram.earnRate} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, earnRate: Number(e.target.value)}}))} className="form-input w-24" />
                                     <span className="text-sm text-text-muted">to earn 1 Point</span>
                                   </div>
                                </FormField>
                                <FormField label="Value of 1 Point">
                                    <div className="flex items-center gap-2">
                                     <span className="text-sm text-text-muted">1 Point =</span>
                                     <input type="number" value={preferences.loyaltyProgram.redemptionValue} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, redemptionValue: Number(e.target.value)}}))} className="form-input w-24" />
                                     <span className="text-sm text-text-muted">Currency Units</span>
                                   </div>
                                </FormField>
                                <div className="border-t border-border-color pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-text-primary mb-3">Tier Discount Benefits (%)</h4>
                                    <div className="grid grid-cols-3 gap-3">
                                        <FormField label="Silver %">
                                            <input type="number" value={preferences.loyaltyProgram.tierDiscounts?.silver ?? 0} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, tierDiscounts: {...(p.loyaltyProgram.tierDiscounts || { silver: 0, gold: 2, platinum: 5 }), silver: Number(e.target.value)}} }))} className="form-input" />
                                        </FormField>
                                        <FormField label="Gold %">
                                            <input type="number" value={preferences.loyaltyProgram.tierDiscounts?.gold ?? 2} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, tierDiscounts: {...(p.loyaltyProgram.tierDiscounts || { silver: 0, gold: 2, platinum: 5 }), gold: Number(e.target.value)}} }))} className="form-input" />
                                        </FormField>
                                        <FormField label="Platinum %">
                                            <input type="number" value={preferences.loyaltyProgram.tierDiscounts?.platinum ?? 5} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, tierDiscounts: {...(p.loyaltyProgram.tierDiscounts || { silver: 0, gold: 2, platinum: 5 }), platinum: Number(e.target.value)}} }))} className="form-input" />
                                        </FormField>
                                    </div>
                                </div>
                                <div className="border-t border-border-color pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-text-primary mb-3">Tier Thresholds (Spend Amount)</h4>
                                    <div className="space-y-3">
                                        <FormField label="Silver Tier Starts At">
                                            <input type="number" value={preferences.loyaltyProgram.tiers.silver} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, tiers: {...p.loyaltyProgram.tiers, silver: Number(e.target.value)}} }))} className="form-input" />
                                        </FormField>
                                         <FormField label="Gold Tier Starts At">
                                            <input type="number" value={preferences.loyaltyProgram.tiers.gold} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, tiers: {...p.loyaltyProgram.tiers, gold: Number(e.target.value)}} }))} className="form-input" />
                                        </FormField>
                                         <FormField label="Platinum Tier Starts At">
                                            <input type="number" value={preferences.loyaltyProgram.tiers.platinum} onChange={e => setPreferences(p => ({...p, loyaltyProgram: {...p.loyaltyProgram, tiers: {...p.loyaltyProgram.tiers, platinum: Number(e.target.value)}} }))} className="form-input" />
                                        </FormField>
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="flex justify-end mt-4"><button onClick={handleSavePreferences} className="btn-primary btn-sm">Save Preferences</button></div>
                    </SettingsSection>

                    <SettingsSection title="Data Management" description="Export, import, or reset all application data.">
                        {legacyKeys.length > 0 && (
                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
                                <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                                    Found old browser data ({legacyKeys.join(', ')}). Import it to the server?
                                </p>
                                <button onClick={handleImportLegacyLocalStorage} className="btn-warning btn-sm">
                                    Import from Browser Storage
                                </button>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={handleExportData} className="btn-secondary w-full">Export All Data</button>
                            <div>
                                 <input type="file" ref={importFileRef} className="hidden" accept=".json" onChange={handleImportData} />
                                 <button onClick={() => importFileRef.current?.click()} className="btn-secondary w-full">Import from Backup</button>
                            </div>
                        </div>
                         <div className="p-4 bg-red-800/20 border border-red-500/30 rounded-lg mt-4">
                             <h4 className="font-bold text-red-400">Danger Zone</h4>
                             <p className="text-sm text-red-400/80 mt-1 mb-3">Resetting the application will permanently delete all sales, inventory, and settings. This cannot be undone.</p>
                             <button onClick={() => setResetModalOpen(true)} className="btn-danger w-full">Reset Application</button>
                         </div>
                    </SettingsSection>

                    {userRole === 'admin' && (
                        <div className="hidden md:block">
                            <SettingsSection
                                title="Mobile Companion"
                                description="Pair a phone on the same Wi‑Fi for barcode scanning, stock counts, and invoice photos."
                            >
                                <MobileConnectPanel />
                            </SettingsSection>
                        </div>
                    )}

                    {userRole === 'admin' && (
                        <SettingsSection title="User Management" description="Create and manage staff accounts.">
                            <UserManagement />
                        </SettingsSection>
                    )}

                    <SettingsSection title="Audit Log" description="History of deletions and critical actions.">
                        <AuditLogViewer />
                    </SettingsSection>
                </div>
            </div>

            {isResetModalOpen && <ConfirmationModal title="Reset Application" message="Are you sure you want to delete ALL data? This is irreversible." confirmText="Yes, Delete Everything" onConfirm={confirmResetApp} onCancel={() => setResetModalOpen(false)} />}
            {showImportConfirm && (
                <ConfirmationModal
                    title="Import Legacy Data"
                    message={`Import ${legacyKeys.length || Object.keys(readLegacyLocalStorageData()).length} dataset(s) from this browser's old localStorage? This merges into the server.`}
                    variant="default"
                    confirmText="Import"
                    onConfirm={confirmImportLegacy}
                    onCancel={() => setShowImportConfirm(false)}
                />
            )}
        </div>
    );
};