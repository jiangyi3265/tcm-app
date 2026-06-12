import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindHerbSelection,
  getInventoryHerbMeta,
  validateBoundHerb,
} from '../src/utils/herbBinding.js'

test('bindHerbSelection 为库存行写入 herbDictId 和 name', () => {
  const row = { id: 'inv-1', name: '', herbDictId: null }
  const herb = { id: 'herb-hq', name: '黄芪' }

  const result = bindHerbSelection(row, herb)

  assert.notEqual(result, row)
  assert.deepEqual(result, { id: 'inv-1', name: '黄芪', herbDictId: 'herb-hq', pinyin: '', latinName: '' })
  assert.deepEqual(row, { id: 'inv-1', name: '', herbDictId: null })
})

test('bindHerbSelection 为方剂药味返回新对象并写入 herbDictId 和 herbName', () => {
  const item = { herbName: '', herbDictId: null }
  const herb = { id: 'herb-dg', name: '当归' }

  const result = bindHerbSelection(item, herb, { nameKey: 'herbName' })

  assert.notEqual(result, item)
  assert.deepEqual(result, { herbName: '当归', herbDictId: 'herb-dg', pinyin: '', latinName: '' })
  assert.deepEqual(item, { herbName: '', herbDictId: null })
})

test('getInventoryHerbMeta 支持 Map 作为 herbById 来源，并优先读取草药字典', () => {
  const item = {
    herbDictId: 'herb-hq',
    alias: '旧别名',
    nature: '微温',
    taste: '旧味',
    guijing: '旧归经',
  }
  const herbById = new Map([
    ['herb-hq', {
      id: 'herb-hq',
      alias: '绵黄芪',
      taste: '甘; 辛',
      meridianTropism: '肺, 脾',
      nature: '温',
      toxicity: '无毒',
    }],
  ])

  const meta = getInventoryHerbMeta(item, herbById)

  assert.deepEqual(meta, {
    alias: '绵黄芪',
    pinyin: '',
    latinName: '',
    nature: '温',
    taste: ['甘', '辛'],
    toxicity: '无毒',
    guijing: ['肺', '脾'],
  })
})

test('getInventoryHerbMeta 在字典字段缺失时逐字段回退旧库存值', () => {
  const item = {
    herbDictId: 'herb-cp',
    alias: '橘皮',
    nature: '温',
    taste: '苦;辛',
    guijing: '肺;脾',
  }
  const herbById = new Map([
    ['herb-cp', {
      id: 'herb-cp',
      alias: '',
      nature: '',
      taste: '',
      meridianTropism: '',
    }],
  ])

  const meta = getInventoryHerbMeta(item, herbById)

  assert.equal(meta.alias, '橘皮')
  assert.equal(meta.pinyin, '')
  assert.equal(meta.latinName, '')
  assert.equal(meta.nature, '温')
  assert.deepEqual(meta.taste, ['苦', '辛'])
  assert.deepEqual(meta.guijing, ['肺', '脾'])
})

test('getInventoryHerbMeta 缺失草药字典时回退旧库存字段', () => {
  const meta = getInventoryHerbMeta({
    alias: ['广陈皮', '橘皮'],
    nature: '温',
    taste: '苦;辛',
    toxicity: '小毒',
    guijing: '肺;脾',
  })

  assert.equal(meta.alias, '广陈皮、橘皮')
  assert.equal(meta.pinyin, '')
  assert.equal(meta.latinName, '')
  assert.equal(meta.nature, '温')
  assert.equal(meta.toxicity, '小毒')
  assert.deepEqual(meta.taste, ['苦', '辛'])
  assert.deepEqual(meta.guijing, ['肺', '脾'])
})

test('validateBoundHerb 仅对 raw_herbs 强制 herbDictId', () => {
  assert.equal(validateBoundHerb({ category: 'powder' }), true)
  assert.equal(validateBoundHerb({ category: 'pills' }), true)
  assert.equal(validateBoundHerb({ category: 'raw_herbs' }), false)
  assert.equal(validateBoundHerb({ category: 'raw_herbs', herbDictId: 'herb-hq' }), true)
})
