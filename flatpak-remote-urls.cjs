/** Shared Flatpak remote / GitHub API URLs for Electron main (CJS). */
'use strict';

const FLATPAK_REMOTE_BASE = 'https://arborito.org/flatpak';
const FLATPAK_REF_URL = `${FLATPAK_REMOTE_BASE}/org.treesys.arborito.flatpakref`;
/** Prefer /latest, but alpha tags are GitHub prereleases and are omitted from that endpoint. */
const GITHUB_RELEASES_LATEST_API = 'https://api.github.com/repos/treesys-org/arborito/releases/latest';
const GITHUB_RELEASES_LIST_API = 'https://api.github.com/repos/treesys-org/arborito/releases?per_page=15';

module.exports = {
  FLATPAK_REMOTE_BASE,
  FLATPAK_REF_URL,
  GITHUB_RELEASES_LATEST_API,
  GITHUB_RELEASES_LIST_API,
};
