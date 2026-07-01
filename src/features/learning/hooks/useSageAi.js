import { useCallback } from 'react';
import { aiService, MAX_BROWSER_NEW_TOKENS } from '../api/ai.js';
import { hasSageAiConsentForInit } from '../api/sage-ai-consent.js';

/**
 * Única puerta React a `aiService` — no importar `ai.js` desde components/modals.
 */
export function useSageAi() {
    const syncEnvironment = useCallback(() => {
        aiService.syncEnvironment();
    }, []);

    const setConfig = useCallback((patch) => {
        aiService.setConfig(patch);
    }, []);

    const resetConfig = useCallback(() => {
        aiService.resetConfig();
    }, []);

    const isWebAiUnavailable = useCallback(() => aiService.isWebAiUnavailable(), []);

    const checkHealth = useCallback(() => aiService.checkHealth(), []);

    const chat = useCallback((messages, ctx) => aiService.chat(messages, ctx), []);

    const providerLabel = useCallback(() => aiService._providerLabel(), []);

    const needsModelInit = useCallback(() => {
        if (!hasSageAiConsentForInit()) return false;
        aiService.syncEnvironment();
        if (aiService.config.provider === 'llamacpp' && !aiService.llamacppReady) return true;
        if (aiService.config.provider === 'expert-api' && !aiService.expertReady) return true;
        return false;
    }, []);

    const config = aiService.config;
    const provider = config.provider;
    const browserModel = config.browserModel;
    const contextPreset = config.contextPreset;
    const browserMaxNewTokens = config.browserMaxNewTokens;

    return {
        config,
        provider,
        browserModel,
        contextPreset,
        browserMaxNewTokens,
        llamacppReady: aiService.llamacppReady,
        expertReady: aiService.expertReady,
        maxBrowserNewTokens: MAX_BROWSER_NEW_TOKENS,
        isProviderActive: provider === 'llamacpp' || provider === 'expert-api',
        isProviderReady: provider !== 'unavailable',
        syncEnvironment,
        setConfig,
        resetConfig,
        isWebAiUnavailable,
        checkHealth,
        chat,
        providerLabel,
        needsModelInit,
    };
}
