import { createClient } from '@supabase/supabase-js';
import { readPublicConfig } from './config';
export const configuration = readPublicConfig(import.meta.env);
export const supabase = configuration.kind === 'ready'
  ? createClient(configuration.url, configuration.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }) : null;
