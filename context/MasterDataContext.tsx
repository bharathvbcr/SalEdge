

import React, { createContext, useContext, ReactNode } from 'react';
import useApiStorage from '../hooks/useApiStorage.tsx';
import { ProductType, Supplier, CustomerProfile } from '../types.ts';
import { INITIAL_PRODUCT_TYPES } from '../constants.ts';
import { useToast } from './ToastContext.tsx';

interface MasterDataContextType {
    isLoading: boolean;
    productTypes: ProductType[];
    addProductType: (newProductType: Omit<ProductType, 'id'>) => ProductType;
    updateProductType: (updatedProductType: ProductType) => void;
    deleteProductType: (productTypeId: string) => void;
    suppliers: Supplier[];
    addSupplier: (newSupplier: Omit<Supplier, 'id'>) => Supplier;
    updateSupplier: (updatedSupplier: Supplier) => void;
    deleteSupplier: (supplierId: string) => void;
    customerProfiles: CustomerProfile[];
    upsertCustomerProfile: (profile: CustomerProfile) => void;
    getCustomerProfile: (id: string) => CustomerProfile | undefined;
}

const MasterDataContext = createContext<MasterDataContextType | undefined>(undefined);

export const MasterDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { addToast } = useToast();
    const [productTypes, setProductTypes, ptLoading] = useApiStorage<ProductType[]>('productTypes', INITIAL_PRODUCT_TYPES);
    const [suppliers, setSuppliers, supLoading] = useApiStorage<Supplier[]>('suppliers', []);
    const [customerProfiles, setCustomerProfiles, cpLoading] = useApiStorage<CustomerProfile[]>('customerProfiles', []);

    const isLoading = ptLoading || supLoading || cpLoading;

    const upsertCustomerProfile = (profile: CustomerProfile) => {
        setCustomerProfiles(prev => {
            const idx = prev.findIndex(p => p.id === profile.id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = profile;
                return updated;
            }
            return [...prev, profile];
        });
        addToast('Customer profile saved!', 'success');
    };

    const getCustomerProfile = (id: string) => customerProfiles.find(p => p.id === id);

    const addProductType = (newProductType: Omit<ProductType, 'id'>) => {
        const product: ProductType = {
            ...newProductType,
            id: `PROD${Date.now()}`,
        };
        setProductTypes(prev => [...prev, product]);
        addToast('New product type added!', 'success');
        return product;
    };

    const updateProductType = (updatedProductType: ProductType) => {
        setProductTypes(prev => prev.map(pt => pt.id === updatedProductType.id ? updatedProductType : pt));
        addToast('Product type updated!', 'info');
    };

    const deleteProductType = (productTypeId: string) => {
        setProductTypes(prev => prev.filter(pt => pt.id !== productTypeId));
        addToast('Product type deleted!', 'warning');
    };

    const addSupplier = (newSupplier: Omit<Supplier, 'id'>) => {
        const supplier: Supplier = {
            ...newSupplier,
            id: `SUP${Date.now()}`,
        };
        setSuppliers(prev => [...prev, supplier]);
        addToast('Supplier added successfully!', 'success');
        return supplier;
    };

    const updateSupplier = (updatedSupplier: Supplier) => {
        setSuppliers(prev => prev.map(s => s.id === updatedSupplier.id ? updatedSupplier : s));
        addToast('Supplier details updated!', 'info');
    };

    const deleteSupplier = (supplierId: string) => {
        setSuppliers(prev => prev.filter(s => s.id !== supplierId));
        addToast('Supplier deleted!', 'warning');
    };

    return (
        <MasterDataContext.Provider value={{ 
            isLoading,
            productTypes, addProductType, updateProductType, deleteProductType,
            suppliers, addSupplier, updateSupplier, deleteSupplier,
            customerProfiles, upsertCustomerProfile, getCustomerProfile,
        }}>
            {children}
        </MasterDataContext.Provider>
    );
};

export const useMasterData = () => {
    const context = useContext(MasterDataContext);
    if (context === undefined) {
        throw new Error('useMasterData must be used within a MasterDataProvider');
    }
    return context;
};
