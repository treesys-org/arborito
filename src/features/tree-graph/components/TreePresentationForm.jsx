import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { safeStripeSupportUrl } from '../../../shared/lib/stripe-support-url.js';
import {
    collectTreeIdentities,
    currentIdentityNameForSave,
    savePresentationMetadata,
} from '../api/tree-presentation-logic.js';

function supportFieldChanged(rawSupport, baselineSupport) {
    return String(rawSupport || '').trim() !== String(baselineSupport || '').trim();
}

/** Validate support only when the user edited the field; unchanged legacy values must not block description saves. */
function resolveSupportForSave(rawSupport, baselineSupport, changed) {
    const trimmed = String(rawSupport || '').trim();
    if (!changed) {
        const baselineTrimmed = String(baselineSupport || '').trim();
        if (!baselineTrimmed) return '';
        return safeStripeSupportUrl(baselineTrimmed) || '';
    }
    if (!trimmed) return '';
    return safeStripeSupportUrl(trimmed) || '';
}

function supportBlocksSave(rawSupport, baselineSupport) {
    const trimmed = String(rawSupport || '').trim();
    if (!trimmed) return false;
    if (!supportFieldChanged(rawSupport, baselineSupport)) return false;
    return !safeStripeSupportUrl(trimmed);
}

