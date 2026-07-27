import { useEffect, useRef } from 'react';
import { isElectronDesktop } from '../api/electron-bridge.js';
import {
    ELECTRON_LESSON_VIDEO_PARTITION,
    buildElectronLessonVideoGuestLoad,
    isThirdPartyVideoEmbedUrl,
    resolveVideoEmbedSrc,
} from '../api/parser-url.js';
import { useResolvedLessonMediaSrc } from '../hooks/useResolvedLessonMediaSrc.js';

/**
 * Lesson video: iframe on web; Electron <webview> for embeds; <video> for local files.
 *
 * Electron: do not navigate the guest to youtube.com/embed as top-level — YouTube's
 * Referer policy (Error 153) blocks that. Load a small arborito.org page that iframes it.
 */
export function LessonVideoPlayer({ src, branchId = '' }) {
    const embed = resolveVideoEmbedSrc(src);
    const localResolved = useResolvedLessonMediaSrc(embed || src, branchId);
    const webviewRef = useRef(null);
    const electronEmbed = isElectronDesktop() && isThirdPartyVideoEmbedUrl(embed);

    useEffect(() => {
        if (!electronEmbed || !embed) return undefined;
        const wv = webviewRef.current;
        if (!wv || typeof wv.loadURL !== 'function') return undefined;
        const guest = buildElectronLessonVideoGuestLoad(embed);
        if (!guest) return undefined;
        try {
            wv.loadURL(guest.dataUrl, { baseURLForDataURL: guest.baseURLForDataURL });
        } catch {
            /* ignore */
        }
        return undefined;
    }, [electronEmbed, embed]);

    if (!embed && !localResolved) return null;

    const isEmbed = isThirdPartyVideoEmbedUrl(embed);
    const fileSrc = isEmbed ? embed : localResolved || embed;

    const shell = (
        <div className="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
            {electronEmbed ? (
                <webview
                    ref={webviewRef}
                    src="about:blank"
                    partition={ELECTRON_LESSON_VIDEO_PARTITION}
                    className="absolute top-0 left-0 w-full h-full"
                    allowpopups="true"
                    referrerpolicy="strict-origin-when-cross-origin"
                />
            ) : isEmbed ? (
                <iframe
                    src={embed}
                    className="absolute top-0 left-0 w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    title=""
                />
            ) : (
                <video
                    className="absolute top-0 left-0 w-full h-full object-contain bg-black"
                    controls
                    src={fileSrc}
                    preload="metadata"
                />
            )}
        </div>
    );

    return <div className="my-10">{shell}</div>;
}
