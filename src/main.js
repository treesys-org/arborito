import { ensureWebTorrentLoaded } from './utils/boot-webtorrent.js';

ensureWebTorrentLoaded()
    .then(() => import('./app-entry.js'))
    .catch((e) => console.error('[Arborito] Failed to start app', e));
