import { useEffect, useState } from 'react';
import { resolveLessonMediaSrc } from '../api/lesson-local-media-store.js';

/** Resolve ./media/… via IndexedDB blob when present; otherwise keep the path. */
export function useResolvedLessonMediaSrc(src, branchId) {
    const [resolved, setResolved] = useState(() => String(src || '').trim());
    useEffect(() => {
        let cancelled = false;
        const raw = String(src || '').trim();
        setResolved(raw);
        if (!raw) return undefined;
        resolveLessonMediaSrc(raw, branchId).then((url) => {
            if (!cancelled && url) setResolved(url);
        });
        return () => {
            cancelled = true;
        };
    }, [src, branchId]);
    return resolved;
}
