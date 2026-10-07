import { useState } from 'react';
import { serviceMessage } from '../lib/validation';
export default function RestaurantSetup({ repository, refresh }) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    if (![name, displayName].every(value => value.trim().length > 0 && value.trim().length <= 100)) {
      setError('Informe o nome do restaurante e seu nome (até 100 caracteres).'); return;
    }
    setBusy(true);
    try { await repository.createRestaurant(name.trim(), displayName.trim()); refresh(); }
    catch (failure) { setError(serviceMessage(failure)); }
    finally { setBusy(false); }
  }
  return <section>
    <h2>Vincule sua conta a um restaurante</h2>
    <p>Faz parte de uma equipe? Peça ao proprietário para associar seu e-mail confirmado e atualize o vínculo.</p>
    <button onClick={refresh} disabled={busy}>Atualizar vínculo</button>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <h3>Sou proprietário de um novo restaurante</h3>
      <label htmlFor="restaurant-name">Nome do restaurante</label>
      <input id="restaurant-name" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} />
      <label htmlFor="owner-name">Seu nome</label>
      <input id="owner-name" value={displayName} maxLength={100} disabled={busy} onChange={event => setDisplayName(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Criando…' : 'Criar restaurante'}</button>
    </form>
  </section>;
}
