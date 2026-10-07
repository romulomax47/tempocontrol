// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ids = {
  ownerA: '00000000-0000-4000-8000-000000000001',
  staffA: '00000000-0000-4000-8000-000000000002',
  ownerB: '00000000-0000-4000-8000-000000000003',
  unlinked: '00000000-0000-4000-8000-000000000004',
};
let db, restaurantA, restaurantB, equipmentA, equipmentB;
async function asUser(user) {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[user]]);
}
async function measure(equipment, temperature) {
  return (await db.query('insert into public.measurements (equipment_id, temperature) values ($1,$2) returning *', [equipment, temperature])).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  // Only Supabase's supplied Auth schema/helper is simulated. The actual application
  // migration, PostgreSQL RLS, roles, grants, FKs, functions and triggers execute here.
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  await db.exec(await readFile(new URL('../migrations/20261007000100_restaurant_mvp.sql', import.meta.url), 'utf8'));
  for (const [name, id] of Object.entries(ids)) await db.query('insert into auth.users values ($1,$2,now())', [id, `${name}@example.test`]);
  await asUser('ownerA');
  restaurantA = (await db.query("select public.create_restaurant('Restaurante A','Ana') id")).rows[0].id;
  await db.query("select public.add_restaurant_member('staffA@example.test','Bia')");
  equipmentA = (await db.query("insert into public.equipment (restaurant_id,name,minimum,maximum) values ($1,'Freezer A',-25,-18) returning id", [restaurantA])).rows[0].id;
  await asUser('ownerB');
  restaurantB = (await db.query("select public.create_restaurant('Restaurante B','Carlos') id")).rows[0].id;
  equipmentB = (await db.query("insert into public.equipment (restaurant_id,name,minimum,maximum) values ($1,'Geladeira B',0,5) returning id", [restaurantB])).rows[0].id;
  await measure(equipmentB, 3);
}, 120000);
afterAll(async () => { await db?.close(); });

