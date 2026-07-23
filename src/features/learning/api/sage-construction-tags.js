/** Machine tags Sage may emit in architect mode (stripped before display). */

import { normalizeConstructionAction } from './sage-construction-intent.js';
import {
    parseSageConstructToolCall,
    stripSageConstructToolCalls,
} from './sage-construction-tools.js';

const ACTION_ALT = 'create-lesson|create-folder|create-exam|create-module|new-folder|new-module|new-file|new-lesson|new-exam';
const TAG_RE = new RegExp(
    String.raw`\[\[SAGE_CONSTRUCT:(propose|execute):(${ACTION_ALT})\]\]`,
    'gi'
);

/** Broken model output like `create-module]` or `[create-module]`. */
const LOOSE_ACTION_RE = new RegExp(
    String.raw`(?:\[\[?\s*SAGE_CONSTRUCT:(?:propose|execute):)?\b(create-(?:module|folder|lesson|exam|course)|new-(?:folder|module|file|lesson|exam)|iniciar-curso)\b\]?`,
    'gi'
);

/**
 * Remove construct tags from chat text.
 * @param {string} text
 * @returns {string}
 */
export function stripSageConstructTags(text) {
    let t = String(text != null ? text : '');

    t = t.replace(TAG_RE, '');

    t = t.replace(/\[\[SAGE_CONSTRUCT:([\s\S]*?)\]\]/gi, (_, inner) => {
        const m = String(inner || '').match(/^[^:\n\]]+:\s*([\s\S]*)$/);
        return m ? String(m[1] || '').trim() : '';
    });

    t = t.replace(/\[\[SAGE_CONSTRUCT:([^:\n\]]+):\s*([\s\S]*)$/i, (_, _verb, prose) =>
        String(prose || '').trim()
    );
    t = t.replace(/\[\[SAGE_CONSTRUCT:[\s\S]*$/i, '');

    t = t.replace(LOOSE_ACTION_RE, '');
    t = t.replace(/^\s*create-(?:module|folder|lesson|exam|course)\s*\]\s*/i, '');
    t = stripSageConstructToolCalls(t);

    return t.replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * @param {string} text
 * @returns {{ display: string, proposal: { phase: 'propose'|'execute', action: string } | null }}
 */
export function parseSageConstructionTags(text) {
    let propose = null;
    let execute = null;
    const raw = String(text || '');
    raw.replace(TAG_RE, (_, phase, actionRaw) => {
        const action = normalizeConstructionAction(actionRaw);
        if (!action) return '';
        const row = { phase: String(phase || '').toLowerCase(), action };
        if (row.phase === 'propose') propose = row;
        else execute = row;
        return '';
    });
    if (!propose && !execute) {
        const toolHit = parseSageConstructToolCall(raw);
        if (toolHit) {
            propose = {
                phase: 'propose',
                action: toolHit.tool.action,
                count: toolHit.count || 1,
            };
        }
    }
    if (!propose && !execute) {
        const loose = raw.match(
            /\b(propose|execute)\b[:\s]+(create-(?:module|folder|lesson|exam|course))\b|\b(create-(?:module|folder|lesson|exam|course)|iniciar-curso)\s*\]?/i
        );
        if (loose) {
            const action = normalizeConstructionAction(loose[2] || loose[3]);
            if (action) {
                const phase = String(loose[1] || 'propose').toLowerCase() === 'execute' ? 'execute' : 'propose';
                if (phase === 'execute') execute = { phase, action };
                else propose = { phase: 'propose', action };
            }
        }
    }
    const display = stripSageConstructTags(text).trim();
    const proposal = propose || execute;
    return { display, proposal };
}
