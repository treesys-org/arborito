/** @typedef {{
 *   action: 'create-lesson'|'create-folder'|'create-exam',
 *   label?: string,
 *   count?: number,
 *   name?: string,
 *   namePrefix?: string,
 *   nested?: { action: 'create-lesson'|'create-folder'|'create-exam', count?: number, namePrefix?: string, name?: string } | null,
 * }} SageConstructionProposal */

/** Single-token confirms. */
const AFFIRMATIVE_TOKEN =
    /^(s[ií]|yes|ok|dale|confirmo|procede|hazlo|hacelo|hazmelo|hácelo|adelante|claro|vale|listo|vamos)$/i;
const NEGATIVE = /^(no|cancel|cancelar|mejor no|stop|nada)([.!?…]*)$/i;

/** Imperative / request verbs (incl. creame / haceme = verb + me). */
const CREATE_VERB =
    String.raw`(?:crea(?:r|me|nos)?|cremae|cr[eé]ame|fabrica(?:r|me)?|a(?:ñ|n)ade(?:r)?|add|new|hace(?:r|me)?|haceme|haz(?:me)?|make|create|arma(?:r)?|genera(?:r)?)`;

/** módulo / módulo / typo modilo */
const MODULE_WORD = String.raw`m[oó]d(?:ulo|ilo)s?`;

/** Parent container the author names (“módulo”, “curso”, “carpeta”). */
const PARENT_WORD = String.raw`(?:${MODULE_WORD}|carpetas?|cursos?|courses?|folders?|branch(?:es)?|temario)`;

const CREATE_NOUN =
    String.raw`(lecci[oó]n(?:es)?|lesson(?:s)?|${MODULE_WORD}|carpeta(?:s)?|folder(?:s)?|branch(?:es)?|curso(?:s)?|course(?:s)?|temario|exam(?:en(?:es)?|ens?|e)?|exámenes)`;

const NAME_TOKEN = String.raw`[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9][\wáéíóúñÁÉÍÓÚÑ-]{0,40}`;

const NAME_STOP =
    /^(nuev[oa]s?|adentro|dentro|inside|nested|llamad[oa]s?|named?|con|y|de|del|la|el|los|las|un|una|unos|unas|para|por)$/i;

const CREATE_PATTERNS = [
    {
        action: 'create-lesson',
        re: new RegExp(String.raw`\b${CREATE_VERB}\b.{0,48}\b(lecci[oó]n(?:es)?|lesson(?:s)?)\b`, 'i'),
    },
    {
        action: 'create-folder',
        re: new RegExp(
            String.raw`\b${CREATE_VERB}\b.{0,48}\b(${MODULE_WORD}|carpeta(?:s)?|folder(?:s)?|branch(?:es)?|curso(?:s)?|course(?:s)?|temario)\b`,
            'i'
        ),
    },
    {
        action: 'create-exam',
        re: new RegExp(
            String.raw`\b${CREATE_VERB}\b.{0,48}\b(exam(?:en(?:es)?|ens?|e)?|exámenes)\b`,
            'i'
        ),
    },
];

/** Cap batch creates so a bad parse cannot flood the map. */
export const SAGE_CONSTRUCT_COUNT_MAX = 20;

/**
 * How many nodes the author wants (default 1). Handles “5 módulos”, “haceme 4 examenes”, “x5”.
 * @param {string} text
 * @returns {number}
 */
export function extractConstructionCount(text) {
    const t = String(text || '');
    if (!t.trim()) return 1;
    const patterns = [
        new RegExp(String.raw`\b(\d{1,2})\s*${CREATE_NOUN}\b`, 'i'),
        new RegExp(String.raw`\b${CREATE_NOUN}\s*(?:nuev[oa]s?\s*)?(\d{1,2})\b`, 'i'),
        /\b(?:haceme|hazme|creame|créame|create|make|add)\s+(\d{1,2})\b/i,
        /\bx\s*(\d{1,2})\b/i,
        /\b(\d{1,2})\s*(?:m[aá]s|more)\b/i,
    ];
    for (const re of patterns) {
        const m = t.match(re);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 1) {
            return Math.min(SAGE_CONSTRUCT_COUNT_MAX, Math.floor(n));
        }
    }
    return 1;
}

