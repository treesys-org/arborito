import './app-entry.js';
import { ensureWebTorrentLoaded } from './utils/boot-webtorrent.js';

ensureWebTorrentLoaded()
    .catch((e) => console.error('[Arborito] Failed to start app', e));

