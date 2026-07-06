// Indian State Codes for GST (Place of Supply)
export const INDIAN_STATES: { code: string; name: string; shortCode: string }[] = [
    { code: '01', name: 'Jammu & Kashmir', shortCode: 'JK' },
    { code: '02', name: 'Himachal Pradesh', shortCode: 'HP' },
    { code: '03', name: 'Punjab', shortCode: 'PB' },
    { code: '04', name: 'Chandigarh', shortCode: 'CH' },
    { code: '05', name: 'Uttarakhand', shortCode: 'UK' },
    { code: '06', name: 'Haryana', shortCode: 'HR' },
    { code: '07', name: 'Delhi', shortCode: 'DL' },
    { code: '08', name: 'Rajasthan', shortCode: 'RJ' },
    { code: '09', name: 'Uttar Pradesh', shortCode: 'UP' },
    { code: '10', name: 'Bihar', shortCode: 'BR' },
    { code: '11', name: 'Sikkim', shortCode: 'SK' },
    { code: '12', name: 'Arunachal Pradesh', shortCode: 'AR' },
    { code: '13', name: 'Nagaland', shortCode: 'NL' },
    { code: '14', name: 'Manipur', shortCode: 'MN' },
    { code: '15', name: 'Mizoram', shortCode: 'MZ' },
    { code: '16', name: 'Tripura', shortCode: 'TR' },
    { code: '17', name: 'Meghalaya', shortCode: 'ML' },
    { code: '18', name: 'Assam', shortCode: 'AS' },
    { code: '19', name: 'West Bengal', shortCode: 'WB' },
    { code: '20', name: 'Jharkhand', shortCode: 'JH' },
    { code: '21', name: 'Odisha', shortCode: 'OR' },
    { code: '22', name: 'Chhattisgarh', shortCode: 'CG' },
    { code: '23', name: 'Madhya Pradesh', shortCode: 'MP' },
    { code: '24', name: 'Gujarat', shortCode: 'GJ' },
    { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu', shortCode: 'DD' },
    { code: '27', name: 'Maharashtra', shortCode: 'MH' },
    { code: '28', name: 'Andhra Pradesh (Old)', shortCode: 'AP' },
    { code: '29', name: 'Karnataka', shortCode: 'KA' },
    { code: '30', name: 'Goa', shortCode: 'GA' },
    { code: '31', name: 'Lakshadweep', shortCode: 'LD' },
    { code: '32', name: 'Kerala', shortCode: 'KL' },
    { code: '33', name: 'Tamil Nadu', shortCode: 'TN' },
    { code: '34', name: 'Puducherry', shortCode: 'PY' },
    { code: '35', name: 'Andaman & Nicobar Islands', shortCode: 'AN' },
    { code: '36', name: 'Telangana', shortCode: 'TS' },
    { code: '37', name: 'Andhra Pradesh', shortCode: 'AD' },
    { code: '38', name: 'Ladakh', shortCode: 'LA' },
];

// Common HSN Codes for Battery Business
export const COMMON_HSN_CODES: { code: string; description: string; gstRate: number }[] = [
    { code: '8507', description: 'Electric accumulators (Lead-acid batteries)', gstRate: 28 },
    { code: '85071000', description: 'Lead-acid starter batteries', gstRate: 28 },
    { code: '85072000', description: 'Other lead-acid accumulators', gstRate: 28 },
    { code: '85073000', description: 'Nickel-cadmium accumulators', gstRate: 28 },
    { code: '85074000', description: 'Nickel-iron accumulators', gstRate: 28 },
    { code: '85076000', description: 'Lithium-ion accumulators', gstRate: 18 },
    { code: '85078000', description: 'Other accumulators', gstRate: 28 },
    { code: '8504', description: 'Electrical transformers, inverters', gstRate: 18 },
    { code: '85044090', description: 'Inverters (Other static converters)', gstRate: 18 },
    { code: '8541', description: 'Solar cells/modules', gstRate: 12 },
    { code: '9985', description: 'Repair & maintenance services', gstRate: 18 },
    { code: '9987', description: 'Other support services', gstRate: 18 },
];

// Utility: Convert number to Indian words (Lakhs/Crores)
export function numberToIndianWords(num: number): string {
    if (num === 0) return 'Zero Rupees Only';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convertLessThanHundred = (n: number): string => {
        if (n < 20) return ones[n];
        return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    };

    const convertLessThanThousand = (n: number): string => {
        if (n < 100) return convertLessThanHundred(n);
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanHundred(n % 100) : '');
    };

    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);

    let result = '';

    if (rupees >= 10000000) {
        result += convertLessThanThousand(Math.floor(rupees / 10000000)) + ' Crore ';
        num = rupees % 10000000;
    } else {
        num = rupees;
    }

    if (num >= 100000) {
        result += convertLessThanHundred(Math.floor(num / 100000)) + ' Lakh ';
        num = num % 100000;
    }

    if (num >= 1000) {
        result += convertLessThanHundred(Math.floor(num / 1000)) + ' Thousand ';
        num = num % 1000;
    }

    if (num > 0) {
        result += convertLessThanThousand(num);
    }

    result = result.trim() + ' Rupees';

    if (paise > 0) {
        result += ' and ' + convertLessThanHundred(paise) + ' Paise';
    }

    return result + ' Only';
}

// Utility: Get state code from GSTIN
export function getStateCodeFromGSTIN(gstin: string): string | null {
    if (!gstin || gstin.length < 2) return null;
    return gstin.substring(0, 2);
}

// Utility: Check if transaction is interstate
export function isInterstateTransaction(sellerStateCode: string, buyerStateCode: string): boolean {
    return sellerStateCode !== buyerStateCode;
}

// Utility: Calculate GST split
export function calculateGSTSplit(
    amount: number,
    gstRate: number,
    isInterstate: boolean
): { cgst: number; sgst: number; igst: number; total: number } {
    const totalTax = amount * (gstRate / 100);

    if (isInterstate) {
        return { cgst: 0, sgst: 0, igst: totalTax, total: totalTax };
    } else {
        const halfTax = totalTax / 2;
        return { cgst: halfTax, sgst: halfTax, igst: 0, total: totalTax };
    }
}
