import { useEditor } from '../hooks/useEditor.js';
import { useEffect } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { CurriculumLangPicker } from '../../sources/components/CurriculumLangPicker.jsx';
import { constructionHubSheetClassName } from '../api/construction-hub-sheet.js';
import { ConstructionModalShell } from './ConstructionModalShell.jsx';

function resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, appLang) {
    if (!langKeys.length) return '';
    if (curriculumEditLang && langKeys.includes(curriculumEditLang)) return curriculumEditLang;
    const al = appLang && String(appLang);
    if (al && langKeys.includes(al)) return al;
    return langKeys[0];
}

export function ModalConstructionCurriculumLang({ dockHost = false, instantReveal = false }) {
    const editor = useEditor();
    const {
        ui,
        dismissModal,
        rawGraphData,
        curriculumEditLang,
        lang,
        constructionMode,
        editorActions,
    } = editor;

    const { canOfferCurriculumLanguageAdd, addCurriculumLanguageInteractive, setCurriculumEditLang } =
        editorActions;
    const canOfferCurriculumLanguageRemove = editorActions.canOfferCurriculumLanguageRemove;
    const removeCurriculumLanguage = editorActions.removeCurriculumLanguage;
    const curriculumLangPickerEpoch = editor.curriculumLangPickerEpoch || 0;
    const mobile = shouldShowMobileUI();
    const close = () => dismissModal();

    const langKeys =
        rawGraphData?.languages && typeof rawGraphData.languages === 'object'
            ? Object.keys(rawGraphData.languages).sort()
            : [];
    const displayKey = resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, lang || '');
    const selectValue =
        curriculumEditLang && langKeys.includes(curriculumEditLang) ? curriculumEditLang : displayKey;

    const title = ui.conConstructionLangModalTitle || ui.conLangDockTab || ui.conCurriculumLangLabel || 'Language';
    const fieldLb = ui.conCurriculumLangLabel || 'Content language';

    const canAdd = constructionMode && canOfferCurriculumLanguageAdd();
    const canRemove = constructionMode && !!canOfferCurriculumLanguageRemove?.();

    useEffect(() => {
        document.documentElement.classList.add('arborito-language-modal-open');
        return () => document.documentElement.classList.remove('arborito-language-modal-open');
    }, []);

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="🌐"
            tagClass="btn-construct-lang-close"
            onClose={close}
        />
    );

    const body = (
        <div className="px-4 pt-4 pb-6 md:p-6 md:pt-2 flex flex-col gap-2 overflow-y-auto custom-scrollbar min-h-0">
            <p className="arborito-eyebrow mb-2">{fieldLb}</p>
            <CurriculumLangPicker
                key={`modal-lang-picker-${selectValue}-${curriculumLangPickerEpoch}`}
                langKeys={langKeys}
                value={selectValue}
                ariaLabel={fieldLb}
                canAdd={canAdd}
                addLabel={ui.conCurriculumLangAddOption || ui.conMoreRowAddLang || '+ Add language…'}
                onChange={(code) => setCurriculumEditLang(code || null)}
                onPickAdd={() => addCurriculumLanguageInteractive({ fromConstructionLangModal: true })}
                canRemove={canRemove}
                removeLabel={ui.conCurriculumLangRemoveAria || ui.removeCurriculumLangTitle || 'Remove {code}'}
                onRemove={(code) => removeCurriculumLanguage?.(code)}
            />
        </div>
    );

    return (
        <ConstructionModalShell
            dockHost={dockHost}
            mobile={mobile}
            compact
            sizeTier="COMPACT"
            hero={hero}
            onClose={close}
            ariaLabel={title}
            instantReveal={instantReveal}
            panelDataAttr="modal-construction-curriculum-lang"
            sheetClassName={constructionHubSheetClassName('construction-curriculum-lang')}
            shellOpts={{ rootFlags: 'arborito-modal--language', layout: 'dock-bottom' }}
            panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
        >
            {body}
        </ConstructionModalShell>
    );
}
