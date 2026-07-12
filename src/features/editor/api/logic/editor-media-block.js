import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { isElectronDesktop } from '../../../learning/api/electron-bridge.js';
import {
    isThirdPartyVideoEmbedUrl,
    resolveVideoEmbedSrc,
    validateLessonMediaUrl,
} from '../../../learning/api/parser-url.js';

function mountElectronWebviewPreview(preview, embed) {
    const wrap = document.createElement('div');
    wrap.className =
        'media-preview__video relative w-full pb-[56.25%] h-0 rounded-lg overflow-hidden bg-black';
    const wv = document.createElement('webview');
    wv.src = embed;
    wv.className = 'absolute inset-0 w-full h-full';
    wv.setAttribute('allowpopups', 'true');
    wrap.appendChild(wv);
    preview.replaceChildren(wrap);
}

/** Update live preview inside a construct-editor media block. */
export function syncMediaBlockPreview(block) {
    if (!(block instanceof HTMLElement) || !block.classList.contains('arborito-media-edit')) return;
    const type = String(block.dataset.type || 'image');
    const url = String(block.querySelector('.media-url-input')?.value || block.dataset.mediaUrl || '').trim();
    const preview = block.querySelector('.media-preview');
    if (!preview) return;
    const ui = store.ui;

    if (!url) {
        preview.innerHTML = `<span class="media-preview__placeholder">${escapeHtml(ui.editorBlockMediaPreviewEmpty || 'Paste a link to preview')}</span>`;
        block.classList.remove('arborito-media-edit--has-preview');
        return;
    }

    const allowedUrl = validateLessonMediaUrl(type, url);
    if (!allowedUrl) {
        preview.innerHTML = `<span class="media-preview__placeholder text-amber-700 dark:text-amber-200">${escapeHtml(
            ui.editorBlockMediaUrlDisallowed ||
                'Use YouTube, PeerTube, or a moderated image host (Imgur, Wikimedia, Unsplash, …).'
        )}</span>`;
        block.classList.remove('arborito-media-edit--has-preview');
        return;
    }

    if (allowedUrl) block.dataset.mediaUrl = allowedUrl;
    else delete block.dataset.mediaUrl;

    block.classList.add('arborito-media-edit--has-preview');
    if (type === 'image') {
        preview.innerHTML = `<img src="${escapeAttr(allowedUrl)}" class="media-preview__image max-h-56 w-auto max-w-full rounded-lg shadow object-contain" alt="">`;
        return;
    }
    if (type === 'video') {
        const embed = resolveVideoEmbedSrc(allowedUrl);
        if (isThirdPartyVideoEmbedUrl(embed)) {
            if (isElectronDesktop()) {
                mountElectronWebviewPreview(preview, embed);
            } else {
                preview.innerHTML = `<div class="media-preview__video relative w-full pb-[56.25%] h-0 rounded-lg overflow-hidden bg-black"><iframe src="${escapeAttr(embed)}" class="absolute inset-0 w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>`;
            }
        }
        return;
    }
    if (type === 'audio') {
        preview.innerHTML = `<audio class="media-preview__audio w-full" controls src="${escapeAttr(allowedUrl)}"></audio>`;
    }
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

export function bindMediaBlockControls(block) {
    if (!(block instanceof HTMLElement) || !block.classList.contains('arborito-media-edit')) return;
    syncMediaBlockPreview(block);
    if (block.dataset.mediaControlsBound === '1') return;
    block.dataset.mediaControlsBound = '1';
    const input = block.querySelector('.media-url-input');
    input?.addEventListener('input', () => syncMediaBlockPreview(block));
    input?.addEventListener('change', () => syncMediaBlockPreview(block));
}