/**
 * “4 más” / “4 more” after a create — same action, new count.
 * @param {string} text
 * @returns {number | null}
 */
export function extractMoreCount(text) {
    const t = String(text || '').trim();
    const m = t.match(/^\s*(\d{1,2})\s*(?:m[aá]s|more)\s*[.!?…]*\s*$/i)
        || t.match(/^\s*(?:m[aá]s|more)\s*(\d{1,2})\s*[.!?…]*\s*$/i)
        || t.match(/^\s*(?:haceme|hazme|creame|créame|create|add)\s+(\d{1,2})\s*(?:m[aá]s|more)\b/i);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(SAGE_CONSTRUCT_COUNT_MAX, Math.floor(n));
}

/**
 * Map model aliases / typos to canonical actions.
 * @param {string} raw
 * @returns {'create-lesson'|'create-folder'|'create-exam'|null}
 */
export function normalizeConstructionAction(raw) {
    const a = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/_/g, '-');
    if (
        a === 'create-folder' ||
        a === 'create-module' ||
        a === 'create-course' ||
        a === 'iniciar-curso' ||
        a === 'new-folder' ||
        a === 'new-module' ||
        a === 'module' ||
        a === 'folder' ||
        a === 'course'
    ) {
        return 'create-folder';
    }
    if (a === 'create-lesson' || a === 'new-file' || a === 'new-lesson' || a === 'lesson' || a === 'file') {
        return 'create-lesson';
    }
    if (a === 'create-exam' || a === 'new-exam' || a === 'exam') {
        return 'create-exam';
    }
    return null;
}

/**
 * Destructive asks — Sage must refuse (no delete tool; too risky for local models).
 * @param {string} text
 */
export function isConstructionDeleteIntent(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (!/\b(borra(?:r|me|nos)?|elimin(?:a|ar|ame|alo|alos)?|delete|remove|quitar)\b/i.test(t)) {
        return false;
    }
    /* “borra todo”, “borrame esta mierda”, “delete this crap” */
    if (
        /\b(todo|all|esto|esta|eso|esa|estos|estas|this|that|mierda|basura|porquer[ií]a|crap|shit|junk)\b/i.test(
            t
        )
    ) {
        return true;
    }
    return /\b(m[oó]d(?:ulo|ilo)s?|carpetas?|lecciones?|exam(?:en(?:es)?)?|exams?|nodos?|ramas?|folders?|lessons?|modules?|cursos?|contenido)\b/i.test(
        t
    );
}

/**
 * @param {string} text
 * @param {Record<string, string>} [ui]
 */
export function describeConstructionDeleteRefuse(ui = {}) {
    return (
        ui.sageConstructCannotDelete ||
        'I cannot delete or clear modules, lessons, or exams from chat — it is too easy to wipe the wrong thing. Use construction mode on the map (select a node → delete) when you want to remove something.'
    );
}

const CHILD_NOUN =
    String.raw`(recetas?|${MODULE_WORD}|carpetas?|lecciones?|lessons?|exam(?:en(?:es)?)?|folders?|modules?)`;

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeChildPrefix(raw) {
    let s = String(raw || '')
        .trim()
        .toLowerCase();
    if (!s) return '';
    if (/^recetas?$/.test(s)) return 'receta';
    if (/^m[oó]d(?:ulo|ilo)s?$/.test(s)) return 'módulo';
    if (/^carpetas?$/.test(s)) return 'carpeta';
    if (/^lecciones?$|^lessons?$/.test(s)) return 'lección';
    if (/^exam/.test(s)) return 'examen';
    if (s.endsWith('es') && s.length > 4) s = s.slice(0, -2);
    else if (s.endsWith('s') && s.length > 3) s = s.slice(0, -1);
    return s;
}

