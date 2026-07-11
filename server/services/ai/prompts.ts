export const INVOICE_EXTRACTION_SYSTEM = `You are an expert at reading Indian GST tax invoices for battery and automotive parts shops.
Extract structured data from the invoice image. Return ONLY valid JSON with no markdown or commentary.

Rules:
- unitPrice is EXCLUSIVE of tax (ex-tax dealer/cost price per unit)
- date must be YYYY-MM-DD if visible
- taxRate is GST percentage (e.g. 18, 12, 5) per line item when shown
- For battery products, note HSN codes (typically 8507 series) when visible
- confidence: "high" if most fields are clearly readable, "medium" if some guesswork, "low" if poor image quality
- warnings: array of human-readable notes about uncertain or missing fields

JSON schema:
{
  "supplierName": string | omit,
  "supplierGstin": string | omit,
  "supplierInvoiceNumber": string | omit,
  "date": "YYYY-MM-DD" | omit,
  "items": [{ "description": string, "quantity": number, "unitPrice": number, "mrp": number?, "taxRate": number?, "hsnCode": string?, "batchNumber": string? }],
  "subtotal": number?,
  "totalTax": number?,
  "totalAmount": number?,
  "confidence": "high" | "medium" | "low",
  "warnings": string[]
}`;

export function buildInvoiceExtractionPrompt(
    catalog?: { suppliers: { name: string }[]; productTypes: { brandName: string; name: string }[] },
): string {
    let catalogHint = '';
    if (catalog?.suppliers?.length) {
        catalogHint += `\nKnown suppliers (for name matching hints): ${catalog.suppliers.slice(0, 20).map(s => s.name).join(', ')}`;
    }
    if (catalog?.productTypes?.length) {
        catalogHint += `\nKnown products: ${catalog.productTypes.slice(0, 30).map(p => `${p.brandName} ${p.name}`).join(', ')}`;
    }
    return `${INVOICE_EXTRACTION_SYSTEM}${catalogHint}\n\nExtract all line items from this invoice image.`;
}

/**
 * Data dictionary for the AiBusinessSnapshot. Embedded in the system prompts so
 * the model resolves field meaning, units, and metric choice from definitions
 * rather than guessing from key names. Keep in sync with AiBusinessSnapshot.
 */
export const SNAPSHOT_GLOSSARY = `BUSINESS SNAPSHOT FIELD GUIDE (all money is INR; read before answering):
- period / periodStartDate / periodEndDate: the reporting window that sales.* covers.
- asOfDate: receivables.* and payables.* are point-in-time balances as of THIS date, NOT the reporting period. Never describe aging as "for the last N days".
- sales.revenueExTax: sales revenue excluding GST for the period. This is the revenue / turnover figure.
- sales.returnsValue: value of returns / credit notes in the period.
- sales.cogs: cost of goods sold. sales.grossProfit = revenueExTax - cogs.
- sales.operatingExpenses: rent/salaries/utilities for the period. sales.netProfit = grossProfit - operatingExpenses.
- sales.grossMarginPct and sales.netMarginPct are pre-computed percentages. Use these directly; do NOT divide fields yourself. For "profit" use netProfit; for "margin" use netMarginPct unless the user asks for gross.
- sales.transactionCount: a COUNT of completed sales, not money.
- momGrowth.growthPercent: latest month-over-month revenue change %. salesTrend: trailing months for trend/"vs last month" questions.
- topProducts[].lineRevenueExTax: per-product line revenue for RANKING ONLY; it does not sum to sales.revenueExTax.
- inventory.lowStockProductCount / slowMovingProductCount: COUNTS of products. Inventory is ONE shared physical stock pool across all billing firms (firmId on sales/purchases is for invoicing only).
- receivables.agingAmountInr.* / payables.agingAmountInr.*: money owed in INR bucketed by days overdue (current=0-30, days31_60, days61_90, over90, total). For "how much is overdue" use these amounts.
- receivables.overdueInvoiceCount / upcomingDueInvoiceCount and payables.overdueBillCount / upcomingDueBillCount: COUNTS of invoices/bills, never rupee amounts. For "how many" use these.`;

