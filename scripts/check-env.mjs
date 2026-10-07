import process from 'node:process';
import { loadEnv } from 'vite';
import { readPublicConfig } from '../src/lib/config.js';
const config = readPublicConfig(loadEnv('production', process.cwd(), 'VITE_'));
if (config.kind !== 'ready') {
  console.error(config.message || 'Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY antes do deploy.');
  process.exitCode = 1;
} else {
  console.log('Configuração pública do Supabase validada.');
}
