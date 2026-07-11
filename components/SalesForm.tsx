import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { InventoryItem, Transaction, ProductType } from '../types.ts';
import { IconX, IconPrint } from './icons.tsx';
import { useConfig } from '../context/ConfigContext.tsx';
import { inferSaleCategoryFromProduct, getCategorySectionLabels } from '../utils/saleCategory.ts';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { getCustomerTier, getTierDiscountPercent, getCustomPriceForProduct, wouldExceedCreditLimit, makeCustomerId } from '../utils/customerPricing.ts';
import { getSaleQueue, clearSaleQueue } from '../utils/mobileSaleQueue.ts';
import { lookupByBarcode } from '../utils/inventoryLookup.ts';
import { isSerialTrackedItem, validateUniqueCartSerials, parseTransactionSerials, serialsForQuantity } from '../utils/serialNumbers.ts';
import { buildCustomerIndex, searchCustomers, findCustomerByPhone, CustomerRecord } from '../utils/customerLookup.ts';
import { saveSaleDraft, loadSaleDraft, clearSaleDraft } from '../utils/saleDraft.ts';
import { computeSaleTotals, computeBaseBeforeOverallDiscount, deriveOverallDiscountFromFinal } from '../utils/salePricing.ts';
import { consumeSaleCustomerPrefill } from '../utils/pageActions.ts';
import { getLastPaymentMethod, saveLastPaymentMethod, PaymentMethod } from '../utils/salePrefs.ts';
import { useBarcodeWedge } from '../hooks/useBarcodeWedge.ts';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.ts';
import { MobileScanModal } from './MobileScanModal.tsx';
import { Modal } from './Modal.tsx';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { CartItem, Payment, CustomerData, WizardStep, SaleTotals, PricingMode } from './sales/types.ts';
import { SalesFormWizard } from './sales/SalesFormWizard.tsx';
import { SalesFormCustomerSection } from './sales/SalesFormCustomerSection.tsx';
import { SalesFormCartSection } from './sales/SalesFormCartSection.tsx';
import { SalesFormPaymentSection } from './sales/SalesFormPaymentSection.tsx';
import { SharedStockHint } from './SharedStockHint.tsx';
import { ShortcutsCheatsheet } from './sales/ShortcutsCheatsheet.tsx';

const getProductName = (productType: ProductType): string =>
    productType ? `${productType.brandName} ${productType.name}` : 'Unknown Product';

interface SalesFormProps {
    inventory: InventoryItem[];
    productTypes: ProductType[];
    transactions: Transaction[];
    transactionToEdit?: Transaction | null;
    transactionToReturn?: Transaction | null;
    initialViewMode?: boolean;
    initialWizardStep?: WizardStep;
    onAddSale: (sale: Omit<Transaction, 'id'>) => void;
    onUpdateSale: (originalTransaction: Transaction, updatedSale: Omit<Transaction, 'id'>) => void;
    onClose: () => void;
    onViewReceipt?: (transaction: Transaction) => void;
    onStepChange?: (step: WizardStep) => void;
}