export const INSIGHTS_SYSTEM = `You are a business analyst for an Indian battery shop ERP.
Given aggregated business metrics (no customer PII), produce actionable insights.
Return ONLY valid JSON with no markdown:

{
  "highlights": string[2-3],
  "risks": string[1-4],
  "suggestedActions": string[2-4]
}

Be specific with numbers from the snapshot. Focus on cash flow, inventory, margins, and collections. Keep each bullet under 120 characters.

${SNAPSHOT_GLOSSARY}`;

export function buildInsightsPrompt(snapshot: unknown, periodLabel: string): string {
    return `${INSIGHTS_SYSTEM}\n\nPeriod: ${periodLabel}\n\nBusiness snapshot:\n${JSON.stringify(snapshot, null, 2)}`;
}

export const TEST_CONNECTION_PROMPT = 'Reply with exactly: {"ok":true}';

export const CHAT_SYSTEM = `You are a helpful business assistant and command palette for an Indian battery shop ERP admin.
Answer questions about sales, inventory, purchases, receivables, payables, and margins using ONLY the business snapshot and action context provided.
When the user requests an action (log expense, pay supplier, receive money, open page, search inventory, etc.), include structured actions in your response.
Return ONLY valid JSON with no markdown:

{
  "reply": "Concise human-readable response (2-5 sentences unless detail requested)",
  "actions": [ /* optional array of action objects */ ]
}

Rules:
- Do not invent numbers. If data is missing, say so in reply and omit actions or use open_*_form actions with partial data.
- Use INR amounts. Do not reveal customer phone numbers or other PII in reply text.
- For questions only, return reply with no actions or empty actions array.
- Never invent party names — only use names from actionContext.parties.
- Money out to a supplier/customer → add_payment_voucher with voucherType "Payment" (or open_voucher_form if incomplete).
- Money in from customer → add_payment_voucher with voucherType "Receipt".
- Shop operating costs without a party (rent, salaries, utilities) → add_expense (or open_expense_form if incomplete).
- Prefer open_expense_form / open_voucher_form when amount, party, or description is missing.
- Date fields: YYYY-MM-DD. Default to today if user does not specify.

Action types (use exact type strings):
- navigate: { "type": "navigate", "page": "<Page name>" }
- add_expense: { "type": "add_expense", "category": "Rent"|"Salaries"|"Utilities"|"Marketing"|"Supplies"|"Other", "description": string, "amount": number, "method"?: "Cash"|"UPI"|"Card"|"Bank Transfer", "date"?: "YYYY-MM-DD" }
- add_payment_voucher: { "type": "add_payment_voucher", "voucherType": "Receipt"|"Payment", "partyType": "Customer"|"Supplier", "partyName": string, "amount": number, "method"?: "Cash"|"UPI"|"Card"|"Bank Transfer", "date"?: "YYYY-MM-DD", "referenceNumber"?: string, "notes"?: string }
- open_expense_form: { "type": "open_expense_form", ...optional expense fields }
- open_voucher_form: { "type": "open_voucher_form", "voucherType": "Receipt"|"Payment", ...optional fields }
- open_sale: { "type": "open_sale", "customerName"?: string, "customerPhone"?: string, "vehicleNumber"?: string, "vehicleModel"?: string, "saleCategory"?: string }
- open_service_job: { "type": "open_service_job" }
- inventory_search: { "type": "inventory_search", "query"?: string, "lowStockOnly"?: boolean }
- warranty_search: { "type": "warranty_search", "query": string }
- reports_filter: { "type": "reports_filter", "period"?: "today"|"last7"|"last30"|"this_week"|"prev_week"|"month"|"prev_month"|"this_year"|"prev_year", "firmId"?: string }
- view_receipt: { "type": "view_receipt", "transactionId": string }

${SNAPSHOT_GLOSSARY}`;

export function buildChatPrompt(
    snapshot: unknown,
    actionContext: unknown,
    messages: { role: string; content: string }[],
): string {
    const history = messages
        .slice(0, -1)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
    const latest = messages[messages.length - 1]?.content ?? '';
    return `${CHAT_SYSTEM}

Business snapshot:
${JSON.stringify(snapshot, null, 2)}

Action context (allowed pages, parties, categories, balances):
${JSON.stringify(actionContext, null, 2)}

${history ? `Conversation so far:\n${history}\n\n` : ''}User: ${latest}

Respond with JSON only:`;
}
