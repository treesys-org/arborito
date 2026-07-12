/**
 * Injected into Arcade game iframes by game-player.js.
 * Single public surface: window.arborito (lowercase). No window.Arborito.
 *
 * Error convention: thrown Error may have .code in:
 *   AI_TIMEOUT | AI_SAGE_ERROR | AI_PARSE_ERROR | AI_EMPTY_RESPONSE | AI_NETWORK
 */
import { GAME_SDK_CORE_FRAGMENT } from './game-sdk-inject/game-sdk-core.js';
import { GAME_SDK_LESSON_FRAGMENT } from './game-sdk-inject/game-sdk-lesson.js';
import { GAME_SDK_QUIZ_FRAGMENT } from './game-sdk-inject/game-sdk-quiz.js';
import { GAME_SDK_PLATFORM_FRAGMENT } from './game-sdk-inject/game-sdk-platform.js';
import { GAME_SDK_PLAY_FRAGMENT } from './game-sdk-inject/game-sdk-play.js';
import { GAME_SDK_API_FRAGMENT } from './game-sdk-inject/game-sdk-api.js';

export function buildGameSdkInjection({ bridgeUser, bridgeAvatar, bridgeLang }) {
    const u = JSON.stringify(bridgeUser);
    const a = JSON.stringify(bridgeAvatar);
    const l = JSON.stringify(bridgeLang);

    return `(function(){
    var bridge = window.parent && window.parent.__ARBORITO_GAME_BRIDGE__;
    if (!bridge) { console.error("[arborito] Bridge not found"); return; }
    var user = { username: ${u}, avatar: ${a}, lang: ${l} };
${GAME_SDK_CORE_FRAGMENT}
${GAME_SDK_LESSON_FRAGMENT}
${GAME_SDK_QUIZ_FRAGMENT}
${GAME_SDK_PLATFORM_FRAGMENT}
${GAME_SDK_PLAY_FRAGMENT}
${GAME_SDK_API_FRAGMENT}
})();`;
}
