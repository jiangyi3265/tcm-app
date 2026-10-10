import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import * as availableIcons from '@element-plus/icons-vue'
import { appIcons, registerAppIcons } from '../src/icons.js'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const normalize = (name) => name.replace(/-/g, '').toLowerCase()
const names = new Map([...Object.keys(availableIcons), ...Object.keys(appIcons)].map((name) => [normalize(name), name]))

test('the icon registry covers static templates, icon props and dynamic component names', () => {
  const required = new Set()
  function requireIcon(rawName, filename) {
    const name = names.get(normalize(rawName))
    assert(name && appIcons[name], `${filename}: missing icon registration for ${rawName}`)
    required.add(name)
  }
  for (const relative of fs.readdirSync(sourceRoot, { recursive: true }).filter((file) => /\.(vue|js)$/.test(file))) {
    const source = fs.readFileSync(path.join(sourceRoot, relative), 'utf8')
    const configuredNames = [...source.matchAll(/\bicon:\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    configuredNames.forEach((name) => requireIcon(name, relative))
    if (!relative.endsWith('.vue')) continue
    const { descriptor } = parseSfc(source)
    if (!descriptor.template) continue
    const ast = parseTemplate(descriptor.template.content)
    function visit(node, insideIcon = false) {
      if (node.type !== 1 && node.type !== 0) return
      if (node.type === 1) {
        if (names.has(normalize(node.tag)) || (insideIcon && node.tag !== 'component' && node.tag !== 'svg')) {
          requireIcon(node.tag, relative)
        }
        for (const prop of node.props) {
          const isIconProp = prop.type === 7 && prop.name === 'bind'
            && ['icon', 'prefix-icon', 'suffix-icon'].includes(prop.arg?.content)
          const isDynamicIcon = node.tag === 'component' && insideIcon && prop.type === 7
            && prop.name === 'bind' && prop.arg?.content === 'is'
          if (!isIconProp && !isDynamicIcon) continue
          const expression = prop.exp?.content || ''
          const literals = [...expression.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
          if (literals.length) literals.forEach((name) => requireIcon(name, relative))
          else {
            assert(isDynamicIcon && expression === 'item.icon' && configuredNames.length,
              `${relative}: check new dynamic icon expression ${expression}`)
          }
        }
      }
      for (const child of node.children || []) visit(child, node.tag === 'el-icon')
    }
    visit(ast)
  }
  assert.deepEqual(Object.keys(appIcons).sort(), [...required].sort(), 'Remove unused global icons as templates change')
})

test('registered icons including the legacy merge alias render SVG components', async () => {
  const registered = new Map()
  registerAppIcons({ component: (name, component) => registered.set(name, component) })
  assert.equal(registered.size, Object.keys(appIcons).length)
  for (const [name, component] of registered) {
    assert.match(await renderToString(h(component)), /^<svg\b/, `${name} must resolve to an SVG`)
  }
})
