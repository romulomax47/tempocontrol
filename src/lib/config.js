export function readPublicConfig(env) {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!url && !key) return { kind: 'missing' };
  try {
    const parsed = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:'))) throw new Error();
    let publishable = key.startsWith('sb_publishable_');
    if (!publishable && key.split('.').length === 3) {
      const payload = key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
      publishable = JSON.parse(atob(payload)).role === 'anon';
    }
    if (!publishable) throw new Error();
    return { kind: 'ready', url, key };
  } catch {
    return { kind: 'invalid', message: 'Configure a URL do Supabase e uma chave publicável (ou anon). Chaves privadas não são permitidas.' };
  }
}