describe('migration real e isolamento PostgreSQL', () => {
  it('limita restaurantes, usuários, equipamentos e medições ao próprio restaurante', async () => {
    await asUser('ownerA');
    expect((await db.query('select id from public.restaurants')).rows).toEqual([{ id: restaurantA }]);
    expect((await db.query('select user_id from public.restaurant_members')).rows.map(row => row.user_id).sort()).toEqual([ids.ownerA, ids.staffA].sort());
    expect((await db.query('select id from public.equipment')).rows).toEqual([{ id: equipmentA }]);
    expect((await db.query('select * from public.measurements where restaurant_id = $1', [restaurantB])).rows).toHaveLength(0);
  });
  it('nega acesso anônimo às tabelas e RPCs', async () => {
    await db.exec('reset role; set role anon;');
    await expect(db.query('select * from public.measurements')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("select public.create_restaurant('X','Y')")).rejects.toMatchObject({ code: '42501' });
  });
  it('nega criação de equipamento em outro restaurante', async () => {
    await asUser('ownerA');
    await expect(db.query("insert into public.equipment (restaurant_id,name,minimum,maximum) values ($1,'Fraude',0,5)", [restaurantB])).rejects.toMatchObject({ code: '42501' });
  });
  it('não permite alterar equipamentos de outro restaurante', async () => {
    await asUser('ownerA');
    expect((await db.query("update public.equipment set name='Fraude' where id=$1 returning id", [equipmentB])).rows).toHaveLength(0);
  });
  it('não permite ao funcionário configurar equipamentos ou associar contas', async () => {
    await asUser('staffA');
    await expect(db.query("insert into public.equipment (restaurant_id,name,minimum,maximum) values ($1,'Novo',0,5)", [restaurantA])).rejects.toMatchObject({ code: '42501' });
    expect((await db.query("update public.equipment set maximum=99 where id=$1 returning id", [equipmentA])).rows).toHaveLength(0);
    await expect(db.query("select public.add_restaurant_member('unlinked@example.test','X')")).rejects.toMatchObject({ code: '42501' });
  });
  it('impede mudança de restaurante, autoassociação e escalada para proprietário', async () => {
    await asUser('staffA');
    await expect(db.query("update public.restaurant_members set role='owner' where user_id=$1", [ids.staffA])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('insert into public.restaurant_members (user_id,restaurant_id,display_name,role) values ($1,$2,$3,$4)', [ids.unlinked, restaurantA, 'X', 'owner'])).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("select public.create_restaurant('Outro','Bia')")).rejects.toMatchObject({ code: 'P0001' });
  });
  it('usuário sem vínculo não vê dados e não registra medições', async () => {
    await asUser('unlinked');
    expect((await db.query('select * from public.restaurants')).rows).toHaveLength(0);
    await expect(measure(equipmentA, -20)).rejects.toMatchObject({ code: '42501' });
  });
  it('não aceita equipamento de outro restaurante mesmo com ID conhecido', async () => {
    await asUser('ownerA');
    await expect(measure(equipmentB, 3)).rejects.toMatchObject({ code: 'P0001' });
  });
  it('impede forjar responsável, restaurante, horário e limites pelo cliente', async () => {
    await asUser('ownerA');
    for (const column of ['recorded_by', 'restaurant_id', 'recorded_at', 'minimum', 'equipment_name']) {
      const value = column === 'recorded_at' ? 'now()' : column === 'minimum' ? '0' : column === 'equipment_name' ? "'Falso'" : `'${restaurantB}'`;
      await expect(db.query(`insert into public.measurements (equipment_id,temperature,${column}) values ($1,0,${value})`, [equipmentA])).rejects.toMatchObject({ code: '42501' });
    }
  });
  it.each([[-25, 'normal'], [-18, 'normal'], [-20.55, 'normal'], [-25.1, 'alerta'], [-17.9, 'alerta']])('calcula status para %s no servidor: %s', async (temperature, status) => {
    await asUser('staffA');
    const row = await measure(equipmentA, temperature);
    expect(row).toMatchObject({ temperature, status, restaurant_id: restaurantA, recorded_by: ids.staffA,
      equipment_name: 'Freezer A', responsible_name: 'Bia', minimum: -25, maximum: -18 });
    expect(Number.isFinite(new Date(row.recorded_at).getTime())).toBe(true);
  });
  it.each(['NaN', 'Infinity', '-Infinity'])('rejeita %s no banco', async temperature => {
    await asUser('ownerA');
    await expect(measure(equipmentA, temperature)).rejects.toMatchObject({ code: '23514' });
  });
  it('não permite editar nem excluir o histórico', async () => {
    await asUser('ownerA');
    await expect(db.query('update public.measurements set temperature=0')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('delete from public.measurements')).rejects.toMatchObject({ code: '42501' });
  });
  it('garante unicidade do identificador de envio no banco', async () => {
    await asUser('staffA');
    const id = '00000000-0000-4000-8000-000000000099';
    await db.query('insert into public.measurements (id,equipment_id,temperature) values ($1,$2,-20)', [id, equipmentA]);
    await expect(db.query('insert into public.measurements (id,equipment_id,temperature) values ($1,$2,-20)', [id, equipmentA])).rejects.toMatchObject({ code: '23505' });
    expect((await db.query('select id from public.measurements where id=$1', [id])).rows).toHaveLength(1);
  });
  it('o proprietário não consegue transferir contas já vinculadas a outro restaurante', async () => {
    await asUser('ownerA');
    await expect(db.query("select public.add_restaurant_member('ownerB@example.test','Outra pessoa')")).rejects.toMatchObject({ code: 'P0001' });
    await asUser('ownerB');
    expect((await db.query('select user_id from public.restaurant_members')).rows).toEqual([{ user_id: ids.ownerB }]);
    expect((await db.query('select equipment_name from public.measurements')).rows).toEqual([{ equipment_name: 'Geladeira B' }]);
  });
  it('rejeita limites invertidos ou não finitos na configuração', async () => {
    await asUser('ownerA');
    for (const [min, max] of [[5, 0], ['NaN', 5], [0, 'Infinity']]) {
      await expect(db.query("insert into public.equipment (restaurant_id,name,minimum,maximum) values ($1,'Inválido',$2,$3)", [restaurantA, min, max])).rejects.toMatchObject({ code: '23514' });
    }
  });
  it('preserva os limites e nomes históricos depois de editar o equipamento', async () => {
    await asUser('ownerA');
    const old = await measure(equipmentA, -20);
    await db.query("update public.equipment set name='Freezer Renomeado', minimum=-30, maximum=-22 where id=$1", [equipmentA]);
    const fresh = await measure(equipmentA, -20);
    expect(fresh).toMatchObject({ equipment_name: 'Freezer Renomeado', minimum: -30, maximum: -22, status: 'alerta' });
    expect((await db.query('select * from public.measurements where id=$1', [old.id])).rows[0]).toMatchObject({ equipment_name: 'Freezer A', minimum: -25, maximum: -18, status: 'normal' });
    await db.query('update public.equipment set active=false where id=$1', [equipmentA]);
    await expect(measure(equipmentA, -25)).rejects.toMatchObject({ code: 'P0001' });
  });
});
