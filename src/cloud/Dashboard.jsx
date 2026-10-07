import { useEffect, useRef, useState } from 'react';
import RestaurantSetup from './RestaurantSetup';
import EquipmentManager from './EquipmentManager';
import TeamManager from './TeamManager';
import { finiteTemperature, measurementErrors, serviceMessage } from '../lib/validation';
export default function Dashboard({ user, repository }) {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [equipmentId, setEquipmentId] = useState('');
  const [temperature, setTemperature] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [writeError, setWriteError] = useState('');
  const [page, setPage] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const inFlight = useRef(false);
  const request = useRef(null);
  useEffect(() => {
    let active = true;
    repository.loadWorkspace(user.id).then(data => {
      if (active) { setWorkspace(data); setLoading(false); }
    }).catch(failure => {
      if (active) { setError(serviceMessage(failure, 'Não foi possível carregar o restaurante. Confira sua conexão.')); setLoading(false); }
    });
    return () => { active = false; };
  }, [repository, user.id, revision]);
  function refresh(notification = '') {
    setLoading(true); setError(''); setWriteError(''); setHistoryError(''); setPage(0);
    setMessage(typeof notification === 'string' ? notification : '');
    setRevision(value => value + 1);
  }
  async function record(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const invalid = measurementErrors(workspace.equipment, equipmentId, temperature);
    setErrors(invalid); setMessage(''); setWriteError('');
    if (Object.keys(invalid).length) return;
    const number = finiteTemperature(temperature);
    if (request.current?.equipmentId !== equipmentId || request.current?.temperature !== number) request.current = { id: crypto.randomUUID(), equipmentId, temperature: number };
    inFlight.current = true; setBusy(true);
    try {
      const saved = await repository.recordMeasurement(request.current, user.id);
      setWorkspace(value => ({ ...value, records: [saved, ...value.records.filter(row => row.id !== saved.id)] }));
      setTemperature(''); request.current = null;
      setMessage(saved.status === 'normal' ? 'Medição registrada e salva no restaurante.' : 'Medição salva com alerta: temperatura fora dos limites.');
    } catch (failure) { setWriteError(serviceMessage(failure, 'Não foi possível confirmar a gravação. Tente novamente com os mesmos valores para evitar duplicação.')); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function loadMore() {
    setMoreBusy(true); setHistoryError('');
    try {
      const next = await repository.history(workspace.member.restaurant_id, page + 1);
      setWorkspace(value => ({ ...value, hasMore: next.hasMore, records: [...value.records, ...next.records.filter(row => !value.records.some(existing => existing.id === row.id))] }));
      setPage(value => value + 1);
    } catch (failure) { setHistoryError(serviceMessage(failure, 'Não foi possível carregar mais medições. Tente novamente.')); }
    finally { setMoreBusy(false); }
  }
  if (loading) return <p role="status">Carregando restaurante e medições…</p>;
  if (error) return <><p role="alert">{error}</p><button onClick={refresh}>Tentar novamente</button></>;
  if (!workspace) return <RestaurantSetup repository={repository} refresh={refresh} />;
  const { member, equipment, records } = workspace;
  const selected = equipment.find(item => item.id === equipmentId && item.active);
  const value = finiteTemperature(temperature);
  const outside = selected && value !== null && (value < selected.minimum || value > selected.maximum);
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: member.restaurants.timezone });
  return <>
    <section className="restaurant-heading"><h2>{member.restaurants.name}</h2><p>Responsável: {member.display_name}</p>
      <button onClick={refresh} disabled={busy || moreBusy}>Atualizar histórico</button></section>
    <form onSubmit={record} noValidate aria-busy={busy} aria-label="Registrar medição">
      <label htmlFor="cloud-equipment">Equipamento</label>
      <select id="cloud-equipment" value={equipmentId} disabled={busy} aria-invalid={Boolean(errors.equipment)}
        aria-describedby={errors.equipment ? 'cloud-equipment-error' : undefined} onChange={event => setEquipmentId(event.target.value)}>
        <option value="">Selecione</option>{equipment.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {errors.equipment && <p id="cloud-equipment-error" role="alert">{errors.equipment}</p>}
      {!equipment.some(item => item.active) && <p>Nenhum equipamento ativo. Peça ao proprietário para cadastrar um equipamento.</p>}
      {selected && <p className="limit-hint">Limite: {selected.minimum} °C até {selected.maximum} °C</p>}
      <label htmlFor="cloud-temperature">Temperatura (°C)</label>
      <input id="cloud-temperature" type="number" step="any" inputMode="decimal" value={temperature} disabled={busy}
        placeholder="Ex: -20.5" aria-invalid={Boolean(errors.temperature)} aria-describedby={errors.temperature ? 'cloud-temperature-error' : 'temperature-hint'}
        onChange={event => setTemperature(event.target.value)} />
      {errors.temperature && <p id="cloud-temperature-error" role="alert">{errors.temperature}</p>}
      <p id="temperature-hint" className={outside ? 'inline-warning' : 'limit-hint'}>{outside ? 'Fora dos limites. A medição será registrada com alerta.' : 'Temperaturas negativas e decimais são aceitas.'}</p>
      {writeError && <p role="alert">{writeError}</p>}<p role="status">{message}</p>
      <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar temperatura'}</button>
    </form>
    <section className="historico" aria-labelledby="cloud-history-title"><h2 id="cloud-history-title">Histórico de medições</h2>
      <p className="limit-hint">Horários em {member.restaurants.timezone}</p>
      {records.length === 0 && <p>Nenhuma medição registrada.</p>}
      {records.map(row => <article key={row.id} className={`medicao ${row.status}`}>
        <div className="medicao-topo"><strong>{row.equipment_name}</strong><span>{row.status === 'normal' ? '✅ Normal' : '⚠️ Alerta'}</span></div>
        <p><strong>Temperatura:</strong> {row.temperature} °C</p><p><strong>Limite:</strong> {row.minimum} °C até {row.maximum} °C</p>
        <p><strong>Responsável:</strong> {row.responsible_name}</p><time dateTime={row.recorded_at}>{date.format(new Date(row.recorded_at))}</time>
      </article>)}
      {historyError && <p role="alert">{historyError}</p>}
      {workspace.hasMore && <button disabled={moreBusy || busy} onClick={loadMore}>{moreBusy ? 'Carregando…' : 'Carregar mais medições'}</button>}
    </section>
    {member.role === 'owner' && <div className="management">
      <EquipmentManager equipment={equipment} restaurantId={member.restaurant_id} repository={repository}
        onSaved={item => setWorkspace(current => ({ ...current, equipment: [...current.equipment.filter(row => row.id !== item.id), item] }))} />
      <TeamManager members={workspace.members} repository={repository} refresh={() => refresh('Responsável associado ao restaurante.')} />
    </div>}
  </>;
}
