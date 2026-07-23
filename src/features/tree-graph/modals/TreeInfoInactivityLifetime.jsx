import { useEffect, useState } from 'react';
import { useTreeGraph } from '../hooks/useTreeGraph.js';
import {
    effectiveInactivityExpiresAt,
    formatInactivityRemainingMs,
    getInactivityPolicyFromMeta,
} from '../../publishing/api/inactivity-lifetime.js';

/** GDPR inactivity countdown for published network copies (pauses while learners are active today). */
export function TreeInfoInactivityLifetime() {
    const { ui, rawGraphData, getActivePublicTreeRef, nostr } = useTreeGraph();
    const treeRef = getActivePublicTreeRef?.();
    const policy = getInactivityPolicyFromMeta(rawGraphData?.meta);
    const [learnerActiveToday, setLearnerActiveToday] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!treeRef?.pub || !treeRef?.universeId || !policy) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const net = nostr;
                if (!net || typeof net.countTreeUsageUniqueLastNDaysOnce !== 'function') return;
                const used1 = await net.countTreeUsageUniqueLastNDaysOnce({
                    ownerPub: treeRef.pub,
                    universeId: treeRef.universeId,
                    days: 1,
                    maxUsersPerDay: 200,
                });
                if (!cancelled) setLearnerActiveToday(Number(used1) > 0);
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [treeRef?.pub, treeRef?.universeId, nostr, policy]);

    useEffect(() => {
        if (!policy) return undefined;
        const id = setInterval(() => setTick((n) => n + 1), 60000);
        return () => clearInterval(id);
    }, [policy]);

    if (!policy) return null;

    void tick;
    const effective = effectiveInactivityExpiresAt(policy, { learnerActiveToday });
    const remainingMs = effective != null ? Math.max(0, effective - Date.now()) : 0;
    const countdown = formatInactivityRemainingMs(remainingMs, ui);
    const paused = learnerActiveToday;

    return (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <p className="arborito-eyebrow m-0 mb-2">{ui.treeInactivityHeading || 'Online lifetime'}</p>
            <ul className="list-disc pl-4 m-0 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                <li>
                    <span className="font-semibold">{ui.treeInactivityRemainingLabel || 'Auto-retract in'}:</span>{' '}
                    {countdown}
                </li>
                <li>
                    {paused
                        ? ui.treeInactivityPausedLearners ||
                          'Timer paused, learners accessed this copy today.'
                        : ui.treeInactivityHint ||
                          'Countdown runs while nobody uses this copy (owner or learners). Use Retract to remove it sooner.'}
                </li>
            </ul>
        </div>
    );
}
