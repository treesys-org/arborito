import { ModalHubHero, ModalHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { threadsFor, placeNodeName } from '../api/modals/logic/forum-modal-utils.js';

function PlaceLevelRow({ p, ui, threadCount, onPick, onDrill, pickClass, drillClass, compact }) {
    const isGen = !!p.isGeneral;
    const id = isGen ? '' : String(p.id);
    const label = isGen ? ui.forumGeneralPlace || 'General' : placeNodeName(p);
    const icon = isGen ? '💬' : p.icon || '🗂️';
    const canDrill = !isGen && !!p.hasChildren;
    const drillAria = (ui.forumMobileNavEnter || 'Open {name}').replace('{name}', label);
    const pickAria = `${label}, ${threadCount} ${ui.forumTopicsCountShort || 'topics'}`;

    return (
        <div
            className={`${compact ? 'w-[calc(100%-0.75rem)]' : 'w-[calc(100%-0.5rem)]'} mx-auto mb-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 overflow-hidden`}
        >
            <div className="flex items-stretch w-full min-w-0">
                <button
                    type="button"
                    className={`${pickClass} flex-1 min-w-0 text-left px-3 ${compact ? 'py-2.5' : 'py-3'} min-h-11 flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500`}
                    data-place-id={id}
                    aria-label={pickAria}
                    onClick={() => onPick(id)}
                >
                    <span className="shrink-0 text-lg leading-none mt-0.5 opacity-90" aria-hidden="true">
                        {icon}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span
                            className={`forum-place-level__title block ${compact ? 'text-xs' : 'text-sm'} font-bold leading-snug line-clamp-2`}
                        >
                            {label}
                        </span>
                        <span
                            className={`forum-place-level__meta block ${compact ? 'text-[10px]' : 'text-[11px]'} font-semibold mt-0.5`}
                        >
                            {threadCount} {ui.forumTopicsCountShort || 'topics'}
                        </span>
                    </span>
                </button>
                {canDrill ? (
                    <button
                        type="button"
                        className={`${drillClass} shrink-0 ${compact ? 'w-12' : 'w-14'} min-h-11 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 font-black text-slate-700 dark:text-slate-200`}
                        data-place-id={id}
                        aria-label={drillAria}
                        title={drillAria}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDrill(id);
                        }}
                    >
                        ›
                    </button>
                ) : (
                    <span className={`shrink-0 ${compact ? 'w-12' : 'w-14'} border-l border-slate-200/0 dark:border-slate-700/0`} aria-hidden="true" />
                )}
            </div>
        </div>
    );
}

function buildLevelRows(places, parentId, filterQ, allThreads, ui, showGeneral) {
    const q = String(filterQ || '').trim().toLowerCase();
    const nameMatches = (p) => {
        if (!q) return true;
        return String(p.name || '').toLowerCase().includes(q);
    };
    const pid = parentId != null ? String(parentId) : '';
    const children = (places || []).filter(
        (p) => !p.isGeneral && String(p.parentId != null ? p.parentId : '') === pid
    ).filter(nameMatches);
    const generalRow = showGeneral && !q
        ? [{ id: null, isGeneral: true, name: ui.forumGeneralPlace || 'General', icon: '💬', hasChildren: false }]
        : [];
    return [...generalRow, ...children];
}

export function ForumPlainHero({
    ui,
    title,
    subtitle,
    titleId,
    titleTruncate,
    showBack,
    backTagClass = 'forum-stack-back',
    backAriaLabel,
    leadingIcon,
    trailingHtml,
    onBack,
}) {
    return (
        <ModalHero
            ui={ui}
            mobile
            tone="plain"
            showClose={false}
            showBack={showBack}
            backTagClass={backTagClass}
            backAriaLabel={backAriaLabel}
            title={title}
            titleId={titleId}
            subtitle={subtitle}
            titleTruncate={titleTruncate}
            leadingIcon={leadingIcon}
            trailingHtml={trailingHtml}
            onBack={onBack}
        />
    );
}

