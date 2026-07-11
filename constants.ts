

import { InventoryItem, ServiceJob, ServiceJobStatus, Transaction, ProductType, Expense } from './types.ts';

// 1 Point earned for every 100 spent
export const LOYALTY_POINTS_EARN_RATE = 100; 
// 1 Point = 1 Currency Unit value
export const LOYALTY_POINT_VALUE = 1;

export const DEFAULT_SALE_CATEGORIES = [
    '2-Wheeler',
    '3-Wheeler',
    '4-Wheeler',
    'Truck',
    'Inverter',
    'Generator',
    'Solar',
    'E-Rickshaw',
    'Other',
];

export const INITIAL_PRODUCT_TYPES: ProductType[] = [
    { id: 'PROD001', brandName: 'Amaron', name: '150Ah Tubular Battery', category: 'Inverter', specifications: { capacity: '150Ah', voltage: '12V', technology: 'Tubular', cRating: 'C20' }, defaultGuaranteeMonths: 24, defaultWarrantyMonths: 12, lowStockThreshold: 10 },
    { id: 'PROD002', brandName: 'Exide', name: '100Ah Flat Plate Battery', category: 'Inverter', specifications: { capacity: '100Ah', voltage: '12V', technology: 'Flat Plate', cRating: 'C20' }, defaultGuaranteeMonths: 18, defaultWarrantyMonths: 18, lowStockThreshold: 20 },
    { id: 'PROD003', brandName: 'Luminous', name: '200Ah Solar Battery', category: 'Solar', specifications: { capacity: '200Ah', voltage: '12V', technology: 'Tubular', cRating: 'C10' }, defaultGuaranteeMonths: 36, defaultWarrantyMonths: 24, lowStockThreshold: 15 },
    { id: 'PROD004', brandName: 'Exide', name: '120Ah Battery (Refurbished)', category: 'Inverter', specifications: { capacity: '120Ah', voltage: '12V', technology: 'Flat Plate' }, defaultGuaranteeMonths: 6, defaultWarrantyMonths: 0, lowStockThreshold: 5 },
    { id: 'PROD005', brandName: 'SF Sonic', name: 'Car Battery (DIN60)', category: '4-Wheeler', specifications: { capacity: '60Ah', voltage: '12V', technology: 'SMF' }, defaultGuaranteeMonths: 24, defaultWarrantyMonths: 24, lowStockThreshold: 10 },
    { id: 'PROD006', brandName: 'Exide', name: 'Xplore (2.5Ah 2-Wheeler)', category: '2-Wheeler', specifications: { capacity: '2.5Ah', voltage: '12V', technology: 'SMF' }, defaultGuaranteeMonths: 12, defaultWarrantyMonths: 12, lowStockThreshold: 25 },
    { id: 'PROD007', brandName: 'Amaron', name: 'Rik (100Ah 3-Wheeler)', category: '3-Wheeler', specifications: { capacity: '100Ah', voltage: '12V', technology: 'Flat Plate' }, defaultGuaranteeMonths: 12, defaultWarrantyMonths: 6, lowStockThreshold: 10 },
    { id: 'PROD008', brandName: 'Tata', name: 'Green DIN60 (4-Wheeler)', category: '4-Wheeler', specifications: { capacity: '60Ah', voltage: '12V', technology: 'SMF' }, defaultGuaranteeMonths: 18, defaultWarrantyMonths: 18, lowStockThreshold: 10 },
    { id: 'PROD009', brandName: 'Luminous', name: 'Genus (120Ah Generator)', category: 'Generator', specifications: { capacity: '120Ah', voltage: '12V', technology: 'Flat Plate' }, defaultGuaranteeMonths: 12, defaultWarrantyMonths: 0 },
    { id: 'PROD010', brandName: 'Amaron', name: 'Harvest (90Ah Tractor)', category: 'Other', specifications: { capacity: '90Ah', voltage: '12V', technology: 'Flat Plate' }, defaultGuaranteeMonths: 18, defaultWarrantyMonths: 6 },
    { id: 'PROD011', brandName: 'Luminous', name: 'Inverlast (220Ah Inverter)', category: 'Inverter', specifications: { capacity: '220Ah', voltage: '12V', technology: 'Tubular', cRating: 'C20' }, defaultGuaranteeMonths: 30, defaultWarrantyMonths: 18, lowStockThreshold: 8 },
    { id: 'PROD012', brandName: 'Microtek', name: 'Solar 150Ah (C10)', category: 'Solar', specifications: { capacity: '150Ah', voltage: '12V', technology: 'Tubular', cRating: 'C10' }, defaultGuaranteeMonths: 60, defaultWarrantyMonths: 0, lowStockThreshold: 5 },
];


