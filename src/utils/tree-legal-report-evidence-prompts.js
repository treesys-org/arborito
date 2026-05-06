/** Minimum lengths to discourage empty / bot reports (no legal representation data requested). */
export const LEGAL_REPORT_MIN_WHERE_IN_TREE = 120;
export const LEGAL_REPORT_MIN_WHAT_WORK = 80;
export const LEGAL_REPORT_MIN_DESCRIPTION = 200;

/**
 * Collects evidence text about the tree and the work for `putTreeLegalReport`.
 * @param {*} store global app instance (`store`), with `ui`, `prompt`, `confirm`, `notify`.
 * @returns {Promise<{ whereInTree: string, whatWork: string, description: string, links: string[] } | null>}
 */
export async function promptTreeLegalReportEvidence(store) {
    const ui = store.ui;
    const title = ui.legalReportTitle || ui.treeReportReasonCopyright || 'Legal report';

    const whereRaw = await store.prompt(
        ui.legalReportWhereInTreeBody ||
            'Where in this tree is the infringing material? Be specific (paths, lesson or deck titles, visible text, node ids). Vague reports are discarded.',
        ui.legalReportWhereInTreePlaceholder || 'e.g. module X → lesson “…”, first screen shows …',
        title
    );
    const whereInTree = String(whereRaw || '').trim();
    if (whereInTree.length < LEGAL_REPORT_MIN_WHERE_IN_TREE) {
        if (whereInTree.length === 0) return null;
        store.notify(
            (ui.legalReportWhereTooShort || 'Please be more specific about where in this tree (min {n} characters).').replace(
                /\{n\}/g,
                String(LEGAL_REPORT_MIN_WHERE_IN_TREE)
            ),
            true
        );
        return null;
    }

    const whatRaw = await store.prompt(
        ui.legalReportWhatWorkBody ||
            'What work is being used without authorization? (title, author or rights holder, and a public link if one exists.)',
        ui.legalReportWhatWorkPlaceholder || 'Title, creator, link to original listing…',
        title
    );
    const whatWork = String(whatRaw || '').trim();
    if (whatWork.length < LEGAL_REPORT_MIN_WHAT_WORK) {
        if (whatWork.length === 0) return null;
        store.notify(
            (ui.legalReportWhatWorkTooShort || 'Please identify the work more clearly (min {n} characters).').replace(
                /\{n\}/g,
                String(LEGAL_REPORT_MIN_WHAT_WORK)
            ),
            true
        );
        return null;
    }

    const descRaw = await store.prompt(
        ui.legalReportDescBody ||
            'Explain how this tree reproduces or closely imitates that work (min 200 characters).',
        ui.legalReportDescPlaceholder || 'Details…',
        title
    );
    const description = String(descRaw || '').trim();
    if (description.length < LEGAL_REPORT_MIN_DESCRIPTION) {
        if (description.length === 0) return null;
        store.notify(ui.legalReportDescTooShort || 'Please write at least 200 characters.', true);
        return null;
    }

    const linksRaw = await store.prompt(
        ui.legalReportLinksBody || 'Optional evidence links (one per line): official page, catalog, screenshot host, etc.',
        ui.legalReportLinksPlaceholder || 'https://…',
        title
    );
    const links = String(linksRaw || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 6);

    const okDecl = await store.confirm(
        ui.legalReportDeclarationBody ||
            'I declare in good faith that the locations and work described above are accurate to the best of my knowledge.',
        ui.legalReportDeclarationTitle || ui.legalReportTitle || 'Legal report',
        true
    );
    if (!okDecl) return null;

    return { whereInTree, whatWork, description, links };
}
