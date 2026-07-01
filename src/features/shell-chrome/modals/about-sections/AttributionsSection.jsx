const ATTRIBUTION_ITEMS = [
    {
        key: 'Twemoji',
        lic: 'CC-BY 4.0',
        href: 'https://github.com/jdecked/twemoji',
        licHref: 'https://creativecommons.org/licenses/by/4.0/',
        noteKey: 'aboutAttributionsTwemoji',
        defaultNote: 'Emoji graphics © Twitter, Inc. and contributors, used unmodified.',
    },
    {
        key: 'Noto Color Emoji',
        lic: 'OFL 1.1',
        href: 'https://fonts.google.com/noto/specimen/Noto+Color+Emoji',
        licHref: 'https://scripts.sil.org/OFL',
        noteKey: 'aboutAttributionsNoto',
        defaultNote: 'Emoji glyph fallback font © Google LLC, used unmodified.',
    },
    {
        key: 'nostr-tools',
        lic: 'Unlicense',
        href: 'https://github.com/nbd-wtf/nostr-tools',
        licHref: 'https://unlicense.org/',
        noteKey: 'aboutAttributionsNostrTools',
        defaultNote: 'Nostr protocol client (public domain).',
    },
    {
        key: '@noble / @scure',
        lic: 'MIT',
        href: 'https://paulmillr.com/noble/',
        licHref: 'https://opensource.org/licenses/MIT',
        noteKey: 'aboutAttributionsNoble',
        defaultNote: 'Cryptography (curves, hashes, ciphers, base encodings) © Paul Miller.',
    },
    {
        key: 'WebTorrent',
        lic: 'MIT',
        href: 'https://github.com/webtorrent/webtorrent',
        licHref: 'https://opensource.org/licenses/MIT',
        noteKey: 'aboutAttributionsWebtorrent',
        defaultNote: 'Peer-to-peer transfer © WebTorrent LLC and contributors.',
    },
    {
        key: 'QRCode.js',
        lic: 'MIT',
        href: 'https://github.com/davidshimjs/qrcodejs',
        licHref: 'https://opensource.org/licenses/MIT',
        noteKey: 'aboutAttributionsQrcode',
        defaultNote: 'QR code generation © davidshimjs.',
    },
    {
        key: 'Tailwind CSS',
        lic: 'MIT',
        href: 'https://tailwindcss.com',
        licHref: 'https://github.com/tailwindlabs/tailwindcss/blob/master/LICENSE',
        noteKey: 'aboutAttributionsTailwind',
        defaultNote: 'Utility CSS compiled into the bundled stylesheet.',
    },
];

export function AttributionsSection({ ui }) {
    const title = ui.aboutAttributionsTitle || 'Open-source & assets';
    const intro =
        ui.aboutAttributionsIntro ||
        'Arborito bundles the following third-party assets offline (no CDN at runtime):';

    return (
        <div className="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
            <h3 className="arborito-eyebrow arborito-eyebrow--md mb-2">{title}</h3>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 mb-3">{intro}</p>
            <ul className="list-none m-0 p-0 select-text">
                {ATTRIBUTION_ITEMS.map((it) => (
                    <li
                        key={it.key}
                        className="py-2 first:pt-0 last:pb-0 border-b last:border-0 border-slate-100 dark:border-slate-800"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <a
                                href={it.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-slate-700 dark:text-slate-200 text-xs hover:underline"
                            >
                                {it.key}
                            </a>
                            <a
                                href={it.licHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:underline"
                            >
                                {it.lic}
                            </a>
                        </div>
                        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-0.5 mb-0">
                            {ui[it.noteKey] || it.defaultNote}
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
