
export type PaymentMethod = 'Cash' | 'Card' | 'UPI' | 'Bank Transfer';

export interface ProductType {
    id: string;
    brandName: string;
    name: string;
    category: string;
    hsnCode?: string; // New: HSN Code for GST Compliance
    specifications: {
        capacity: string; // e.g., 150Ah
        voltage: string;  // e.g., 12V
        technology?: 'Tubular' | 'Flat Plate' | 'SMF' | 'Gel' | 'Lithium'; // New: Battery Tech
        cRating?: 'C10' | 'C20' | 'C5' | 'N/A'; // New: Solar vs Normal
    };
    defaultGuaranteeMonths?: number; // Free Replacement
    defaultWarrantyMonths?: number; // Pro-rata
    lowStockThreshold?: number;
    barcode?: string; // Product-level barcode/SKU for scanning
}

export interface Supplier {
    id: string;
    name: string;
    contactPerson: string;
    phone: string;
    email?: string;
    gstin?: string;
    address?: string;
}

export interface ScrapItem {
    id: string;
    date: string;
    sourceTransactionId?: string; // If from buyback
    productName: string; // e.g., "Old Exide 150Ah"
    category: string;
    quantity: number;
    purchasePrice: number; // Cost (buyback price)
    status: 'In Stock' | 'Sold' | 'Disposed';
    notes?: string;
}

export interface InventoryItem {
    id: string;
    firmId: string; // New: Multi-branch support
    productTypeId: string; // Replaces 'name' for data consistency
    supplierId?: string; // New: Link to Supplier
    type: 'New' | 'Refurbished';
    serialNumber: string;
    batchNumber?: string;
    purchaseDate: string;
    purchasePrice: number; // This is the Dealer Price (Cost) for this batch
    mrp: number; // This is the MRP for this batch
    stock: number;
}

export enum ServiceJobStatus {
    PENDING = 'Pending',
    IN_PROGRESS = 'In Progress',
    WAITING_FOR_PARTS = 'Waiting for Parts',
    SENT_TO_COMPANY = 'Sent to Company', // RMA
    READY_FOR_PICKUP = 'Ready for Pickup',
    COMPLETED = 'Completed',
    DELIVERED = 'Delivered',
}

export interface ServiceJob {
    id: string;
    customerName: string;
    customerPhone: string;
    vehicleDetails: string;
    issueDescription: string;
    receivedDate: string;
    estimatedCompletionDate?: string;
    status: ServiceJobStatus;
    assignedTo?: string;
    chargeAmount?: number;
    notes?: string;
    priority: 'Low' | 'Medium' | 'High';
    loanerItemDetails?: string; // New: Standby battery details
    loanerStatus?: 'Given' | 'Returned'; // New: Track loaner return

    // RMA / Warranty Claim Fields
    warrantyClaim?: {
        isClaim: boolean;
        warrantyLogId?: string; // Link to WarrantyLog
        companyName?: string;
        ticketNumber?: string;
        sentDate?: string;
        receivedDate?: string;
        companyRemarks?: string; // e.g., "Rejected - Physical Damage" or "Approved - Replacement"
        claimDocumentGeneratedAt?: string;
    };
}

export interface Transaction {
    id: string;
    invoiceNumber?: string; // New: Manual Invoice Number
    firmId: string; // ID of the firm that made the sale
    type: 'Sale' | 'Return'; // New: Support for Credit Notes
    originalTransactionId?: string; // New: Link for returns
    date: string;
    customerName: string;
    customerPhone?: string;
    customerGst?: string; // New: For B2B
    billingAddress?: string; // New: For Invoice
    vehicleNumber?: string; // New: Critical for Warranty
    vehicleModel?: string; // New: Separate Model field
    saleCategory?: string; // e.g. 2-Wheeler, Truck, Inverter, Generator

