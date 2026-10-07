import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import process from 'node:process'
import { readPublicConfig } from './src/lib/config.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const configuration = readPublicConfig(loadEnv(mode, process.cwd(), 'VITE_'))
  if (configuration.kind === 'invalid') throw new Error(configuration.message)
  return { plugins: [react()] }
})