export const SalesForm: React.FC<SalesFormProps> = ({
    inventory, productTypes, transactions, transactionToEdit, transactionToReturn,
    initialViewMode = false, initialWizardStep = 0,
    onAddSale, onUpdateSale, onClose, onViewReceipt, onStepChange,
}) => {
    const { config, defaultFirm } = useConfig();
    const { getCustomerProfile } = useMasterData();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [selectedFirmId, setSelectedFirmId] = useState(config.preferences.defaultFirmId);
    const [viewMode, setViewMode] = useState(initialViewMode);
    const isReturnMode = !!transactionToReturn;
    const isNewSale = !transactionToEdit && !transactionToReturn;
    const useWizard = isNewSale && !viewMode;

    const [wizardStep, setWizardStep] = useState<WizardStep>(initialWizardStep);

    useEffect(() => { setViewMode(initialViewMode); }, [initialViewMode]);
    useEffect(() => { onStepChange?.(wizardStep); }, [wizardStep, onStepChange]);

    const activeFirm = useMemo(
        () => config.firms.find(f => f.id === selectedFirmId) ?? defaultFirm ?? config.firms[0],
        [config.firms, selectedFirmId, defaultFirm]
    );
    const loyaltySettings = config.preferences.loyaltyProgram ?? {
        enabled: false, earnRate: 100, redemptionValue: 1,
        tiers: { silver: 0, gold: 20000, platinum: 50000 },
        tierDiscounts: { silver: 0, gold: 2, platinum: 5 },
    };

    const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');
    const [customerGst, setCustomerGst] = useState('');
    const [billingAddress, setBillingAddress] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');
    const [saleCategory, setSaleCategory] = useState('');
    const [placeOfSupply, setPlaceOfSupply] = useState('');
    const categoryLabels = useMemo(() => getCategorySectionLabels(saleCategory), [saleCategory]);
    const [additionalCharges, setAdditionalCharges] = useState({ description: 'Installation / Service', amount: 0 });
    const [paymentDueDate, setPaymentDueDate] = useState('');
    const [creditLimitWarning, setCreditLimitWarning] = useState<string | null>(null);
    const [selectedCustomerData, setSelectedCustomerData] = useState<CustomerData | null>(null);
    const customerProfile = useMemo(() => {
        if (!customerName || !customerPhone) return undefined;
        return getCustomerProfile(makeCustomerId(customerName, customerPhone));
    }, [customerName, customerPhone, getCustomerProfile]);
    const [phoneError, setPhoneError] = useState('');
    const [showValidation, setShowValidation] = useState(false);
    const [taxRegime, setTaxRegime] = useState<'Regular' | 'Composition'>(activeFirm?.financials.taxRegime ?? 'Regular');
    const [overallDiscount, setOverallDiscount] = useState({ type: 'percentage' as 'percentage' | 'fixed', value: 0 });
    const [finalPriceOverride, setFinalPriceOverride] = useState<number | null>(null);
    const [finalPriceLocked, setFinalPriceLocked] = useState(false);
    const [pricingMode, setPricingMode] = useState<PricingMode>('discount-drives');
    const [clubBuybackWithDiscount, setClubBuybackWithDiscount] = useState(false);
    const [pointsToRedeem, setPointsToRedeem] = useState(0);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [notes, setNotes] = useState('');
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [itemSearchQuery, setItemSearchQuery] = useState('');
    const [showItemSuggestions, setShowItemSuggestions] = useState(false);
    const [showScanModal, setShowScanModal] = useState(false);
    const [saveConfirm, setSaveConfirm] = useState<{ saveAs: 'sale' | 'quotation'; step: 'credit' | 'due' } | null>(null);
    const { addToast } = useToast();
    const mobileQueueLoaded = useRef(false);
    const draftLoaded = useRef(false);

    const customerIndex = useMemo(() => buildCustomerIndex(transactions), [transactions]);
    const customerSuggestions = useMemo(
        () => searchCustomers(customerIndex, customerSearchQuery),
        [customerIndex, customerSearchQuery]
    );

    useEffect(() => {
        const sourceTransaction = transactionToEdit || transactionToReturn;
        if (sourceTransaction) {
            setSelectedFirmId(sourceTransaction.firmId);
            setCustomerName(sourceTransaction.customerName);
            setCustomerPhone(sourceTransaction.customerPhone || '');
            setCustomerSearchQuery(sourceTransaction.customerName);
            setCustomerGst(sourceTransaction.customerGst || '');
            setBillingAddress(sourceTransaction.billingAddress || '');
            setVehicleNumber(sourceTransaction.vehicleNumber || '');
            setVehicleModel(sourceTransaction.vehicleModel || '');
            setSaleCategory(sourceTransaction.saleCategory || '');
            setAdditionalCharges(sourceTransaction.additionalCharges || { description: 'Installation / Service', amount: 0 });
            setTaxRegime(sourceTransaction.taxRegime);
            setOverallDiscount(sourceTransaction.discount || { type: 'percentage', value: 0 });

            if (transactionToEdit) {
                setSaleDate(new Date(sourceTransaction.date).toISOString().split('T')[0]);
                setInvoiceNumber(sourceTransaction.invoiceNumber || '');
                setPaymentDueDate(sourceTransaction.paymentDueDate || '');
                setPointsToRedeem(sourceTransaction.redeemedPoints || 0);
                setPayments(sourceTransaction.payments.map((p, index) => ({ ...p, id: index })));
                setNotes(sourceTransaction.notes || '');
                setFinalPriceOverride(sourceTransaction.total);
                setFinalPriceLocked(true);
                setPricingMode('final-drives');
                setClubBuybackWithDiscount(sourceTransaction.clubBuybackDiscount ?? false);
            } else {
                setSaleDate(new Date().toISOString().split('T')[0]);
                setInvoiceNumber('');
                setPayments([{ id: Date.now(), method: 'Cash', amount: 0 }]);
                setNotes(`Return for Invoice #${sourceTransaction.id}`);
                setPointsToRedeem(0);
            }

            const restoredCart = sourceTransaction.items.flatMap(item => {
                if (transactionToReturn && (item.isBuyback || item.isCustom)) return [];
                const invItem = inventory.find(i => i.id === item.id);
                const serials = parseTransactionSerials(item.serialNumbers);
                const serialUnit = invItem ? isSerialTrackedItem(invItem) : serials.length === 1;

                if (transactionToReturn) {
                    return [{
                        itemId: item.id, name: item.name, quantity: 1, price: item.price,
                        purchasePrice: item.purchasePrice, serialNumbers: serials.length > 0 ? serials : [''],
                        isBuyback: item.isBuyback, buybackBrand: item.buybackBrand, buybackCapacity: item.buybackCapacity,
                        buybackSerialNumber: item.buybackSerialNumber, isCustom: item.isCustom,
                        guaranteePeriodMonths: item.guaranteePeriodMonths, warrantyPeriodMonths: item.warrantyPeriodMonths,
                        maxStock: serials.length || item.quantity, isSerialUnit: serialUnit,
                        discount: item.discount || { type: 'fixed', value: 0 },
                        specifications: item.specifications || {}, notes: item.notes || '',
                    }];
                }
                const maxStock = invItem ? invItem.stock + item.quantity : undefined;
                return [{
                    itemId: item.id, name: item.name, quantity: item.quantity, price: item.price,
                    purchasePrice: item.purchasePrice, serialNumbers: serials.length > 0 ? serials : serialsForQuantity(item.quantity),
                    isBuyback: item.isBuyback, buybackBrand: item.buybackBrand, buybackCapacity: item.buybackCapacity,
                    buybackSerialNumber: item.buybackSerialNumber, isCustom: item.isCustom,
                    guaranteePeriodMonths: item.guaranteePeriodMonths, warrantyPeriodMonths: item.warrantyPeriodMonths,
                    maxStock, isSerialUnit: serialUnit && item.quantity === 1,
                    discount: item.discount || { type: 'fixed', value: 0 },
                    specifications: item.specifications || {}, notes: item.notes || '',
                }];
            });
            setCart(restoredCart);
        } else if (!draftLoaded.current) {
            const customerPrefill = consumeSaleCustomerPrefill();
            const draft = loadSaleDraft();
            if (customerPrefill) {
                draftLoaded.current = true;
                setCustomerName(customerPrefill.customerName);
                setCustomerPhone(customerPrefill.customerPhone);
                setCustomerSearchQuery(customerPrefill.customerPhone
                    ? `${customerPrefill.customerName} (${customerPrefill.customerPhone})`
                    : customerPrefill.customerName);
                if (customerPrefill.vehicleNumber) setVehicleNumber(customerPrefill.vehicleNumber);
                if (customerPrefill.vehicleModel) setVehicleModel(customerPrefill.vehicleModel);
                if (customerPrefill.saleCategory) setSaleCategory(customerPrefill.saleCategory);
                setWizardStep(1);
            }
            if (draft && draft.cart.length > 0) {
                draftLoaded.current = true;
                setSelectedFirmId(draft.selectedFirmId);
                setSaleDate(draft.saleDate);
                setCustomerName(draft.customerName);
                setCustomerPhone(draft.customerPhone);
                setCustomerSearchQuery(draft.customerName || draft.customerPhone);
                setCustomerGst(draft.customerGst);
                setBillingAddress(draft.billingAddress);
                setVehicleNumber(draft.vehicleNumber);
                setVehicleModel(draft.vehicleModel);
                setSaleCategory(draft.saleCategory);
                setPlaceOfSupply(draft.placeOfSupply);
                setCart(draft.cart as CartItem[]);
                setPayments(draft.payments as Payment[]);
                setNotes(draft.notes);
                setWizardStep(draft.wizardStep as WizardStep);
                if (draft.overallDiscount) setOverallDiscount(draft.overallDiscount);
                if (draft.finalPriceOverride != null) setFinalPriceOverride(draft.finalPriceOverride);
                if (draft.finalPriceLocked != null) setFinalPriceLocked(draft.finalPriceLocked);
                if (draft.pricingMode) setPricingMode(draft.pricingMode);
                if (draft.clubBuybackWithDiscount != null) setClubBuybackWithDiscount(draft.clubBuybackWithDiscount);
            } else {
                const lastMethod = getLastPaymentMethod();
                setPayments([{ id: Date.now(), method: lastMethod, amount: 0 }]);
            }
        }
    }, [transactionToEdit, transactionToReturn, inventory]);

    useEffect(() => {
        if (isReturnMode) {
            setCart(prev => prev.map(item => ({ ...item, price: -Math.abs(item.price) })));
            setAdditionalCharges(prev => ({ ...prev, amount: -Math.abs(prev.amount) }));
        }
    }, [isReturnMode]);

    useEffect(() => {
        if (activeFirm) setTaxRegime(activeFirm.financials.taxRegime);
    }, [selectedFirmId, activeFirm]);

    const pointsRedemptionValue = loyaltySettings.enabled ? loyaltySettings.redemptionValue : 0;

    const totals: SaleTotals = useMemo(() => computeSaleTotals({
        cart,
        overallDiscount,
        additionalCharges,
        pointsToRedeem,
        pointsRedemptionValue,
        taxRegime,
        gstRate: activeFirm?.financials.gstRate ?? 0,
        finalPriceOverride,
        finalPriceLocked,
        pricingMode,
        isReturnMode,
        clubBuybackWithDiscount,
    }), [cart, overallDiscount, taxRegime, activeFirm?.financials.gstRate, additionalCharges, pointsToRedeem, pointsRedemptionValue, finalPriceOverride, finalPriceLocked, pricingMode, isReturnMode, clubBuybackWithDiscount]);

    useEffect(() => {
        if (pricingMode !== 'final-drives' || !finalPriceLocked || finalPriceOverride === null) return;
        const { baseBeforeDisc } = computeBaseBeforeOverallDiscount(cart, additionalCharges, pointsToRedeem, pointsRedemptionValue);
        const derived = deriveOverallDiscountFromFinal(baseBeforeDisc, finalPriceOverride, isReturnMode);
        setOverallDiscount(prev => prev.type === 'fixed' && prev.value === derived.value ? prev : derived);
    }, [cart, additionalCharges, pointsToRedeem, pointsRedemptionValue, finalPriceLocked, finalPriceOverride, pricingMode, isReturnMode]);

    const { total } = totals;

    useEffect(() => {
        if (!transactionToEdit && payments.length === 1 && !viewMode) {
            setPayments(prev => [{ ...prev[0], amount: Math.abs(total) }]);
        }
    }, [total, transactionToEdit, viewMode, payments.length]);

    useEffect(() => {
        if (customerName && customerPhone) {
            const customerTransactions = transactions.filter(t => t.customerName === customerName && t.customerPhone === customerPhone && t.status !== 'Quotation');
            if (customerTransactions.length > 0) {
                const totalSpent = customerTransactions.reduce((sum, t) => sum + t.total, 0);
                const dueTransactions = customerTransactions.filter(t => t.status === 'Due');
                const totalDue = dueTransactions.reduce((sum, t) => sum + (t.total - t.payments.reduce((pSum, p) => pSum + p.amount, 0)), 0);
                const lastSeen = customerTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date;
                let earnedPoints = 0, usedPoints = 0;
                customerTransactions.forEach(t => {
                    if (loyaltySettings.enabled && loyaltySettings.earnRate > 0) earnedPoints += Math.floor(t.total / loyaltySettings.earnRate);
                    usedPoints += (t.redeemedPoints || 0);
                });
                if (transactionToEdit?.redeemedPoints) usedPoints -= transactionToEdit.redeemedPoints;
                const loyaltyPoints = Math.max(0, earnedPoints - usedPoints);
                const tier = getCustomerTier(totalSpent, loyaltySettings.tiers);
                const tierDiscountPercent = getTierDiscountPercent(tier, loyaltySettings);
                const profile = getCustomerProfile(makeCustomerId(customerName, customerPhone));
                setSelectedCustomerData({ totalSpent, totalDue, lastSeen, loyaltyPoints, tier, creditLimit: profile?.creditLimit, tierDiscountPercent });
                if (tierDiscountPercent > 0 && !transactionToEdit && overallDiscount.value === 0 && !finalPriceLocked) {
                    setOverallDiscount({ type: 'percentage', value: tierDiscountPercent });
                }
            } else {
                setSelectedCustomerData(null);
                setPointsToRedeem(0);
            }
        } else {
            setSelectedCustomerData(null);
        }
    }, [customerName, customerPhone, transactions, transactionToEdit, loyaltySettings, getCustomerProfile, overallDiscount.value, finalPriceLocked]);

    const handleOverallDiscountChange: React.Dispatch<React.SetStateAction<{ type: 'percentage' | 'fixed'; value: number }>> = (updater) => {
        setPricingMode('discount-drives');
        setFinalPriceLocked(false);
        setFinalPriceOverride(null);
        setOverallDiscount(updater);
    };

    const handleFinalPriceChange = (value: number) => {
        const { baseBeforeDisc } = computeBaseBeforeOverallDiscount(cart, additionalCharges, pointsToRedeem, pointsRedemptionValue);
        setFinalPriceOverride(value);
        setFinalPriceLocked(true);
        setPricingMode('final-drives');
        setOverallDiscount(deriveOverallDiscountFromFinal(baseBeforeDisc, value, isReturnMode));
    };

    const handleRoundFinal = () => {
        handleFinalPriceChange(Math.round(totals.computedFinalBeforeRound));
    };

    const handleResetFinal = () => {
        setFinalPriceOverride(null);
        setFinalPriceLocked(false);
        setPricingMode('discount-drives');
        const tierPct = selectedCustomerData?.tierDiscountPercent ?? 0;
        setOverallDiscount({ type: 'percentage', value: tierPct });
    };

    const handleEditDiscountManually = () => {
        setPricingMode('discount-drives');
        setFinalPriceLocked(false);
        setFinalPriceOverride(null);
    };

    const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [payments]);
    const amountDue = Math.abs(total) - totalPaid;

    useEffect(() => {
        if (selectedCustomerData && amountDue > 0.01) {
            const exceeded = wouldExceedCreditLimit(selectedCustomerData.totalDue, amountDue, selectedCustomerData.creditLimit);
            if (exceeded && selectedCustomerData.creditLimit) {
                setCreditLimitWarning(`Credit limit ₹${selectedCustomerData.creditLimit.toLocaleString('en-IN')} would be exceeded by ₹${(selectedCustomerData.totalDue + amountDue - selectedCustomerData.creditLimit).toLocaleString('en-IN')}`);
            } else setCreditLimitWarning(null);
        } else setCreditLimitWarning(null);
    }, [selectedCustomerData, amountDue]);

    const availableInventory = useMemo(() => {
        const cartItemIds = cart.map(item => item.itemId);
        if (isReturnMode) return [];
        return inventory.filter(item => !cartItemIds.includes(item.id) && item.stock > 0);
    }, [inventory, cart, isReturnMode]);

    const itemSuggestions = useMemo(() => {
        if (!itemSearchQuery) return [];
        return availableInventory.map(item => {
            const productType = productTypes.find(pt => pt.id === item.productTypeId);
            return { ...item, productType, fullName: productType ? getProductName(productType) : 'Unknown Product' };
        }).filter(item => {
            const searchLower = itemSearchQuery.toLowerCase();
            return item.fullName.toLowerCase().includes(searchLower) ||
                item.serialNumber?.toLowerCase().includes(searchLower) ||
                item.batchNumber?.toLowerCase().includes(searchLower);
        });
    }, [itemSearchQuery, availableInventory, productTypes]);

    const handleCustomerSearchChange = (value: string) => {
        setCustomerSearchQuery(value);
        const digits = value.replace(/\D/g, '');
        if (/^\d{10}$/.test(digits)) {
            const match = findCustomerByPhone(customerIndex, digits);
            if (match) {
                applyCustomerRecord(match);
                return;
            }
            setCustomerPhone(digits);
            setCustomerName(prev => prev || '');
        } else {
            setCustomerName(value);
            if (phoneError) setPhoneError('');
        }
        setShowCustomerSuggestions(!!value.trim());
    };

    const applyCustomerRecord = (customer: CustomerRecord) => {
        setCustomerName(customer.name);
        setCustomerPhone(customer.phone);
        setCustomerSearchQuery(customer.phone ? `${customer.name} (${customer.phone})` : customer.name);
        if (customer.gst) setCustomerGst(customer.gst);
        if (customer.address) setBillingAddress(customer.address);
        if (customer.vehicleNo) setVehicleNumber(customer.vehicleNo);
        if (customer.vehicleModel) setVehicleModel(customer.vehicleModel);
        if (customer.saleCategory) setSaleCategory(customer.saleCategory);
        setShowCustomerSuggestions(false);
    };

    const handleWalkInPreset = () => {
        setCustomerName('Walk-in');
        setCustomerPhone('');
        setCustomerSearchQuery('Walk-in');
        setShowCustomerSuggestions(false);
    };

    const handleItemSearchChange = (value: string) => {
        setItemSearchQuery(value);
        setShowItemSuggestions(!!value);
    };

    const handleSelectItemSuggestion = (itemToAdd: InventoryItem & { fullName: string; productType?: ProductType }, forcedSerial?: string) => {
        if (!itemToAdd?.stock || !itemToAdd.productType) return;
        if (cart.some(c => c.itemId === itemToAdd.id && !c.isCustom && !c.isBuyback)) {
            addToast('This battery is already in the cart.', 'warning');
            return;
        }
        const matchedSerial = forcedSerial ?? (isSerialTrackedItem(itemToAdd) ? itemToAdd.serialNumber
            : (itemToAdd.serialNumber?.toLowerCase().includes(itemSearchQuery.toLowerCase()) ? itemToAdd.serialNumber : ''));
        const serialUnit = isSerialTrackedItem(itemToAdd);
        const price = getCustomPriceForProduct(customerProfile, itemToAdd.productTypeId) ?? itemToAdd.mrp;
        setCart(prev => [...prev, {
            itemId: itemToAdd.id, name: itemToAdd.fullName, quantity: 1, price,
            purchasePrice: itemToAdd.purchasePrice, maxStock: serialUnit ? 1 : itemToAdd.stock,
            serialNumbers: [matchedSerial || ''], isSerialUnit: serialUnit,
            guaranteePeriodMonths: itemToAdd.productType?.defaultGuaranteeMonths || 0,
            warrantyPeriodMonths: itemToAdd.productType?.defaultWarrantyMonths || 0,
            discount: { type: 'fixed', value: 0 },
            specifications: {
                capacity: itemToAdd.productType?.specifications?.capacity,
                voltage: itemToAdd.productType?.specifications?.voltage,
                technology: itemToAdd.productType?.specifications?.technology,
                cRating: itemToAdd.productType?.specifications?.cRating,
            }, notes: '',
        }]);
        const inferred = inferSaleCategoryFromProduct(itemToAdd.productType, config.preferences.saleCategories ?? []);
        if (inferred) setSaleCategory(prev => prev || inferred);
        setItemSearchQuery('');
        setShowItemSuggestions(false);
    };

    const addInventoryToCart = useCallback((item: InventoryItem, serialHint?: string) => {
        const productType = productTypes.find(pt => pt.id === item.productTypeId);
        if (!productType) return;
        handleSelectItemSuggestion({ ...item, productType, fullName: getProductName(productType) }, serialHint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productTypes, cart, customerProfile, itemSearchQuery, config.preferences.saleCategories]);

    useEffect(() => {
        if (mobileQueueLoaded.current || transactionToEdit || transactionToReturn) return;
        const queue = getSaleQueue();
        if (queue.length === 0) return;
        mobileQueueLoaded.current = true;
        if (queue[0]?.firmId) setSelectedFirmId(queue[0].firmId);
        queue.forEach(q => {
            const inv = inventory.find(i => i.id === q.inventoryItemId);
            if (inv && inv.stock > 0) addInventoryToCart(inv, q.serialNumber ?? q.scannedCode);
        });
        clearSaleQueue();
        setWizardStep(0);
    }, [inventory, productTypes, transactionToEdit, transactionToReturn, addInventoryToCart]);

    const handleBarcodeScan = useCallback((code: string) => {
        setShowScanModal(false);
        const trimmed = code.trim();
        if (!trimmed) return;

        const exactMatch = availableInventory.find(i => i.serialNumber?.toLowerCase() === trimmed.toLowerCase());
        if (exactMatch) { addInventoryToCart(exactMatch, trimmed); return; }

        const batchMatch = availableInventory.find(i => !i.serialNumber && i.batchNumber?.toLowerCase() === trimmed.toLowerCase());
        if (batchMatch) { addInventoryToCart(batchMatch, trimmed); return; }

        const result = lookupByBarcode(trimmed, inventory, productTypes);
        if (result?.matchType === 'serial' || result?.matchType === 'inventory_id') {
            const item = result.inventoryItem;
            if (item?.stock) { addInventoryToCart(item, trimmed); return; }
        }
        if (result?.matchType === 'batch') {
            const item = result.inventoryItem ?? result.batches.find(b => b.stock > 0);
            if (item) { addInventoryToCart(item, trimmed); return; }
        }
        if (result?.matchType === 'product_barcode' || result?.matchType === 'product_id') {
            addToast('Scan a battery serial to add to sale.', 'warning');
        } else {
            addToast('Serial not found in stock.', 'warning');
        }
        setItemSearchQuery(trimmed);
        setShowItemSuggestions(true);
    }, [availableInventory, inventory, productTypes, addInventoryToCart, addToast]);

    useBarcodeWedge(!viewMode && !isReturnMode, handleBarcodeScan);

    useEffect(() => {
        if (!isNewSale || viewMode || cart.length === 0) return;
        const timer = setInterval(() => {
            saveSaleDraft({
                savedAt: new Date().toISOString(), selectedFirmId, saleDate, customerName, customerPhone,
                customerGst, billingAddress, vehicleNumber, vehicleModel, saleCategory, placeOfSupply,
                cart, payments, notes, wizardStep, overallDiscount, finalPriceOverride, finalPriceLocked,
                pricingMode, clubBuybackWithDiscount,
            });
        }, 30000);
        return () => clearInterval(timer);
    }, [isNewSale, viewMode, cart, selectedFirmId, saleDate, customerName, customerPhone, customerGst, billingAddress, vehicleNumber, vehicleModel, saleCategory, placeOfSupply, payments, notes, wizardStep, overallDiscount, finalPriceOverride, finalPriceLocked, pricingMode, clubBuybackWithDiscount]);

    const handleAddItem = () => {
        const query = itemSearchQuery.trim();
        if (!query) return;
        const exactMatch = availableInventory.find(i =>
            i.serialNumber?.toLowerCase() === query.toLowerCase() || i.batchNumber?.toLowerCase() === query.toLowerCase()
        );
        if (exactMatch) {
            const productType = productTypes.find(pt => pt.id === exactMatch.productTypeId);
            handleSelectItemSuggestion({ ...exactMatch, productType, fullName: productType ? getProductName(productType) : 'Unknown Product' });
        } else {
            setCart(prev => [...prev, { itemId: `custom-${Date.now()}`, name: query, quantity: 1, price: 0, serialNumbers: [''], isCustom: true, discount: { type: 'fixed', value: 0 }, notes: '', specifications: {} }]);
            setItemSearchQuery('');
            setShowItemSuggestions(false);
        }
        setTimeout(() => searchInputRef.current?.focus(), 100);
    };

    const handleAddBuyback = () => setCart(prev => [...prev, {
        itemId: `buyback-${Date.now()}`, name: 'Old Battery Buyback', quantity: 1, price: -500,
        serialNumbers: [''], isBuyback: true, discount: { type: 'fixed', value: 0 },
        buybackBrand: '', buybackCapacity: '', buybackSerialNumber: '',
    }]);

    const handleUpdateCart = (itemId: string, field: string, value: unknown) => {
        setCart(prev => prev.map(item => {
            if (item.itemId !== itemId) return item;
            const updatedItem = { ...item };
            if (field.startsWith('discount.')) {
                const [, subField] = field.split('.');
                updatedItem.discount = { ...updatedItem.discount, [subField]: value };
            } else if (field.startsWith('specifications.')) {
                const [, subField] = field.split('.');
                updatedItem.specifications = { ...updatedItem.specifications, [subField]: value };
            } else {
                (updatedItem as Record<string, unknown>)[field] = value;
            }
            if (field === 'quantity') {
                if (updatedItem.isSerialUnit) { updatedItem.quantity = 1; return updatedItem; }
                const newQuantity = Math.max(1, Number(value) || 1);
                const oldSerials = updatedItem.serialNumbers || [];
                const finalQuantity = updatedItem.maxStock && newQuantity > updatedItem.maxStock ? updatedItem.maxStock : newQuantity;
                updatedItem.serialNumbers = Array(finalQuantity).fill('').map((_, i) => oldSerials[i] || '');
                updatedItem.quantity = finalQuantity;
            }
            if (item.isBuyback && field === 'price') updatedItem.price = -Math.abs(Number(value));
            return updatedItem;
        }));
    };

    const handleRemoveItem = (itemId: string) => setCart(prev => prev.filter(item => item.itemId !== itemId));
    const handleAddPayment = () => setPayments(prev => [...prev, { id: Date.now(), method: getLastPaymentMethod(), amount: amountDue > 0 ? amountDue : 0 }]);
    const handleRemovePayment = (id: number) => { if (payments.length > 1) setPayments(prev => prev.filter(p => p.id !== id)); };
    const handleUpdatePayment = (id: number, field: 'method' | 'amount', value: string | number) =>
        setPayments(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    const handleSetFullPayment = (id: number) => {
        const otherPayments = payments.filter(p => p.id !== id).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        handleUpdatePayment(id, 'amount', Math.max(0, Math.abs(total) - otherPayments));
    };

    const validateCart = () => {
        if (cart.length === 0) { addToast('Add at least one item to the cart.', 'warning'); return false; }
        const invalidItems = cart.filter(item => !item.isCustom && !item.isBuyback && item.serialNumbers.some(s => !s.trim()));
        if (invalidItems.length > 0) {
            addToast(`Enter serial numbers for: ${invalidItems.map(i => i.name).join(', ')}`, 'warning');
            setShowValidation(true);
            return false;
        }
        return true;
    };

    const validateCustomer = () => {
        if (!customerName.trim()) { setShowValidation(true); addToast('Enter a customer name.', 'warning'); return false; }
        if (customerPhone && !/^\d{10}$/.test(customerPhone)) { setShowValidation(true); setPhoneError('Phone number must be 10 digits.'); return false; }
        setPhoneError('');
        return true;
    };

    const goToStep = (step: WizardStep) => {
        if (step > wizardStep) {
            if (wizardStep === 0 && !validateCart()) return;
            if (wizardStep === 1 && step > 1 && !validateCustomer()) return;
        }
        setWizardStep(step);
    };

    const handleSave = (saveAs: 'sale' | 'quotation') => {
        setShowValidation(true);
        if (customerPhone && !/^\d{10}$/.test(customerPhone)) { setPhoneError('Phone number must be 10 digits.'); return; }
        setPhoneError('');
        if (cart.length === 0 || !customerName) { addToast('Please add items to the cart and enter a customer name.', 'warning'); return; }

        if (saveAs !== 'quotation' && !isReturnMode) {
            const invalidItems = cart.filter(item => !item.isCustom && !item.isBuyback && item.serialNumbers.some(s => !s.trim()));
            if (invalidItems.length > 0) {
                addToast(`Please enter all required serial numbers for: ${invalidItems.map(i => i.name).join(', ')}`, 'warning');
                return;
            }
            const cartSerials = cart.flatMap(item => item.isCustom || item.isBuyback ? [] : item.serialNumbers.map(s => s.trim()).filter(Boolean));
            const duplicateSerialError = validateUniqueCartSerials(cartSerials);
            if (duplicateSerialError) { addToast(duplicateSerialError, 'warning'); return; }
        }

        const finalPayments = payments.map(({ method, amount }) => ({ method, amount: Number(amount) || 0 })).filter(p => p.amount > 0);
        const finalDue = Math.abs(total) - finalPayments.reduce((s, p) => s + p.amount, 0);

        if (saveAs !== 'quotation' && finalDue > 0.01) {
            if (!paymentDueDate && !isReturnMode) { setShowValidation(true); addToast('Please select a Payment Due Date for this credit transaction.', 'warning'); return; }
            if (selectedCustomerData?.creditLimit && wouldExceedCreditLimit(selectedCustomerData.totalDue, finalDue, selectedCustomerData.creditLimit)) {
                setSaveConfirm({ saveAs, step: 'credit' }); return;
            }
            setSaveConfirm({ saveAs, step: 'due' }); return;
        }
        executeSave(saveAs, finalPayments, finalDue);
    };

    const executeSave = (saveAs: 'sale' | 'quotation', finalPayments: { method: string; amount: number }[], finalDue: number) => {
        const finalStatus: 'Paid' | 'Due' | 'Quotation' = saveAs === 'quotation' ? 'Quotation' : (finalDue <= 0.01 ? 'Paid' : 'Due');
        const saleData = {
            firmId: selectedFirmId, invoiceNumber: invoiceNumber.trim() || undefined,
            type: isReturnMode ? 'Return' as const : 'Sale' as const,
            originalTransactionId: transactionToReturn?.id,
            customerName, customerPhone, customerGst, billingAddress, vehicleNumber, vehicleModel,
            saleCategory: saleCategory || undefined, additionalCharges,
            paymentDueDate: finalStatus === 'Due' ? paymentDueDate : undefined,
            date: new Date(saleDate).toISOString(),
            items: cart.map(({ itemId, name, quantity, price, purchasePrice, serialNumbers, isBuyback, isCustom, guaranteePeriodMonths, warrantyPeriodMonths, discount, buybackBrand, buybackCapacity, buybackSerialNumber, specifications, notes }) => ({
                id: itemId, name, quantity, price, purchasePrice, serialNumbers: serialNumbers.join(', '),
                isBuyback, isCustom, guaranteePeriodMonths, warrantyPeriodMonths, discount,
                buybackBrand, buybackCapacity, buybackSerialNumber, specifications, notes,
            })),
            subtotal: totals.itemsTotal, discount: overallDiscount, redeemedPoints: pointsToRedeem,
            taxRegime, taxAmount: totals.taxAmount, total, payments: finalPayments, status: finalStatus, notes,
            priceIncludesTax: true, clubBuybackDiscount: clubBuybackWithDiscount,
        };
        clearSaleDraft();
        if (finalPayments.length > 0) {
            saveLastPaymentMethod(finalPayments[0].method as PaymentMethod);
        }
        if (transactionToEdit) onUpdateSale(transactionToEdit, saleData as Omit<Transaction, 'id'>);
        else onAddSale(saleData as Omit<Transaction, 'id'>);
    };

    const handleConfirmSave = () => {
        if (!saveConfirm) return;
        const { saveAs, step } = saveConfirm;
        const finalPayments = payments.map(({ method, amount }) => ({ method, amount: Number(amount) || 0 })).filter(p => p.amount > 0);
        const finalDue = Math.abs(total) - finalPayments.reduce((s, p) => s + p.amount, 0);
        if (step === 'credit' && finalDue > 0.01) { setSaveConfirm({ saveAs, step: 'due' }); return; }
        setSaveConfirm(null);
        executeSave(saveAs, finalPayments, finalDue);
    };

    const pendingFinalDue = useMemo(() => Math.abs(total) - payments.reduce((s, p) => s + (Number(p.amount) || 0), 0), [payments, total]);

    useKeyboardShortcuts(useMemo(() => [
        { key: '/', handler: () => searchInputRef.current?.focus(), enabled: useWizard && wizardStep === 0 && !viewMode },
        { key: 'Enter', ctrlOrMeta: true, handler: () => handleSave('sale'), enabled: !viewMode },
        { key: 'Escape', handler: () => { if (useWizard && wizardStep > 0) setWizardStep(s => (s - 1) as WizardStep); else onClose(); }, enabled: true },
        { key: '1', handler: () => goToStep(0), enabled: useWizard },
        { key: '2', handler: () => goToStep(1), enabled: useWizard },
        { key: '3', handler: () => goToStep(2), enabled: useWizard },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [useWizard, wizardStep, viewMode]));

    useEffect(() => {
        if (useWizard && wizardStep === 0 && !viewMode) {
            setTimeout(() => searchInputRef.current?.focus(), 150);
        }
    }, [useWizard, wizardStep, viewMode]);

    if (!activeFirm) {
        return (
            <Modal onClose={onClose} size="md" ariaLabel="Sales Form">
                <div className="p-6 text-center space-y-4">
                    <p className="text-text-secondary">No firm is configured. Add a firm in Settings before recording sales.</p>
                    <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                </div>
            </Modal>
        );
    }

    const currencySymbol = activeFirm.financials.currencySymbol;
    const saleCategories = config.preferences.saleCategories ?? [];
    const customerNameError = showValidation && !customerName.trim() ? 'Customer name is required.' : undefined;
    const paymentDueDateError = showValidation && amountDue > 0.01 && !paymentDueDate && !isReturnMode
        ? 'Required for Due/Credit transactions.'
        : undefined;

    const renderCustomerSection = (compact = false) => (
        <SalesFormCustomerSection
            saleDate={saleDate} setSaleDate={setSaleDate}
            invoiceNumber={invoiceNumber} setInvoiceNumber={setInvoiceNumber}
            customerName={customerName} customerPhone={customerPhone}
            customerSearchQuery={customerSearchQuery} onCustomerSearchChange={handleCustomerSearchChange}
            onSelectCustomer={applyCustomerRecord} customerSuggestions={customerSuggestions}
            showSuggestions={showCustomerSuggestions} setShowSuggestions={setShowCustomerSuggestions}
            phoneError={phoneError} customerNameError={customerNameError} saleCategory={saleCategory} setSaleCategory={setSaleCategory}
            saleCategories={saleCategories} categoryLabels={categoryLabels}
            vehicleNumber={vehicleNumber} setVehicleNumber={setVehicleNumber}
            vehicleModel={vehicleModel} setVehicleModel={setVehicleModel}
            customerGst={customerGst} setCustomerGst={setCustomerGst}
            placeOfSupply={placeOfSupply} setPlaceOfSupply={setPlaceOfSupply}
            billingAddress={billingAddress} setBillingAddress={setBillingAddress}
            selectedCustomerData={selectedCustomerData} creditLimitWarning={creditLimitWarning}
            currencySymbol={currencySymbol} isReturnMode={isReturnMode}
            onWalkInPreset={handleWalkInPreset} compact={compact}
        />
    );

    const renderCartSection = () => (
        <SalesFormCartSection
            cart={cart} isReturnMode={isReturnMode} viewMode={viewMode} showValidation={showValidation}
            currencySymbol={currencySymbol} gstRate={activeFirm.financials.gstRate ?? 0} itemSearchQuery={itemSearchQuery}
            onItemSearchChange={handleItemSearchChange} itemSuggestions={itemSuggestions}
            showItemSuggestions={showItemSuggestions} setShowItemSuggestions={setShowItemSuggestions}
            onSelectItemSuggestion={item => handleSelectItemSuggestion(item as InventoryItem & { fullName: string; productType?: ProductType })}
            onAddItem={handleAddItem} onAddBuyback={handleAddBuyback}
            onScanClick={() => setShowScanModal(true)} onUpdateCart={handleUpdateCart}
            onRemoveItem={handleRemoveItem} searchInputRef={searchInputRef}
        />
    );

    const renderPaymentSection = () => (
        <SalesFormPaymentSection
            overallDiscount={overallDiscount} setOverallDiscount={handleOverallDiscountChange}
            pointsToRedeem={pointsToRedeem} setPointsToRedeem={setPointsToRedeem}
            selectedCustomerData={selectedCustomerData} loyaltySettings={loyaltySettings}
            taxRegime={taxRegime} setTaxRegime={setTaxRegime} notes={notes} setNotes={setNotes}
            payments={payments} onAddPayment={handleAddPayment} onRemovePayment={handleRemovePayment}
            onUpdatePayment={handleUpdatePayment} onSetFullPayment={handleSetFullPayment}
            paymentDueDate={paymentDueDate} setPaymentDueDate={setPaymentDueDate}
            amountDue={amountDue} totalPaid={totalPaid} totals={totals}
            additionalCharges={additionalCharges} setAdditionalCharges={setAdditionalCharges}
            currencySymbol={currencySymbol} viewMode={viewMode} isReturnMode={isReturnMode}
            paymentDueDateError={paymentDueDateError}
            gstRate={activeFirm.financials.gstRate ?? 0}
            pricingMode={pricingMode} finalPriceLocked={finalPriceLocked}
            finalPriceOverride={finalPriceOverride}
            onFinalPriceChange={handleFinalPriceChange}
            onRoundFinal={handleRoundFinal} onResetFinal={handleResetFinal}
            onEditDiscountManually={handleEditDiscountManually}
            clubBuybackWithDiscount={clubBuybackWithDiscount}
            setClubBuybackWithDiscount={setClubBuybackWithDiscount}
        />
    );

    return (
        <>
            <Modal onClose={onClose} size="full" className="max-w-7xl h-[95vh] !max-h-[95vh]" ariaLabel="Sales Form">
                <header className="flex justify-between items-center p-4 border-b border-border-color">
                    <h2 className="text-xl font-bold text-text-primary">
                        {viewMode ? 'View Transaction Details' : (transactionToEdit ? 'Edit Transaction' : (isReturnMode ? 'Process Sales Return' : 'New Sale'))}
                    </h2>
                    <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end gap-0.5">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Bill as</span>
                                <div className="firm-switcher">
                                    {config.firms.map(firm => (
                                        <button key={firm.id} type="button" disabled={viewMode || isReturnMode} onClick={() => setSelectedFirmId(firm.id)} className={`firm-switcher-btn ${selectedFirmId === firm.id ? 'active' : ''}`}>{firm.shopDetails?.name ?? firm.id}</button>
                                    ))}
                                </div>
                            </div>
                            <ShortcutsCheatsheet />
                            <button onClick={onClose} className="btn-icon" aria-label="Close"><IconX className="h-5 w-5" /></button>
                        </div>
                        {config.firms.length > 1 && <SharedStockHint />}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 space-y-6">
                    <fieldset disabled={viewMode} className="contents group">
                        {useWizard && (
                            <SalesFormWizard step={wizardStep} onStepChange={goToStep} />
                        )}

                        {useWizard ? (
                            <>
                                {wizardStep === 0 && renderCartSection()}
                                {wizardStep === 1 && renderCustomerSection()}
                                {wizardStep === 2 && renderPaymentSection()}
                            </>
                        ) : (
                            <>
                                {renderCustomerSection(true)}
                                {renderCartSection()}
                                {renderPaymentSection()}
                            </>
                        )}
                    </fieldset>
                </main>

                <footer className="flex justify-between items-center gap-3 p-4 bg-bg-tertiary border-t border-border-color rounded-b-xl">
                    <button type="button" onClick={onClose} className="btn-secondary">Close</button>
                    {viewMode ? (
                        <div className="flex gap-3">
                            {onViewReceipt && transactionToEdit && (
                                <button type="button" onClick={() => onViewReceipt(transactionToEdit)} className="btn-secondary">
                                    <IconPrint className="h-4 w-4" /> View Receipt
                                </button>
                            )}
                            <button type="button" onClick={() => setViewMode(false)} className="btn-info">Edit</button>
                        </div>
                    ) : useWizard ? (
                        <div className="flex gap-3">
                            {wizardStep > 0 && (
                                <button type="button" onClick={() => setWizardStep(s => (s - 1) as WizardStep)} className="btn-secondary">Back</button>
                            )}
                            {wizardStep < 2 ? (
                                <button type="button" onClick={() => goToStep((wizardStep + 1) as WizardStep)} className="btn-primary">Next</button>
                            ) : (
                                <>
                                    {!isReturnMode && <button type="button" onClick={() => handleSave('quotation')} className="btn-secondary border-brand-red text-brand-red">Save as Quotation</button>}
                                    <button type="button" onClick={() => handleSave('sale')} className="btn-primary">Record Sale</button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            {!isReturnMode && <button type="button" onClick={() => handleSave('quotation')} className="btn-secondary border-brand-red text-brand-red">Save as Quotation</button>}
                            <button type="button" onClick={() => handleSave('sale')} className={isReturnMode ? 'btn-danger' : 'btn-primary'}>
                                {isReturnMode ? 'Process Return' : (transactionToEdit ? 'Update Sale' : 'Record Sale')}
                            </button>
                        </div>
                    )}
                </footer>
            </Modal>
            {saveConfirm && (
                <ConfirmationModal
                    title={saveConfirm.step === 'credit' ? 'Credit Limit Exceeded' : 'Partial Payment'}
                    message={
                        saveConfirm.step === 'credit'
                            ? `This sale exceeds the customer's credit limit of ${currencySymbol}${selectedCustomerData?.creditLimit?.toLocaleString('en-IN')}. Continue anyway?`
                            : `Payment is less than total amount. A balance of ${currencySymbol}${pendingFinalDue.toFixed(2)} will be marked as DUE. Continue?`
                    }
                    variant="default" confirmText="Continue" onConfirm={handleConfirmSave} onCancel={() => setSaveConfirm(null)}
                />
            )}
            {showScanModal && (
                <MobileScanModal onScan={handleBarcodeScan} onClose={() => setShowScanModal(false)} title="Scan to Add Item" />
            )}
        </>
    );
};
