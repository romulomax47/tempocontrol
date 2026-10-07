import { useState } from 'react';
import { finiteTemperature, serviceMessage } from '../lib/validation';
export default function EquipmentManager({ equipment, restaurantId, repository, onSaved }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function edit(item) {
    setEditing(item?.id || null); setName(item?.name || '');
    setMinimum(item ? String(item.minimum) : ''); setMaximum(item ? String(item.maximum) : '');
    setActive(item?.active ?? true); setError(''); setMessage('');
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    const min = finiteTemperature(minimum); const max = finiteTemperature(maximum);
    if (!name.trim() || name.trim().length > 100 || min === null || max === null || min > max) {
      setError('Informe um nome e limites numéricos finitos, com mínimo menor ou igual ao máximo.'); return;
    }
    setBusy(true);
    try {
      const values = { name: name.trim(), minimum: min, maximum: max };
      if (editing) values.active = active;
      const item = await repository.saveEquipment(restaurantId, values, editing);
      onSaved(item); edit(null); setMessage('Equipamento salvo.');
    } catch (failure) { setError(serviceMessage(failure)); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="equipment-manager-title">
    <h2 id="equipment-manager-title">Equipamentos e limites</h2>
    <ul className="equipment-list">{equipment.map(item => <li key={item.id}>
      <span>{item.name} — {item.minimum} a {item.maximum} °C{!item.active && ' (inativo)'}</span>
      <button type="button" disabled={busy} onClick={() => edit(item)}>Editar {item.name}</button>
    </li>)}</ul>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <h3>{editing ? 'Editar equipamento' : 'Novo equipamento'}</h3>
      <label htmlFor="device-name">Nome do equipamento</label>
      <input id="device-name" maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      <div className="limits-grid">
        <div><label htmlFor="device-min">Mínimo (°C)</label><input id="device-min" type="number" step="any" value={minimum} disabled={busy} onChange={event => setMinimum(event.target.value)} /></div>
        <div><label htmlFor="device-max">Máximo (°C)</label><input id="device-max" type="number" step="any" value={maximum} disabled={busy} onChange={event => setMaximum(event.target.value)} /></div>
      </div>
      {editing && <label className="checkbox-label"><input type="checkbox" checked={active} disabled={busy} onChange={event => setActive(event.target.checked)} />Ativo para novas medições</label>}
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      <button disabled={busy}>{busy ? 'Salvando…' : 'Salvar equipamento'}</button>
      {editing && <button type="button" disabled={busy} onClick={() => edit(null)}>Cancelar edição</button>}
    </form>
  </section>;
}
