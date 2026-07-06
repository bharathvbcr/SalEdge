const LAST_PAYMENT_METHOD_KEY = 'bsms_last_payment_method';

export type PaymentMethod = 'Cash' | 'Card' | 'UPI';

export function getLastPaymentMethod(): PaymentMethod {
    try {
        const v = localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
        if (v === 'Cash' || v === 'Card' || v === 'UPI') return v;
    } catch {
        /* ignore */
    }
    return 'Cash';
}

export function saveLastPaymentMethod(method: PaymentMethod) {
    try {
        localStorage.setItem(LAST_PAYMENT_METHOD_KEY, method);
    } catch {
        /* ignore */
    }
}
