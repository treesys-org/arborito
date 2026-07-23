/** Minimum score to pass when a quiz block has no custom `pass_rate` (aligned with exams). */
export const QUIZ_PASS_RATE = 0.8;
export const QUIZ_PASS_RATE_DEFAULT_PERCENT = 80;

/** @param {number|null|undefined} rawPercent 0–100; null/undefined → default */
export function normalizeQuizPassRatePercent(rawPercent) {
    if (rawPercent == null || rawPercent === '') return QUIZ_PASS_RATE_DEFAULT_PERCENT;
    const num = typeof rawPercent === 'number' ? rawPercent : parseFloat(String(rawPercent).replace('%', '').trim());
    if (Number.isNaN(num)) return QUIZ_PASS_RATE_DEFAULT_PERCENT;
    const pct = num <= 1 && num > 0 ? num * 100 : num;
    return Math.min(100, Math.max(0, Math.round(pct)));
}

/** @param {object|null|undefined} challengeOrBlock normalized challenge or parser block */
export function resolveQuizPassRate(challengeOrBlock) {
    const raw = challengeOrBlock?.pass_rate ?? challengeOrBlock?.challenge?.pass_rate;
    return normalizeQuizPassRatePercent(raw) / 100;
}

export function countQuizCorrect(ids, getQuizState) {
    return ids.filter((id) => !!getQuizState(id)?.correct).length;
}

export function quizSessionScore(ids, getQuizState) {
    const total = ids.length;
    const correct = countQuizCorrect(ids, getQuizState);
    const rate = total > 0 ? correct / total : 0;
    return { correct, total, rate };
}

export function didPassQuizSession(ids, getQuizState, passRate = QUIZ_PASS_RATE) {
    const { total, rate } = quizSessionScore(ids, getQuizState);
    if (!total) return true;
    return rate >= passRate;
}

/** Tier for summary UI: perfect | pass | fail */
export function quizPassTier(rate, passRate = QUIZ_PASS_RATE) {
    if (rate >= 1) return 'perfect';
    if (rate >= passRate) return 'pass';
    return 'fail';
}
