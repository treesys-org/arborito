import { attachAllStoreActions } from '../stores/attach-actions.js';
import { applyPrototypeMethods } from './apply-prototype-methods.js';
import { applyPrototypeAccessors } from './apply-prototype-accessors.js';
import { storeConnectedServiceMethods } from './store-connected-services.js';
import { storeConstructionUpdateMethods } from './store-construction-update.js';
import { storeOnboardingInitMethods } from './store-onboarding-init.js';
import { storeServiceAccessorDescriptors } from './store-service-accessors.js';

/** Attach core mixins + feature actions onto Store.prototype. */
export function wireStorePrototype(StoreClass) {
    applyPrototypeMethods(
        StoreClass.prototype,
        storeOnboardingInitMethods,
        storeConnectedServiceMethods,
        storeConstructionUpdateMethods
    );
    applyPrototypeAccessors(StoreClass.prototype, storeServiceAccessorDescriptors);
    attachAllStoreActions(StoreClass);
}
