import { describe, expect, it } from 'vitest';
import { finiteTemperature, measurementErrors } from './validation';
import { readPublicConfig } from './config';
describe('validação do fluxo Supabase', () => {
  it.each(['', ' ', 'NaN', 'Infinity', '-Infinity', '1e309', 'abc', '0x20'])('rejeita entrada %s', value => {
    expect(finiteTemperature(value)).toBeNull();
  });
  it.each([['-20.55', -20.55], ['0', 0], ['5', 5], ['.5', .5]])('aceita %s sem impor limites do equipamento', (value, result) => {
    expect(finiteTemperature(value)).toBe(result);
  });
  it('aceita temperatura fora do limite e rejeita equipamento inativo ou inexistente', () => {
    const devices = [{ id: 'freezer', active: true, minimum: -25, maximum: -18 }, { id: 'old', active: false }];
    expect(measurementErrors(devices, 'freezer', '25')).toEqual({});
    expect(measurementErrors(devices, 'old', '1').equipment).toBeTruthy();
    expect(measurementErrors(devices, 'unknown', '1').equipment).toBeTruthy();
  });
  it('aceita somente URL segura e chave pública e detecta configuração ausente', () => {
    expect(readPublicConfig({}).kind).toBe('missing');
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).kind).toBe('ready');
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).kind).toBe('invalid');
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never-use' }).kind).toBe('invalid');
    const key = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(readPublicConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key }).kind).toBe('invalid');
  });
});