    // GST Compliance Fields
    placeOfSupply?: string; // State code (e.g., "07" for Delhi)
    isInterstate?: boolean; // Auto-computed from state codes
    eInvoiceIrn?: string; // E-invoice IRN (for B2B > 5 Cr)
    eInvoiceAckNo?: string; // E-invoice acknowledgement number
    eInvoiceAckDate?: string; // E-invoice acknowledgement date (ISO)
    eInvoiceStatus?: 'Not Generated' | 'Pending' | 'Generated' | 'Cancelled' | 'Failed';
    eWayBillNo?: string; // E-way bill number (goods > 50k)
    eWayBillDate?: string; // E-way bill valid-from date (ISO)
    eWayBillStatus?: 'Not Generated' | 'Pending' | 'Generated' | 'Cancelled' | 'Failed';

    items: {
        id: string; // This will be the inventoryId for stock items
        name: string; // The denormalized name at time of sale
        quantity: number;
        price: number;
        purchasePrice?: number; // Added for profit calculation
        serialNumbers?: string;
        isBuyback?: boolean;
        buybackBrand?: string;
        buybackCapacity?: string;
        buybackSerialNumber?: string;
        isCustom?: boolean;
        guaranteePeriodMonths?: number;
        warrantyPeriodMonths?: number;
        discount: {
            type: 'percentage' | 'fixed';
            value: number;
        };
        specifications?: {
            capacity?: string;
            voltage?: string;
            technology?: string;
            cRating?: string;
        };
        notes?: string;
        // GST Item Fields
        hsnCode?: string; // HSN/SAC code
        gstRate?: number; // Total GST rate (e.g., 18)
        cgstRate?: number; // CGST rate (e.g., 9)
        sgstRate?: number; // SGST rate (e.g., 9)
        igstRate?: number; // IGST rate (e.g., 18 for interstate)
        cgstAmount?: number;
        sgstAmount?: number;
        igstAmount?: number;
    }[];
    additionalCharges?: { // New: Installation, Service, etc.
        description: string;
        amount: number;
        hsnCode?: string; // SAC for services
        gstRate?: number;
    };
    subtotal: number;
    discount: {
        type: 'percentage' | 'fixed';
        value: number;
    };
    redeemedPoints?: number; // New: Points used in this transaction
    taxRegime: 'Regular' | 'Composition';
    taxAmount: number;
    // GST Split Totals
    totalCgst?: number;
    totalSgst?: number;
    totalIgst?: number;
    total: number;
    payments: {
        method: 'Cash' | 'Card' | 'UPI';
        amount: number;
    }[];
    status: 'Paid' | 'Due' | 'Quotation';
    paymentDueDate?: string; // New: Track when udhaar is promised
    notes?: string;
}

export interface PurchaseItem {
    productTypeId: string;
    type: 'New' | 'Refurbished';
    quantity: number;
    unitPrice: number; // Purchase Price (Excl Tax)
    mrp: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    batchNumber?: string;
    serialNumbers?: string[]; // Optional at time of purchase entry, can be added later
}

export interface Purchase {
    id: string;
    firmId: string;
    supplierId: string;
    supplierInvoiceNumber: string;
    date: string; // Invoice Date
    entryDate: string; // System Date
    items: PurchaseItem[];
    subtotal: number;
    totalTax: number;
    totalAmount: number;
    status: 'Received' | 'Ordered';
    paymentStatus: 'Paid' | 'Due' | 'Partial';
    paidAmount: number;
    paymentMethod?: PaymentMethod;
    paymentDueDate?: string;
    notes?: string;
    invoiceImage?: string; // Base64 data URL from upload or mobile companion
}

/** Pending vendor invoice photo captured on mobile companion (synced via API). */
export interface PurchaseInvoiceUpload {
    id: string;
    firmId: string;
    image: string;
    capturedAt: string;
    supplierInvoiceNumber?: string;
    notes?: string;
    /** Battery serial numbers scanned on mobile while capturing the invoice */
    scannedSerials?: string[];
}

export interface StockTakeAdjustment {
    inventoryItemId: string;
    countedQty: number;
}