/**
 * @param {string} noun
 * @returns {'create-lesson'|'create-folder'|'create-exam'}
 */
function childActionFromNoun(noun) {
    const n = String(noun || '').toLowerCase();
    if (/lecci|lesson/.test(n)) return 'create-lesson';
    if (/exam/.test(n)) return 'create-exam';
    return 'create-folder';
}

/**
 * “recetas … como lecciones” → lessons named receta.
 * @param {string} text
 * @param {string} noun
 */
function resolveChildAction(text, noun) {
    if (/\bcomo\s+lecciones?\b|\bas\s+lessons?\b/i.test(text)) return 'create-lesson';
    return childActionFromNoun(noun);
}

/**
 * Digits near “recetas / dentro / tenga”.
 * @param {string} text
 * @returns {number | null}
 */
export function extractNestedChildCount(text) {
    const t = String(text || '');
    const patterns = [
        new RegExp(
            String.raw`\b(\d{1,2})\s+${CHILD_NOUN}(?:\s+(?:adentro|dentro|inside|numerad\w*))?\b`,
            'i'
        ),
        new RegExp(
            String.raw`\b(?:tenga|tengan|contenga|con|dentro|adentro)\s+(\d{1,2})\b`,
            'i'
        ),
        /\b(\d{1,2})\s+(?:adentro|dentro|inside)\b/i,
    ];
    for (const re of patterns) {
        const m = t.match(re);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 1) {
            return Math.min(SAGE_CONSTRUCT_COUNT_MAX, Math.floor(n));
        }
    }
    return null;
}

/**
 * @param {Array<{ role?: string, content?: string }>} messages
 * @param {string} [currentText]
 * @returns {number | null}
 */
export function findRecentNestedChildCount(messages, currentText = '') {
    const cur = String(currentText || '').trim();
    const list = Array.isArray(messages) ? messages : [];
    let seenCurrent = !cur;
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const m = list[i];
        if (m?.role !== 'user') continue;
        const content = String(m.content || '').trim();
        if (!seenCurrent && content === cur) {
            seenCurrent = true;
            continue;
        }
        const n = extractNestedChildCount(content);
        if (n && n > 1) return n;
    }
    return null;
}

/**
 * “módulo llamado X” / “curso de cocina” / “módulo cocina”
 * @param {string} text
 * @returns {string}
 */
export function extractConstructionName(text) {
    const t = String(text || '');
    const m =
        t.match(new RegExp(String.raw`\b(?:llamad[oa]s?|named?)\s+[«"']?(${NAME_TOKEN})[»"']?`, 'i')) ||
        t.match(
            new RegExp(
                String.raw`\b${PARENT_WORD}\s+(?:llamad[oa]\s+|de\s+)?[«"']?(${NAME_TOKEN})[»"']?`,
                'i'
            )
        ) ||
        t.match(new RegExp(String.raw`\b(?:uno|una)\s+de\s+[«"']?(${NAME_TOKEN})[»"']?`, 'i'));
    const name = m ? String(m[1] || '').trim() : '';
    if (!name || NAME_STOP.test(name)) return '';
    return name;
}

/**
 * @param {string} parentName
 * @param {number} childCount
 * @param {string} childNoun
 * @param {string} fullText
 * @returns {SageConstructionProposal | null}
 */
function nestedProposal(parentName, childCount, childNoun, fullText) {
    const name = String(parentName || '').trim();
    const prefix = normalizeChildPrefix(childNoun) || 'ítem';
    const n = Math.min(SAGE_CONSTRUCT_COUNT_MAX, Math.max(1, Math.floor(Number(childCount) || 1)));
    if (!name || NAME_STOP.test(name) || n < 1) return null;
    return {
        action: 'create-folder',
        count: 1,
        name,
        nested: {
            action: resolveChildAction(fullText, childNoun),
            count: n,
            namePrefix: prefix,
        },
    };
}

