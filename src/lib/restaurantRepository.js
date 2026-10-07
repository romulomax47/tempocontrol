export const PAGE_SIZE = 20;
const unwrap = ({ data, error }) => { if (error) throw error; return data; };
export function createRestaurantRepository(client) {
  const history = async (restaurantId, page = 0) => {
    const rows = unwrap(await client.from('measurements').select('*')
      .eq('restaurant_id', restaurantId).order('recorded_at', { ascending: false })
      .order('id', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    return { records: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  };
  return {
    async loadWorkspace(userId) {
      const member = unwrap(await client.from('restaurant_members')
        .select('user_id,restaurant_id,display_name,role,restaurants(id,name,timezone)')
        .eq('user_id', userId).maybeSingle());
      if (!member) return null;
      const [equipment, firstPage, members] = await Promise.all([
        client.from('equipment').select('*').eq('restaurant_id', member.restaurant_id).order('name').then(unwrap),
        history(member.restaurant_id),
        member.role === 'owner'
          ? client.from('restaurant_members').select('user_id,display_name,role')
            .eq('restaurant_id', member.restaurant_id).order('display_name').then(unwrap)
          : Promise.resolve([]),
      ]);
      return { member, equipment, members, ...firstPage };
    },
    history,
    async createRestaurant(name, displayName) {
      return unwrap(await client.rpc('create_restaurant', { p_name: name, p_display_name: displayName }));
    },
    async addMember(email, displayName) {
      return unwrap(await client.rpc('add_restaurant_member', { p_email: email, p_display_name: displayName }));
    },
    async saveEquipment(restaurantId, values, id) {
      const query = id
        ? client.from('equipment').update(values).eq('id', id).eq('restaurant_id', restaurantId)
        : client.from('equipment').insert({ ...values, restaurant_id: restaurantId });
      return unwrap(await query.select().single());
    },
    async recordMeasurement(request, userId) {
      const response = await client.from('measurements').insert({
        id: request.id, equipment_id: request.equipmentId, temperature: request.temperature,
      }).select().single();
      if (!response.error) return response.data;
      if (response.error.code !== '23505') throw response.error;
      const existing = unwrap(await client.from('measurements').select('*').eq('id', request.id).single());
      if (existing.recorded_by !== userId || existing.equipment_id !== request.equipmentId ||
        existing.temperature !== request.temperature) throw response.error;
      return existing;
    },
  };
}