export interface PaymentVoucher {
    id: string;
    date: string;
    type: 'Receipt' | 'Payment' | 'Contra'; // Receipt = From Customer, Payment = To Supplier/Expense
    firmId: string;
    partyType?: 'Customer' | 'Supplier';
    partyId?: string; // ID for Supplier, or "Name|Phone" for Customer
    partyName: string; // Display Name
    amount: number;
    method: 'Cash' | 'Card' | 'UPI' | 'Bank Transfer';
    referenceNumber?: string; // Cheque No / UPI Ref
    notes?: string;
}

export interface WarrantyLog {
    id: string;
    transactionId: string;
    inventoryId: string;
    productName: string;
    serialNumber: string;
    customerName: string;
    customerPhone: string;
    saleDate: string;
    saleCategory?: string;
    vehicleNumber?: string;
    vehicleModel?: string;
    guaranteePeriodMonths: number;
    guaranteeEndDate: string; // ISO string
    warrantyPeriodMonths: number;
    warrantyEndDate: string; // ISO string
}


export type CustomerTier = 'Silver' | 'Gold' | 'Platinum';

export interface CustomerCustomPrice {
    productTypeId: string;
    price: number;
}

export interface CustomerProfile {
    id: string; // name|phone key
    name: string;
    phone: string;
    creditLimit?: number;
    customPrices?: CustomerCustomPrice[];
    notes?: string;
}

export interface Customer {
    id: string; // combination of name and phone
    name: string;
    phone: string;
    totalSpent: number;
    totalDue: number;
    loyaltyPoints: number; // New: Available points
    tier?: CustomerTier;
    creditLimit?: number;
    customPrices?: CustomerCustomPrice[];
    tierDiscountPercent?: number;
    firstSeen: string;
    lastSeen: string;
    transactionIds: string[];
    serviceJobIds: string[];
}

export interface Expense {
    id: string;
    date: string;
    category: 'Rent' | 'Salaries' | 'Utilities' | 'Marketing' | 'Supplies' | 'Other';
    description: string;
    amount: number;
    method?: PaymentMethod;
}

export interface PeriodSummarySnapshot {
    revenue: number;
    expenses: number;
    grossProfit: number;
    netProfit: number;
    transactionCount: number;
    cashIn?: number;
    upiIn?: number;
    cardIn?: number;
    cashExpenses?: number;
}

export interface DailyClose {
    id: string;
    date: string;
    firmId?: string;
    expectedCash: number;
    countedCash: number;
    countedUpi?: number;
    countedCard?: number;
    variance: number;
    notes?: string;
    snapshot: PeriodSummarySnapshot;
    closedAt: string;
}

export interface MonthlyClose {
    id: string;
    year: number;
    month: number;
    snapshot: PeriodSummarySnapshot;
    notes?: string;
    closedAt: string;
}

export interface MonthlyBreakdownRow {
    month: number;
    label: string;
    revenue: number;
    expenses: number;
    profit: number;
    transactionCount: number;
}

export interface YearlyClose {
    id: string;
    year: number;
    snapshot: PeriodSummarySnapshot;
    monthlyBreakdown: MonthlyBreakdownRow[];
    notes?: string;
    closedAt: string;
}

export type ReportPeriodPreference =
    | 'today'
    | 'last7'
    | 'last30'
    | 'this_week'
    | 'prev_week'
    | 'month'
    | 'prev_month'
    | 'this_year'
    | 'prev_year';

export interface ShopDetails {
    name: string;
    address: string;
    phone: string;
    email: string;
    gstin: string;
    logo?: string;
    invoiceTerms?: string; // New: Custom terms for invoice footer
}

export interface FinancialSettings {
    taxRegime: 'Regular' | 'Composition';
    gstRate: number;
    currencySymbol: string;
    upiId?: string; // New: For QR Code generation
}

export interface LoyaltySettings {
    enabled: boolean;
    earnRate: number; // Amount spent to earn 1 point
    redemptionValue: number; // Value of 1 point
    tiers: {
        silver: number; // Spend amount for Silver
        gold: number;   // Spend amount for Gold
        platinum: number; // Spend amount for Platinum
    };
    tierDiscounts?: {
        silver: number; // % discount for Silver tier
        gold: number;
        platinum: number;
    };
}

