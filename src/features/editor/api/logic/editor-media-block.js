import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { isElectronDesktop } from '../../../learning/api/electron-bridge.js';
import {
    detectMediaProviderId,
    mediaProviderById,
    mediaProviderExample,
    providersForMediaType,
    defaultMediaProviderId,
} from '../../../learning/api/lesson-media-providers.js';
import {
    putLessonMediaFile,
    resolveLessonMediaSrc,
    safeMediaFilename,
} from '../../../learning/api/lesson-local-media-store.js';
import {
    isThirdPartyVideoEmbedUrl,
    resolveVideoEmbedSrc,
    validateLessonMediaUrl,
} from '../../../learning/api/parser-url.js';

const MAX_LOCAL_BYTES = 8 * 1024 * 1024;

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

function setWhyOpen(block, open) {
    const panel = block.querySelector('.media-url-why-panel');
    const btn = block.querySelector('.media-url-why-toggle');
    if (!panel || !btn) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function activeBranchId() {
    try {
        if (typeof fileSystem.localGardenTreeId === 'function') {
            const id = fileSystem.localGardenTreeId();
            if (id) return String(id).trim();
        }
        const s = store;
        return String(s.state?.activeSource?.id || s.state?.activeSource?.branchId || '').trim();
    } catch {
        return '';
    }
}

function localFilenameLabel(path) {
    const s = String(path || '').trim();
    if (!s) return '';
    const slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    return slash >= 0 ? s.slice(slash + 1) : s;
}

function syncLocalFilenameLabel(block, path) {
    const el = block.querySelector('.media-local-filename');
    if (!(el instanceof HTMLElement)) return;
    const name = localFilenameLabel(path);
    el.textContent = name;
    el.hidden = !name;
}

function syncLocalUploadVisibility(block) {
    const select = block.querySelector('.media-provider-select');
    const urlRow = block.querySelector('.media-url-row');
    const localRow = block.querySelector('.media-local-row');
    const networkFoot = block.querySelector('.media-network-foot');
    const selectVal = select instanceof HTMLSelectElement ? select.value : '';
    const isLocal = selectVal === 'local';
    if (isLocal) block.dataset.mediaProvider = 'local';
    else if (block.dataset.mediaProvider === 'local') {
        block.dataset.mediaProvider = selectVal || '';
    }
    if (urlRow instanceof HTMLElement) {
        urlRow.classList.toggle('hidden', isLocal);
        urlRow.hidden = isLocal;
        urlRow.style.display = isLocal ? 'none' : '';
    }
    if (localRow instanceof HTMLElement) {
        localRow.classList.toggle('hidden', !isLocal);
        localRow.hidden = !isLocal;
        localRow.style.display = isLocal ? '' : 'none';
    }
    if (networkFoot instanceof HTMLElement) {
        networkFoot.classList.toggle('hidden', isLocal);
        networkFoot.hidden = isLocal;
        networkFoot.style.display = isLocal ? 'none' : '';
    }
    if (isLocal) {
        const path = String(
            block.querySelector('.media-url-input')?.value || block.dataset.mediaUrl || ''
        ).trim();
        syncLocalFilenameLabel(block, path);
        setWhyOpen(block, false);
    }
}

function syncProviderSelect(block, url) {
    const select = block.querySelector('.media-provider-select');
    if (!(select instanceof HTMLSelectElement)) return;
    const fromUrl = detectMediaProviderId(url);
    const pinned = String(block.dataset.mediaProvider || '').trim();
    // Prefer the user's select choice while editing; only auto-detect from URL when empty.
    const preferred = select.value || pinned;
    const id = fromUrl || preferred;
    if (id && [...select.options].some((o) => o.value === id)) {
        select.value = id;
        block.dataset.mediaProvider = id;
    } else if (!url && !pinned && !select.value) {
        select.value = '';
        delete block.dataset.mediaProvider;
    } else if (pinned && [...select.options].some((o) => o.value === pinned)) {
        select.value = pinned;
    }
    syncLocalUploadVisibility(block);
}

function markUrlValidity(block, ok, empty) {
    const input = block.querySelector('.media-url-input');
    if (!(input instanceof HTMLInputElement)) return;
    input.classList.toggle('arborito-input--invalid', !empty && !ok);
    input.setAttribute('aria-invalid', !empty && !ok ? 'true' : 'false');
}

export function enforceMediaBlockUrl(block, { clearInvalid = false } = {}) {
    if (!(block instanceof HTMLElement) || !block.classList.contains('arborito-media-edit')) return '';
    const type = String(block.dataset.type || 'image');
    const input = block.querySelector('.media-url-input');
    const raw = String(input?.value || block.dataset.mediaUrl || '').trim();
    if (!raw) {
        delete block.dataset.mediaUrl;
        markUrlValidity(block, true, true);
        return '';
    }
    const allowedUrl = validateLessonMediaUrl(type, raw);
    if (!allowedUrl) {
        delete block.dataset.mediaUrl;
        markUrlValidity(block, false, false);
        if (clearInvalid && input instanceof HTMLInputElement) {
            input.value = '';
            markUrlValidity(block, true, true);
        }
        return '';
    }
    block.dataset.mediaUrl = allowedUrl;
    if (input instanceof HTMLInputElement && input.value.trim() !== allowedUrl) {
        input.value = allowedUrl;
    }
    const detected = detectMediaProviderId(allowedUrl);
    if (detected) block.dataset.mediaProvider = detected;
    markUrlValidity(block, true, false);
    return allowedUrl;
}

async function renderPreview(block, allowedUrl, type) {
    const preview = block.querySelector('.media-preview');
    if (!preview) return;
    const ui = store.ui;
    const branchId = activeBranchId();
    const displaySrc = await resolveLessonMediaSrc(allowedUrl, branchId);

    block.classList.add('arborito-media-edit--has-preview');
    if (type === 'image') {
        preview.innerHTML = `<img src="${escapeAttr(displaySrc)}" class="media-preview__image max-h-56 w-auto max-w-full rounded-lg shadow object-contain" alt="">`;
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
        } else {
            const src = await resolveLessonMediaSrc(embed || allowedUrl, branchId);
            preview.innerHTML = `<div class="media-preview__video relative w-full pb-[56.25%] h-0 rounded-lg overflow-hidden bg-black"><video class="absolute inset-0 w-full h-full object-contain" controls src="${escapeAttr(src)}" preload="metadata"></video></div>`;
        }
        return;
    }
    if (type === 'audio') {
        preview.innerHTML = `<audio class="media-preview__audio w-full" controls src="${escapeAttr(displaySrc)}"></audio>`;
    }
}

