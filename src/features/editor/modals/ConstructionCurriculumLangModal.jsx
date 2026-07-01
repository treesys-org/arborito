import { useEditor } from '../hooks/useEditor.js';
import { useEffect } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { CurriculumLangPicker } from '../../sources/components/CurriculumLangPicker.jsx';

function resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, appLang) {
    if (!langKeys.length) return '';
    if (curriculumEditLang && langKeys.includes(curriculumEditLang)) return curriculumEditLang;
    const al = appLang && String(appLang);
    if (al && langKeys.includes(al)) return al;
    return langKeys[0];
}

export function ModalConstructionCurriculumLang() {
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

    useEffect(() => {
        document.documentElement.classList.add('arborito-language-modal-open');
        return () => document.documentElement.classList.remove('arborito-language-modal-open');
    }, []);

    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="COMPACT"
            shellOpts={{ scrim: 'translucent' }}
            hero={
                <ModalHero
                    ui={ui}
                    mobile={mobile}
                    title={title}
                    leadingIcon={<ChromeEmoji emoji="🌐" size={24} className="shrink-0" />}
                    tagClass="btn-construct-lang-close"
                    extraWrapClassDesktop="border-b border-slate-100 dark:border-slate-800"
                    onClose={close}
                />
            }
        >
            <div className="px-4 pt-4 pb-6 md:pb-5 flex flex-col gap-2">
                <p className="arborito-eyebrow mb-2">{fieldLb}</p>
                <CurriculumLangPicker
                    langKeys={langKeys}
                    value={selectValue}
                    ariaLabel={fieldLb}
                    canAdd={canAdd}
                    addLabel={ui.conCurriculumLangAddOption || ui.conMoreRowAddLang || '+ Add language…'}
                    onChange={(code) => setCurriculumEditLang(code || null)}
                    onPickAdd={() => addCurriculumLanguageInteractive({ fromConstructionLangModal: true })}
                />
            </div>
        </DockModalShell>
    );
}
