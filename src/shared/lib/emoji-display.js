/**
 * Emoji rendering, ONE deterministic strategy everywhere: bundled Twemoji PNGs.
 *
 * Why images and not a colour font: the colour-font path (Noto woff2 / TTF) was
 * unreliable, on Linux/Electron it intermittently rendered "NO GLYPH" tofu, and
 * the previous probe-and-swap workaround made emoji flash in/out, behave
 * differently on mobile vs desktop, and even render the *same* emoji two
 * different ways (font glyph in one place, Twemoji in another).
 *
 * Twemoji PNGs are vendored locally (`vendor/emoji/twemoji/72x72/`), so they look
 * identical on every platform, never tofu, never need a probe, and never swap
 * after first paint. The bundled Noto font is still registered as a *last-resort*
 * fallback for any raw emoji text that doesn't go through the helpers below.
 *
 * UI rule: interactive chrome and labels use `<ChromeEmoji>` (React) or
 * `chromeEmojiHtml()` / `twemojiImgHtml()` (imperative HTML). Do not paste raw
 * Unicode emoji in JSX text nodes.
 *
 * Documented exceptions (keep minimal):
 * 1. User-authored tree/lesson icons (`node.icon`, picker seeds) — dynamic data;
 *    always render at display time via ChromeEmoji / chromeEmojiHtml.
 * 2. Markdown and lesson body content — processed by the content/markdown pipeline.
 * 3. Editor math symbols (∑, ⌨) — typographic glyphs, not emoji assets.
 * 4. Plain-text exports, manifests, and store labels built for logs/API strings
 *    (e.g. version switcher `label: 🌳 ${name}`) — not rendered UI chrome.
 * 5. Legacy HTML modal builders (`modalNavBackHtml`) — prefer React ModalHero;
 *    chevron is SVG, not emoji.
 */
import { escHtml, escAttr } from './html-escape.js';
import { emojiToTwemojiCandidates, EMOJI_IN_TEXT_RE } from './emoji-twemoji.js';
import { getPanelRef } from '../../app/panel-refs.js';

const FONTS_BASE = new URL(/* @vite-ignore */ '../../../vendor/fonts/', import.meta.url);
const TWEMOJI_BASE = new URL(/* @vite-ignore */ '../../../vendor/emoji/twemoji/72x72/', import.meta.url);
const TWEMOJI_IMG_DIR = 'vendor/emoji/twemoji/72x72';
const NOTO_TTF = 'NotoColorEmoji.ttf';

/** @type {Record<string, string>|null} */
let TWEMOJI_DATAURI = null;
/** @type {Record<string, string>|null} */
let TWEMOJI_DATAURI_ALIAS = null;
/** @type {Promise<void>|null} */
let twemojiBundlePromise = null;

function ensureTwemojiBundle() {
    if (TWEMOJI_DATAURI) return Promise.resolve();
    if (!twemojiBundlePromise) {
        twemojiBundlePromise = import('./twemoji-datauri.js')
            .then((mod) => {
                TWEMOJI_DATAURI = mod.TWEMOJI_DATAURI;
                TWEMOJI_DATAURI_ALIAS = mod.TWEMOJI_DATAURI_ALIAS;
            })
            .catch((e) => {
                console.warn('[Arborito] twemoji bundle load failed', e);
                TWEMOJI_DATAURI = {};
                TWEMOJI_DATAURI_ALIAS = {};
            });
    }
    return twemojiBundlePromise;
}

let emojiInitDone = false;

/** Images are the only mode now; kept for callers that still ask. */
export function usesEmojiImages() {
    return true;
}

function isElectronApp() {
    return typeof window !== 'undefined' && !!window.arboritoElectron;
}

