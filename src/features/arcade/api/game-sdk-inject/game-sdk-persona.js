/**
 * Optional AI persona string for dynamic-mode ask.lessonAction / ai.persona.
 */
import { iframeSdkBlock } from './fragment.js';

export const GAME_SDK_PERSONA_FRAGMENT = iframeSdkBlock([
    '',
    '    var aiPersonaConfig = { persona: \'\' };',
    '',
]);
