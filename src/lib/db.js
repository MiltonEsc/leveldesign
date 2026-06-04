import { supabase } from './supabase.js'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// When Supabase isn't configured (.env.local missing the URL/key), the client
// is null. Reads return empty, writes throw a clear, catchable message.
const NOT_CONFIGURED = 'Cloud storage is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.'
function requireClient() {
  if (!supabase) throw new Error(NOT_CONFIGURED)
  return supabase
}

// ── Assets (props) ──────────────────────────────────────────────────────────
// Row shape: { id, name, cols, rows, tile_size, pixels(base64), created_at }
export async function listAssets() {
  if (!supabase) return []
  return unwrap(await supabase.from('assets').select('*').order('created_at', { ascending: true }))
}

export async function addAsset({ name, cols, rows, tileSize, pixelsB64 }) {
  const rows_ = unwrap(await requireClient().from('assets')
    .insert({ name, cols, rows, tile_size: tileSize, pixels: pixelsB64 })
    .select())
  return rows_[0]
}

export async function removeAsset(id) {
  unwrap(await requireClient().from('assets').delete().eq('id', id))
}

// ── Tilesets ────────────────────────────────────────────────────────────────
// Row shape: { id, name, tile_size, definition(jsonb), created_at }
export async function listTilesets() {
  if (!supabase) return []
  return unwrap(await supabase.from('tilesets').select('*').order('created_at', { ascending: true }))
}

export async function saveTileset({ name, tileSize, definition }) {
  const rows = unwrap(await requireClient().from('tilesets')
    .insert({ name, tile_size: tileSize, definition })
    .select())
  return rows[0]
}

export async function removeTileset(id) {
  unwrap(await requireClient().from('tilesets').delete().eq('id', id))
}

// ── Levels ──────────────────────────────────────────────────────────────────
// Row shape: { id, name, width, height, tile_size,
//              layers(jsonb) — array of { id,name,visible,tileset,gridB64,manualTilesB64 },
//              placed_props(jsonb), seamless_edges, created_at }
// Legacy rows may also have: grid, manual_tiles, materials, material_ids, tileset
export async function listLevels() {
  if (!supabase) return []
  return unwrap(await supabase.from('levels').select('*').order('created_at', { ascending: true }))
}

export async function saveLevel({ name, width, height, tileSize, layers, placedProps, seamlessEdges }) {
  const rows = unwrap(await requireClient().from('levels')
    .insert({
      name, width, height, tile_size: tileSize,
      layers: layers ?? null,
      placed_props: placedProps, seamless_edges: seamlessEdges,
    })
    .select())
  return rows[0]
}

export async function removeLevel(id) {
  unwrap(await requireClient().from('levels').delete().eq('id', id))
}