export function ForumMobileNavHero({
    ui,
    places,
    placeById,
    mobNavStack,
    onDismiss,
    embedded = false,
}) {
    const rootPlace = places.find((p) => !p.isGeneral && (p.depth || 0) === 0) || null;
    const rootId = rootPlace ? String(rootPlace.id) : null;
    const mobCurParentId = mobNavStack.length ? String(mobNavStack[mobNavStack.length - 1]) : rootId;
    const mobCurPlace = mobCurParentId ? placeById.get(String(mobCurParentId)) : null;
    const mobCurTitle = mobCurPlace ? mobCurPlace.name : rootPlace ? rootPlace.name : ui.forumTitle || 'Forum';
    const mobNavTitle = ui.forumPlacesHeading || 'Course area';
    const mobNavBackLabel = ui.forumMobileNavBack || ui.forumBackToTopicsAria || 'Back';
    const mobNavDismissAria = mobNavStack.length
        ? mobNavBackLabel
        : ui.forumMobileDismissNavAria || ui.forumAriaBackToList || 'Back to forum';

    if (embedded) {
        return (
            <ForumPlainHero
                ui={ui}
                showBack
                backTagClass="forum-mob-nav-dismiss"
                backAriaLabel={mobNavDismissAria}
                title={mobCurTitle}
                subtitle={mobNavTitle}
                titleTruncate
                leadingIcon={<ChromeEmoji emoji="🗂️" size={24} />}
                onBack={onDismiss}
            />
        );
    }

    return (
        <ModalHubHero
            ui={ui}
            mobile
            showClose={false}
            showBack
            backTagClass="forum-mob-nav-dismiss"
            backAriaLabel={mobNavDismissAria}
            title={mobCurTitle}
            subtitle={mobNavTitle}
            titleTruncate
            leadingIcon={<ChromeEmoji emoji="🗂️" size={24} />}
            onBack={onDismiss}
        />
    );
}

export function ForumMobileNavBody({
    ui,
    places,
    allThreads,
    forumPlaceFilterQ,
    mobNavStack,
    structureHint,
    onFilterChange,
    onPickPlace,
    onDrillPlace,
}) {
    const rootPlace = places.find((p) => !p.isGeneral && (p.depth || 0) === 0) || null;
    const rootId = rootPlace ? String(rootPlace.id) : null;
    const mobCurParentId = mobNavStack.length ? String(mobNavStack[mobNavStack.length - 1]) : rootId;
    const fqLabel = ui.forumPlaceFilterAria || ui.forumPlaceFilterPlaceholder || 'Filter sections';
    const rows = buildLevelRows(places, mobCurParentId, forumPlaceFilterQ, allThreads, ui, mobNavStack.length === 0);
    const structureSummary = ui.forumStructureHintSummary || ui.forumLimitSummaryShort || ui.forumPlacesHeading || 'About sections';

    return (
        <div className="forum-mob-nav-panel lg:hidden flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-white dark:bg-slate-900">
                <div className="forum-mob-nav-filter shrink-0 w-full border-b border-slate-200 dark:border-slate-700 px-3 py-2.5">
                    {structureHint ? (
                        <details className="forum-mob-structure-details mb-2">
                            <summary className="cursor-pointer select-none list-none text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                {structureSummary}
                            </summary>
                            <div className="mt-1.5">{structureHint}</div>
                        </details>
                    ) : null}
                    <label className="sr-only" htmlFor="forum-place-filter-mob">
                        {fqLabel}
                    </label>
                    <input
                        id="forum-place-filter-mob"
                        type="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        value={forumPlaceFilterQ}
                        placeholder={ui.forumPlaceFilterPlaceholder || 'Filter by section…'}
                        className="mt-2 arborito-input arborito-input--compact rounded-lg font-medium min-h-11 w-full"
                        onChange={(e) => onFilterChange(e.target.value, 'forum-place-filter-mob')}
                    />
                </div>
                <div
                    className="forum-mob-places-scroll flex-1 overflow-y-auto overflow-x-hidden min-h-0 w-full custom-scrollbar px-1 py-2"
                    role="navigation"
                    aria-label={ui.forumPlaceSelectAria || ui.forumPlacesHeading || 'Course areas'}
                >
                    {rows.length ? (
                        rows.map((p) => (
                            <PlaceLevelRow
                                key={p.isGeneral ? 'general' : p.id}
                                p={p}
                                ui={ui}
                                threadCount={threadsFor(allThreads, p.isGeneral ? null : String(p.id)).length}
                                pickClass="forum-mob-nav-pick"
                                drillClass="forum-mob-nav-drill-btn"
                                onPick={onPickPlace}
                                onDrill={onDrillPlace}
                            />
                        ))
                    ) : (
                        <div className="p-4 text-xs text-slate-600 dark:text-slate-300">
                            {ui.forumNoSearchResults || 'No matches found'}
                        </div>
                    )}
                </div>
            </div>
    );
}