export function syncMediaBlockPreview(block) {
    if (!(block instanceof HTMLElement) || !block.classList.contains('arborito-media-edit')) return;
    const type = String(block.dataset.type || 'image');
    const input = block.querySelector('.media-url-input');
    const url = String(input?.value || block.dataset.mediaUrl || '').trim();
    const preview = block.querySelector('.media-preview');
    if (!preview) return;
    const ui = store.ui;

    syncProviderSelect(block, url);

    if (!url) {
        const isLocal = block.dataset.mediaProvider === 'local';
        preview.innerHTML = `<span class="media-preview__placeholder">${escapeHtml(
            isLocal
                ? ui.editorBlockMediaLocalEmpty || 'Choose a local file'
                : ui.editorBlockMediaPreviewEmpty || 'Paste a link to preview'
        )}</span>`;
        block.classList.remove('arborito-media-edit--has-preview');
        if (!isLocal) delete block.dataset.mediaUrl;
        markUrlValidity(block, true, true);
        return;
    }

    const allowedUrl = validateLessonMediaUrl(type, url);
    if (!allowedUrl) {
        let msg = ui.editorBlockMediaUrlDisallowed || 'That link is not allowed.';
        try {
            const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
            if (
                type === 'audio' &&
                host === 'archive.org' &&
                !/\.(mp3|ogg|wav|m4a|aac|flac|opus)(?:\?|$)/i.test(url)
            ) {
                msg =
                    ui.editorBlockMediaNeedDirectAudio ||
                    'Paste the direct audio file link (…mp3), not the website page.';
            }
        } catch {
            /* ignore */
        }
        preview.innerHTML = `<span class="media-preview__placeholder text-amber-700 dark:text-amber-200">${escapeHtml(
            msg
        )}</span>`;
        block.classList.remove('arborito-media-edit--has-preview');
        delete block.dataset.mediaUrl;
        markUrlValidity(block, false, false);
        return;
    }

    block.dataset.mediaUrl = allowedUrl;
    markUrlValidity(block, true, false);
    void renderPreview(block, allowedUrl, type);
}

