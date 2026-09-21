export const MODAL_WIDTH = 720;

/** Mirrors the Skills module's own slug rule (server: D3) — duplicated rather
 *  than imported since a route may not reach into another route's helpers. */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
