import { store } from '../../store.js';
import { schedulePersistTreeUiState } from '../../utils/tree-ui-persist.js';
import { fileSystem } from '../../services/filesystem.js';
import { escHtml, escAttr } from './graph-mobile.js';
import { VERSION_TOGGLE_ID } from './graph-version.js';

/**
 * Limpia la caché de `renderMobilePrototypeTree` para que el siguiente render repinte todo el DOM
 * (nudos del tronco, filas del panel, listeners). Llamar tras cambiar `mobilePath` o selección.
 */
export function invalidateMobilePrototypeKeys() {
    this._mobileStructureKey = undefined;
    this._mobileConstructionKey = undefined;
}

/**
 * Fila de etiqueta del camino (el nodo activo comparte `current` con el panel de hijos).
 * @param {object} graph
 * @param {{ node: object, index: number, pathNodes: object[] }} p
 */
function createMobilePathLabelRow(graph, { node, index, pathNodes }) {
    const isActive = index === pathNodes.length - 1;
    const labelRow = document.createElement('div');
    const showRootVersion =
        index === 0 && store.value.viewMode === 'explore' && store.value.activeSource;

    if (showRootVersion) {
        labelRow.className = `mobile-label-row mobile-label-row--with-version ${isActive ? 'is-active' : ''} arborito-mobile-path w-full`;
        labelRow.id = 'arborito-curriculum-chrome';
        labelRow.innerHTML = graph.buildCurriculumChromeTitleRowHTML({
            showMeta: false
        });
    } else {
        // El panel (viñeta) ya muestra el título del nodo activo; aquí mantenemos la fila
        // para conservar alineación con el tronco (y para alojar CTAs) sin duplicar el nombre.
        const suppressActiveTitle = isActive && node.type !== 'root';
        const rowTitle = suppressActiveTitle
            ? ''
            : (node.type === 'root' ? (store.ui.navHome || 'Home') : (node.name || ''));
        labelRow.removeAttribute('id');
        labelRow.className = `mobile-label-row ${isActive ? 'is-active' : ''}${suppressActiveTitle ? ' mobile-label-row--suppress-title' : ''}`;
        labelRow.innerHTML = `<span class="mobile-label-text" title="${escAttr(rowTitle)}">${escHtml(rowTitle)}</span>`;
    }

    if (isActive) {
        const ui = store.ui;
        const listedKids = Array.isArray(node.children) ? node.children : [];
        const hasChildren = listedKids.length > 0;
        const isConstruct = !!store.value.constructionMode;
        // Con hijos, la cabecera del panel (viñeta) ya incluye Arcade; no duplicar en la fila del camino.
        const showPathArcade = !hasChildren || isConstruct;

        if (showPathArcade) {
            const actions = document.createElement('div');
            actions.className = 'mobile-path-actions';
            const mkBtn = (cls, label, emoji) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = cls;
                b.setAttribute('aria-label', label);
                b.title = label;
                b.textContent = `${label} ${emoji}`.trim();
                return b;
            };

            const arcade = mkBtn('mobile-path-cta mobile-path-cta--arcade', ui.mobileArcadeCta || 'Arcade', '🎮');
            graph.bindMobileTap(arcade, (ev) => {
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
                const moduleId =
                    node.type === 'leaf' || node.type === 'exam'
                        ? (node.parentId || node.id)
                        : node.id;
                store.setModal({ type: 'arcade', preSelectedNodeId: moduleId });
            });
            actions.appendChild(arcade);

            labelRow.appendChild(actions);
        }
    }

    if (!isActive) {
        const tapEl = showRootVersion ? labelRow.querySelector('.mobile-label-row__text') : labelRow;
        if (tapEl) {
            graph.bindMobileTap(tapEl, () => {
                graph.mobilePath = graph.mobilePath.slice(0, index + 1);
                graph.invalidateMobilePrototypeKeys();
                graph.renderMobilePrototypeTree(store.value.data);
                schedulePersistTreeUiState(store);
            });
        }
    } else if (isActive && store.value.constructionMode && fileSystem.features.canWrite) {
        graph.bindMobileTap(labelRow, (ev) => {
            const t = ev?.target;
            if (t && typeof t.closest === 'function') {
                if (
                    t.closest(
                        '#arborito-version-toggle, #arborito-version-dropdown-panel, #arborito-version-dropdown-backdrop, .arborito-version-archive-item, #arborito-version-live'
                    )
                )
                    return;
            }
            graph.selectedNodeId = node.id;
            graph.isMoveMode = false;
            graph.invalidateMobilePrototypeKeys();
            graph.renderMobilePrototypeTree(store.value.data);
        });
        const listedKids = Array.isArray(node.children) ? node.children : [];
        const deferFolderToolsToPanel = listedKids.length > 0;
        if (!deferFolderToolsToPanel) {
            const inlineTools = graph.createMobileInlineNodeTools(node, { compact: true });
            if (inlineTools) {
                labelRow.appendChild(inlineTools);
                graph.bindMobileInlineNodeTools(inlineTools, node);
            }
        }
    }
    return labelRow;
}