export function ForumMobileZoneBar({ ui, pLabel, onOpenNav, onOpenNewTopic, showNewTopic }) {
    const mobNavTitle = ui.forumPlacesHeading || 'Course area';
    const mobNavOpenLabel = ui.forumMobileOpenNav || ui.forumPlacesHeading || 'Course area';
    return (
        <div className="forum-mob-zone-root lg:hidden shrink-0 w-full border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="forum-mob-zone-bar flex items-center gap-2 px-3 py-2.5 min-h-11">
                <button
                    type="button"
                    className="forum-mob-nav-open arborito-mmenu-back shrink-0 min-h-11 w-11"
                    aria-label={mobNavOpenLabel}
                    onClick={onOpenNav}
                >
                    <span aria-hidden="true">☰</span>
                </button>
                <div className="min-w-0 flex-1">
                    <p className="arborito-eyebrow">{mobNavTitle}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate" title={pLabel}>
                        {pLabel}
                    </p>
                </div>
                {showNewTopic ? (
                    <button
                        type="button"
                        className="forum-new-thread arborito-cta-emerald shrink-0 min-h-10 px-3 py-2 rounded-xl text-[11px] font-bold tracking-wide shadow-sm shadow-emerald-900/15"
                        aria-label={ui.forumNewTopicAria || ui.forumNewThread || 'New topic'}
                        onClick={onOpenNewTopic}
                    >
                        {ui.forumNewTopic || '+ Topic'}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export function ForumDesktopPlaces({
    ui,
    places,
    allThreads,
    placeById,
    forumPlaceFilterQ,
    deskNavStack,
    structureHint,
    onFilterChange,
    onDeskBack,
    onPickPlace,
    onDrillPlace,
}) {
    const rootPlace = places.find((p) => !p.isGeneral && (p.depth || 0) === 0) || null;
    const rootId = rootPlace ? String(rootPlace.id) : null;
    const deskCurParentId = deskNavStack.length ? String(deskNavStack[deskNavStack.length - 1]) : rootId;
    const deskCurPlace = deskCurParentId ? placeById.get(String(deskCurParentId)) : null;
    const deskCurTitle = deskCurPlace ? deskCurPlace.name : rootPlace ? rootPlace.name : ui.forumTitle || 'Forum';
    const mobNavBackLabel = ui.forumMobileNavBack || ui.forumBackToTopicsAria || 'Back';
    const fqLabel = ui.forumPlaceFilterAria || ui.forumPlaceFilterPlaceholder || 'Filter sections';
    const rows = buildLevelRows(places, deskCurParentId, forumPlaceFilterQ, allThreads, ui, deskNavStack.length === 0);

    return (
        <aside className="forum-aside forum-aside--categories forum-master-nav hidden lg:flex lg:w-[13rem] xl:w-[14rem] shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-h-0">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
                <p className="text-xs font-bold tracking-wide text-slate-600 dark:text-slate-300">
                    {ui.forumPlacesHeading || 'Categories'}
                </p>
                {structureHint}
                <div className="mt-2">
                    <label className="sr-only" htmlFor="forum-place-filter-desk">
                        {fqLabel}
                    </label>
                    <input
                        id="forum-place-filter-desk"
                        type="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        value={forumPlaceFilterQ}
                        placeholder={ui.forumPlaceFilterPlaceholder || 'Filter by section…'}
                        className="arborito-input arborito-input--compact rounded-lg font-medium"
                        onChange={(e) => onFilterChange(e.target.value, 'forum-place-filter-desk')}
                    />
                </div>
            </div>
            {deskNavStack.length > 0 ? (
                <div className="shrink-0 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                    <button
                        type="button"
                        className="forum-desk-nav-back min-h-10 px-3 py-2 rounded-xl text-xs font-bold tracking-wide border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 w-full text-left"
                        aria-label={mobNavBackLabel}
                        onClick={onDeskBack}
                    >
                        ← {mobNavBackLabel}{' '}
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">·</span>{' '}
                        <span className="font-black">{deskCurTitle}</span>
                    </button>
                </div>
            ) : null}
            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 py-2">
                {rows.length ? (
                    rows.map((p) => (
                        <PlaceLevelRow
                            key={p.isGeneral ? 'general' : p.id}
                            p={p}
                            ui={ui}
                            compact
                            threadCount={threadsFor(allThreads, p.isGeneral ? null : String(p.id)).length}
                            pickClass="forum-desk-nav-pick"
                            drillClass="forum-desk-nav-drill"
                            onPick={onPickPlace}
                            onDrill={onDrillPlace}
                        />
                    ))
                ) : (
                    <div className="p-4 text-xs text-slate-600 dark:text-slate-300">
                        {ui.forumNoSearchResults || 'No matches found'}
                    </div>
                )}
            </div>
        </aside>
    );
}