export interface AiSettings {
    enabled: boolean;
    provider: 'gemini' | 'ollama';
    geminiApiKey?: string;
    geminiModel?: string;
    ollamaBaseUrl?: string;
    ollamaVisionModel?: string;
    /** Route text AI (chat, insights) through the local semantic layer middleware. */
    semanticLayerEnabled?: boolean;
    semanticLayerUrl?: string;
}

export interface PurchaseExtractionResult {
    supplierName?: string;
    supplierGstin?: string;
    supplierInvoiceNumber?: string;
    date?: string;
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        mrp?: number;
        taxRate?: number;
        hsnCode?: string;
        batchNumber?: string;
    }>;
    subtotal?: number;
    totalTax?: number;
    totalAmount?: number;
    confidence: 'high' | 'medium' | 'low';
    warnings: string[];
}

/**
 * Aggregated, PII-free business context handed to the AI assistant.
 *
 * Conventions (kept explicit so an LLM never has to guess):
 * - All monetary values are integers in INR (`currency`).
 * - P&L figures (`sales.*`) are scoped to [periodStartDate, periodEndDate] and
 *   are tax-EXCLUSIVE unless the field name says otherwise.
 * - Balances and aging (`receivables.*`, `payables.*`) are point-in-time as of
 *   `asOfDate` and are NOT scoped to the reporting period.
 * A human-readable data dictionary for these fields is embedded in the AI system
 * prompts (see SNAPSHOT_GLOSSARY in server/services/ai/prompts.ts).
 */
export interface AiBusinessSnapshot {
    period: string;             // Human label, e.g. "Last 30 Days"
    periodStartDate: string;    // ISO YYYY-MM-DD, inclusive — scope of sales.*
    periodEndDate: string;      // ISO YYYY-MM-DD, inclusive
    asOfDate: string;           // ISO YYYY-MM-DD — as-of date for balances/aging
    currency: 'INR';
    sales: {
        revenueExTax: number;         // ex-tax sales revenue (matches P&L report)
        returnsValue: number;         // value of returns / credit notes in period
        cogs: number;                 // cost of goods sold (net of returned stock)
        grossProfit: number;          // revenueExTax - cogs
        operatingExpenses: number;    // period operating expenses (rent, salaries...)
        netProfit: number;            // grossProfit - operatingExpenses
        grossMarginPct: number | null;// 100 * grossProfit / revenueExTax
        netMarginPct: number | null;  // 100 * netProfit / revenueExTax
        transactionCount: number;     // completed sales (excludes returns & quotations)
    };
    momGrowth: { month: string; growthPercent: number | null } | null; // latest month-over-month %
    salesTrend: { month: string; grossRevenue: number; transactionCount: number }[]; // trailing months, gross incl GST
    topProducts: { name: string; quantitySold: number; lineRevenueExTax: number }[]; // ranking only; not comparable to sales totals
    inventory: {
        lowStockProductCount: number;     // product types at/below their low-stock threshold
        slowMovingProductCount: number;   // products with no sale in >= 90 days
    };
    receivables: {
        overdueInvoiceCount: number;      // customer invoices past due date, as of asOfDate
        upcomingDueInvoiceCount: number;  // customer invoices due within 7 days
        agingAmountInr: { current: number; days31_60: number; days61_90: number; over90: number; total: number };
    };
    payables: {
        overdueBillCount: number;         // supplier bills past due date, as of asOfDate
        upcomingDueBillCount: number;     // supplier bills due within 7 days
        agingAmountInr: { current: number; days31_60: number; days61_90: number; over90: number; total: number };
    };
}

export interface AiInsightsResult {
    highlights: string[];
    risks: string[];
    suggestedActions: string[];
}

export interface AiChatMessage {
    role: 'user' | 'assistant';
    content: string;
    actions?: AiChatAction[];
}