export const TreePresentationForm = forwardRef(function TreePresentationForm(
    {
        aboutKind,
        desc: initialDesc,
        authorName: initialAuthor,
        supportInputValue: initialSupport,
        hideTitle,
        hideDescLabel,
        title,
        publishHub = false,
    },
    ref
) {
    const tree = useTreeGraph();
    const { ui, notify } = tree;
    const [desc, setDesc] = useState(initialDesc);
    const [supportUrl, setSupportUrl] = useState(initialSupport);
    const ids = useMemo(() => collectTreeIdentities(), [initialDesc, initialAuthor, initialSupport]);

    const pubLim =
        typeof tree.getPublicationMetadataLimits === 'function'
            ? tree.getPublicationMetadataLimits()
            : { authorMin: 2, descriptionMin: 5 };

    const baseline = useMemo(
        () => ({
            description: String(initialDesc || '').trim(),
            authorName: String(initialAuthor || '').trim(),
            supportUrl: String(initialSupport || '').trim(),
        }),
        [initialDesc, initialAuthor, initialSupport]
    );

    const identityName = currentIdentityNameForSave(baseline.authorName);
    const authorAbout = String(
        tree.rawGraphData?.universePresentation?.authorAbout || ''
    ).trim();

    const next = useMemo(() => {
        const rawSupport = String(supportUrl || '').trim();
        const supportChanged = supportFieldChanged(rawSupport, baseline.supportUrl);
        return {
            description: String(desc || '').trim(),
            authorName: identityName || baseline.authorName,
            authorAbout,
            supportUrl: rawSupport,
            supportChanged,
            supportNormalized: resolveSupportForSave(rawSupport, baseline.supportUrl, supportChanged),
        };
    }, [desc, supportUrl, identityName, baseline.authorName, baseline.supportUrl, authorAbout]);

    const isDirty =
        next.description !== baseline.description ||
        next.authorName !== baseline.authorName ||
        next.supportUrl !== baseline.supportUrl;

    const meetsSaveReqs =
        next.description.length >= pubLim.descriptionMin &&
        !supportBlocksSave(next.supportUrl, baseline.supportUrl);

    const canSave = isDirty && meetsSaveReqs;

    useEffect(() => {
        if (isDirty) return;
        setDesc(initialDesc);
        setSupportUrl(initialSupport);
    }, [initialDesc, initialSupport, isDirty]);

    useEffect(() => {
        if (!publishHub || !identityName) return undefined;
        if (String(baseline.authorName || '').trim().length >= pubLim.authorMin) return undefined;
        savePresentationMetadata({
            aboutKind,
            description: baseline.description,
            authorName: identityName,
            authorAbout,
            supportUrl: baseline.supportUrl ? safeStripeSupportUrl(baseline.supportUrl) || '' : '',
        });
        return undefined;
    }, [
        publishHub,
        identityName,
        baseline.authorName,
        baseline.description,
        baseline.supportUrl,
        aboutKind,
        authorAbout,
        pubLim.authorMin,
    ]);

    const persistDraft = useCallback(() => {
        savePresentationMetadata({
            aboutKind,
            description: next.description,
            authorName: next.authorName,
            authorAbout: next.authorAbout,
            supportUrl: next.supportNormalized,
        });
    }, [aboutKind, next]);

    const onSave = useCallback(() => {
        if (!canSave) {
            const tpl = ui.publishMissingDescription || ui.publishMetaRequiredTitle || 'Course details required';
            const msg = String(tpl).includes('{n}')
                ? String(tpl).replace(/\{n\}/g, String(pubLim.descriptionMin))
                : tpl;
            notify(msg, true);
            return false;
        }
        persistDraft();
        const savedMsg =
            aboutKind === 'tree'
                ? ui.treeMetaSaved || 'Saved.'
                : ui.treeMetaSavedBranch || ui.treeMetaSaved || 'Saved.';
        notify(savedMsg);
        return true;
    }, [canSave, aboutKind, ui, pubLim.descriptionMin, publishHub, notify, persistDraft]);

    const flushMetadata = useCallback(() => {
        const rawSupport = String(supportUrl || '').trim();
        const supportChanged = supportFieldChanged(rawSupport, baseline.supportUrl);
        const description = String(desc || '').trim();
        const author = identityName || baseline.authorName;

        if (supportBlocksSave(rawSupport, baseline.supportUrl)) {
            return {
                ok: false,
                message:
                    ui.treeMetaSupportStripeHint ||
                    'Only Stripe Payment Links (https://buy.stripe.com/…) are accepted.',
            };
        }
        if (description.length < pubLim.descriptionMin) {
            const tpl = ui.publishMissingDescription || ui.publishMetaRequiredTitle || 'Course details required';
            const message = String(tpl).includes('{n}')
                ? String(tpl).replace(/\{n\}/g, String(pubLim.descriptionMin))
                : tpl;
            return { ok: false, message };
        }
        if (author.length < pubLim.authorMin) {
            const tpl =
                ui.publishMissingAuthor ||
                'Add an author or organization name before publishing.';
            const message = String(tpl).includes('{n}')
                ? String(tpl).replace(/\{n\}/g, String(pubLim.authorMin))
                : tpl;
            return { ok: false, message };
        }

        const normalized = resolveSupportForSave(rawSupport, baseline.supportUrl, supportChanged);
        savePresentationMetadata({
            aboutKind,
            description,
            authorName: author,
            authorAbout,
            supportUrl: normalized,
        });
        return { ok: true };
    }, [
        aboutKind,
        authorAbout,
        baseline.authorName,
        baseline.supportUrl,
        desc,
        identityName,
        pubLim.authorMin,
        pubLim.descriptionMin,
        supportUrl,
        ui,
    ]);

    useImperativeHandle(ref, () => ({ flushMetadata }), [flushMetadata]);

    const showCollabDialog = useCallback(() => {
        if (!ids.owner) return;
        const renderRow = (p) =>
            `<li class="arborito-tree-pres-collab-item">
                <span class="arborito-tree-pres-collab-item__name">${p.label}</span>
                ${p.sub ? `<span class="arborito-tree-pres-collab-item__sub">${p.sub}</span>` : ''}
                <span class="arborito-tree-pres-collab-item__role">${p.role}</span>
            </li>`;
        const html = `<ul class="arborito-tree-pres-collab-list">
            ${renderRow(ids.owner)}
            ${ids.collaborators.map(renderRow).join('')}
        </ul>`;
        tree.alert(html, ui.treeMetaCollaboratorsListTitle || 'People who edit this tree', {
            bodyHtml: true,
            confirmText: ui.treeMetaCollaboratorsClose || ui.close || 'Close',
        });
    }, [ids, ui]);

    const descLabel =
        aboutKind === 'tree'
            ? ui.treeMetaDescription || 'Tree description'
            : ui.treeMetaDescriptionBranch || ui.constructionScopeBranchInfoLabel || 'Branch description';
    const descPh =
        aboutKind === 'tree'
            ? ui.treeMetaDescriptionPh || ''
            : ui.treeMetaDescriptionBranchPh || ui.treeMetaDescriptionPh || '';
    const saveLabel =
        aboutKind === 'tree'
            ? ui.treeMetaSave || 'Save tree info'
            : ui.treeMetaSaveBranch || ui.treeMetaSave || 'Save branch info';
    const minHint = String(ui.treeMetaMinCharsHint || 'Minimum {n} characters (required).').replace(
        /\{n\}/g,
        String(pubLim.descriptionMin)
    );

    const showHeading = !hideTitle && title;
    const showDescLabel = !hideDescLabel && !showHeading;

    return (
        <div className="arborito-tree-pres-inline">
            {showHeading ? <h2 className="arborito-tree-pres-inline__title">{title}</h2> : null}
            <div className="space-y-2 arborito-text-strong">
                {showDescLabel ? (
                <label className="arborito-eyebrow arborito-eyebrow--strong block">
                    {descLabel} <span className="text-red-600" title={ui.publishMissingDescription || ''}>*</span>
                </label>
                ) : null}
                <p className="text-[9px] font-bold arborito-text-muted m-0 -mt-0.5">{minHint}</p>
                <textarea
                    id="tree-pres-desc"
                    rows={3}
                    className="arborito-input arborito-input--compact w-full text-xs"
                    placeholder={descPh}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    aria-label={showDescLabel ? undefined : descLabel}
                />
                <label className="arborito-eyebrow arborito-eyebrow--strong block">
                    {ui.treeMetaSupportUrl || 'Support-the-creator link'}
                </label>
                <input
                    id="tree-pres-support"
                    type="url"
                    inputMode="url"
                    className="arborito-input arborito-input--compact w-full text-xs arborito-input--mono"
                    value={supportUrl}
                    placeholder="https://buy.stripe.com/…"
                    autoComplete="off"
                    onChange={(e) => setSupportUrl(e.target.value)}
                />
                <p className="text-[10px] arborito-text-muted leading-snug pt-0.5">
                    {ui.treeMetaSupportStripeHint ||
                        'Only Stripe Payment Links (https://buy.stripe.com/…) are accepted, so the link always points to Stripe checkout.'}
                </p>
                {publishHub ? (
                    <>
                        <p className="text-[10px] leading-snug text-slate-600 dark:text-slate-300 m-0 pt-1">
                            {ui.constructionBranchMetaFileHint}
                        </p>
                        <button
                            type="button"
                            id="tree-pres-save"
                            disabled={!canSave}
                            className={`arborito-tree-pres-save w-full py-2.5 rounded-xl arborito-cta-emerald font-black text-xs shadow-sm border border-emerald-700/25 transition-[transform,opacity,box-shadow] active:scale-[0.98]${canSave ? ' arborito-tree-pres-save--ready' : ''}`}
                            onClick={() => onSave()}
                        >
                            {ui.constructionBranchMetaSaveLabel ||
                                ui.treeMetaSaveBranch ||
                                ui.treeMetaSave}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        id="tree-pres-save"
                        disabled={!canSave}
                        className={`arborito-tree-pres-save w-full py-2.5 rounded-xl arborito-cta-emerald font-black text-xs shadow-sm border border-emerald-700/25 transition-[transform,opacity,box-shadow] active:scale-[0.98]${canSave ? ' arborito-tree-pres-save--ready' : ''}`}
                        onClick={() => onSave()}
                    >
                        {saveLabel}
                    </button>
                )}
                {!ids.owner ? (
                    <p className="arborito-tree-pres-creator-hint">
                        {ui.treeMetaCreatorMissingHint ||
                            'Sign in with your online account (Profile) so the tree card shows you as the creator.'}
                    </p>
                ) : (
                    <div className="arborito-tree-pres-creator" data-arbor-creator-row>
                        <span className="arborito-tree-pres-creator__label">{ui.treeMetaCreatorLabel || 'Created by'}</span>
                        <span className="arborito-tree-pres-creator__name">{ids.owner.label}</span>
                        {ids.owner.sub ? (
                            <span className="arborito-tree-pres-creator__sub">{ids.owner.sub}</span>
                        ) : null}
                        {ids.collaborators.length ? (
                            <button
                                type="button"
                                className="arborito-tree-pres-creator__collab"
                                data-arbor-collab-toggle="1"
                                aria-haspopup="dialog"
                                onClick={showCollabDialog}
                            >
                                {String(ui.treeMetaCollaboratorsCount || '+{n} collaborators').replace(
                                    /\{n\}/g,
                                    String(ids.collaborators.length)
                                )}
                            </button>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
});
