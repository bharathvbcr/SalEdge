import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import useApiStorage from '../hooks/useApiStorage.tsx';
import { AppConfig, Firm, AppPreferences } from '../types.ts';
import { DEFAULT_SALE_CATEGORIES } from '../constants.ts';

export const INITIAL_CONFIG: AppConfig = {
    firms: [
        {
            id: 'FIRM001',
            shopDetails: {
                name: 'Usha Traders',
                address: '123 Battery Lane, Charge City, 110011',
                phone: '+91 12345 67890',
                email: 'contact@ushatraders.com',
                gstin: 'YOUR_GSTIN_FOR_USHA',
                invoiceTerms: '1. Goods once sold will not be taken back.\n2. Warranty as per company policy only.\n3. Interest @18% pa will be charged if not paid by due date.'
            },
            financials: {
                taxRegime: 'Regular',
                gstRate: 18,
                currencySymbol: '₹',
                upiId: '',
            }
        },
        {
            id: 'FIRM002',
            shopDetails: {
                name: 'Bharath Battery Care',
                address: '456 Power Street, Charge City, 110011',
                phone: '+91 98765 43210',
                email: 'support@bharathbattery.com',
                gstin: 'YOUR_GSTIN_FOR_BHARATH',
                invoiceTerms: '1. No guarantee on electronics items.\n2. Subject to local jurisdiction.'
            },
            financials: {
                taxRegime: 'Composition',
                gstRate: 1,
                currencySymbol: '₹',
                upiId: '',
            }
        }
    ],
    preferences: {
        defaultDashboardView: 'last7',
        defaultLowStockAlert: 5,
        defaultFirmId: 'FIRM001',
        loyaltyProgram: {
            enabled: true,
            earnRate: 100, // Spend 100 to get 1 point
            redemptionValue: 1, // 1 point = 1 currency unit
            tiers: {
                silver: 0,
                gold: 20000,
                platinum: 50000
            },
            tierDiscounts: {
                silver: 0,
                gold: 2,
                platinum: 5,
            }
        },
        saleCategories: DEFAULT_SALE_CATEGORIES,
        aiSettings: {
            enabled: false,
            provider: 'gemini',
            geminiModel: 'gemini-2.0-flash',
            ollamaBaseUrl: 'http://127.0.0.1:11434',
            ollamaVisionModel: 'llama3.2-vision',
        },
    },
};

function mergeFirmWithDefaults(firm: Firm): Firm {
    const defaults = INITIAL_CONFIG.firms.find(d => d.id === firm.id);
    return {
        ...firm,
        shopDetails: {
            ...defaults?.shopDetails,
            ...firm.shopDetails,
            invoiceTerms: firm.shopDetails?.invoiceTerms || defaults?.shopDetails.invoiceTerms || '',
        },
        financials: {
            ...defaults?.financials,
            ...firm.financials,
            upiId: firm.financials?.upiId || '',
        },
    };
}

interface ConfigContextType {
    isLoading: boolean;
    config: AppConfig;
    updateFirm: (updatedFirm: Firm) => void;
    updatePreferences: (updatedPreferences: Partial<AppPreferences>) => void;
    defaultFirm: Firm | undefined;
    resetConfig: () => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig, configLoading] = useApiStorage<AppConfig>('config', INITIAL_CONFIG);

    // Repair corrupted/partial config persisted to the database (e.g. empty firms array).
    useEffect(() => {
        if (configLoading || config.firms.length > 0) return;
        setConfig(prev => ({
            ...INITIAL_CONFIG,
            ...prev,
            firms: INITIAL_CONFIG.firms,
            preferences: {
                ...INITIAL_CONFIG.preferences,
                ...prev.preferences,
            },
        }));
    }, [configLoading, config.firms.length, setConfig]);

    const sourceFirms = config.firms.length > 0 ? config.firms : INITIAL_CONFIG.firms;

    // Merge with defaults in case of new fields added to existing structure (Schema Migration strategy)
    const effectiveConfig: AppConfig = {
        ...config,
        firms: sourceFirms.map(mergeFirmWithDefaults),
        preferences: {
            ...INITIAL_CONFIG.preferences,
            ...config.preferences,
            loyaltyProgram: {
                ...INITIAL_CONFIG.preferences.loyaltyProgram,
                ...(config.preferences?.loyaltyProgram || {}),
                tiers: {
                    ...INITIAL_CONFIG.preferences.loyaltyProgram.tiers,
                    ...(config.preferences?.loyaltyProgram?.tiers || {})
                },
                tierDiscounts: {
                    ...INITIAL_CONFIG.preferences.loyaltyProgram.tierDiscounts,
                    ...(config.preferences?.loyaltyProgram?.tierDiscounts || {})
                }
            },
            saleCategories: config.preferences?.saleCategories?.length
                ? config.preferences.saleCategories
                : DEFAULT_SALE_CATEGORIES,
            aiSettings: {
                ...INITIAL_CONFIG.preferences.aiSettings!,
                ...(config.preferences?.aiSettings || {}),
            },
        }
    };

    const updateFirm = (updatedFirm: Firm) => {
        setConfig(prev => ({
            ...prev,
            firms: prev.firms.map(f => f.id === updatedFirm.id ? updatedFirm : f)
        }));
    };
    
    const updatePreferences = (updatedPreferences: Partial<AppPreferences>) => {
        setConfig(prev => ({
            ...prev,
            preferences: { ...prev.preferences, ...updatedPreferences }
        }));
    };
    
    const resetConfig = () => {
        setConfig(INITIAL_CONFIG);
    };

    const defaultFirm = effectiveConfig.firms.find(f => f.id === effectiveConfig.preferences.defaultFirmId)
        ?? effectiveConfig.firms[0];

    return (
        <ConfigContext.Provider value={{ isLoading: configLoading, config: effectiveConfig, updateFirm, updatePreferences, defaultFirm, resetConfig }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (context === undefined) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
};