/**
 * Parent + children:
 * - “módulo llamado cocina y 5 módulos adentro llamados receta”
 * - “creame un modulo de cocina y que tenga 7 recetas”
 * - “haceme un curso de cocina con 8 recetas dentro”
 * - “llamado cocina y con recetas numerado como lecciones”
 * @param {string} text
 * @returns {SageConstructionProposal | null}
 */
export function detectConstructionNestedIntent(text) {
    const t = String(text || '').trim();
    if (!t) return null;

    const labeled = t.match(
        new RegExp(
            String.raw`\b${CREATE_VERB}\b.{0,24}(?:un\s+|una\s+)?${PARENT_WORD}\s+llamad[oa]\s+[«"']?(${NAME_TOKEN})[»"']?.{0,100}?(\d{1,2})\s+${MODULE_WORD}\s+(?:adentro|dentro|inside|nested).{0,40}?llamad[oa]s?\s+[«"']?(${NAME_TOKEN})`,
            'i'
        )
    );
    if (labeled) {
        const hit = nestedProposal(labeled[1], labeled[2], labeled[3], t);
        if (hit) return hit;
    }

    /*
     * Create + curso/módulo + (de|llamado)? name + bridge + N + children
     * “creame un modulo de cocina y que tenga 7 recetas”
     * “haceme un curso de cocina con 8 recetas dentro”
     */
    const withCreate = t.match(
        new RegExp(
            String.raw`\b${CREATE_VERB}\b.{0,30}(?:un\s+|una\s+)?${PARENT_WORD}\s+(?:llamad[oa]\s+|de\s+)?[«"']?(${NAME_TOKEN})[»"']?.{0,80}?(?:y\s+(?:que\s+)?(?:tenga|tengan|contenga)|y|con|que\s+tenga)\s+(?:(?:adentro|dentro|inside)\s+)?(\d{1,2})\s+${CHILD_NOUN}(?:\s+(?:adentro|dentro|inside|numerad\w*))?`,
            'i'
        )
    );
    if (withCreate) {
        const hit = nestedProposal(withCreate[1], withCreate[2], withCreate[3], t);
        if (hit) return hit;
    }

    /* “… cocina con 7 dentro” / “… 7 adentro” (children implied = recetas/módulos) */
    const conDentro = t.match(
        new RegExp(
            String.raw`(?:\b${CREATE_VERB}\b.{0,30}(?:un\s+|una\s+)?${PARENT_WORD}\s+(?:llamad[oa]\s+|de\s+)?|\b(?:uno|una)\s+de\s+|llamad[oa]\s+)[«"']?(${NAME_TOKEN})[»"']?.{0,60}?(?:con|y)\s+(\d{1,2})\s+(?:${CHILD_NOUN}\s+)?(?:adentro|dentro|inside)\b`,
            'i'
        )
    );
    if (conDentro) {
        const childNoun = /\brecetas?\b/i.test(t)
            ? 'receta'
            : /\blecciones?\b/i.test(t)
              ? 'lección'
              : 'módulo';
        const hit = nestedProposal(conDentro[1], conDentro[2], childNoun, t);
        if (hit) return hit;
    }

    /*
     * Clarification without create verb:
     * “simplemente llamado cocina y con recetas numerado como lecciones”
     * Count may be filled later from chat history.
     */
    const softNamed = t.match(
        new RegExp(
            String.raw`\b(?:llamad[oa]|named)\s+[«"']?(${NAME_TOKEN})[»"']?.{0,80}?\b(?:con\s+)?(?:(\d{1,2})\s+)?${CHILD_NOUN}(?:\s+numerad\w*)?`,
            'i'
        )
    );
    if (softNamed && (/\bnumerad/i.test(t) || /\bcomo\s+lecciones?\b/i.test(t) || softNamed[2])) {
        const count = Number(softNamed[2]) || extractNestedChildCount(t) || 0;
        const noun = softNamed[3] || 'receta';
        /* Prefer “receta” label when they say recetas…como lecciones */
        const label =
            /\brecetas?\b/i.test(t) && resolveChildAction(t, noun) === 'create-lesson'
                ? 'receta'
                : noun;
        if (count > 1) {
            const hit = nestedProposal(softNamed[1], count, label, t);
            if (hit) return hit;
        } else {
            /* Count placeholder — enrichConstructionIntentFromHistory fills from recent turns */
            const name = String(softNamed[1] || '').trim();
            const prefix = normalizeChildPrefix(label);
            if (name && !NAME_STOP.test(name) && prefix) {
                return {
                    action: 'create-folder',
                    count: 1,
                    name,
                    nested: {
                        action: resolveChildAction(t, label),
                        count: 0,
                        namePrefix: prefix,
                    },
                };
            }
        }
    }

    return null;
}

