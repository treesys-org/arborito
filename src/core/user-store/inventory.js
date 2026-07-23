import { buyGardenItem, equipGardenDecor, unequipGardenDecor } from '../../features/garden-progress/api/lumen-shop.js';

export const inventoryMixin = {
    purchaseGardenItem(itemId) {
        return buyGardenItem(this, itemId);
    },

    equipGardenDecorItem(itemId) {
        return equipGardenDecor(this, itemId);
    },

    unequipGardenDecorItem(slot) {
        if (slot !== 'sky' && slot !== 'ground') return false;
        unequipGardenDecor(this, slot);
        return true;
    }
};