export const INITIAL_INVENTORY: InventoryItem[] = [
    { id: 'INV001', firmId: 'SHARED', productTypeId: 'PROD001', type: 'New', serialNumber: 'AMRN123456', batchNumber: 'BN-A150-2310', purchaseDate: '2023-10-15', purchasePrice: 11500, mrp: 14500, stock: 1 },
    { id: 'INV002', firmId: 'SHARED', productTypeId: 'PROD002', type: 'New', serialNumber: 'EXD789012', batchNumber: 'BN-E100-2311', purchaseDate: '2023-11-02', purchasePrice: 8000, mrp: 9500, stock: 1 },
    { id: 'INV003', firmId: 'SHARED', productTypeId: 'PROD003', type: 'New', serialNumber: 'LUM345678', purchaseDate: '2023-09-20', purchasePrice: 17500, mrp: 21000, stock: 1 },
    { id: 'INV004', firmId: 'SHARED', productTypeId: 'PROD004', type: 'Refurbished', serialNumber: 'RF-EXD998877', purchaseDate: '2023-11-05', purchasePrice: 3500, mrp: 5500, stock: 1 },
];

export const INITIAL_SERVICE_JOBS: ServiceJob[] = [
    { id: 'JOB001', customerName: 'Ramesh Kumar', customerPhone: '9876543210', vehicleDetails: 'Maruti Alto (DL-3C-1234)', issueDescription: 'Battery not holding charge', receivedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), status: ServiceJobStatus.IN_PROGRESS, assignedTo: 'Suresh', estimatedCompletionDate: new Date().toISOString(), priority: 'High' },
    { id: 'JOB002', customerName: 'Sunita Sharma', customerPhone: '9988776655', vehicleDetails: 'Honda Activa (HR-26-5678)', issueDescription: 'Charging issue, check wiring', receivedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), status: ServiceJobStatus.PENDING, priority: 'Medium' },
    { id: 'JOB003', customerName: 'Amit Singh', customerPhone: '9123456789', vehicleDetails: 'Inverter Battery', issueDescription: 'Low backup time', receivedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), status: ServiceJobStatus.COMPLETED, chargeAmount: 500, notes: 'Water topped up and terminals cleaned.', priority: 'Low' },
    { id: 'JOB004', customerName: 'Priya Gupta', customerPhone: '9000011111', vehicleDetails: 'Tata Nexon EV', issueDescription: 'DC fast charging not working', receivedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), status: ServiceJobStatus.DELIVERED, chargeAmount: 2500, notes: 'Replaced charging port fuse.', priority: 'High' },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
    { id: 'TRN001', type: 'Sale', firmId: 'FIRM001', date: '2023-11-20T10:00:00Z', customerName: 'Vijay Sales Corp', customerPhone: '9876543210', items: [{ id: 'INV001', name: 'Amaron 150Ah Tubular Battery', quantity: 2, price: 14500, purchasePrice: 11500, serialNumbers: 'AMRN123, AMRN124', discount: {type: 'fixed', value: 0} }], subtotal: 29000, discount: { type: 'percentage', value: 5 }, taxRegime: 'Regular', taxAmount: 4959, total: 32509, payments: [{ method: 'UPI', amount: 32509 }], status: 'Paid', notes: 'Urgent delivery requested.' },
    { id: 'TRN002', type: 'Sale', firmId: 'FIRM001', date: '2023-11-19T14:30:00Z', customerName: 'Anil Kumar', customerPhone: '9988776655', items: [{ id: 'INV002', name: 'Exide 100Ah Flat Plate Battery', quantity: 1, price: 9000, purchasePrice: 8000, serialNumbers: 'EXD789012', discount: {type: 'fixed', value: 0} }], subtotal: 9000, discount: { type: 'percentage', value: 0 }, taxRegime: 'Composition', taxAmount: 0, total: 9000, payments: [{ method: 'Card', amount: 9000 }], status: 'Paid', saleCategory: '4-Wheeler', vehicleNumber: 'DL-10-AB-1234', vehicleModel: 'Maruti Swift' },
    { id: 'TRN003', type: 'Sale', firmId: 'FIRM002', date: '2023-11-19T18:00:00Z', customerName: 'Walk-in', customerPhone: '', items: [{ id: 'INV004', name: 'Exide 120Ah Battery (Refurbished)', quantity: 1, price: 5500, purchasePrice: 3500, serialNumbers: 'RF-EXD998877', discount: {type: 'fixed', value: 0} }], subtotal: 5500, discount: { type: 'percentage', value: 0 }, taxRegime: 'Regular', taxAmount: 990, total: 6490, payments: [], status: 'Quotation', notes: 'Customer will confirm by tomorrow.' },
];

export const INITIAL_EXPENSES: Expense[] = [
    { id: 'EXP001', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), category: 'Utilities', description: 'Electricity Bill for October', amount: 5500 },
    { id: 'EXP002', date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), category: 'Supplies', description: 'Shop cleaning supplies and tools', amount: 800 },
    { id: 'EXP003', date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), category: 'Rent', description: 'Shop Rent for November', amount: 15000 },
];