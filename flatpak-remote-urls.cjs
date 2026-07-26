/** Shared Flatpak remote / GitHub API URLs for Electron main (CJS). */
'use strict';

const FLATPAK_REMOTE_BASE = 'https://arborito.org/flatpak';
const FLATPAK_REF_URL = `${FLATPAK_REMOTE_BASE}/org.treesys.arborito.flatpakref`;
const GITHUB_RELEASES_LATEST_API = 'https://api.github.com/repos/treesys-org/arborito/releases/latest';

module.exports = {
  FLATPAK_REMOTE_BASE,
  FLATPAK_REF_URL,
  GITHUB_RELEASES_LATEST_API,
};
