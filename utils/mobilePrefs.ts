const PREFS_KEY = 'bsms_mobile_prefs';

export interface MobilePrefs {
    continuousScan: boolean;
    scanSound: boolean;
    fullscreenScanner: boolean;
}

const DEFAULTS: MobilePrefs = {
    continuousScan: false,
    scanSound: true,
    fullscreenScanner: false,
};

export function getMobilePrefs(): MobilePrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
        return { ...DEFAULTS };
    }
}

export function setMobilePrefs(partial: Partial<MobilePrefs>): MobilePrefs {
    const next = { ...getMobilePrefs(), ...partial };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
}