/**
 * Fill nested.count / child label from recent user turns when the clarification omitted them.
 * @param {SageConstructionProposal} intent
 * @param {Array<{ role?: string, content?: string }>} messages
 * @param {string} [currentText]
 * @returns {SageConstructionProposal}
 */
export function enrichConstructionIntentFromHistory(intent, messages, currentText = '') {
    if (!intent?.action) return intent;
    const out = { ...intent, nested: intent.nested ? { ...intent.nested } : null };
    if (!out.nested) return out;

    if (!(out.nested.count > 1)) {
        const n =
            extractNestedChildCount(currentText) ||
            findRecentNestedChildCount(messages, currentText);
        if (n && n > 1) out.nested.count = n;
        else out.nested = null;
    }
    if (!out.nested) return out;

    const prefix = String(out.nested.namePrefix || '').toLowerCase();
    if (prefix === 'módulo' || prefix === 'modulo' || prefix === 'ítem' || prefix === 'item') {
        const cur = String(currentText || '');
        const list = Array.isArray(messages) ? messages : [];
        const blob = `${cur}\n${list
            .filter((m) => m?.role === 'user')
            .map((m) => m.content)
            .join('\n')}`;
        if (/\brecetas?\b/i.test(blob)) {
            out.nested.namePrefix = 'receta';
            if (/\bcomo\s+lecciones?\b/i.test(blob)) out.nested.action = 'create-lesson';
        } else if (/\blecciones?\b/i.test(blob)) {
            out.nested.namePrefix = 'lección';
            out.nested.action = 'create-lesson';
        }
    }
    return out;
}

/**
 * @param {string} text
 * @returns {SageConstructionProposal | null}
 */
export function detectConstructionCreateIntent(text) {
    const msg = String(text || '').trim();
    if (!msg || msg.length < 5) return null;
    const nested = detectConstructionNestedIntent(msg);
    if (nested) return nested;
    for (const { action, re } of CREATE_PATTERNS) {
        if (!re.test(msg)) continue;
        const count = extractConstructionCount(msg);
        const name = extractConstructionName(msg);
        /** Numbered children share a prefix (“receta numerados”). */
        const numbered = /\bnumerad/i.test(msg) || /\bnumbered\b/i.test(msg);
        if (name && count > 1 && numbered) {
            return { action, count, namePrefix: name };
        }
        if (name && count === 1) return { action, count: 1, name };
        if (name && count > 1) return { action, count, namePrefix: name };
        return { action, count };
    }
    return null;
}

/**
 * Infer a create action from assistant prose / broken tags (e.g. "create-module]").
 * @param {string} text
 * @returns {SageConstructionProposal | null}
 */
export function inferConstructionActionFromAssistant(text) {
    const t = String(text || '');
    if (!t.trim()) return null;
    const tagLike = t.match(
        /(?:\[\[?\s*SAGE_CONSTRUCT:[^\]]*|)\b(propose|execute)[:\s]+(create[\w-]*)\b|\]?\s*(create-(?:module|folder|lesson|exam|course)|iniciar-curso)\s*\]?/i
    );
    if (tagLike) {
        const raw = tagLike[2] || tagLike[3];
        const action = normalizeConstructionAction(raw);
        if (action) return { action };
    }
    if (/\b(crear|crea|añadir|add|fabric)\b.{0,40}\b(m[oó]dulo|módulo|module|carpeta|curso|folder|course)\b/i.test(t)) {
        return { action: 'create-folder' };
    }
    if (/\b(crear|crea|añadir|add)\b.{0,40}\b(lecci[oó]n|lesson)\b/i.test(t)) {
        return { action: 'create-lesson' };
    }
    if (/\b(crear|crea|añadir|add)\b.{0,40}\b(examen|exam)\b/i.test(t)) {
        return { action: 'create-exam' };
    }
    return null;
}

