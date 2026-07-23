import { useLearning } from '../hooks/useLearning.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ModalBackChevronIcon } from '../../../app/components/ModalHero.jsx';
import { LessonEditorToolbarBridge } from '../../editor/components/LessonEditorToolbarBridge.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { useBindMobileTapRef } from '../../../shared/ui/useBindMobileTap.js';
import { NODE_PROPERTY_EMOJIS } from '../../tree-graph/api/node-property-emojis.js';

function MobileLessonBackButton({ ui, onClose }) {
    const mobile = shouldShowMobileUI();
    const btnRef = useRef(null);
    const handleClose = useCallback(() => onClose?.(), [onClose]);
    useBindMobileTapRef(btnRef, handleClose, mobile);
    const label = ui.navBack || ui.close || 'Back';
    return (
        <button
            ref={btnRef}
            type="button"
            id="btn-close-content-mobile"
            className="arborito-mmenu-back arborito-lesson-mobile-back shrink-0"
            aria-label={label}
            title={label}
            onClick={mobile ? undefined : handleClose}
        >
            <ModalBackChevronIcon className="arborito-lesson-mobile-back__glyph" />
        </button>
    );
}

function LessonSaveButton({ ui, saveSaving, lessonUserHasEdited, onSave, saveLabel }) {
    const canSave = lessonUserHasEdited && !saveSaving;
    const label = saveSaving ? '…' : saveLabel || ui.lessonSave || 'Save lesson';
    const saveBtnClass = [
        'arborito-lesson-save-btn shrink-0 px-3.5 py-2 sm:px-4 rounded-lg text-sm font-black transition-[transform,box-shadow,background-color,border-color,color] touch-manipulation min-h-[2.5rem] border shadow-sm',
        canSave ? 'arborito-cta-emerald border-emerald-700/30 active:scale-[0.98]' : 'arborito-lesson-save-btn--idle'
    ].join(' ');

    return (
        <button
            type="button"
            id="btn-lesson-save"
            data-arbor-tour="lesson-edit-save"
            className={saveBtnClass}
            disabled={!canSave}
            aria-disabled={!canSave}
            onClick={() => onSave?.()}
        >
            {label}
        </button>
    );
}

function ModalCloseX({ ui, extraClasses = 'btn-close-lesson arborito-lesson-head-close', inverse = true, onClose }) {
    if (shouldShowMobileUI()) return null;
    const label = ui.close || 'Close';
    return (
        <button
            type="button"
            className={`arborito-modal-window-x${extraClasses ? ` ${extraClasses}` : ''} shrink-0${inverse ? ' arborito-modal-window-x--inverse' : ''}`}
            aria-label={label}
            data-arbor-tip={label}
            onClick={() => onClose?.()}
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="w-[1.125rem] h-[1.125rem]">
                <path d="M18 6 6 18M6 6l12 12" />
            </svg>
        </button>
    );
}

function TocPillButton({ isTocVisible, ui, onToggleToc }) {
    const label = ui.lessonTopics || 'Contents';
    const mobile = shouldShowMobileUI();
    const btnRef = useRef(null);
    const handleToggle = useCallback(() => onToggleToc?.(), [onToggleToc]);
    useBindMobileTapRef(btnRef, handleToggle, mobile);
    return (
        <button
            ref={btnRef}
            type="button"
            id="btn-toggle-toc"
            className={`arborito-lesson-mtool arborito-lesson-mtool--compact arborito-lesson-toc-pill ${isTocVisible ? 'is-active' : ''}`}
            aria-expanded={isTocVisible}
            aria-label={label}
            data-arbor-tip={label}
            onClick={mobile ? undefined : handleToggle}
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75zm0 5.25h.008v.008H3.75V12zm0 5.25h.008v.008H3.75v-.008z" />
            </svg>
        </button>
    );
}

