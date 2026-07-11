import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, Firm } from '../types.ts';
import { IconDownload, IconPrint } from './icons.tsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useConfig } from '../context/ConfigContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useMasterData } from '../context/MasterDataContext.tsx';
import { useAppData } from '../context/AppDataContext.tsx';
import { INDIAN_STATES, isInterstateTransaction } from '../indianGST.ts';
import { generateEInvoice, generateEWayBill, requiresEInvoice, requiresEWayBill } from '../utils/eInvoiceService.ts';
import { Modal, ModalHeader, ModalFooter } from './Modal.tsx';

interface TransactionDetailModalProps {
    transaction: Transaction;
    onClose: () => void;
    onEdit: (transaction: Transaction) => void;
    onDelete?: (transaction: Transaction) => void;
    autoPrint?: boolean;
}

// Utility to convert number to Indian words
const numberToWords = (num: number): string => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = num.toString() as any).length > 9) return 'Overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';

    let str = '';
    str += (Number(n[1]) !== 0) ? (a[Number(n[1])] || b[n[1][0] as any] + ' ' + a[n[1][1] as any]) + 'Crore ' : '';
    str += (Number(n[2]) !== 0) ? (a[Number(n[2])] || b[n[2][0] as any] + ' ' + a[n[2][1] as any]) + 'Lakh ' : '';
    str += (Number(n[3]) !== 0) ? (a[Number(n[3])] || b[n[3][0] as any] + ' ' + a[n[3][1] as any]) + 'Thousand ' : '';
    str += (Number(n[4]) !== 0) ? (a[Number(n[4])] || b[n[4][0] as any] + ' ' + a[n[4][1] as any]) + 'Hundred ' : '';
    str += (Number(n[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0] as any] + ' ' + a[n[5][1] as any]) : '';

    return str.trim() ? str + 'Only' : '';
};

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ transaction, onEdit, onClose, onDelete, autoPrint = false }) => {
    const { config } = useConfig();
    const { userRole } = useAuth();
    const { productTypes } = useMasterData();
    const { addToast } = useToast();
    const { updateTransactionCompliance, transactions } = useAppData();
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingEInvoice, setIsGeneratingEInvoice] = useState(false);
    const [isGeneratingEWayBill, setIsGeneratingEWayBill] = useState(false);

    const liveTransaction = useMemo(
        () => transactions.find(t => t.id === transaction.id) || transaction,
        [transactions, transaction]
    );
    const tx = liveTransaction;

    const firm = useMemo(() => config.firms.find(f => f.id === liveTransaction.firmId) as Firm, [config.firms, liveTransaction.firmId]);
    const loyaltySettings = config.preferences.loyaltyProgram;

    const { itemsTotal, totalItemDiscount, overallDiscountAmount, totalCost, estimatedProfit, pointsValue, netSubtotal, buybackTotal } = useMemo(() => {
        let runningItemsTotal = 0;
        let runningItemDiscount = 0;
        let runningTotalCost = 0;
        let runningRegularItemsGross = 0;
        let runningBuybackTotal = 0;

        tx.items.forEach(item => {
            const itemGross = item.price * item.quantity;
            let itemDiscountAmount = 0;
            if (item.discount) {
                if (item.discount.type === 'percentage') {
                    itemDiscountAmount = itemGross * (item.discount.value / 100);
                } else {
                    itemDiscountAmount = item.discount.value * item.quantity;
                }
            }

            if (item.isBuyback) {
                runningBuybackTotal += itemGross;
            } else {
                runningRegularItemsGross += itemGross;
                runningItemDiscount += itemDiscountAmount;
                if (item.purchasePrice !== undefined) {
                    runningTotalCost += item.purchasePrice * item.quantity;
                }
            }

            runningItemsTotal += itemGross;
        });

        const netSubtotalCalc = runningItemsTotal - runningItemDiscount;

        const additionalChargesAmount = tx.additionalCharges?.amount || 0;

        let runningOverallDiscount = 0;
        const baseForOverallDiscount = netSubtotalCalc + additionalChargesAmount;

        if (tx.discount.type === 'percentage') {
            runningOverallDiscount = baseForOverallDiscount * (tx.discount.value / 100);
        } else {
            runningOverallDiscount = tx.discount.value;
        }

        const pointsVal = (tx.redeemedPoints || 0) * (loyaltySettings.redemptionValue || 1);

        const revenueForProfit = tx.priceIncludesTax
            ? tx.total - tx.taxAmount
            : (runningRegularItemsGross - runningItemDiscount) + additionalChargesAmount - runningOverallDiscount - pointsVal;
        const profit = revenueForProfit - runningTotalCost;

        return {
            itemsTotal: runningItemsTotal,
            totalItemDiscount: runningItemDiscount,
            netSubtotal: netSubtotalCalc,
            overallDiscountAmount: runningOverallDiscount,
            pointsValue: pointsVal,
            totalCost: runningTotalCost,
            estimatedProfit: profit,
            buybackTotal: runningBuybackTotal,
        };
    }, [tx, loyaltySettings]);

    const handleDownloadPdf = () => {
        // ... (existing logic)
        const receiptElement = document.getElementById('receipt-content');
        if (!receiptElement) {
            addToast('Could not find receipt content to generate PDF.', 'error');
            return;
        }

        setIsGeneratingPdf(true);

        html2canvas(receiptElement, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true, // Crucial for loading QR Code image
            onclone: (clonedDoc) => {
                const hiddenElements = clonedDoc.querySelectorAll('.print-hidden');
                hiddenElements.forEach((el: any) => el.style.display = 'none');
            }
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();

            const margin = 10;
            const contentWidth = pdfWidth - (margin * 2);
            const contentHeight = (canvas.height * contentWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, contentHeight);
            pdf.save(`invoice-${tx.id}.pdf`);
        }).catch(err => {
            console.error('PDF generation failed:', err);
            addToast('Failed to generate PDF.', 'error');
        }).finally(() => {
            setIsGeneratingPdf(false);
        });
    };

    const handleShareWhatsapp = () => {
        const message = `Hello ${tx.customerName},\nHere is your invoice #${tx.invoiceNumber || tx.id} from ${firm.shopDetails.name}.\nDate: ${new Date(tx.date).toLocaleDateString()}\nTotal Amount: ${firm.financials.currencySymbol}${tx.total.toFixed(2)}\n\nThank you for your business!`;
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/${tx.customerPhone ? '91' + tx.customerPhone : ''}?text=${encodedMessage}`, '_blank');
    };

    const handlePrint = () => {
        window.print();
    };

    const handlePrintAndClose = () => {
        window.print();
        onClose();
    };

    useEffect(() => {
        if (autoPrint) {
            setTimeout(() => {
                window.print();
            }, 500);
        }
    }, [autoPrint]);

    const isQuotation = tx.status === 'Quotation';

    // Helper to find HSN from product type
    const getHsn = (itemName: string) => {
        const match = productTypes.find(pt => `${pt.brandName} ${pt.name}` === itemName || pt.name === itemName);
        return match?.hsnCode || '';
    }

    const amountInWords = useMemo(() => numberToWords(Math.round(tx.total)), [tx.total]);

    const handleGenerateEInvoice = async () => {
        setIsGeneratingEInvoice(true);
        try {
            updateTransactionCompliance(tx.id, { eInvoiceStatus: 'Pending' });
            const result = await generateEInvoice(transaction, {
                apiKey: config.preferences.eInvoiceApiKey,
                gspUrl: config.preferences.eInvoiceGspUrl,
            });
            updateTransactionCompliance(tx.id, {
                eInvoiceIrn: result.irn,
                eInvoiceAckNo: result.ackNo,
                eInvoiceAckDate: result.ackDate,
                eInvoiceStatus: 'Generated',
            });
            addToast('E-Invoice IRN generated successfully!', 'success');
        } catch (e) {
            updateTransactionCompliance(tx.id, { eInvoiceStatus: 'Failed' });
            addToast('E-Invoice generation failed.', 'error');
        } finally {
            setIsGeneratingEInvoice(false);
        }
    };

    const handleGenerateEWayBill = async () => {
        setIsGeneratingEWayBill(true);
        try {
            updateTransactionCompliance(tx.id, { eWayBillStatus: 'Pending' });
            const result = await generateEWayBill(transaction, {
                apiKey: config.preferences.eInvoiceApiKey,
                gspUrl: config.preferences.eInvoiceGspUrl,
            });
            updateTransactionCompliance(tx.id, {
                eWayBillNo: result.eWayBillNo,
                eWayBillDate: result.eWayBillDate,
                eWayBillStatus: 'Generated',
            });
            addToast('E-Way Bill generated successfully!', 'success');
        } catch (e) {
            updateTransactionCompliance(tx.id, { eWayBillStatus: 'Failed' });
            addToast('E-Way Bill generation failed.', 'error');
        } finally {
            setIsGeneratingEWayBill(false);
        }
    };

    const upiQrCodeUrl = useMemo(() => {
        if (!firm.financials.upiId || isQuotation || tx.type === 'Return') return null;

        const upiId = firm.financials.upiId;
        const name = encodeURIComponent(firm.shopDetails.name);
        const amount = tx.total.toFixed(2);
        const note = encodeURIComponent(`Invoice ${tx.invoiceNumber || tx.id}`);

        const upiString = `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&tn=${note}`;

        // Using a reliable public QR code API
        return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiString)}`;
    }, [firm, transaction, isQuotation]);


    return (
        <Modal
            onClose={onClose}
            size="lg"
            ariaLabel={isQuotation ? 'Quotation Details' : 'Transaction Details'}
            overlayClassName="print-overlay print:p-0 print:bg-white print:static"
            className="print-visible-modal print:shadow-none print:max-h-none print:max-w-none print:w-full print:rounded-none"
            closeOnBackdrop={false}
        >
                <ModalHeader title={isQuotation ? 'Quotation Details' : 'Transaction Details'} onClose={onClose} className="print-hidden" />
                <div className="flex-1 overflow-y-auto p-6 space-y-6 print:p-0 print:overflow-visible max-h-[70vh]">
                    <div id="receipt-content" className="p-6 bg-white text-gray-800 text-sm print:p-8">
                        <div className="flex justify-between items-start pb-6 border-b border-gray-200">
                            <div className="flex flex-col items-start w-1/2">
                                <img 
                                    src={firm.shopDetails.logo || "/logo.svg"} 
                                    alt="Shop Logo" 
                                    className="h-16 w-auto object-contain mb-3" 
                                />
                                <h3 className="text-2xl font-bold text-black">{firm.shopDetails.name}</h3>
                                <p className="text-gray-600 whitespace-pre-line">{firm.shopDetails.address}</p>
                                <p className="text-gray-600">Ph: {firm.shopDetails.phone}</p>
                                {firm.shopDetails.gstin && <p className="font-semibold mt-1">GSTIN: {firm.shopDetails.gstin}</p>}
                            </div>
                            <div className="text-right w-1/2">
                                <h4 className="text-xl font-bold uppercase tracking-wide text-gray-500">{isQuotation ? 'Quotation' : 'Tax Invoice'}</h4>
                                <p className="font-mono font-bold text-black mt-1">#{tx.invoiceNumber || tx.id}</p>
                                <p className="text-gray-600">{new Date(tx.date).toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mt-6">
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Billed To</h4>
                                <p className="font-bold text-lg text-black">{tx.customerName}</p>
                                {tx.customerPhone && <p>{tx.customerPhone}</p>}
                                {tx.billingAddress && <p className="text-gray-600 mt-1">{tx.billingAddress}</p>}
                                {tx.customerGst && <p className="font-semibold mt-1">GSTIN: {tx.customerGst}</p>}
                            </div>
                            <div>
                                {(tx.vehicleNumber || tx.vehicleModel || tx.saleCategory) && (
                                    <div className="mb-3">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Vehicle Details</h4>
                                        {tx.saleCategory && <p className="text-xs text-gray-500 uppercase tracking-wide">{tx.saleCategory}</p>}
                                        {tx.vehicleNumber && <p className="font-semibold">{tx.vehicleNumber}</p>}
                                        {tx.vehicleModel && <p className="text-gray-600">{tx.vehicleModel}</p>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-8">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-black">
                                        <th className="pb-2 text-left font-bold text-gray-600 uppercase text-xs">Item Description</th>
                                        <th className="pb-2 text-center font-bold text-gray-600 uppercase text-xs">HSN/SAC</th>
                                        <th className="pb-2 text-center font-bold text-gray-600 uppercase text-xs">Qty</th>
                                        <th className="pb-2 text-right font-bold text-gray-600 uppercase text-xs">Rate</th>
                                        <th className="pb-2 text-right font-bold text-gray-600 uppercase text-xs">Discount</th>
                                        <th className="pb-2 text-right font-bold text-gray-600 uppercase text-xs">Net Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {tx.items.map((item, index) => {
                                        const gross = item.price * item.quantity;
                                        let discountAmount = 0;
                                        if (item.discount) {
                                            if (item.discount.type === 'percentage') {
                                                discountAmount = gross * (item.discount.value / 100);
                                            } else {
                                                discountAmount = item.discount.value * item.quantity;
                                            }
                                        }
                                        const net = gross - discountAmount;

                                        let itemProfit = null;
                                        if (!item.isBuyback && !item.isCustom && item.purchasePrice !== undefined) {
                                            const cost = item.purchasePrice * item.quantity;
                                            const exTaxNet = tx.priceIncludesTax && firm.financials.gstRate > 0
                                                ? net / (1 + firm.financials.gstRate / 100)
                                                : net;
                                            itemProfit = exTaxNet - cost;
                                        }

                                        const specs = [
                                            item.specifications?.capacity,
                                            item.specifications?.technology,
                                            item.specifications?.cRating
                                        ].filter(Boolean).join(' / ');

                                        const hsn = getHsn(item.name);

                                        return (
                                            <tr key={item.id + index} className="border-b border-gray-200">
                                                <td className="py-3 pr-2">
                                                    <p className="font-bold text-black">{item.name}</p>
                                                    {specs && <p className="text-xs text-gray-600">{specs}</p>}
                                                    {item.serialNumbers && <p className="font-mono text-xs text-gray-500 mt-0.5">SN: {item.serialNumbers}</p>}
                                                    {item.isBuyback && (item.buybackBrand || item.buybackCapacity || item.buybackSerialNumber) && (
                                                        <p className="text-xs text-gray-500 italic">
                                                            Old Battery: {
                                                                [item.buybackBrand, item.buybackCapacity, item.buybackSerialNumber]
                                                                    .filter(Boolean).join(' / ')
                                                            }
                                                        </p>
                                                    )}
                                                    {item.notes && <p className="text-xs text-gray-500 italic mt-1">Note: {item.notes}</p>}
                                                </td>
                                                <td className="py-3 text-center align-top text-xs text-gray-500">{hsn}</td>
                                                <td className="py-3 text-center align-top">{item.quantity}</td>
                                                <td className="py-3 text-right align-top">{firm.financials.currencySymbol}{Math.abs(item.price).toFixed(2)}</td>
                                                <td className="py-3 text-right align-top text-red-500">
                                                    {discountAmount > 0 ? `-${firm.financials.currencySymbol}${discountAmount.toFixed(2)}` : '-'}
                                                    {discountAmount > 0 && item.discount?.type === 'percentage' && <span className="text-[10px] block">({item.discount.value}%)</span>}
                                                </td>
                                                <td className="py-3 text-right align-top">
                                                    <div className="font-medium">{item.isBuyback ? '-' : ''}{firm.financials.currencySymbol}{Math.abs(net).toFixed(2)}</div>
                                                    {true && itemProfit !== null && (
                                                        <div className={`text-[10px] print-hidden mt-1 font-semibold ${itemProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            Profit: {firm.financials.currencySymbol}{itemProfit.toFixed(2)}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end mt-6">
                            <div className="w-1/2 space-y-2">
                                <div className="flex justify-between text-gray-600">
                                    <span>{tx.priceIncludesTax ? 'Items Total (Incl. GST)' : 'Gross Subtotal'}</span>
                                    <span>{firm.financials.currencySymbol}{(tx.priceIncludesTax ? itemsTotal - buybackTotal : itemsTotal).toFixed(2)}</span>
                                </div>
                                {totalItemDiscount > 0 && (
                                    <div className="flex justify-between text-red-500 text-sm"><span>Item Discounts</span><span>- {firm.financials.currencySymbol}{totalItemDiscount.toFixed(2)}</span></div>
                                )}
                                <div className="flex justify-between text-black font-semibold border-t border-dashed border-gray-300 pt-1 mt-1">
                                    <span>{tx.priceIncludesTax ? 'Subtotal (Incl. GST)' : 'Net Subtotal'}</span>
                                    <span>{firm.financials.currencySymbol}{netSubtotal.toFixed(2)}</span>
                                </div>

                                {tx.additionalCharges && tx.additionalCharges.amount > 0 && (
                                    <div className="flex justify-between text-gray-600 mt-2">
                                        <span>{tx.additionalCharges.description}</span>
                                        <span>+ {firm.financials.currencySymbol}{tx.additionalCharges.amount.toFixed(2)}</span>
                                    </div>
                                )}

                                {tx.clubBuybackDiscount ? (
                                    (buybackTotal < 0 || overallDiscountAmount > 0) && (
                                        <div className="flex justify-between text-red-500">
                                            <span>Buyback &amp; Discount</span>
                                            <span>- {firm.financials.currencySymbol}{(Math.abs(buybackTotal) + overallDiscountAmount).toFixed(2)}</span>
                                        </div>
                                    )
                                ) : (
                                    <>
                                        {buybackTotal < 0 && (
                                            <div className="flex justify-between text-green-600">
                                                <span>Buyback Credit</span>
                                                <span>- {firm.financials.currencySymbol}{Math.abs(buybackTotal).toFixed(2)}</span>
                                            </div>
                                        )}
                                        {overallDiscountAmount > 0 && (
                                            <div className="flex justify-between text-red-500"><span>Overall Discount</span><span>- {firm.financials.currencySymbol}{overallDiscountAmount.toFixed(2)}</span></div>
                                        )}
                                    </>
                                )}
                                {pointsValue > 0 && (
                                    <div className="flex justify-between text-blue-600"><span>Loyalty Points Redeemed ({tx.redeemedPoints})</span><span>- {firm.financials.currencySymbol}{pointsValue.toFixed(2)}</span></div>
                                )}

                                {tx.priceIncludesTax && tx.taxRegime === 'Regular' && tx.taxAmount !== 0 && (
                                    <div className="flex justify-between text-gray-600 text-sm border-t border-dashed border-gray-300 pt-2 mt-2">
                                        <span>Taxable Value</span>
                                        <span>{firm.financials.currencySymbol}{(tx.total - tx.taxAmount).toFixed(2)}</span>
                                    </div>
                                )}

                                {/* GST Breakup - Show CGST/SGST or IGST based on interstate */}
                                {tx.taxRegime === 'Regular' && tx.taxAmount > 0 && (
                                    (() => {
                                        const sellerStateCode = firm.shopDetails.gstin?.substring(0, 2) || '';
                                        const buyerStateCode = tx.placeOfSupply || tx.customerGst?.substring(0, 2) || sellerStateCode;
                                        const isInterstate = sellerStateCode !== buyerStateCode;
                                        const placeOfSupplyName = INDIAN_STATES.find(s => s.code === buyerStateCode)?.name;
                                        const halfTax = tx.taxAmount / 2;
                                        const taxPrefix = tx.priceIncludesTax ? '' : '+ ';

                                        return (
                                            <>
                                                {placeOfSupplyName && (
                                                    <div className="flex justify-between text-gray-500 text-xs mb-1">
                                                        <span>Place of Supply</span>
                                                        <span>{buyerStateCode} - {placeOfSupplyName}</span>
                                                    </div>
                                                )}
                                                {isInterstate ? (
                                                    <div className="flex justify-between text-gray-600">
                                                        <span>IGST ({firm.financials.gstRate}%)</span>
                                                        <span>{taxPrefix}{firm.financials.currencySymbol}{tx.taxAmount.toFixed(2)}</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex justify-between text-gray-600 text-sm">
                                                            <span>CGST ({firm.financials.gstRate / 2}%)</span>
                                                            <span>{taxPrefix}{firm.financials.currencySymbol}{halfTax.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-gray-600 text-sm">
                                                            <span>SGST ({firm.financials.gstRate / 2}%)</span>
                                                            <span>{taxPrefix}{firm.financials.currencySymbol}{halfTax.toFixed(2)}</span>
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        );
                                    })()
                                )}
                                {tx.taxRegime === 'Composition' && tx.taxAmount > 0 && (
                                    <div className="flex justify-between text-gray-600"><span>Tax (Composition)</span><span>+ {firm.financials.currencySymbol}{tx.taxAmount.toFixed(2)}</span></div>
                                )}
                                {tx.taxAmount === 0 && (
                                    <div className="flex justify-between text-gray-600"><span>Tax</span><span>{firm.financials.currencySymbol}0.00</span></div>
                                )}
                                <div className="flex justify-between items-center text-xl font-bold border-t-2 border-black pt-2 mt-2 text-black"><span>Total</span><span>{firm.financials.currencySymbol}{tx.total.toFixed(2)}</span></div>

                                <div className="text-right text-xs italic text-gray-500 mt-1">
                                    (Rupees {amountInWords})
                                </div>

                                {true && (
                                    <div className="flex justify-between items-center text-sm font-semibold pt-2 border-t border-gray-300 border-dashed print-hidden">
                                        <span className="text-gray-500">Total Estimated Profit</span>
                                        <span className={estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                            {firm.financials.currencySymbol}{estimatedProfit.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between items-end pt-6 mt-8 border-t border-gray-200">
                            <div className="w-2/3 pr-4">
                                {/* UPI QR Code */}
                                {upiQrCodeUrl && !isQuotation && (
                                    <div className="mb-6 flex items-center gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 w-fit">
                                        <img src={upiQrCodeUrl} alt="UPI QR" className="h-24 w-24 mix-blend-multiply" />
                                        <div>
                                            <p className="font-bold text-sm text-black">Scan to Pay</p>
                                            <p className="text-xs text-gray-600">UPI: {firm.financials.upiId}</p>
                                            <p className="text-xs text-gray-600 mt-1">Total: {firm.financials.currencySymbol}{tx.total.toFixed(2)}</p>
                                        </div>
                                    </div>
                                )}

                                {tx.notes && (
                                    <div className="mb-4">
                                        <p className="font-bold text-xs uppercase text-gray-400 mb-1">Notes</p>
                                        <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-2 rounded">{tx.notes}</p>
                                    </div>
                                )}

                                {!isQuotation && (
                                    <div>
                                        <p className="font-bold text-xs uppercase text-gray-400 mb-1">Payment Details</p>
                                        {tx.payments.length > 0 ? (
                                            <ul className="space-y-1 text-gray-700 text-xs">
                                                {tx.payments.map((p, i) => (
                                                    <li key={i}>
                                                        Paid via <span className="font-semibold">{p.method}</span>: {firm.financials.currencySymbol}{p.amount.toFixed(2)}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-gray-600 text-xs">No payment recorded.</p>}
                                    </div>
                                )}
                            </div>

                            <div className="text-right">
                                {!isQuotation && (
                                    <>
                                        <p className="font-bold text-xs uppercase text-gray-400 mb-1">Balance Due</p>
                                        <p className={`text-lg font-bold ${tx.status === 'Paid' ? 'text-green-600' : 'text-red-600'}`}>
                                            {firm.financials.currencySymbol}{(tx.total - tx.payments.reduce((s, p) => s + p.amount, 0)).toFixed(2)}
                                        </p>
                                        {tx.status === 'Due' && tx.paymentDueDate && (
                                            <p className="text-xs text-red-500 mt-1 font-medium">Due Date: {new Date(tx.paymentDueDate).toLocaleDateString()}</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="text-left mt-8 text-xs text-gray-500 border-t border-gray-200 pt-4">
                            <p className="font-bold uppercase mb-1">Terms & Conditions:</p>
                            {firm.shopDetails.invoiceTerms ? (
                                <p className="whitespace-pre-wrap">{firm.shopDetails.invoiceTerms}</p>
                            ) : (
                                <>
                                    <p>1. Goods once sold will not be taken back.</p>
                                    <p>2. Warranty as per manufacturer policy only. Physical damage not covered.</p>
                                    <p>3. Subject to local jurisdiction.</p>
                                </>
                            )}
                        </div>

                        <div className="text-center mt-8 font-bold text-sm">
                            Thank you for your business!
                        </div>

                        {/* E-Invoice / E-Way Bill compliance block */}
                        {!isQuotation && tx.type === 'Sale' && (
                            <div className="mt-6 p-4 border border-dashed border-gray-300 rounded-lg print-hidden">
                                <p className="font-bold text-xs uppercase text-gray-500 mb-2">GST Compliance</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <p className="font-semibold text-gray-700">E-Invoice (IRN)</p>
                                        <p className="text-gray-600">Status: <span className="font-bold">{tx.eInvoiceStatus || 'Not Generated'}</span></p>
                                        {tx.eInvoiceIrn && (
                                            <p className="font-mono text-[10px] break-all mt-1">IRN: {tx.eInvoiceIrn}</p>
                                        )}
                                        {tx.eInvoiceAckNo && (
                                            <p className="text-gray-500">Ack: {tx.eInvoiceAckNo} ({tx.eInvoiceAckDate ? new Date(tx.eInvoiceAckDate).toLocaleDateString() : ''})</p>
                                        )}
                                        {requiresEInvoice(tx) && !tx.eInvoiceIrn && (
                                            <p className="text-amber-600 mt-1">Required for B2B invoices ≥ ₹50,000</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-700">E-Way Bill</p>
                                        <p className="text-gray-600">Status: <span className="font-bold">{tx.eWayBillStatus || 'Not Generated'}</span></p>
                                        {tx.eWayBillNo && (
                                            <p className="font-mono mt-1">No: {tx.eWayBillNo}</p>
                                        )}
                                        {requiresEWayBill(tx) && !tx.eWayBillNo && (
                                            <p className="text-amber-600 mt-1">Required for goods movement ≥ ₹50,000</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <ModalFooter className="print-hidden flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                    {isQuotation ? (
                        <button type="button" onClick={() => onEdit(tx)} className="btn-success">
                            Convert to Sale
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => onEdit(tx)} className="btn-secondary">
                                Edit Sale
                            </button>
                            {true && tx.type === 'Sale' && tx.status !== 'Quotation' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleGenerateEInvoice}
                                        disabled={isGeneratingEInvoice || tx.eInvoiceStatus === 'Generated'}
                                        className="btn-sm btn-indigo disabled:opacity-50"
                                    >
                                        {isGeneratingEInvoice ? 'Generating IRN...' : tx.eInvoiceIrn ? 'IRN Generated' : 'Generate E-Invoice'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleGenerateEWayBill}
                                        disabled={isGeneratingEWayBill || tx.eWayBillStatus === 'Generated'}
                                        className="btn-sm btn-purple disabled:opacity-50"
                                    >
                                        {isGeneratingEWayBill ? 'Generating...' : tx.eWayBillNo ? 'E-Way Generated' : 'Generate E-Way Bill'}
                                    </button>
                                </>
                            )}
                            {true && onDelete && (
                                <button type="button" onClick={() => onDelete?.(tx)} className="btn-sm btn-danger">
                                    Delete
                                </button>
                            )}
                        </>
                    )}
                    </div>
                    <div className="flex gap-3 ml-auto flex-wrap">
                        <button onClick={handleShareWhatsapp} className="btn-success">
                            WhatsApp
                        </button>
                        {autoPrint ? (
                            <button type="button" onClick={handlePrintAndClose} className="btn-primary">
                                <IconPrint className="h-4 w-4" /> Print & Close
                            </button>
                        ) : (
                            <button type="button" onClick={handlePrint} className="btn-secondary">
                                <IconPrint className="h-4 w-4" /> Print
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            className="btn-secondary disabled:opacity-50"
                            disabled={isGeneratingPdf}
                        >
                            {isGeneratingPdf ? 'Generating...' : <><IconDownload className="h-4 w-4" /> Download PDF</>}
                        </button>
                        {!autoPrint && (
                            <button type="button" onClick={onClose} className="btn-primary">Close</button>
                        )}
                    </div>
                </ModalFooter>
        </Modal>
    );
};