/**
 * Strip leading fillers: “no, procede” / “bueno dale” / “ok, hacelo”.
 * @param {string} text
 */
function stripProceedFillers(text) {
    return String(text || '')
        .trim()
        .replace(/[.!?…]+$/g, '')
        .trim()
        .replace(/^(?:no|bueno|ok|okay|dale|sí|si)[,\s]+/i, '')
        .trim();
}

/** @param {string} text */
export function isAffirmativeReply(text) {
    const raw = String(text || '')
        .trim()
        .replace(/[.!?…]+$/g, '')
        .trim();
    if (!raw || raw.length > 48) return false;
    /* Bare “no” is cancel — not “no, procede”. */
    if (NEGATIVE.test(raw)) return false;
    const t = stripProceedFillers(raw);
    if (!t) return false;
    /* Single token: sí / dale / procede / hacelo */
    if (AFFIRMATIVE_TOKEN.test(t)) return true;
    /* Compound: "dale, procede" / "sí dale" / "ok, adelante" — only affirmative tokens. */
    const parts = t
        .split(/[\s,;]+/)
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return false;
    return parts.every((p) => AFFIRMATIVE_TOKEN.test(p));
}

/**
 * Confirm without needing a pending proposal (recovery when the model invented a plan).
 * @param {string} text
 */
export function isConstructionConfirmReply(text) {
    if (isNegativeReply(text)) return false;
    if (isConstructionDeleteIntent(text)) return false;
    if (detectConstructionCreateIntent(text)) return false;
    return isAffirmativeReply(text);
}

/**
 * Walk recent user turns for a create ask (skip the current message).
 * @param {Array<{ role?: string, content?: string }>} messages
 * @param {string} [currentText]
 * @returns {SageConstructionProposal | null}
 */
export function findRecentConstructionCreateIntent(messages, currentText = '') {
    const cur = String(currentText || '').trim();
    const list = Array.isArray(messages) ? messages : [];
    let seenCurrent = !cur;
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const m = list[i];
        if (m?.role !== 'user') continue;
        const content = String(m.content || '').trim();
        if (!seenCurrent && content === cur) {
            seenCurrent = true;
            continue;
        }
        const intent = detectConstructionCreateIntent(content);
        if (intent?.action) return intent;
    }
    return null;
}

/** @param {string} text */
export function isNegativeReply(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 40) return false;
    return NEGATIVE.test(t);
}

/**
 * While a create proposal is pending, short detail answers ("básico") mean proceed.
 * @param {string} text
 * @param {SageConstructionProposal | null | undefined} pending
 */
export function isConstructionProceedReply(text, pending) {
    if (!pending?.action) return false;
    if (isNegativeReply(text)) return false;
    if (isConstructionDeleteIntent(text)) return false;
    if (isAffirmativeReply(text)) return true;
    const t = String(text || '').trim();
    if (!t || t.length > 48) return false;
    if (/\?/.test(t)) return false;
    /* User changed mind toward a different create kind — let the model handle. */
    if (detectConstructionCreateIntent(t)) return false;
    if (/\b(espera|wait|mejor no|cambia|instead|otra cosa)\b/i.test(t)) return false;
    return true;
}

/**
 * @param {SageConstructionProposal} proposal
 * @param {Record<string, string>} ui
 */
