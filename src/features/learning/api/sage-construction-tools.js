/**
 * Closed construction tools for architect mode.
 * The model reads the catalog and chooses CALL <id> — the app does not route on user synonyms.
 */

/** @typedef {'create-lesson'|'create-folder'|'create-exam'} SageConstructAction */

/**
 * @typedef {{
 *   id: string,
 *   action: SageConstructAction,
 *   aliases: string[],
 *   describeEN: string,
 *   describeES: string,
 *   useWhenEN: string,
 *   useWhenES: string,
 * }} SageConstructTool
 */

/**
 * Catalog the model sees. Aliases are only for parsing mistyped CALL ids from the model
 * (create-module → create_course), never for matching user chat synonyms.
 * @type {SageConstructTool[]}
 */
export const SAGE_CONSTRUCT_TOOLS = [
    {
        id: 'create_course',
        action: 'create-folder',
        aliases: [
            'create_course',
            'create-course',
            'create_folder',
            'create-folder',
            'create_module',
            'create-module',
            'new_folder',
            'new-folder',
            'new_module',
            'new-module',
        ],
        describeEN: 'Create a new module (folder / course branch) on the map.',
        describeES: 'Crear un módulo nuevo (carpeta en el mapa) bajo la selección.',
        useWhenEN:
            'Use when the author wants a new container for lessons: a module/folder on the map (not a whole Forest branch). Any request whose result should be a folder node.',
        useWhenES:
            'Usá cuando el autor quiere un contenedor nuevo para lecciones: un módulo/carpeta en el mapa (no una rama entera del Bosque). Cualquier pedido cuyo resultado deba ser un nodo carpeta.',
    },
    {
        id: 'create_lesson',
        action: 'create-lesson',
        aliases: [
            'create_lesson',
            'create-lesson',
            'new_lesson',
            'new-lesson',
            'new_file',
            'new-file',
        ],
        describeEN: 'Create a new lesson under the selected module.',
        describeES: 'Crear una lección nueva bajo el módulo seleccionado.',
        useWhenEN:
            'Use when the author wants a single teachable page/lesson/content file inside a module — not a whole course folder and not an exam.',
        useWhenES:
            'Usá cuando el autor quiere una sola página/lección/contenido enseñable dentro de un módulo — no un curso entero ni un examen.',
    },
    {
        id: 'create_exam',
        action: 'create-exam',
        aliases: ['create_exam', 'create-exam', 'new_exam', 'new-exam'],
        describeEN: 'Create a new exam under the selected module.',
        describeES: 'Crear un examen nuevo bajo el módulo seleccionado.',
        useWhenEN:
            'Use when the author wants a quiz/exam/assessment node, not a regular lesson or a course folder.',
        useWhenES:
            'Usá cuando el autor quiere un nodo de examen/cuestionario/evaluación, no una lección normal ni un módulo/curso.',
    },
];

const ALIAS_TO_TOOL = (() => {
    /** @type {Map<string, SageConstructTool>} */
    const map = new Map();
    for (const tool of SAGE_CONSTRUCT_TOOLS) {
        map.set(tool.id, tool);
        for (const a of tool.aliases) {
            map.set(String(a).toLowerCase(), tool);
        }
    }
    return map;
})();

/**
 * @param {string} raw
 * @returns {SageConstructTool | null}
 */
export function resolveSageConstructTool(raw) {
    const key = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/-+/g, '-');
    if (!key) return null;
    return (
        ALIAS_TO_TOOL.get(key) ||
        ALIAS_TO_TOOL.get(key.replace(/_/g, '-')) ||
        ALIAS_TO_TOOL.get(key.replace(/-/g, '_')) ||
        null
    );
}

/**
 * CONTEXT block: full closed catalog for the model to choose from (no synonym routing).
 * @param {string} [_query] ignored — kept for call-site compatibility
 * @param {'EN'|'ES'|string} [lang]
 */
