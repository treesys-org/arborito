import { getArboritoStore as store } from '../../../../core/store-singleton.js';

function topicIdsFromBlock(block) {
    const raw =
        block.querySelector('.game-topics-input')?.value || block.getAttribute('data-topics') || '';
    return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function syncGameBlockTopicsUi(block) {
    const topics = topicIdsFromBlock(block);
    const joined = topics.join(',');
    block.setAttribute('data-topics', joined);
    const hidden = block.querySelector('.game-topics-input');
    if (hidden) hidden.value = joined;
    const list = block.querySelector('.game-topics-list');
    const ui = store.ui;
    if (list) {
        list.textContent = topics.length
            ? topics.join(', ')
            : ui.editorBlockGameTopicsNone || 'No topics selected';
    }
    const countEl = block.querySelector('.arborito-eyebrow span.opacity-70');
    if (countEl) countEl.textContent = `(${topics.length})`;
}

function syncGameOptionalUi(block) {
    const optional = block.getAttribute('data-optional') !== 'false';
    const btn = block.querySelector('.game-optional-toggle-btn');
    const lbl = block.querySelector('.game-opt-lbl');
    const ui = store.ui;
    if (btn) btn.setAttribute('aria-pressed', optional ? 'true' : 'false');
    if (lbl) {
        lbl.textContent = optional
            ? ui.tagOptional || 'Optional'
            : ui.tagRequired || 'Required';
    }
}

/** Wire game block controls inside the visual editor (delegation target: block root). */
export function handleGameBlockAction(block, target) {
    if (!(block instanceof HTMLElement) || !(target instanceof Element)) return false;

    if (target.closest('.game-optional-toggle-btn')) {
        const optional = block.getAttribute('data-optional') !== 'false';
        block.setAttribute('data-optional', optional ? 'false' : 'true');
        syncGameOptionalUi(block);
        return true;
    }

    if (target.closest('.game-topic-clear')) {
        block.setAttribute('data-topics', '');
        const hidden = block.querySelector('.game-topics-input');
        if (hidden) hidden.value = '';
        syncGameBlockTopicsUi(block);
        return true;
    }

    if (target.closest('.game-topic-add')) {
        const select = block.querySelector('.game-topic-select');
        const picked = String(select?.value || '').trim();
        if (!picked) return false;
        const topics = topicIdsFromBlock(block);
        if (!topics.includes(picked)) topics.push(picked);
        block.setAttribute('data-topics', topics.join(','));
        const hidden = block.querySelector('.game-topics-input');
        if (hidden) hidden.value = topics.join(',');
        syncGameBlockTopicsUi(block);
        if (select) select.value = '';
        return true;
    }

    if (target.closest('.game-existing-use')) {
        const select = block.querySelector('.game-existing-select');
        const urlInput = block.querySelector('.game-url-input');
        const picked = String(select?.value || '').trim();
        if (!picked || !urlInput) return false;
        urlInput.value = picked;
        return true;
    }

    return false;
}

export function bindGameBlockControls(block) {
    if (!(block instanceof HTMLElement)) return;
    syncGameOptionalUi(block);
    syncGameBlockTopicsUi(block);
}