function ReadTools({
    ui,
    isMobile,
    isExam,
    isBookmarkedHere,
    bookmarkElsewhere,
    bookmarkTooltip,
    isSpeaking,
    onReadSection,
    onToggleBookmark,
    onExportPdf,
    onAskSage
}) {
    const readSectionLabel = ui.lessonReadSection || ui.sageVoiceReadMessage || 'Read section';
    const pdfFullLabel = ui.exportTitle || 'Exportar a PDF';
    const pdfShortLabel = ui.exportPdfShort || 'PDF';
    const sageFullLabel = ui.navSage || 'Ask Sage';

    const bookmarkIcon = isBookmarkedHere ? (
        <svg className="w-5 h-5 text-yellow-500 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
        </svg>
    ) : bookmarkElsewhere ? (
        <svg className="w-5 h-5 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.371 1.141l-4.203 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.203-3.602a.563.563 0 01.371-1.141l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
    ) : (
        <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.563.045.797.777.371 1.141l-4.203 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.203-3.602a.563.563 0 01.371-1.141l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
    );

    return (
        <>
            {!isExam ? (
                <button
                    type="button"
                    id="btn-read-section"
                    className={`arborito-lesson-mtool arborito-lesson-read-btn${isMobile ? ' arborito-lesson-mtool--compact' : ''}${isSpeaking ? ' is-speaking' : ''}`}
                    title={readSectionLabel}
                    aria-label={readSectionLabel}
                    aria-pressed={isSpeaking || undefined}
                    onClick={() => onReadSection?.()}
                >
                    <span className="arborito-read-btn__icon-slot" aria-hidden="true">
                        <svg className="arborito-read-btn__icon arborito-read-btn__icon--play w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                        </svg>
                        <svg className="arborito-read-btn__icon arborito-read-btn__icon--pause w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                    </span>
                    {isMobile ? null : <span className="arborito-lesson-mtool-label">{readSectionLabel}</span>}
                </button>
            ) : null}
            <button
                type="button"
                id="btn-toggle-bookmark"
                className={`arborito-lesson-mtool arborito-lesson-bookmark-btn${isBookmarkedHere ? ' is-bookmarked-here' : bookmarkElsewhere ? ' has-bookmark-elsewhere' : ''}${isMobile ? ' arborito-lesson-mtool--compact' : ''}`}
                title={bookmarkTooltip}
                aria-label={bookmarkTooltip}
                onClick={() => onToggleBookmark?.()}
            >
                {bookmarkIcon}
            </button>
            {!isExam ? (
                <button
                    type="button"
                    id="btn-export-pdf"
                    className={`arborito-lesson-mtool${isMobile ? ' arborito-lesson-mtool--compact' : ''}`}
                    title={pdfFullLabel}
                    aria-label={pdfFullLabel}
                    onClick={() => onExportPdf?.()}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {isMobile ? null : <span className="arborito-lesson-mtool-label">{pdfShortLabel}</span>}
                </button>
            ) : null}
            {!isExam && !isMobile ? (
                <button
                    type="button"
                    id="btn-ask-sage"
                    className="arborito-lesson-mtool arborito-lesson-mtool--sage"
                    title={sageFullLabel}
                    aria-label={sageFullLabel}
                    onClick={() => onAskSage?.()}
                >
                    <span aria-hidden="true">
                        <ChromeEmoji emoji="🦉" size={18} />
                    </span>
                    <span className="arborito-lesson-mtool-label">{sageFullLabel}</span>
                </button>
            ) : null}
        </>
    );
}

