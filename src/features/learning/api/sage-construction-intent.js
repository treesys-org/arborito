/** @typedef {{ action: 'create-lesson'|'create-folder'|'create-exam', label?: string }} SageConstructionProposal */

const AFFIRMATIVE = /^(s[ií]|yes|ok|dale|confirmo|procede|hazlo|adelante|claro|vale|bueno)\b/i;
const NEGATIVE = /^(no|cancel|cancelar|mejor no|stop|nada)\b/i;

const CREATE_PATTERNS = [
    { action: 'create-lesson', re: /\b(crea|crear|añade|añadir|add|new)\b.{0,40}\b(lecci[oó]n|lesson)\b/i },
    { action: 'create-folder', re: /\b(crea|crear|añade|añadir|add|new)\b.{0,40}\b(m[oó]dulo|carpeta|folder|branch)\b/i },
    { action: 'create-exam', re: /\b(crea|crear|añade|añadir|add|new)\b.{0,40}\b(examen|exam)\b/i },
];

/**
 * @param {string} text
 * @returns {SageConstructionProposal | null}
 */
export function detectConstructionCreateIntent(text) {
    const msg = String(text || '').trim();
    if (!msg || msg.length < 6) return null;
    for (const { action, re } of CREATE_PATTERNS) {
        if (re.test(msg)) return { action };
    }
    return null;
}

/** @param {string} text */
export function isAffirmativeReply(text) {
    const t = String(text || '').trim();
    return !!t && AFFIRMATIVE.test(t) && !NEGATIVE.test(t);
}

/** @param {string} text */
export function isNegativeReply(text) {
    const t = String(text || '').trim();
    return !!t && NEGATIVE.test(t);
}

/**
 * @param {SageConstructionProposal} proposal
 * @param {Record<string, string>} ui
 */
export function describeConstructionProposal(proposal, ui = {}) {
    if (proposal.action === 'create-folder') {
        return (
            ui.sageConstructProposeFolder ||
            'I can add a new module (branch) under the selected node on the map. Proceed?'
        );
    }
    if (proposal.action === 'create-exam') {
        return (
            ui.sageConstructProposeExam ||
            'I can add a new exam lesson under the selected module. Proceed?'
        );
    }
    return (
        ui.sageConstructProposeLesson ||
        'I can add a new lesson under the selected module. Proceed?'
    );
}

/**
 * @param {SageConstructionProposal} proposal
 * @param {Record<string, string>} ui
 */
export function describeConstructionDone(proposal, ui = {}) {
    if (proposal.action === 'create-folder') {
        return ui.sageConstructDoneFolder || 'Module created on the map. You can rename it and add content.';
    }
    if (proposal.action === 'create-exam') {
        return ui.sageConstructDoneExam || 'Exam created on the map. Open it to edit the quiz.';
    }
    return ui.sageConstructDoneLesson || 'Lesson created on the map. Open it to write content.';
}