/**
 * Actualiza solo etiqueta activa, cabecera del panel y selección en filas — sin tocar el tronco (nudos).
 */
export function applyMobileConstructionChromeOnly(root) {
    if (!root || !this.mobileRightCol) return;

    const pathNodes = [];
    let tailCurrent = root;
    pathNodes.push(tailCurrent);
    for (let i = 1; i < this.mobilePath.length; i++) {
        const targetId = String(this.mobilePath[i]);
        const next = (tailCurrent.children || []).find((c) => String(c.id) === targetId);
        if (!next) break;
        tailCurrent = next;
        pathNodes.push(tailCurrent);
    }

    const activeIndex = pathNodes.length - 1;
    const branch = this.mobileRightCol.querySelector('.mobile-active-branch');
    if (!branch) return;

    const oldLabel = branch.querySelector('.mobile-label-row');
    if (oldLabel) {
        const newLabel = createMobilePathLabelRow(this, {
            node: pathNodes[activeIndex],
            index: activeIndex,
            pathNodes
        });
        oldLabel.replaceWith(newLabel);
    }

    const toggle = this.querySelector(`#${VERSION_TOGGLE_ID}`);
    if (toggle && this.mobileTreeUI) {
        this.bindCurriculumChrome(this.mobileTreeUI, () => {
            this.invalidateMobilePrototypeKeys();
            this.renderMobilePrototypeTree(store.value.data);
        });
    }

    const panel = branch.querySelector('.mobile-children-panel');
    if (!panel) return;

    const children = Array.isArray(tailCurrent.children) ? tailCurrent.children : [];
    const ui = store.ui;
    if (children.length > 0) {
        const head = panel.querySelector('.mobile-panel-head');
        if (head) {
            const isConstruct = store.value.constructionMode;
            const canWrite = fileSystem.features.canWrite;
            const parentToolsHtml =
                isConstruct && canWrite
                    ? this.buildMobileInlineNodeToolsHTML(tailCurrent, { compact: true })
                    : '';
            const backBtnHtml =
                this.mobilePath && this.mobilePath.length > 1
                    ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || 'Back')}" title="${escAttr(ui.navBack || 'Back')}">←</button>`
                    : '';
            const title = tailCurrent.type === 'root' ? (ui.navHome || 'Home') : (tailCurrent.name || '');
            const actionsHtml =
                !isConstruct
                    ? `<div class="mobile-panel-actions">
                        <button type="button" class="mobile-panel-cta mobile-panel-cta--arcade" aria-label="${escAttr(ui.mobileArcadeCta || 'Arcade')}" title="${escAttr(ui.mobileArcadeCta || 'Arcade')}">${escHtml(ui.mobileArcadeCta || 'Arcade')} 🎮</button>
                    </div>`
                    : '';
            head.innerHTML = `<div class="mobile-panel-header">${backBtnHtml}<span class="mobile-panel-title" title="${escAttr(title)}">${escHtml(title)}</span>${actionsHtml}</div>
                ${parentToolsHtml}`;
            const headTools = head.querySelector('.mobile-inline-tools');
            if (headTools) this.bindMobileInlineNodeTools(headTools, tailCurrent);
            const backBtn = head.querySelector('.mobile-panel-back');
            if (backBtn) {
                backBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (this.mobilePath && this.mobilePath.length > 1) {
                        this.mobilePath = this.mobilePath.slice(0, -1);
                        this.invalidateMobilePrototypeKeys();
                        this.renderMobilePrototypeTree(store.value.data);
                        schedulePersistTreeUiState(store);
                    }
                };
            }
            const arcadeBtn = head.querySelector('.mobile-panel-cta--arcade');
            if (arcadeBtn) {
                arcadeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    store.setModal({ type: 'arcade', preSelectedNodeId: tailCurrent.id });
                };
            }
        }
    }

    const isConstruct = store.value.constructionMode;
    const sel = this.selectedNodeId;
    panel.querySelectorAll('.mobile-child-row[data-node-id]').forEach((row) => {
        const id = row.getAttribute('data-node-id');
        const isSel = isConstruct && sel != null && String(id) === String(sel);
        row.classList.toggle('mobile-child-row--selected', !!isSel);
    });
}

