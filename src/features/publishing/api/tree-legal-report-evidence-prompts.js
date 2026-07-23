/** Minimum lengths to discourage empty / bot reports. */
const LEGAL_REPORT_MIN_WHERE_IN_TREE = 120;
const LEGAL_REPORT_MIN_WHAT_WORK = 80;
const LEGAL_REPORT_MIN_DESCRIPTION = 200;
const LEGAL_REPORT_MIN_GROUND = 60;

/**
 * Collects a DSA Art. 16 compliant notice for `putTreeLegalReport`:
 * exact location in the tree, identification of the work / content,
 * substantiated explanation, optional evidence links, the notifier's
 * name and e-mail (Art. 16(2)(c), anonymity is only allowed when the
 * notice concerns child sexual abuse material), and the good-faith
 * declaration (Art. 16(2)(d)).
 *
 * @param {*} store global app instance (`store`), with `ui`, `prompt`, `confirm`, `notify`.
 * @param {{ reportType?: 'copyright' | 'illegal' }} [opts]
 * @returns {Promise<{ whereInTree: string, whatWork: string, description: string, links: string[], legalGround: string, notifierName: string, notifierEmail: string } | null>}
 */
export async function promptTreeLegalReportEvidence(store, opts = {}) {
    const ui = store.ui;
    const reportType = opts.reportType === 'illegal' ? 'illegal' : 'copyright';
    const title = ui.legalReportTitle || ui.treeReportReasonCopyright || 'Legal report';
    const caseHint = String(ui.legalReportCaseIdHint || '').trim();
    if (caseHint) {
        store.notify(caseHint, false);
    }

    let legalGround = '';
    if (reportType === 'illegal') {
        const groundRaw = await store.prompt(
            ui.legalReportGroundBody ||
                'Why is this content illegal? Name the law or legal ground you rely on (e.g. defamation, incitement, fraud, privacy violation) and the country whose law applies.',
            ui.legalReportGroundPlaceholder || 'Law / legal ground and country…',
            title
        );
        legalGround = String(groundRaw || '').trim();
        if (legalGround.length < LEGAL_REPORT_MIN_GROUND) {
            if (legalGround.length === 0) return null;
            store.notify(
                (ui.legalReportGroundTooShort || 'Please explain the legal ground more clearly (min {n} characters).').replace(
                    /\{n\}/g,
                    String(LEGAL_REPORT_MIN_GROUND)
                ),
                true
            );
            return null;
        }
    }

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

    /* DSA Art. 16(2)(c): the notice must allow the notifier to provide their
     * name and e-mail. Leaving them empty is only foreseen when the notice
     * concerns child sexual abuse material; otherwise an anonymous notice may
     * not qualify as a valid DSA notice and carries less weight. */
    const nameRaw = await store.prompt(
        ui.legalReportNotifierNameBody ||
            'Your name or the name of the entity you represent (required by the EU Digital Services Act, Art. 16, unless this notice concerns child sexual abuse material, in that case you may leave it empty).',
        ui.legalReportNotifierNamePlaceholder || 'Full name / organisation…',
        title
    );
    if (nameRaw === null || nameRaw === undefined) return null;
    const notifierName = String(nameRaw || '').trim().slice(0, 160);

    const emailRaw = await store.prompt(
        ui.legalReportNotifierEmailBody ||
            'Your e-mail address, so the parties involved can follow up on this notice (same DSA rule and exception as the name).',
        ui.legalReportNotifierEmailPlaceholder || 'you@example.org',
        title
    );
    if (emailRaw === null || emailRaw === undefined) return null;
    const notifierEmail = String(emailRaw || '').trim().slice(0, 160);

    const okDecl = await store.confirm(
        ui.legalReportDeclarationBody ||
            'I declare in good faith that the information and allegations in this notice are accurate and complete (EU Digital Services Act, Art. 16).',
        ui.legalReportDeclarationTitle || ui.legalReportTitle || 'Legal report',
        true
    );
    if (!okDecl) return null;

    return { whereInTree, whatWork, description, links, legalGround, notifierName, notifierEmail };
}
