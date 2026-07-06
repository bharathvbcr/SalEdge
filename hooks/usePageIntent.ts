import { useEffect } from 'react';
import { subscribePageIntents } from '../utils/pageActions.ts';

/** Run handler on mount and whenever a cross-page intent is requested (e.g. AI chat while already on page). */
export function usePageIntent(handler: () => void) {
    useEffect(() => {
        handler();
        return subscribePageIntents(handler);
    }, [handler]);
}