function ConstructTitleBlock({
    node,
    isExam,
    lessonHeaderTitleValue,
    lessonHeaderDescValue,
    pathBreadcrumb,
    ui,
    onHeaderMetaChange,
    onHeaderEmojiPick
}) {
    const lessonHeaderEmojiBtnTitle = ui.lessonHeaderIconEmoji || ui.lessonTocEmojiPlaceholder || 'Icon';
    const headerTitleAria = ui.graphPromptLessonName || ui.lessonHeaderEditMeta || 'Lesson name';
    const headerDescAria = ui.editorLabelDesc || 'Description';
    const headerDescPh = ui.treeMetaDescriptionPh || '';
    const lessonHeaderEmojiAria = ui.lessonTocEmojiPlaceholder || 'Emoji';
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickerRef = useRef(null);

    useEffect(() => {
        if (!pickerOpen) return undefined;
        const onDoc = (e) => {
            if (pickerRef.current?.contains(e.target)) return;
            setPickerOpen(false);
        };
        setTimeout(() => document.addEventListener('click', onDoc), 0);
        return () => document.removeEventListener('click', onDoc);
    }, [pickerOpen]);

    return (
        <div className="arborito-lesson-meta-hit group flex items-start gap-2 w-full min-w-0 min-h-0 rounded-xl -mx-1 px-1 py-0.5 text-left transition-colors hover:bg-amber-100/40 dark:hover:bg-amber-950/25" data-arbor-tour="lesson-edit-meta">
            <div className="relative shrink-0 arborito-lesson-emoji-wrap" ref={pickerRef}>
                <button
                    type="button"
                    id="btn-lesson-node-meta"
                    className="arborito-lesson-emoji-btn shrink-0 rounded-lg p-0.5 -m-0.5 transition-transform hover:bg-amber-100/60 dark:hover:bg-amber-950/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80"
                    title={lessonHeaderEmojiBtnTitle}
                    aria-label={ui.lessonHeaderIconEmojiAria || lessonHeaderEmojiBtnTitle}
                    aria-expanded={pickerOpen}
                    aria-haspopup="listbox"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPickerOpen((v) => !v);
                    }}
                >
                    <span className="arborito-lesson-emoji shrink-0 transition-transform group-hover:scale-105">
                        <ChromeEmoji emoji={node.icon || '📄'} className="arborito-lesson-emoji arborito-emoji-glyph" />
                    </span>
                </button>
                <div
                    id="lesson-header-emoji-picker"
                    className={`arborito-lesson-emoji-picker${pickerOpen ? '' : ' hidden'}`}
                    role="listbox"
                    aria-label={lessonHeaderEmojiAria}
                >
                    <div className="arborito-lesson-emoji-picker__grid">
                        {NODE_PROPERTY_EMOJIS.map((e) => (
                            <button
                                key={e}
                                type="button"
                                className="btn-lesson-header-emoji js-lesson-header-emoji-choice"
                                aria-label={`${lessonHeaderEmojiAria} ${e}`}
                                onClick={(ev) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    setPickerOpen(false);
                                    onHeaderEmojiPick?.(e);
                                }}
                            >
                                <ChromeEmoji emoji={e} className="arborito-emoji-glyph" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="flex items-start gap-1.5 min-w-0">
                    <input
                        type="text"
                        id="inp-lesson-header-title"
                        className="arborito-lesson-header-title-input w-full min-w-0"
                        value={lessonHeaderTitleValue}
                        autoComplete="off"
                        spellCheck
                        aria-label={headerTitleAria}
                        onChange={(e) =>
                            onHeaderMetaChange?.({
                                title: e.target.value,
                                description: undefined
                            })
                        }
                    />
                    {isExam ? (
                        <span className="arborito-pill arborito-pill--chip arborito-pill--red arborito-pill--bordered shrink-0 align-middle">
                            {ui.tagExam || 'EXAM'}
                        </span>
                    ) : null}
                </div>
                {pathBreadcrumb ? <p className="arborito-lesson-mobile-breadcrumb pointer-events-none">{pathBreadcrumb}</p> : null}
                <input
                    type="text"
                    id="inp-lesson-header-desc"
                    className="arborito-lesson-header-desc-input w-full min-w-0"
                    value={lessonHeaderDescValue}
                    placeholder={headerDescPh}
                    autoComplete="off"
                    spellCheck
                    aria-label={headerDescAria}
                    onChange={(e) =>
                        onHeaderMetaChange?.({
                            title: undefined,
                            description: e.target.value
                        })
                    }
                />
            </div>
        </div>
    );
}

function ReadTitleBlock({ node, isExam, pathBreadcrumb, careFeedbackMsg, isMobile, ui }) {
    const examTag = isExam ? (
        <span className="arborito-pill arborito-pill--chip arborito-pill--red arborito-pill--bordered align-middle">
            {ui.tagExam || 'EXAM'}
        </span>
    ) : null;

    if (isMobile) {
        return (
            <>
                <ChromeEmoji emoji={node.icon || '📄'} className="arborito-lesson-emoji arborito-emoji-glyph" />
                <div className="min-w-0 flex-1">
                    <h1 className="arborito-lesson-mobile-title truncate" title={[node.name, pathBreadcrumb].filter(Boolean).join(', ')}>
                        {node.name} {examTag}
                    </h1>
                    {pathBreadcrumb ? <p className="arborito-lesson-mobile-breadcrumb pointer-events-none">{pathBreadcrumb}</p> : null}
                </div>
            </>
        );
    }

    return (
        <>
            <ChromeEmoji emoji={node.icon || '📄'} className="arborito-lesson-emoji arborito-emoji-glyph" />
            <div className="min-w-0 flex-1">
                <h1 className="line-clamp-3 flex flex-wrap items-center gap-1.5">
                    {node.name} {examTag}
                </h1>
                {careFeedbackMsg ? (
                    <p className="arborito-care-feedback text-xs text-emerald-700 dark:text-emerald-300 font-medium mt-1 mb-0">
                        {careFeedbackMsg}
                    </p>
                ) : null}
                {pathBreadcrumb ? <p className="arborito-lesson-mobile-breadcrumb">{pathBreadcrumb}</p> : null}
            </div>
        </>
    );
}