/** GitHub Pages / arborito.org, root-relative paths avoid import.meta / CSS base quirks. */
function siteOriginAsset(relPath) {
    if (typeof window === 'undefined') return null;
    const proto = window.location?.protocol || '';
    if (proto !== 'http:' && proto !== 'https:') return null;
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    const rel = String(relPath || '').replace(/^\//, '');
    return rel ? `${origin}/${rel}` : null;
}

function faceSrcUrl(file) {
    const resolveAsset = typeof window !== 'undefined' && window.arboritoElectron?.resolveAsset;
    if (resolveAsset) {
        const href = resolveAsset(`vendor/fonts/${file}`);
        if (href) return href;
    }
    const abs = siteOriginAsset(`vendor/fonts/${file}`);
    if (abs) return abs;
    return new URL(file, FONTS_BASE).href;
}

function twemojiAssetUrl(file) {
    if (TWEMOJI_DATAURI) {
        const inline = TWEMOJI_DATAURI[file]
            || (TWEMOJI_DATAURI_ALIAS && TWEMOJI_DATAURI_ALIAS[file]
                ? TWEMOJI_DATAURI[TWEMOJI_DATAURI_ALIAS[file]]
                : null);
        if (inline) return inline;
    }
    const resolveAsset = typeof window !== 'undefined' && window.arboritoElectron?.resolveAsset;
    if (resolveAsset) {
        const href = resolveAsset(`${TWEMOJI_IMG_DIR}/${file}`);
        if (href) return href;
    }
    const abs = siteOriginAsset(`${TWEMOJI_IMG_DIR}/${file}`);
    if (abs) return abs;
    return new URL(file, TWEMOJI_BASE).href;
}

/**
 * A Twemoji `<img>` for one emoji. Always carries `arborito-emoji-img` so the
 * shared CSS sizing rules and the `onerror` candidate/fallback chain apply even
 * when the caller passes a custom className, this is what keeps the same emoji
 * looking identical in every place it is used.
 */
function twemojiImgHtml(emoji, opts = {}) {
    const ch = String(emoji || '').trim() || '📄';
    const candidates = emojiToTwemojiCandidates(ch);
    const src = twemojiAssetUrl(candidates[0]);
    const extra = opts.className || 'arborito-emoji-glyph';
    const cls = /(^|\s)arborito-emoji-img(\s|$)/.test(extra) ? extra : `${extra} arborito-emoji-img`;
    const title = opts.title != null ? opts.title : ch;
    const size = opts.size || 18;
    if (!TWEMOJI_DATAURI) {
        return (
            `<img class="${escAttr(cls)}" src="${escAttr(src)}" alt="${escAttr(ch)}" ` +
            `width="${size}" height="${size}" decoding="async" draggable="false" ` +
            `data-emoji-fallback="${escAttr(ch)}" data-emoji-candidates="${escAttr(candidates.join(','))}" ` +
            `data-emoji-candidate-idx="0" role="img" aria-label="${escAttr(title)}" />`
        );
    }
    return (
        `<img class="${escAttr(cls)}" src="${escAttr(src)}" alt="${escAttr(ch)}" ` +
        `width="${size}" height="${size}" decoding="async" draggable="false" ` +
        `data-emoji-fallback="${escAttr(ch)}" data-emoji-candidates="${escAttr(candidates.join(','))}" ` +
        `data-emoji-candidate-idx="0" role="img" aria-label="${escAttr(title)}" />`
    );
}

/** One delegated listener: walk the Twemoji candidate list on 404, then fall
 * back to a text span (system/bundled emoji font) as the very last resort. */
function wireEmojiImgFallback() {
    if (typeof document === 'undefined' || document.documentElement.dataset.arboritoEmojiImgFallback) return;
    document.documentElement.dataset.arboritoEmojiImgFallback = '1';
    document.addEventListener('error', (ev) => {
        const img = ev.target;
        if (!(img instanceof HTMLImageElement) || !img.classList.contains('arborito-emoji-img')) return;
        const list = (img.getAttribute('data-emoji-candidates') || '').split(',').filter(Boolean);
        let idx = parseInt(img.getAttribute('data-emoji-candidate-idx') || '0', 10) + 1;
        if (idx < list.length) {
            img.setAttribute('data-emoji-candidate-idx', String(idx));
            img.src = twemojiAssetUrl(list[idx]);
            return;
        }
        const ch = img.getAttribute('data-emoji-fallback') || img.alt || '📄';
        const span = document.createElement('span');
        span.className = 'arborito-emoji-glyph arborito-emoji-fallback-text';
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', ch);
        span.textContent = ch;
        img.replaceWith(span);
    }, true);
}

/* ── Global emojify observer ─────────────────────────────────────────────────
 * The helpers above (emojiHtml/chromeEmojiHtml/…) only cover call sites that opt
 * in. Plenty of UI renders raw emoji text directly (forum, lesson copy, tooltips)
 *, those used to depend on the bundled colour FONT, which is ~11 MB of woff2 and
 * loaded unreliably (random "missing" emoji, slow first paint). This observer
 * converts every emoji text node in the document to the same tiny Twemoji <img>,
 * so the whole app is consistent AND never needs the heavy font.
 *
 * Editable regions are skipped on purpose: turning a typed emoji into an <img>
 * would corrupt the lesson editor's contenteditable HTML on save. Those keep raw
 * text (rendered with the OS emoji font via the CSS stack). */
const EMOJIFY_SKIP_SELECTOR =
    'script,style,textarea,input,select,code,pre,[contenteditable],[contenteditable="true"],.arborito-no-emojify,.arborito-onboarding-lang-grid,#mobile-tree-ui,#mobile-knots-container,.graph-container,.mobile-tree-ui';

function makeTwemojiImgEl(ch) {
    const candidates = emojiToTwemojiCandidates(ch);
    const img = document.createElement('img');
    img.className = 'arborito-emoji-img arborito-emoji-inline';
    img.src = twemojiAssetUrl(candidates[0]);
    img.alt = ch;
    img.decoding = 'async';
    img.setAttribute('draggable', 'false');
    img.setAttribute('role', 'img');
    img.setAttribute('aria-label', ch);
    img.setAttribute('data-emoji-fallback', ch);
    img.setAttribute('data-emoji-candidates', candidates.join(','));
    img.setAttribute('data-emoji-candidate-idx', '0');
    /* Scale with surrounding text instead of a fixed px size. */
    img.style.width = '1.2em';
    img.style.height = '1.2em';
    return img;
}

function emojifyTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const text = node.textContent;
    if (!text) return;
    EMOJI_IN_TEXT_RE.lastIndex = 0;
    if (!EMOJI_IN_TEXT_RE.test(text)) return;
    const parent = node.parentElement;
    if (!parent) return;
    if (parent.isContentEditable) return;
    if (parent.closest && parent.closest(EMOJIFY_SKIP_SELECTOR)) return;

    EMOJI_IN_TEXT_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = EMOJI_IN_TEXT_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        frag.appendChild(makeTwemojiImgEl(m[0]));
        last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode && node.parentNode.replaceChild(frag, node);
}

function emojifyElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest(EMOJIFY_SKIP_SELECTOR)) return;
    /* TreeWalker over text nodes is far cheaper than recursing every element. */
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
            if (!n.textContent) return NodeFilter.FILTER_REJECT;
            EMOJI_IN_TEXT_RE.lastIndex = 0;
            return EMOJI_IN_TEXT_RE.test(n.textContent)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });
    const pending = [];
    let cur;
    while ((cur = walker.nextNode())) pending.push(cur);
    for (const n of pending) emojifyTextNode(n);
}

let emojifyObserverStarted = false;
function startEmojifyObserver() {
    if (emojifyObserverStarted || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
        return;
    }
    const root = document.getElementById('app') || document.body || document.documentElement;
    if (!root) return;
    emojifyObserverStarted = true;

    const initialWalk = () => emojifyElement(root);
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(initialWalk, { timeout: 1200 });
    } else {
        setTimeout(initialWalk, 0);
    }

    let emojifyRaf = 0;
    /** @type {MutationRecord[]} */
    let pendingMutations = [];

    const flushEmojifyMutations = () => {
        emojifyRaf = 0;
        const batch = pendingMutations;
        pendingMutations = [];
        for (const mut of batch) {
            if (mut.type === 'characterData') {
                emojifyTextNode(mut.target);
            } else if (mut.type === 'childList') {
                for (const node of mut.addedNodes) {
                    if (node.nodeType === 3) emojifyTextNode(node);
                    else if (node.nodeType === 1) emojifyElement(node);
                }
            }
        }
    };

    const observer = new MutationObserver((mutations) => {
        pendingMutations.push(...mutations);
        if (emojifyRaf) return;
        emojifyRaf = requestAnimationFrame(flushEmojifyMutations);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
}

/**
 * Register the bundled Noto faces as a pure-CSS, last-resort fallback for raw
 * emoji text that never passes through the helpers (e.g. user-typed copy). No
 * forced load: a subset only downloads if such text actually appears, so this
 * costs nothing in the normal (all-images) case.
 */
function injectFallbackEmojiFont() {
    if (typeof document === 'undefined') return;
    /* Web/mobile: OS emoji is enough; skip ~10 MB of Noto woff2 subsets. */
    if (!isElectronApp()) return;
    const styleId = 'arborito-emoji-font-face';
    if (document.getElementById(styleId)) return;
    const rules = [];
    rules.push(
        `@font-face{font-family:"Arborito Emoji";font-style:normal;font-weight:400;font-display:swap;` +
            `src:url("${faceSrcUrl(NOTO_TTF)}") format("truetype");}`
    );
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = rules.join('');
    document.head.appendChild(style);
}

/**
 * Set up emoji rendering. Synchronous and idempotent: no font probe, no async
 * swap, no platform branch, so every component renders the same Twemoji from
 * its very first paint (no flicker, no "appear then vanish", no lag).
 */
export async function initEmojiRendering() {
    if (typeof document === 'undefined') return;
    if (emojiInitDone) return;
    emojiInitDone = true;
    document.documentElement.classList.add('arborito-emoji-images');
    wireEmojiImgFallback();
    void ensureTwemojiBundle().then(() => {
        injectFallbackEmojiFont();
        patchEmojiSlots();
        if (document.body) startEmojifyObserver();
        else document.addEventListener('DOMContentLoaded', startEmojifyObserver, { once: true });
        try {
            window.dispatchEvent(new CustomEvent('arborito-emoji-ready'));
        } catch {
            /* ignore */
        }
    });
}

/** Replace emoji in an (already-escaped) HTML string with inline Twemoji imgs. */
export function injectEmojiImagesInText(html) {
    if (!html) return html;
    return html.replace(EMOJI_IN_TEXT_RE, (match) =>
        twemojiImgHtml(match, { size: 16, className: 'arborito-emoji-inline' })
    );
}

/** Escaped UI copy with inline Twemoji emoji. */
export function richTextWithEmojis(text) {
    return injectEmojiImagesInText(escHtml(String(text || '')));
}

/** Tour / mascot cluster, one img per emoji (handles ZWJ multi-emoji strings). */
export function mascotEmojiHtml(emoji, size = 28) {
    const ch = String(emoji || '').trim() || '🦉';
    const cls = 'arborito-emoji-glyph arborito-emoji-img arborito-tour-tooltip__mascot-ic';
    const parts = ch.match(EMOJI_IN_TEXT_RE);
    if (!parts || parts.length <= 1) {
        return twemojiImgHtml(ch, { className: cls, size });
    }
    return parts.map((p) => twemojiImgHtml(p, { className: cls, size })).join('');
}

/** General-purpose emoji (content, buttons, lesson icons). */
export function emojiHtml(emoji, opts = {}) {
    return twemojiImgHtml(String(emoji || '').trim() || '📄', opts);
}

/** Nav / chrome icons. Identical Twemoji on every platform (Linux-safe). */
export function chromeEmojiHtml(emoji, size = 20) {
    return twemojiImgHtml(String(emoji || '').trim() || '📄', {
        className: 'arborito-emoji-glyph',
        size,
    });
}

export function emojiText(emoji) {
    return String(emoji || '').trim() || '📄';
}

let patchEmojiScheduled = false;

/** Re-render the long-lived shell components. Retained for callers that want to
 * force an emoji refresh; no longer part of any swap (there is no swap). */
export function patchEmojiSlots() {
    if (typeof document === 'undefined') return;
    if (patchEmojiScheduled) return;
    patchEmojiScheduled = true;
    requestAnimationFrame(() => {
        patchEmojiScheduled = false;
        const panels = [
            getPanelRef('sidebar'),
            getPanelRef('progress-widget'),
            getPanelRef('modal-search'),
        ].filter(Boolean);
        panels.forEach((el) => {
            if (typeof el.render === 'function') {
                el.renderKey = null;
                el.render();
            }
        });
        const content = getPanelRef('content');
        if (content && typeof content.scheduleUpdate === 'function') {
            content.lastRenderKey = null;
            content.scheduleUpdate(true);
        }
        const tour = getPanelRef('product-tour');
        if (tour?._active && typeof tour.syncStepText === 'function') {
            tour.syncStepText();
        }
        const con = getPanelRef('construction-panel');
        if (con && typeof con._repaint === 'function' && con.style.display !== 'none') {
            con._repaint();
        }
    });
}

export async function refreshEmojis() {}

/** Await inlined Twemoji before print/PDF so flag glyphs are embedded as data URIs. */
export function ensureEmojiBundleReady() {
    return ensureTwemojiBundle();
}

/**
 * Safe Twemoji stack for Arcade cartridges inside Electron only.
 * Web uses native OS emoji in srcdoc; Electron/Linux often shows "NO GLYPH".
 *
 * Unlike the old iframe injection this deliberately:
 * - never loads NotoColorEmoji.ttf (tofu / sanitizer issues in srcdoc)
 * - never forces Arborito Emoji on *::before (that produced vertical "NO GLYPH" bars)
 * - skips canvas, card tables, and FX layers so gameplay DOM is not rewritten
 *
 * @returns {{ css: string, script: string }}
 */
export function buildGameIframeEmojiInjection() {
    const twSample = twemojiAssetUrl('1f332.png');
    const twBase = twSample.replace(/1f332\.png$/i, '');

    /** Inline Twemoji for common game glyphs, avoids file:// fetch issues in srcdoc. */
    const inlineMap = {};
    const seedEmoji = '⚔️🛡🏆👤🌳🎮⭐✅❌🔥💡📄🎯🃏🎲🚀🌸🍄🦉📝🎓💼🌱❤️💛💚💙💜🧠⚠️✨🎉';
    for (const ch of seedEmoji) {
        for (const file of emojiToTwemojiCandidates(ch)) {
            if (TWEMOJI_DATAURI[file]) inlineMap[file] = TWEMOJI_DATAURI[file];
        }
    }

    const css = [
        'html,body,button,input,textarea,select,span,div,p,h1,h2,h3,h4,h5,h6,label,li{font-family:system-ui,sans-serif;}',
        '.arborito-emoji-img{display:inline-block;vertical-align:-0.15em;object-fit:contain;width:1.25em;height:1.25em;pointer-events:none;}',
        '.arborito-emoji-img.arborito-emoji-img--lg{width:1em;height:1em;}',
        '.fighter-portrait__emoji .arborito-emoji-img{width:1.65rem;height:1.65rem;}',
        '.event-banner-icon .arborito-emoji-img{width:1.05rem;height:1.05rem;}',
        '.arborito-li-has-emoji-bullet::before{content:none !important;display:none !important;}',
        '.arborito-li-emoji{margin-right:0.2em;vertical-align:-0.12em;width:1em !important;height:1em !important;}',
    ];

    if (TWEMOJI_DATAURI['2694.png']) {
        const swordBg = TWEMOJI_DATAURI['2694.png'];
        css.push(
            '.overlay-card .feature-list li::before,.feature-list li::before{',
            `content:''!important;display:inline-block!important;width:1em;height:1em;margin-right:.15em;`,
            `vertical-align:-.12em;background:url(${swordBg}) center/contain no-repeat!important;`,
            'color:transparent!important;font-size:0!important;}',
        );
    }

    const cssText = css.join('\n');

    const script = `(function(){
var TW_BASE=${JSON.stringify(twBase)};
var TW_INLINE=${JSON.stringify(inlineMap)};
var EMOJI_RE=/(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?)*|[\\u{1F1E6}-\\u{1F1FF}]{2})/gu;
var SKIP_SEL='canvas,#bg-canvas,#game-canvas,#float-layer,.duel-card,.table-card,.card-slot,.card-face,[data-card-id]';
function shouldSkip(el){
  if(!el||el.nodeType!==1)return true;
  var tag=el.tagName;
  if(tag==='SCRIPT'||tag==='STYLE'||tag==='CANVAS'||tag==='SVG')return true;
  try{if(el.closest&&el.closest(SKIP_SEL))return true;}catch(e){}
  return false;
}
function twCandidates(ch){var hex=[];for(var c of ch){hex.push(c.codePointAt(0).toString(16));}var b=hex.join('-');var s=b.replace(/-fe0f/g,'');var out=[];if(s)out.push(s+'.png');if(b!==s)out.push(b+'.png');if(b.indexOf('fe0f')===-1)out.push(b+'-fe0f.png');return out.length?out:['1f4c4.png'];}
function twImg(ch,lg){
  var cands=twCandidates(ch);
  var img=document.createElement('img');
  img.className='arborito-emoji-img'+(lg?' arborito-emoji-img--lg':'');
  img.alt=ch;img.setAttribute('role','img');img.setAttribute('aria-label',ch);
  var px=lg?40:20;img.width=px;img.height=px;
  var idx=0;
  function tryNext(){
    if(idx>=cands.length){var s=document.createElement('span');s.className=img.className;s.setAttribute('aria-hidden','true');img.replaceWith(s);return;}
    var inline=TW_INLINE[cands[idx]];
    if(inline){img.src=inline;idx++;return;}
    img.src=TW_BASE+cands[idx++];
  }
  img.onerror=tryNext;
  tryNext();
  return img;
}
function patchTextNode(node){
  if(!node||node.nodeType!==3)return;
  var par=node.parentElement;
  if(!par||shouldSkip(par))return;
  var t=node.textContent;if(!t)return;
  EMOJI_RE.lastIndex=0;if(!EMOJI_RE.test(t))return;
  EMOJI_RE.lastIndex=0;
  var lg=par&&window.getComputedStyle&&(parseFloat(getComputedStyle(par).fontSize)||0)>=22;
  var frag=document.createDocumentFragment();var i=0,m;
  while((m=EMOJI_RE.exec(t))!==null){if(m.index>i)frag.appendChild(document.createTextNode(t.slice(i,m.index)));frag.appendChild(twImg(m[0],lg));i=m.index+m[0].length;}
  if(i<t.length)frag.appendChild(document.createTextNode(t.slice(i)));
  node.parentNode&&node.parentNode.replaceChild(frag,node);
}
function patchElement(el){
  if(!el||el.nodeType!==1||shouldSkip(el))return;
  var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:function(n){
    if(!n.textContent||!n.parentElement||shouldSkip(n.parentElement))return NodeFilter.FILTER_REJECT;
    EMOJI_RE.lastIndex=0;return EMOJI_RE.test(n.textContent)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
  }});
  var pending=[];var cur;while((cur=walker.nextNode()))pending.push(cur);
  for(var i=0;i<pending.length;i++)patchTextNode(pending[i]);
}
function patchListBeforeEmojis(root){
  var scope=root&&root.querySelectorAll?root:document;
  var lists=scope.querySelectorAll?scope.querySelectorAll('li'):[];
  for(var i=0;i<lists.length;i++){
    var li=lists[i];
    if(shouldSkip(li)||li.classList.contains('arborito-li-has-emoji-bullet'))continue;
    var before='';try{before=getComputedStyle(li,'::before').content||'';}catch(e){continue;}
    if(!before||before==='none'||before==='normal'||before==='""'||before==="''")continue;
    var unq=before.replace(/^["']|["']$/g,'');
    EMOJI_RE.lastIndex=0;var m=EMOJI_RE.exec(unq);if(!m)continue;
    var img=twImg(m[0],false);img.className+=' arborito-li-emoji';
    li.classList.add('arborito-li-has-emoji-bullet');li.insertBefore(img,li.firstChild);
  }
}
function refreshUi(){
  document.documentElement.classList.add('arborito-emoji-images');
  var roots=['.overlay','#start-overlay','#rules-overlay','#end-overlay','.overlay-card','.fighter-portrait','.speech-bubble','.event-banner','.hud-top','#event-banner-stack','#start-features'];
  for(var r=0;r<roots.length;r++){
    var nodes=document.querySelectorAll?document.querySelectorAll(roots[r]):[];
    for(var j=0;j<nodes.length;j++){patchElement(nodes[j]);patchListBeforeEmojis(nodes[j]);}
  }
  patchListBeforeEmojis(document.documentElement);
}
var UI_SEL='.overlay,.overlay-card,#start-features,#event-banner-stack,.hud-top,.fighter-portrait,.speech-bubble,.event-banner';
function observeUi(){
  var scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;refreshUi();});}
  var mo=new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      var n=muts[i].target;
      if(!n||!n.closest)continue;
      if(n.closest(UI_SEL)||n.id==='start-features'){schedule();return;}
    }
  });
  var observeRoot=document.getElementById('app')||document.body;
  if(observeRoot)mo.observe(observeRoot,{childList:true,subtree:true,characterData:true});
  setTimeout(function(){mo.disconnect();},30000);
}
function boot(){refreshUi();observeUi();var n=0;var t=setInterval(function(){refreshUi();if(++n>=12)clearInterval(t);},400);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();`;

    return { css: cssText, script };
}
