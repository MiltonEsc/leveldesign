// Shared zoom bounds for the Level Designer canvas (px per cell)
export const MIN_CELL_PX = 4
export const MAX_CELL_PX = 64
export const ZOOM_STEP   = 2

export const clampCellPx = (v) => Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, v))
