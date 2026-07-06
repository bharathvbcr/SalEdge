const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MOBILE_MAX_BYTES = 800 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image.'));
        img.src = src;
    });
}

function estimateDataUrlBytes(dataUrl: string): number {
    const base64 = dataUrl.split(',')[1] ?? '';
    return Math.ceil(base64.length * 0.75);
}

async function compressDataUrl(dataUrl: string, maxBytes: number): Promise<string> {
    if (estimateDataUrlBytes(dataUrl) <= maxBytes) return dataUrl;

    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    let { width, height } = img;
    const maxEdge = 1600;
    if (width > maxEdge || height > maxEdge) {
        const scale = maxEdge / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.85;
    let result = canvas.toDataURL('image/jpeg', quality);
    while (estimateDataUrlBytes(result) > maxBytes && quality > 0.45) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
    }

    if (estimateDataUrlBytes(result) > maxBytes) {
        throw new Error(`Image too large after compression. Max ${Math.round(maxBytes / 1024)}KB.`);
    }
    return result;
}

export async function readImageAsDataUrl(
    file: File,
    maxBytes = DEFAULT_MAX_BYTES,
    compress = false,
): Promise<string> {
    if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file.');
    }
    if (!compress && file.size > maxBytes) {
        throw new Error(`Image too large. Max ${Math.round(maxBytes / (1024 * 1024))}MB.`);
    }

    const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image.'));
        reader.readAsDataURL(file);
    });

    const targetBytes = compress ? MOBILE_MAX_BYTES : maxBytes;
    return compressDataUrl(raw, targetBytes);
}

export async function readMobileInvoiceImage(file: File): Promise<string> {
    return readImageAsDataUrl(file, MOBILE_MAX_BYTES, true);
}
