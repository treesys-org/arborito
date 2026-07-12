import { runArcadeGamesAction } from './games.js';

/** Run an arcade hub action (mirrors Biblioteca `runSourcesAction`). */
export async function runArcadeAction(ctx, action, fields = {}) {
    return runArcadeGamesAction(ctx, action, fields);
}