export type ExpenseCategory = Expense['category'];

export type AiChatAction =
    | { type: 'navigate'; page: Page }
    | {
          type: 'add_expense';
          date?: string;
          category: ExpenseCategory;
          description: string;
          amount: number;
          method?: PaymentMethod;
      }
    | {
          type: 'add_payment_voucher';
          voucherType: 'Receipt' | 'Payment';
          partyType: 'Customer' | 'Supplier';
          partyName: string;
          amount: number;
          method?: PaymentVoucher['method'];
          date?: string;
          referenceNumber?: string;
          notes?: string;
      }
    | {
          type: 'open_expense_form';
          date?: string;
          category?: ExpenseCategory;
          description?: string;
          amount?: number;
          method?: PaymentMethod;
      }
    | {
          type: 'open_voucher_form';
          voucherType: 'Receipt' | 'Payment';
          partyType?: 'Customer' | 'Supplier';
          partyName?: string;
          amount?: number;
          method?: PaymentVoucher['method'];
          date?: string;
          referenceNumber?: string;
          notes?: string;
      }
    | {
          type: 'open_sale';
          customerName?: string;
          customerPhone?: string;
          vehicleNumber?: string;
          vehicleModel?: string;
          saleCategory?: string;
      }
    | { type: 'open_service_job' }
    | { type: 'inventory_search'; query?: string; lowStockOnly?: boolean }
    | { type: 'warranty_search'; query: string }
    | { type: 'reports_filter'; period?: ReportPeriodPreference; firmId?: string }
    | { type: 'view_receipt'; transactionId: string };

export interface AiActionContext {
    allowedPages: Page[];
    expenseCategories: ExpenseCategory[];
    paymentMethods: PaymentMethod[];
    voucherMethods: PaymentVoucher['method'][];
    parties: Array<{ type: 'Customer' | 'Supplier'; id: string; name: string }>;
    cashBalance: number;
    bankBalance: number;
    defaultFirmId: string;
    exampleUtterances: string[];
}

export interface AiChatResult {
    reply: string;
    actions?: AiChatAction[];
}

export interface AppPreferences {
    defaultDashboardView: ReportPeriodPreference;
    defaultLowStockAlert: number;
    defaultFirmId: string;
    loyaltyProgram: LoyaltySettings;
    saleCategories?: string[];
    browserNotificationsEnabled?: boolean;
    eInvoiceApiKey?: string;
    eInvoiceGspUrl?: string;
    aiSettings?: AiSettings;
}

export interface Firm {
    id: string;
    shopDetails: ShopDetails;
    financials: FinancialSettings;
}

export interface AppConfig {
    firms: Firm[];
    preferences: AppPreferences;
}

export interface InventoryLog {
    id: string;
    date: string; // ISO string
    inventoryItemId: string;
    productName: string;
    change: number; // e.g., -1 for a sale, +10 for new stock
    newQuantity: number;
    reason: string; // e.g., "Sale", "Stock Adjustment", "Initial Stock"
    referenceId?: string; // e.g., transactionId
}

export interface AuditLog {
    id: string;
    date: string;
    action: 'DELETE' | 'UPDATE' | 'CREATE' | 'EINVOICE' | 'STOCK_REVERSAL';
    entityType: 'Transaction' | 'Purchase' | 'Expense' | 'ServiceJob';
    entityId: string;
    userRole: UserRole;
    details: string;
    snapshot?: string; // JSON snapshot of deleted entity
}

export interface AppNotification {
    id: string;
    date: string;
    type: 'due_reminder' | 'overdue' | 'low_stock' | 'system';
    title: string;
    message: string;
    read: boolean;
    linkPage?: Page;
    referenceId?: string;
}

export type Page = 'Dashboard' | 'Sales' | 'Purchases' | 'Banking' | 'Customers' | 'Products' | 'Expenses' | 'Charging Services' | 'Warranty' | 'Reports' | 'Settings' | 'Mobile';

export type UserRole = 'admin' | 'staff';