export function describeConstructionProposal(proposal, ui = {}) {
    if (proposal.nested?.count) {
        const parent = proposal.name || 'module';
        const n = proposal.nested.count;
        const child = proposal.nested.namePrefix || proposal.nested.name || 'item';
        if (proposal.nested.action === 'create-lesson') {
            return (
                ui.sageConstructProposeNestedLessons ||
                'I can create module «{parent}» and {n} lessons inside named {child} 1…{n}. Proceed?'
            )
                .replace(/\{parent\}/g, parent)
                .replace(/\{n\}/g, String(n))
                .replace(/\{child\}/g, child);
        }
        return (
            ui.sageConstructProposeNested ||
            'I can create module «{parent}» and {n} modules inside named {child} 1…{n}. Proceed?'
        )
            .replace(/\{parent\}/g, parent)
            .replace(/\{n\}/g, String(n))
            .replace(/\{child\}/g, child);
    }
    const n = Math.max(1, Number(proposal.count) || 1);
    if (proposal.name && n === 1) {
        if (proposal.action === 'create-folder') {
            return (ui.sageConstructProposeFolderNamed || 'I can add a module named «{name}». Proceed?').replace(
                /\{name\}/g,
                proposal.name
            );
        }
        if (proposal.action === 'create-exam') {
            return (ui.sageConstructProposeExamNamed || 'I can add an exam named «{name}». Proceed?').replace(
                /\{name\}/g,
                proposal.name
            );
        }
        return (ui.sageConstructProposeLessonNamed || 'I can add a lesson named «{name}». Proceed?').replace(
            /\{name\}/g,
            proposal.name
        );
    }
    if (n > 1) {
        if (proposal.action === 'create-folder') {
            return (
                (ui.sageConstructProposeFolderN || 'I can add {n} new modules under the map selection. Proceed?').replace(
                    /\{n\}/g,
                    String(n)
                )
            );
        }
        if (proposal.action === 'create-exam') {
            return (
                (ui.sageConstructProposeExamN || 'I can add {n} new exams under the selected module. Proceed?').replace(
                    /\{n\}/g,
                    String(n)
                )
            );
        }
        return (
            (ui.sageConstructProposeLessonN || 'I can add {n} new lessons under the selected module. Proceed?').replace(
                /\{n\}/g,
                String(n)
            )
        );
    }
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
 * @param {{ created?: number }} [opts]
 */
export function describeConstructionDone(proposal, ui = {}, opts = {}) {
    const n = Math.max(1, Number(opts.created) || Number(proposal.count) || 1);
    if (proposal.nested?.count) {
        if (proposal.nested.action === 'create-lesson') {
            return (
                ui.sageConstructDoneNestedLessons ||
                'Created «{parent}» with {n} lessons inside. They are on the map — tap to edit.'
            )
                .replace(/\{parent\}/g, proposal.name || 'module')
                .replace(/\{n\}/g, String(proposal.nested.count));
        }
        return (
            ui.sageConstructDoneNested ||
            'Created «{parent}» with {n} modules inside. They are on the map — tap to rename or edit.'
        )
            .replace(/\{parent\}/g, proposal.name || 'module')
            .replace(/\{n\}/g, String(proposal.nested.count));
    }
    if (n > 1) {
        if (proposal.action === 'create-folder') {
            return (
                (ui.sageConstructDoneFolderN || '{n} modules created on the map. You can rename them and add content.').replace(
                    /\{n\}/g,
                    String(n)
                )
            );
        }
        if (proposal.action === 'create-exam') {
            return (
                (ui.sageConstructDoneExamN || '{n} exams created on the map. Tap them when you want to edit the quizzes.').replace(
                    /\{n\}/g,
                    String(n)
                )
            );
        }
        return (
            (ui.sageConstructDoneLessonN || '{n} lessons created on the map. Tap them when you want to write content.').replace(
                /\{n\}/g,
                String(n)
            )
        );
    }
    if (proposal.action === 'create-folder') {
        return ui.sageConstructDoneFolder || 'Module created on the map. You can rename it and add content.';
    }
    if (proposal.action === 'create-exam') {
        return ui.sageConstructDoneExam || 'Exam created on the map. Tap it when you want to edit the quiz.';
    }
    return ui.sageConstructDoneLesson || 'Lesson created on the map. Tap it when you want to write content.';
}
