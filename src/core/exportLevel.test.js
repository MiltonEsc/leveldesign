import test from 'node:test'
import assert from 'node:assert/strict'

if (!globalThis.ImageData) {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) { this.data = data; this.width = width; this.height = height }
  }
}
// composeNativeSheet needs a DOM canvas; stub just enough for the model build.
if (!globalThis.document) {
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ imageSmoothingEnabled: false, putImageData() {}, drawImage() {} }),
    }),
  }
}

const { buildLevelModel, tiledMap, genericJson } = await import('./exportLevel.js')

function fakeLevel() {
  const width = 3, height = 2
  const grid = new Uint8Array([
    1, 1, 0,
    0, 1, 0,
  ])
  const manualTiles = new Int16Array(width * height).fill(-1)
  return {
    width, height, seamlessEdges: false,
    placedProps: [{ id: 'p1', assetId: 'tree', x: 1, y: 0 }],
    layers: [{ id: 'l1', name: 'Ground', kind: 'autotile', visible: true, grid, manualTiles }],
  }
}

const fakeLayerTiles = [{ tiles: new Array(48).fill(null).map(() => ({})), tileSize: 16 }]
const ctx = { level: fakeLevel(), layerTiles: fakeLayerTiles, tileSize: 16, assetsById: { tree: { cols: 1, rows: 2 } } }

test('buildLevelModel resolves indices, dedupes tilesets, and keeps props', () => {
  const model = buildLevelModel(ctx)
  assert.equal(model.width, 3)
  assert.equal(model.height, 2)
  assert.equal(model.tilesets.length, 1)
  assert.equal(model.layers.length, 1)
  assert.equal(model.layers[0].data.length, 6)
  // Cell (2,0) and (2,1) are empty terrain → -1; solid cells are >= 0.
  assert.equal(model.layers[0].data[2], -1)
  assert.equal(model.layers[0].data[5], -1)
  assert.ok(model.layers[0].data[0] >= 0)
  assert.deepEqual(model.props, [{ asset: 'tree', x: 1, y: 0, cols: 1, rows: 2 }])
})

test('tiledMap encodes empty as gid 0 and tiles as firstgid + index', () => {
  const model = buildLevelModel(ctx)
  const map = tiledMap(model, 'level_3x2')
  assert.equal(map.orientation, 'orthogonal')
  assert.equal(map.tilewidth, 16)
  assert.equal(map.tilesets[0].firstgid, 1)
  assert.equal(map.tilesets[0].image, 'level_3x2_tileset_0.png')
  const tileLayer = map.layers.find(l => l.type === 'tilelayer')
  assert.equal(tileLayer.data[2], 0) // empty
  assert.equal(tileLayer.data[0], 1 + model.layers[0].data[0]) // firstgid + index
  // Props become an object group.
  assert.ok(map.layers.some(l => l.type === 'objectgroup' && l.objects.length === 1))
})

test('genericJson carries flat per-layer data and tileset refs', () => {
  const model = buildLevelModel(ctx)
  const json = genericJson(model, 'level_3x2')
  assert.equal(json.format, 'tileset-studio-level')
  assert.equal(json.tileSize, 16)
  assert.equal(json.tilesets[0].image, 'level_3x2_tileset_0.png')
  assert.equal(json.layers[0].data.length, 6)
  assert.equal(json.layers[0].tileset, 0)
})
