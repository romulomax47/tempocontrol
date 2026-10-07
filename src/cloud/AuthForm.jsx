import { useState } from 'react';
import { serviceMessage } from '../lib/validation';
export default function AuthForm({ client, recovery = false, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'update' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const titles = { signin: 'Entrar', signup: 'Criar conta', reset: 'Recuperar senha', update: 'Salvar nova senha' };
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(''); setMessage('');
    if (mode !== 'update' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Informe um e-mail válido.'); return; }
    if (mode !== 'reset' && password.length < (mode === 'signin' ? 1 : 8)) {
      setError(mode === 'signin' ? 'Informe sua senha.' : 'Use uma senha com pelo menos 8 caracteres.'); return;
    }
    setBusy(true);
    try {
      let result;
      if (mode === 'signin') result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (mode === 'signup') result = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
      if (mode === 'reset') result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (mode === 'update') result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword('');
      if (mode === 'signup') setMessage('Conta solicitada. Confira seu e-mail para confirmar o cadastro e entrar.');
      if (mode === 'reset') setMessage('Se a conta existir, você receberá um e-mail para recuperar a senha.');
      if (mode === 'update') { setMessage('Senha atualizada.'); onRecovered?.(); }
    } catch (failure) { setError(serviceMessage(failure)); }
    finally { setBusy(false); }
  }
  function switchMode(next) { setMode(next); setError(''); setMessage(''); setPassword(''); }
  return <section aria-labelledby="auth-title">
    <h2 id="auth-title">{titles[mode]}</h2>
    <form onSubmit={submit} noValidate aria-busy={busy}>
      {mode !== 'update' && <><label htmlFor="auth-email">E-mail</label>
        <input id="auth-email" type="email" autoComplete="email" value={email} disabled={busy}
          onChange={event => setEmail(event.target.value)} aria-describedby={error ? 'auth-error' : undefined} /></>}
      {mode !== 'reset' && <><label htmlFor="auth-password">{mode === 'update' ? 'Nova senha' : 'Senha'}</label>
        <input id="auth-password" type="password" value={password} disabled={busy}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          onChange={event => setPassword(event.target.value)} aria-describedby={error ? 'auth-error' : undefined} /></>}
      {error && <p id="auth-error" role="alert">{error}</p>}
      <p role="status">{message}</p>
      <button disabled={busy} type="submit">{busy ? 'Aguarde…' : titles[mode]}</button>
    </form>
    {!recovery && <nav className="auth-links" aria-label="Acesso à conta">
      {mode !== 'signin' && <button disabled={busy} onClick={() => switchMode('signin')}>Já tenho conta</button>}
      {mode !== 'signup' && <button disabled={busy} onClick={() => switchMode('signup')}>Criar conta</button>}
      {mode !== 'reset' && <button disabled={busy} onClick={() => switchMode('reset')}>Esqueci minha senha</button>}
    </nav>}
  </section>;
}
