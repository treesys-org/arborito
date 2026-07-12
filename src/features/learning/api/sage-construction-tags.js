/** Machine tags Sage may emit in architect mode (stripped before display). */

const TAG_RE =
    /\[\[SAGE_CONSTRUCT:(propose|execute):(create-lesson|create-folder|create-exam)\]\]/gi;

/**
 * @param {string} text
 * @returns {{ display: string, proposal: { phase: 'propose'|'execute', action: string } | null }}
 */
export function parseSageConstructionTags(text) {
    let proposal = null;
    const display = String(text || '').replace(TAG_RE, (_, phase, action) => {
        proposal = { phase: phase.toLowerCase(), action };
        return '';
    }).trim();
    return { display, proposal };
}
