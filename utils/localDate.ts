/**
 * Local-calendar date helpers.
 *
 * Transactions store `date` as the UTC-midnight ISO of the LOCAL calendar day
 * chosen at entry (`new Date('YYYY-MM-DD').toISOString()`), so string
 * prefixes like '2026-08-22' mean the shop's local day. Formatting "now" via
 * toISOString() shifts IST evenings/mornings into the previous/next UTC day
 * and misaligns every range filter — always derive keys from local getters.
 */
export function toDateKeyLocal(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function todayKeyLocal(): string {
    return toDateKeyLocal(new Date());
}
