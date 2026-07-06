const OPEN_PURCHASE_KEY = 'bsms_mobile_open_purchase';
const OPEN_PURCHASE_UPLOAD_KEY = 'bsms_mobile_open_purchase_upload';

export function requestOpenPurchase(uploadId?: string) {
    sessionStorage.setItem(OPEN_PURCHASE_KEY, '1');
    if (uploadId) {
        sessionStorage.setItem(OPEN_PURCHASE_UPLOAD_KEY, uploadId);
    } else {
        sessionStorage.removeItem(OPEN_PURCHASE_UPLOAD_KEY);
    }
}

export function consumeOpenPurchaseRequest(): { open: boolean; uploadId?: string } {
    const open = sessionStorage.getItem(OPEN_PURCHASE_KEY) === '1';
    if (!open) return { open: false };
    sessionStorage.removeItem(OPEN_PURCHASE_KEY);
    const uploadId = sessionStorage.getItem(OPEN_PURCHASE_UPLOAD_KEY) ?? undefined;
    sessionStorage.removeItem(OPEN_PURCHASE_UPLOAD_KEY);
    return { open: true, uploadId };
}
