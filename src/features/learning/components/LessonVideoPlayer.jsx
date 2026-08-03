import { isElectronDesktop } from '../api/electron-bridge.js';
import {
    ELECTRON_LESSON_VIDEO_PARTITION,
    isThirdPartyVideoEmbedUrl,
    resolveVideoEmbedSrc,
} from '../api/parser-url.js';
import { useResolvedLessonMediaSrc } from '../hooks/useResolvedLessonMediaSrc.js';

/**
 * Lesson video: iframe on web; Electron <webview> for embeds; <video> for local files.
 *
 * Web and desktop use youtube.com/embed (nocookie often refuses to connect on Pages).
 * Desktop: <webview> + main-process Referer covers YouTube Error 153.
 */
export function LessonVideoPlayer({ src, branchId = '' }) {
    const embed = resolveVideoEmbedSrc(src);
    const localResolved = useResolvedLessonMediaSrc(embed || src, branchId);
    if (!embed && !localResolved) return null;

    const isEmbed = isThirdPartyVideoEmbedUrl(embed);
    const electronEmbed = isElectronDesktop() && isEmbed;
    const fileSrc = isEmbed ? embed : localResolved || embed;

    const shell = (
        <div className="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
            {electronEmbed ? (
                <webview
                    src={embed}
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
