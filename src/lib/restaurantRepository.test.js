import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createRestaurantRepository, PAGE_SIZE } from './restaurantRepository';

const row = { id: 'request-a', equipment_id: 'equipment-a', temperature: -20.5, recorded_by: 'user-a' };
const request = { id: row.id, equipmentId: row.equipment_id, temperature: row.temperature };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function createRepository(fetch) {
  return createRestaurantRepository(createClient('https://project.example.test', 'sb_publishable_test', {
    global: { fetch }, auth: { storageKey: `repository-test-${crypto.randomUUID()}`,
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}
describe('contrato do cliente oficial Supabase com a API', () => {
  it('envia apenas temperatura, equipamento e identidade idempotente, nunca campos de auditoria', async () => {
    let sent;
    const repo = createRepository(vi.fn(async (_url, options) => { sent = JSON.parse(options.body); return json(row); }));
    expect(await repo.recordMeasurement(request, 'user-a')).toEqual(row);
    expect(sent).toEqual({ id: row.id, equipment_id: row.equipment_id, temperature: -20.5 });
    expect(sent).not.toHaveProperty('restaurant_id'); expect(sent).not.toHaveProperty('recorded_by');
  });
  it('reconhece envio já confirmado após retry sem gravar uma segunda medição', async () => {
    const fetch = vi.fn(async (_url, options) => options.method === 'POST'
      ? json({ code: '23505', message: 'duplicate key' }, 409) : json(row));
    const repo = createRepository(fetch);
    expect(await repo.recordMeasurement(request, 'user-a')).toEqual(row);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('não trata colisão de identidade com outra pessoa como sucesso', async () => {
    const repo = createRepository(vi.fn(async (_url, options) => options.method === 'POST'
      ? json({ code: '23505', message: 'duplicate key' }, 409) : json({ ...row, recorded_by: 'another-user' })));
    await expect(repo.recordMeasurement(request, 'user-a')).rejects.toMatchObject({ code: '23505' });
  });
  it('propaga falha real de gravação em vez de usar localStorage', async () => {
    const repo = createRepository(vi.fn(async () => json({ code: '42501', message: 'denied' }, 403)));
    await expect(repo.recordMeasurement(request, 'user-a')).rejects.toMatchObject({ code: '42501' });
  });
  it('consulta somente o restaurante solicitado e informa se há outra página', async () => {
    let queried;
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => ({ ...row, id: `row-${index}` }));
    const repo = createRepository(vi.fn(async url => { queried = new URL(url); return json(rows); }));
    const result = await repo.history('restaurant-a', 1);
    expect(result.records).toHaveLength(PAGE_SIZE); expect(result.hasMore).toBe(true);
    expect(queried.searchParams.get('restaurant_id')).toBe('eq.restaurant-a');
    expect(queried.searchParams.get('offset')).toBe(String(PAGE_SIZE));
  });
  it('usuário sem associação não dispara consultas de equipamento ou histórico', async () => {
    const fetch = vi.fn(async () => json([]));
    expect(await createRepository(fetch).loadWorkspace('new-user')).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
