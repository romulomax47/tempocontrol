import { useState } from 'react';
import { serviceMessage } from '../lib/validation';
export default function TeamManager({ members, repository, refresh }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !name.trim() || name.trim().length > 100) { setError('Informe o e-mail confirmado e o nome do responsável.'); return; }
    setBusy(true);
    try { await repository.addMember(email.trim(), name.trim()); refresh(); }
    catch (failure) { setError(serviceMessage(failure)); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="team-title"><h2 id="team-title">Responsáveis</h2>
    <ul>{members.map(member => <li key={member.user_id}>{member.display_name} — {member.role === 'owner' ? 'Proprietário' : 'Equipe'}</li>)}</ul>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <p>A pessoa precisa criar e confirmar sua conta antes de ser associada.</p>
      <label htmlFor="member-email">E-mail do responsável</label>
      <input id="member-email" type="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
      <label htmlFor="member-name">Nome do responsável</label>
      <input id="member-name" maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Associando…' : 'Associar responsável'}</button>
    </form>
  </section>;
}