export function renderMobilePrototypeTree(root) {
        if (!root) return;

        if (!Array.isArray(this.mobilePath) || this.mobilePath.length === 0 || this.mobilePath[0] !== root.id) {
            this.mobilePath = [root.id];
            this._prevMobilePathDepth = undefined;
        }

        // Persist/restore user's manual scroll position in the outline panel (no auto-scroll).
        const sourceKey = String(store.value.activeSource?.id || 'default');
        const trunkScrollKey = `arborito-mobile-trunk-scroll:${sourceKey}`;
        const trunkScrollElInit = this.mobileTrunkContainer;
        if (trunkScrollElInit && !this._mobileTrunkScrollPersistBound) {
            this._mobileTrunkScrollPersistBound = true;
            trunkScrollElInit.addEventListener(
                'scroll',
                () => {
                    try {
                        localStorage.setItem(trunkScrollKey, String(trunkScrollElInit.scrollTop || 0));
                    } catch {
                        /* ignore */
                    }
                },
                { passive: true }
            );
        }

        const pathNodes = [];
        let current = root;
        pathNodes.push(current);

        for (let i = 1; i < this.mobilePath.length; i++) {
            const targetId = String(this.mobilePath[i]);
            const next = (current.children || []).find(c => String(c.id) === targetId);
            if (!next) break;
            current = next;
            pathNodes.push(current);
        }

        this.mobilePath = pathNodes.map(n => n.id);

        const harvested = (store.value.gamification && store.value.gamification.seeds) || [];
        const completedSet = store.value.completedNodes;
        const structureKey = JSON.stringify({
            path: this.mobilePath,
            childIds: (current.children || []).map(c => c.id),
            childHydration: (Array.isArray(current.children) ? current.children : []).map((c) => [
                c.id,
                c.hasUnloadedChildren ? 1 : 0,
                Array.isArray(c.children) ? c.children.length : 0
            ]),
            completedCount: completedSet ? completedSet.size : 0,
            harvestedIds: harvested.map(h => h.id).sort(),
            sourceId: store.value.activeSource?.id || '',
            versionMenuOpen: !!this._versionMenuOpen,
            activeUrl: store.value.activeSource?.url || '',
            desktopForest: document.documentElement.classList.contains('arborito-desktop')
        });
        const constructionKey = JSON.stringify({
            constructionMode: !!store.value.constructionMode,
            constructSel: this.selectedNodeId != null ? String(this.selectedNodeId) : '',
            canWrite: fileSystem.features.canWrite
        });

        if (structureKey === this._mobileStructureKey && constructionKey === this._mobileConstructionKey) {
            return;
        }

        const onlyChrome =
            structureKey === this._mobileStructureKey && this._mobileStructureKey !== undefined;

        if (onlyChrome) {
            this._mobileConstructionKey = constructionKey;
            const trunkEl = this.mobileTrunkContainer;
            const savedScroll = trunkEl ? trunkEl.scrollTop : 0;
            this.applyMobileConstructionChromeOnly(root);
            this.scheduleMobilePrototypeOverlay(false);
            if (this._versionMenuOpen) {
                requestAnimationFrame(() => this.positionVersionDropdownPanel());
            }
            this._syncMobileTreeUiLayer();
            if (trunkEl) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (this.mobileTrunkContainer) this.mobileTrunkContainer.scrollTop = savedScroll;
                    });
                });
            }
            return;
        }

        this._mobileStructureKey = structureKey;
        this._mobileConstructionKey = constructionKey;

        const trunkScrollEl = this.mobileTrunkContainer;
        let preserveTrunkScroll = trunkScrollEl ? trunkScrollEl.scrollTop : 0;
        if (trunkScrollEl) {
            try {
                const raw = localStorage.getItem(trunkScrollKey);
                const saved = raw != null ? Number(raw) : NaN;
                if (Number.isFinite(saved) && saved >= 0) preserveTrunkScroll = saved;
            } catch {
                /* ignore */
            }
        }
        const pathBeforeRebuild = JSON.stringify(this.mobilePath);

        this.mobileKnotsContainer.innerHTML = '';
        this.mobileRightCol.innerHTML = '';

        pathNodes.forEach((node, index) => {
            const isActive = index === pathNodes.length - 1;
            const isCompleted = store.isCompleted && store.isCompleted(node.id);
            const isHarvested = harvested.find(h => String(h.id) === String(node.id));
            const stateClass = isHarvested ? ' state-harvested' : node.isEmpty ? ' state-empty' : isCompleted ? ' state-completed' : '';

            const wrapper = document.createElement('div');
            wrapper.className = 'mobile-knot-wrapper';

            const knot = document.createElement('div');
            knot.className = `mobile-knot mobile-knot-tone-${this.getMobileTone(node)}${isActive ? ' active' : ''}${!isActive ? stateClass : ''}`;
            knot.textContent =
                index === 0 && node.type === 'root' ? node.icon || '🏠' : node.icon || '📁';
            this.bindMobileTap(knot, () => {
                if (!isActive) {
                    this.mobilePath = this.mobilePath.slice(0, index + 1);
                    this.invalidateMobilePrototypeKeys();
                    this.renderMobilePrototypeTree(store.value.data);
                    schedulePersistTreeUiState(store);
                    return;
                }
                if (store.value.constructionMode && fileSystem.features.canWrite) {
                    this.selectedNodeId = node.id;
                    this.isMoveMode = false;
                    this.invalidateMobilePrototypeKeys();
                    this.renderMobilePrototypeTree(store.value.data);
                }
            });
            wrapper.appendChild(knot);
            this.mobileKnotsContainer.appendChild(wrapper);

            const labelRow = createMobilePathLabelRow(this, { node, index, pathNodes });

            if (isActive) {
                const branchWrap = document.createElement('div');
                branchWrap.className = 'mobile-active-branch';
                branchWrap.appendChild(labelRow);

                const panel = document.createElement('div');
                panel.className = 'mobile-children-panel';

                const children = Array.isArray(current.children) ? current.children : [];
                const ui = store.ui;
                if (children.length === 0) {
                    if (current.hasUnloadedChildren) {
                        const loading = ui.mobileLoadingCount || 'Loading…';
                        panel.innerHTML =
                            `<div class="mobile-panel-header">${escHtml(loading)}</div>` +
                            `<div class="mobile-empty-branch">` +
                            `<div class="mobile-empty-branch-icon">⏳</div>` +
                            `<div class="mobile-empty-branch-text">${escHtml(loading)}</div></div>`;
                        store
                            .loadNodeChildren(current)
                            .then(() => {
                                this.invalidateMobilePrototypeKeys();
                                this.renderMobilePrototypeTree(store.value.data);
                            })
                            .catch(() => {
                                /* ignore */
                            });
                    } else {
                        panel.innerHTML = `<div class="mobile-panel-header">${ui.mobileEndOfBranch || 'End of Branch'}</div>`
                            + `<div class="mobile-empty-branch">`
                            + `<div class="mobile-empty-branch-icon">🍃</div>`
                            + `<div class="mobile-empty-branch-text">${ui.mobileEndOfBranch || 'End of Branch'}</div></div>`;
                    }
                } else {
                    const isConstruct = store.value.constructionMode;
                    const canWrite = fileSystem.features.canWrite;
                    const parentToolsHtml =
                        isConstruct && canWrite
                            ? this.buildMobileInlineNodeToolsHTML(current, { compact: true })
                            : '';
                    const backBtnHtml =
                        this.mobilePath && this.mobilePath.length > 1
                            ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || 'Back')}" title="${escAttr(ui.navBack || 'Back')}">←</button>`
                            : '';
                    panel.innerHTML = `<div class="mobile-panel-head">
                            <div class="mobile-panel-header">${backBtnHtml}<span class="mobile-panel-title" title="${escAttr(current.name || '')}">${escHtml(current.type === 'root' ? (ui.navHome || 'Home') : (current.name || ''))}</span>${!isConstruct ? `<div class="mobile-panel-actions"><button type="button" class="mobile-panel-cta mobile-panel-cta--arcade" aria-label="${escAttr(ui.mobileArcadeCta || 'Arcade')}" title="${escAttr(ui.mobileArcadeCta || 'Arcade')}">${escHtml(ui.mobileArcadeCta || 'Arcade')} 🎮</button></div>` : ''}</div>
                            ${parentToolsHtml}
                        </div>`;
                    const headTools = panel.querySelector('.mobile-panel-head .mobile-inline-tools');
                    if (headTools) this.bindMobileInlineNodeTools(headTools, current);
                    const backBtn = panel.querySelector('.mobile-panel-back');
                    if (backBtn) {
                        backBtn.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (this.mobilePath && this.mobilePath.length > 1) {
                                this.mobilePath = this.mobilePath.slice(0, -1);
                                this.invalidateMobilePrototypeKeys();
                                this.renderMobilePrototypeTree(store.value.data);
                                schedulePersistTreeUiState(store);
                            }
                        };
                    }
                    const arcadeBtn = panel.querySelector('.mobile-panel-cta--arcade');
                    if (arcadeBtn) {
                        arcadeBtn.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            store.setModal({ type: 'arcade', preSelectedNodeId: current.id });
                        };
                    }
                    children.forEach((child) => {
                        const hasKidsLoaded = child.children && child.children.length > 0;
                        const tone = this.getMobileTone(child);
                        const childCompleted = store.isCompleted && store.isCompleted(child.id);
                        const childHarvested = harvested.find(h => String(h.id) === String(child.id));
                        const childState = childHarvested ? ' state-harvested' : child.isEmpty ? ' state-empty' : childCompleted ? ' state-completed' : '';
                        const rowState = childHarvested ? '' : child.isEmpty ? ' is-empty' : childCompleted ? ' is-completed' : '';

                        let childIcon = child.icon || '📄';
                        if (child.type === 'exam' && childCompleted) childIcon = '✔';

                        const childTools = '';

                        const row = document.createElement('div');
                        const isSel = isConstruct && this.selectedNodeId && String(child.id) === String(this.selectedNodeId);
                        const cname = child.name || '';
                        const nameLine = `${escHtml(cname)}${childCompleted ? ' · ✔' : ''}`;
                        row.className = `mobile-child-row${rowState}${isSel ? ' mobile-child-row--selected' : ''}`;
                        row.setAttribute('data-node-id', String(child.id));
                        row.innerHTML = `<div class="mobile-child-knot tone-${tone}${childState}"><span class="mobile-child-icon">${childIcon}</span></div>`
                            + `<div class="mobile-child-info">`
                            + `<div class="mobile-child-name" title="${escAttr(cname)}">${nameLine}</div>`
                            + `</div>`
                            + childTools
                            + (hasKidsLoaded ? `<div class="mobile-child-arrow">›</div>` : '');
                        this.bindMobileTap(row, async () => {
                            try {
                                if (child.type === 'leaf' || child.type === 'exam') {
                                    await store.openNodeFromMobileTree(child.id);
                                    return;
                                }
                                if (child.hasUnloadedChildren && (!child.children || child.children.length === 0)) {
                                    await store.loadNodeChildren(child);
                                }
                                const kidsNow = child.children && child.children.length > 0;
                                if (kidsNow) {
                                    this.mobilePath.push(child.id);
                                    this.invalidateMobilePrototypeKeys();
                                    this.renderMobilePrototypeTree(store.value.data);
                                    schedulePersistTreeUiState(store);
                                } else {
                                    await store.openNodeFromMobileTree(child.id);
                                }
                            } catch (err) {
                                console.error('Mobile tree navigation failed', err);
                            }
                        });

                        const wrap = document.createElement('div');
                        wrap.className = 'mobile-child-wrap';
                        wrap.appendChild(row);
                        panel.appendChild(wrap);
                    });
                }
                branchWrap.appendChild(panel);
                this.mobileRightCol.appendChild(branchWrap);
            } else {
                this.mobileRightCol.appendChild(labelRow);
            }
        });

        if (this.mobileVersionFixedSlot) {
            const slot = this.mobileVersionFixedSlot;
            const showRootVersion =
                pathNodes.length > 0 && store.value.viewMode === 'explore' && store.value.activeSource;
            const useFixedVersionSlot =
                showRootVersion && document.documentElement.classList.contains('arborito-desktop');
            if (useFixedVersionSlot) {
                slot.innerHTML = `<div class="arborito-mobile-version-root pointer-events-auto w-full min-w-0">${this.buildVersionSwitchHTML()}</div>`;
                slot.hidden = false;
                slot.setAttribute('aria-hidden', 'false');
            } else {
                slot.innerHTML = '';
                slot.hidden = true;
                slot.setAttribute('aria-hidden', 'true');
            }
        }

        const toggle = this.querySelector(`#${VERSION_TOGGLE_ID}`);
        if (toggle && this.mobileTreeUI) {
            this.bindCurriculumChrome(this.mobileTreeUI, () => {
                this.invalidateMobilePrototypeKeys();
                this.renderMobilePrototypeTree(store.value.data);
            });
        } else if (!toggle && this._versionMenuOpen) {
            this._versionMenuOpen = false;
            this._clearVersionDropdownPanelStyles();
        }

        const pathDepth = pathNodes.length;
        this._prevMobilePathDepth = pathDepth;

        const pathKeyScroll = JSON.stringify(this.mobilePath);
        this._prevMobileScrollPath = pathKeyScroll;

        const pathUnchangedForScroll =
            JSON.stringify(this.mobilePath) === pathBeforeRebuild;
        if (trunkScrollEl) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this.mobileTrunkContainer) {
                        this.mobileTrunkContainer.scrollTop = preserveTrunkScroll;
                    }
                });
            });
        }

        this.scheduleMobilePrototypeOverlay(false);
        if (this._versionMenuOpen) {
            requestAnimationFrame(() => this.positionVersionDropdownPanel());
        }
        this._syncMobileTreeUiLayer();
    }
