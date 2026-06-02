import { supabase } from './supabase.js'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ── Assets (props) ──────────────────────────────────────────────────────────
// Row shape: { id, name, cols, rows, tile_size, pixels(base64), created_at }
export async function listAssets() {
  return unwrap(await supabase.from('assets').select('*').order('created_at', { ascending: true }))
}

export async function addAsset({ name, cols, rows, tileSize, pixelsB64 }) {
  const rows_ = unwrap(await supabase.from('assets')
    .insert({ name, cols, rows, tile_size: tileSize, pixels: pixelsB64 })
    .select())
  return rows_[0]
}

export async function removeAsset(id) {
  unwrap(await supabase.from('assets').delete().eq('id', id))
}

// ── Tilesets ────────────────────────────────────────────────────────────────
// Row shape: { id, name, tile_size, definition(jsonb), created_at }
export async function listTilesets() {
  return unwrap(await supabase.from('tilesets').select('*').order('created_at', { ascending: true }))
}

export async function saveTileset({ name, tileSize, definition }) {
  const rows = unwrap(await supabase.from('tilesets')
    .insert({ name, tile_size: tileSize, definition })
    .select())
  return rows[0]
}

export async function removeTileset(id) {
  unwrap(await supabase.from('tilesets').delete().eq('id', id))
}

// ── Levels ──────────────────────────────────────────────────────────────────
// Row shape: { id, name, width, height, tile_size, grid(base64),
//              placed_props(jsonb), tileset(jsonb), seamless_edges, created_at }
export async function listLevels() {
  return unwrap(await supabase.from('levels').select('*').order('created_at', { ascending: true }))
}

export async function saveLevel({ name, width, height, tileSize, gridB64, placedProps, tileset, seamlessEdges }) {
  const rows = unwrap(await supabase.from('levels')
    .insert({
      name, width, height, tile_size: tileSize, grid: gridB64,
      placed_props: placedProps, tileset, seamless_edges: seamlessEdges,
    })
    .select())
  return rows[0]
}

export async function removeLevel(id) {
  unwrap(await supabase.from('levels').delete().eq('id', id))
}