export function LessonHeader({
    node,
    constructEdit,
    isExam,
    isTocVisible,
    showTocChrome,
    lessonHeaderTitleValue,
    lessonHeaderDescValue,
    careFeedbackMsg,
    isBookmarkedHere,
    bookmarkElsewhere,
    bookmarkTooltip,
    isSpeaking,
    onClose,
    onToggleToc,
    onToggleBookmark,
    onExportPdf,
    onAskSage,
    onReadSection,
    onHeaderMetaChange,
    onHeaderEmojiPick,
    toolbarHandlers,
    onSave,
    lessonSaveState,
    lessonUserHasEdited
}) {
    const { ui } = useLearning();
    const isMobile = shouldShowMobileUI();
    const isDesktop = !isMobile;
    const pathBreadcrumb = node.path ? node.path.split(' / ').slice(0, -1).join(' / ') : '';
    const lessonToolsLabel = constructEdit
        ? ui.lessonToolbar && ui.navConstruct
            ? `${ui.lessonToolbar} · ${ui.navConstruct}`
            : ui.lessonToolbar || ui.navConstruct || ''
        : ui.lessonToolbar || '';

    const saveSaving = lessonSaveState === 'saving';

    const titleBlock = constructEdit ? (
        <ConstructTitleBlock
            key={`construct-meta:${node.id}`}
            node={node}
            isExam={isExam}
            lessonHeaderTitleValue={lessonHeaderTitleValue}
            lessonHeaderDescValue={lessonHeaderDescValue}
            pathBreadcrumb={pathBreadcrumb}
            ui={ui}
            onHeaderMetaChange={onHeaderMetaChange}
            onHeaderEmojiPick={onHeaderEmojiPick}
        />
    ) : (
        <ReadTitleBlock
            node={node}
            isExam={isExam}
            pathBreadcrumb={pathBreadcrumb}
            careFeedbackMsg={careFeedbackMsg}
            isMobile={isMobile}
            ui={ui}
        />
    );

    const sageHeadSlot =
        !isExam && isMobile ? (
            <button
                type="button"
                id="btn-ask-sage"
                className="arborito-lesson-mtool arborito-lesson-mtool--sage arborito-lesson-mtool--compact shrink-0"
                data-arbor-tip={ui.navSage || 'Ask Sage'}
                aria-label={ui.navSage || 'Ask Sage'}
                onClick={() => onAskSage?.()}
            >
                <ChromeEmoji emoji="🦉" size={18} />
            </button>
        ) : null;

    const readTools = (
        <ReadTools
            ui={ui}
            isMobile={isMobile}
            isExam={isExam}
            isBookmarkedHere={isBookmarkedHere}
            bookmarkElsewhere={bookmarkElsewhere}
            bookmarkTooltip={bookmarkTooltip}
            isSpeaking={isSpeaking}
            onReadSection={onReadSection}
            onToggleBookmark={onToggleBookmark}
            onExportPdf={onExportPdf}
            onAskSage={onAskSage}
        />
    );

    const mobileReadTrail = !constructEdit && isMobile ? (
        <div className="arborito-lesson-head-trail arborito-lesson-head-trail--read">
            <div className="arborito-lesson-actions arborito-lesson-actions--read arborito-lesson-actions--read-compact" role="toolbar" aria-label={lessonToolsLabel}>
                <div className="arborito-lesson-read-row">
                    <div className="arborito-lesson-read-bar">
                        {showTocChrome ? <TocPillButton isTocVisible={isTocVisible} ui={ui} onToggleToc={onToggleToc} /> : null}
                        <div className="arborito-lesson-toolbar-scroll js-lesson-toolbar-scroll min-w-0 box-border">
                            <div className="arborito-lesson-read-tools-cluster flex flex-nowrap items-center gap-0.28rem px-1 py-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/50 box-border shrink-0">
                                {readTools}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    const constructTrail = constructEdit ? (
        <div className="arborito-lesson-head-trail arborito-lesson-head-trail--construct">
            <div className="arborito-lesson-actions arborito-lesson-actions--construct arborito-lesson-actions--construct-compact" role="toolbar" aria-label={lessonToolsLabel} data-arbor-tour="lesson-edit-toolbar">
                <div className="arborito-lesson-construct-row">
                    <div className="arborito-lesson-construct-bar">
                        {showTocChrome ? <TocPillButton isTocVisible={isTocVisible} ui={ui} onToggleToc={onToggleToc} /> : null}
                        <div className="arborito-lesson-toolbar-scroll js-lesson-toolbar-scroll min-w-0 box-border">
                            <LessonEditorToolbarBridge ui={ui} isMobile={isMobile} toolbarHandlers={toolbarHandlers} />
                        </div>
                    </div>
                    <LessonSaveButton
                        ui={ui}
                        saveSaving={saveSaving}
                        lessonUserHasEdited={lessonUserHasEdited}
                        onSave={onSave}
                        saveLabel={ui.lessonSave}
                    />
                </div>
            </div>
        </div>
    ) : null;

    const desktopReadActions = !constructEdit && isDesktop ? (
        <div className="arborito-lesson-actions" role="toolbar" aria-label={lessonToolsLabel}>
            <div className="arborito-lesson-tools-group">
                {readTools}
            </div>
            {showTocChrome ? <TocPillButton isTocVisible={isTocVisible} ui={ui} onToggleToc={onToggleToc} /> : null}
        </div>
    ) : null;

    const desktopTrail = isDesktop ? (
        <div className="arborito-lesson-head-trail arborito-lesson-head-trail--desktop">
            {constructEdit ? (
                <div className="arborito-lesson-actions arborito-lesson-actions--construct arborito-lesson-actions--construct-compact" role="toolbar" aria-label={lessonToolsLabel} data-arbor-tour="lesson-edit-toolbar">
                    <div className="arborito-lesson-construct-row">
                        {!isExam && !isMobile ? (
                            <button type="button" id="btn-ask-sage" className="arborito-lesson-mtool arborito-lesson-mtool--sage" data-arbor-tip={ui.navSage || 'Ask Sage'} aria-label={ui.navSage || 'Ask Sage'} onClick={() => onAskSage?.()}>
                                <ChromeEmoji emoji="🦉" size={18} />
                            </button>
                        ) : null}
                        <div className="arborito-lesson-construct-bar">
                            {showTocChrome ? <TocPillButton isTocVisible={isTocVisible} ui={ui} onToggleToc={onToggleToc} /> : null}
                            <div className="arborito-lesson-toolbar-scroll js-lesson-toolbar-scroll min-w-0 box-border">
                                <LessonEditorToolbarBridge ui={ui} isMobile={isMobile} toolbarHandlers={toolbarHandlers} />
                            </div>
                        </div>
                        <LessonSaveButton
                            ui={ui}
                            saveSaving={saveSaving}
                            lessonUserHasEdited={lessonUserHasEdited}
                            onSave={onSave}
                            saveLabel={ui.lessonSave}
                        />
                    </div>
                </div>
            ) : (
                desktopReadActions
            )}
            <ModalCloseX ui={ui} onClose={onClose} />
        </div>
    ) : null;

    const headPrimary = isDesktop ? (
        <div className="arborito-lesson-head-primary min-w-0 flex-1">
            <div className="arborito-lesson-mobile-titleblock min-w-0 w-full">{titleBlock}</div>
        </div>
    ) : (
        <div className={`arborito-lesson-head-primary arborito-lesson-head-primary--mobile${constructEdit ? ' arborito-lesson-head-primary--construct' : ' arborito-lesson-head-primary--read'}`}>
            <div className={`arborito-lesson-mobile-toolbar arborito-lesson-mobile-toolbar--unified${constructEdit ? ' arborito-lesson-mobile-toolbar--construct' : ' arborito-lesson-mobile-toolbar--read'}`}>
                <MobileLessonBackButton ui={ui} onClose={onClose} />
                <div className="arborito-lesson-mobile-titleblock min-w-0 flex-1">{titleBlock}</div>
                {sageHeadSlot}
            </div>
            {constructEdit ? constructTrail : mobileReadTrail}
        </div>
    );

    return (
        <header className="arborito-lesson-mobile-head">
            {isDesktop ? <div className="arborito-lesson-mobile-grab" aria-hidden="true" /> : null}
            <div className="arborito-lesson-head-main arborito-lesson-head-main--with-close">
                <div className="arborito-lesson-head-stack min-w-0 flex-1">{headPrimary}</div>
                {desktopTrail}
            </div>
        </header>
    );
}