async function handleLocalFile(block, file) {
    const ui = store.ui;
    const type = String(block.dataset.type || 'image');
    const input = block.querySelector('.media-url-input');
    const preview = block.querySelector('.media-preview');
    if (!file) return;
    if (file.size > MAX_LOCAL_BYTES) {
        if (preview) {
            preview.innerHTML = `<span class="media-preview__placeholder text-amber-700 dark:text-amber-200">${escapeHtml(
                ui.editorBlockMediaLocalTooLarge || 'File too large (max 8 MB).'
            )}</span>`;
        }
        return;
    }
    const branchId = activeBranchId();
    if (!branchId) {
        if (preview) {
            preview.innerHTML = `<span class="media-preview__placeholder text-amber-700 dark:text-amber-200">${escapeHtml(
                ui.editorBlockMediaNeedBranch ||
                    'Open a branch before attaching local media.'
            )}</span>`;
        }
        return;
    }
    const name = safeMediaFilename(file.name);
    try {
        const path = await putLessonMediaFile(branchId, name, file, file.type || '');
        if (input instanceof HTMLInputElement) input.value = path;
        block.dataset.mediaUrl = path;
        block.dataset.mediaProvider = 'local';
        syncLocalFilenameLabel(block, path);
        syncLocalUploadVisibility(block);
        syncMediaBlockPreview(block);
    } catch (e) {
        console.warn('[Arborito] local media save failed', e);
        if (preview) {
            preview.innerHTML = `<span class="media-preview__placeholder text-amber-700 dark:text-amber-200">${escapeHtml(
                ui.editorBlockMediaLocalSaveFailed || 'Could not save local file.'
            )}</span>`;
        }
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
    if (block.dataset.mediaUrl && !block.dataset.mediaProvider) {
        const d = detectMediaProviderId(block.dataset.mediaUrl);
        if (d) block.dataset.mediaProvider = d;
    }
    syncMediaBlockPreview(block);
    if (block.dataset.mediaControlsBound === '1') return;
    block.dataset.mediaControlsBound = '1';

    const input = block.querySelector('.media-url-input');
    const select = block.querySelector('.media-provider-select');
    const whyToggle = block.querySelector('.media-url-why-toggle');
    const fileInput = block.querySelector('.media-local-file');

    input?.addEventListener('input', () => syncMediaBlockPreview(block));
    input?.addEventListener('change', () => {
        enforceMediaBlockUrl(block, { clearInvalid: true });
        syncMediaBlockPreview(block);
    });
    input?.addEventListener('blur', () => {
        enforceMediaBlockUrl(block, { clearInvalid: true });
        syncMediaBlockPreview(block);
    });

    select?.addEventListener('change', () => {
        const type = String(block.dataset.type || 'image');
        const providerId = select.value;
        const provider = mediaProviderById(providerId);
        block.dataset.mediaProvider = providerId || '';
        if (!(input instanceof HTMLInputElement)) {
            syncLocalUploadVisibility(block);
            return;
        }
        if (provider) {
            input.placeholder = mediaProviderExample(provider, /** @type {'image'|'video'|'audio'} */ (type));
            if (providerId === 'local') {
                if (input.value.trim() && detectMediaProviderId(input.value) !== 'local') {
                    input.value = '';
                    delete block.dataset.mediaUrl;
                }
            } else if (input.value.trim() && detectMediaProviderId(input.value) !== providerId) {
                input.value = '';
                delete block.dataset.mediaUrl;
            }
        } else {
            input.placeholder = store.ui.editorBlockMediaUrlPlaceholder || 'Paste HTTPS link';
            delete block.dataset.mediaProvider;
        }
        syncLocalUploadVisibility(block);
        syncMediaBlockPreview(block);
        syncLocalUploadVisibility(block);
        if (providerId === 'local') fileInput?.focus();
        else input.focus();
    });

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        void handleLocalFile(block, file);
        fileInput.value = '';
    });

    whyToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const panel = block.querySelector('.media-url-why-panel');
        setWhyOpen(block, !!(panel && panel.hidden));
    });
}

export function mediaProviderSelectHtml(type, currentUrl, escHtml, escAttr) {
    const ui = store.ui;
    const providers = providersForMediaType(type);
    const selected = detectMediaProviderId(currentUrl) || defaultMediaProviderId(type);
    const choose = escHtml(ui.editorBlockMediaProviderChoose || 'Platform…');
    const opts = [`<option value="">${choose}</option>`];
    for (const p of providers) {
        const sel = p.id === selected ? ' selected' : '';
        const label =
            p.id === 'local'
                ? ui.editorBlockMediaProviderLocal || ui.sourcesTreesScopeDevice || p.label
                : p.label;
        opts.push(`<option value="${escAttr(p.id)}"${sel}>${escHtml(label)}</option>`);
    }
    return opts.join('');
}
