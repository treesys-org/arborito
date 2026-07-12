export const frozenTreesMixin = {
    isTreeFrozen(sourceId) {
        return !!this.state.frozenTrees[sourceId];
    },

    setTreeFrozen(sourceId, enabled) {
        if (!sourceId) return;
        if (enabled) this.state.frozenTrees[sourceId] = { frozenAt: Date.now() };
        else delete this.state.frozenTrees[sourceId];
        this.persist();
    },

    removeTreeFrozen(sourceId) {
        this.setTreeFrozen(sourceId, false);
    }
};
