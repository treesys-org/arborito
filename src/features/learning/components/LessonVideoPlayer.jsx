import { isElectronDesktop } from '../api/electron-bridge.js';
import { isThirdPartyVideoEmbedUrl, resolveVideoEmbedSrc } from '../api/parser-url.js';

/**
 * Lesson video: iframe on web; Electron <webview> for YouTube/Vimeo embeds (file:// + iframe = black box).
 */
export function LessonVideoPlayer({ src }) {
    const embed = resolveVideoEmbedSrc(src);
    if (!embed) return null;

    const shell = (
        <div className="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
            {isElectronDesktop() && isThirdPartyVideoEmbedUrl(embed) ? (
                <webview
                    src={embed}
                    className="absolute top-0 left-0 w-full h-full"
                    allowpopups="true"
                    referrerpolicy="strict-origin-when-cross-origin"
                />
            ) : isThirdPartyVideoEmbedUrl(embed) ? (
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
                    src={embed}
                    preload="metadata"
                />
            )}
        </div>
    );

    return <div className="my-10">{shell}</div>;
}
