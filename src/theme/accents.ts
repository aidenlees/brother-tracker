/**
 * The six tracker accents. A tracker's `color` must be one of these names; each maps
 * to the `--tracker-<name>` token in tokens.css (tokens.test.ts keeps the two in sync).
 */
export const TRACKER_ACCENTS = ['ink-blue', 'rosin-amber', 'moss', 'plum', 'teal', 'brick'] as const

export type TrackerAccent = (typeof TRACKER_ACCENTS)[number]
