import jsPDF from 'jspdf';
import { ServiceJob, WarrantyLog, Firm } from '../types.ts';

export function generateWarrantyClaimPdf(
    job: ServiceJob,
    warrantyLog: WarrantyLog | undefined,
    firm: Firm
): void {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const margin = 15;
    let y = margin;

    const addLine = (text: string, size = 10, bold = false) => {
        pdf.setFontSize(size);
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.text(text, margin, y);
        y += size * 0.5 + 3;
    };

    pdf.setDrawColor(211, 47, 47);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, 195, y);
    y += 8;

    addLine(firm.shopDetails.name, 16, true);
    addLine('WARRANTY / RMA CLAIM DOCUMENT', 12, true);
    addLine(`Generated: ${new Date().toLocaleString('en-IN')}`, 9);
    y += 4;

    addLine('Service Job Details', 11, true);
    addLine(`Job ID: ${job.id}`);
    addLine(`Customer: ${job.customerName} (${job.customerPhone})`);
    addLine(`Vehicle: ${job.vehicleDetails}`);
    addLine(`Issue: ${job.issueDescription}`);
    addLine(`Status: ${job.status}`);
    y += 4;

    if (job.warrantyClaim) {
        addLine('Warranty Claim Details', 11, true);
        addLine(`Company: ${job.warrantyClaim.companyName || 'N/A'}`);
        addLine(`Ticket No: ${job.warrantyClaim.ticketNumber || 'N/A'}`);
        if (job.warrantyClaim.sentDate) addLine(`Sent Date: ${new Date(job.warrantyClaim.sentDate).toLocaleDateString('en-IN')}`);
        if (job.warrantyClaim.receivedDate) addLine(`Received Date: ${new Date(job.warrantyClaim.receivedDate).toLocaleDateString('en-IN')}`);
        if (job.warrantyClaim.companyRemarks) addLine(`Company Remarks: ${job.warrantyClaim.companyRemarks}`);
        y += 4;
    }

    if (warrantyLog) {
        addLine('Linked Warranty Record', 11, true);
        addLine(`Product: ${warrantyLog.productName}`);
        if (warrantyLog.saleCategory) addLine(`Category: ${warrantyLog.saleCategory}`);
        if (warrantyLog.vehicleModel || warrantyLog.vehicleNumber) {
            addLine(`Vehicle: ${[warrantyLog.vehicleModel, warrantyLog.vehicleNumber].filter(Boolean).join(' ')}`);
        }
        addLine(`Serial No: ${warrantyLog.serialNumber}`);
        addLine(`Sale Date: ${new Date(warrantyLog.saleDate).toLocaleDateString('en-IN')}`);
        addLine(`Invoice Ref: ${warrantyLog.transactionId}`);
        addLine(`Guarantee Until: ${new Date(warrantyLog.guaranteeEndDate).toLocaleDateString('en-IN')}`);
        addLine(`Warranty Until: ${new Date(warrantyLog.warrantyEndDate).toLocaleDateString('en-IN')}`);
    }

    y += 8;
    addLine('Authorized Signature: _________________________', 10);
    addLine(`For ${firm.shopDetails.name}`, 9);

    pdf.save(`warranty-claim-${job.id}.pdf`);
}
