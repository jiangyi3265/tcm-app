import { defineConfig, mergeConfig } from 'vite'
import appConfig from '../vite.config.js'

export default mergeConfig(appConfig, defineConfig({ server: { proxy: { '/api': null } } }))