export function buildSageConstructToolsRagBlock(_query = '', lang = 'EN') {
    const es = lang === 'ES';
    const cards = SAGE_CONSTRUCT_TOOLS.map((t) => {
        const desc = es ? t.describeES : t.describeEN;
        const when = es ? t.useWhenES : t.useWhenEN;
        return [`### ${t.id}`, desc, when, `Emit: CALL ${t.id}`].join('\n');
    });

    if (es) {
        return [
            '[Herramientas Arborito — catálogo cerrado]',
            'Vos elegís la herramienta según el sentido del pedido del autor (no hay lista de sinónimos en la app).',
            'Solo emití CALL cuando el autor pide crear algo concreto en el mapa. Si pregunta qué puede hacer / ayuda / cómo funciona, explicá sin CALL.',
            'Si pide N ítems (ej. «haceme 5 módulos», «4 exámenes»), emití: CALL create_course 5  o  CALL create_exam 4 (número al final, máx. 20).',
            'Si pide uno solo: CALL create_course / create_lesson / create_exam.',
            'No hay herramienta de borrar/eliminar. Si piden borrar módulos, lecciones o exámenes, decí claramente que no podés borrar desde el chat y que usen el mapa en modo construcción.',
            'Prohibido: responder solo "/", negar que podés crear en el mapa, inventar otros nombres de tool, decir que ya creaste algo, o fingir que borraste algo.',
            'Tras CALL … la app confirma con el usuario.',
            '',
            ...cards,
        ].join('\n\n');
    }
    return [
        '[Arborito tools — closed catalog]',
        'You choose the tool from the meaning of the author’s request (the app has no synonym list).',
        'Only emit CALL when the author asks to create something concrete on the map. If they ask what they can do / help / how it works, explain without CALL.',
        'If they ask for N items (e.g. “make 5 modules”, “4 exams”), emit: CALL create_course 5  or  CALL create_exam 4 (number at the end, max 20).',
        'For a single item: CALL create_course / create_lesson / create_exam.',
        'There is no delete tool. If they ask to delete modules, lessons, or exams, say clearly you cannot delete from chat and they should use the map in construction mode.',
        'Forbidden: replying with only "/", saying you cannot create on the map, inventing other tool names, claiming you already created something, or pretending you deleted something.',
        'After CALL … the app confirms with the user.',
        '',
        ...cards,
    ].join('\n\n');
}

/**
 * @param {'EN'|'ES'|string} lang
 */
export function buildSageConstructToolsContext(lang = 'EN') {
    return buildSageConstructToolsRagBlock('', lang);
}

/**
 * Parse a whitelist tool call from model (or user) text.
 * Supports: CALL create_exam · CALL create_exam 4 · CALL create_course x5 · CALL create_lesson count=3
 * @param {string} text
 * @returns {{ tool: SageConstructTool, phase: 'propose'|'execute', count: number } | null}
 */
export function parseSageConstructToolCall(text) {
    const raw = String(text || '');
    if (!raw.trim()) return null;

    const callRe =
        /\b(?:CALL|INVOKE|TOOL)\s*[:\s]\s*([a-z][a-z0-9_-]{2,40})(?:\s*(?:x|count[=:]?\s*)?(\d{1,2}))?\b|\bCALL_([a-z][a-z0-9_-]{2,40})\b/gi;
    let m;
    let last = null;
    while ((m = callRe.exec(raw)) !== null) {
        const tool = resolveSageConstructTool(m[1] || m[3]);
        if (!tool) continue;
        const countRaw = m[2] != null ? Number(m[2]) : 1;
        const count =
            Number.isFinite(countRaw) && countRaw >= 1 ? Math.min(20, Math.floor(countRaw)) : 1;
        last = { tool, phase: 'propose', count };
    }
    if (last) return last;

    const lines = raw
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    for (const line of lines) {
        const cleaned = line.replace(/^\[+|\]+$/g, '').trim();
        const withCount = cleaned.match(/^([a-z][a-z0-9_-]+)\s*(?:x|count[=:]?\s*)?(\d{1,2})$/i);
        if (withCount) {
            const tool = resolveSageConstructTool(withCount[1]);
            if (tool) {
                const count = Math.min(20, Math.max(1, Math.floor(Number(withCount[2]) || 1)));
                return { phase: 'propose', tool, count };
            }
        }
        const tool = resolveSageConstructTool(cleaned);
        if (tool && (lines.length === 1 || /^[a-z][a-z0-9_-]+$/i.test(cleaned))) {
            return { phase: 'propose', tool, count: 1 };
        }
    }

    const sole = raw.trim().replace(/^\[+|\]+$/g, '');
    if (/^[a-z][a-z0-9_-]{2,40}$/i.test(sole)) {
        const tool = resolveSageConstructTool(sole);
        if (tool) return { phase: 'propose', tool, count: 1 };
    }

    return null;
}

/**
 * Strip CALL lines / bare tool ids from display text.
 * @param {string} text
 */
export function stripSageConstructToolCalls(text) {
    let t = String(text != null ? text : '');
    t = t.replace(
        /\b(?:CALL|INVOKE|TOOL)\s*[:\s]\s*[a-z][a-z0-9_-]{2,40}(?:\s*(?:x|count[=:]?\s*)?\d{1,2})?\b/gi,
        ''
    );
    t = t.replace(/\bCALL_[a-z][a-z0-9_-]{2,40}\b/gi, '');
    t = t
        .split(/\n/)
        .filter((line) => {
            const cleaned = line.trim().replace(/^\[+|\]+$/g, '');
            if (!cleaned) return true;
            if (/^[a-z][a-z0-9_-]+(?:\s*(?:x|count[=:]?\s*)?\d{1,2})?$/i.test(cleaned)) {
                const id = cleaned.replace(/\s*(?:x|count[=:]?\s*)?\d{1,2}$/i, '').trim();
                if (resolveSageConstructTool(id)) return false;
            }
            return true;
        })
        .join('\n');
    return t.replace(/\n{3,}/g, '\n\n').trimEnd();
}
