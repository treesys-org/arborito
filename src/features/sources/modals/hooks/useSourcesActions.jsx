import { useCallback, useEffect } from 'react';
import { runSourcesAction } from '../../api/modals/logic/sources-actions/index.js';
import { registerSourcesActionHandler } from '../../api/modals/logic/dispatch-sources-action.js';

export function useSourcesActions(actionCtxRef) {
    const handleAction = useCallback(async (action, fields = {}) => {
        const ctx = actionCtxRef?.current;
        if (!ctx) return;
        await runSourcesAction(ctx, action, fields);
    }, [actionCtxRef]);

    useEffect(() => {
        registerSourcesActionHandler(handleAction);
        return () => registerSourcesActionHandler(null);
    }, [handleAction]);

    return { handleAction };
}
