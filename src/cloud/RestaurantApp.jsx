import { useEffect, useMemo, useState } from 'react';
import AuthForm from './AuthForm';
import Dashboard from './Dashboard';
import { createRestaurantRepository } from '../lib/restaurantRepository';
import { serviceMessage } from '../lib/validation';
export default function RestaurantApp({ client }) {
  const repository = useMemo(() => createRestaurantRepository(client), [client]);
  const [auth, setAuth] = useState({ loading: true, session: null, recovery: false, error: '' });
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  useEffect(() => {
    let active = true;
    let revision = 0;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      revision += 1;
      if (!active) return;
      // Keep callback synchronous: awaiting Supabase here can deadlock the Auth lock.
      setAuth(previous => ({ loading: false, session, error: '',
        recovery: event === 'PASSWORD_RECOVERY' || (event !== 'SIGNED_OUT' && previous.recovery) }));
    });
    const initialRevision = revision;
    client.auth.getSession().then(({ data, error }) => {
      if (active && revision === initialRevision) setAuth({ loading: false, session: data?.session || null,
        recovery: false, error: error ? serviceMessage(error, 'Não foi possível verificar sua sessão.') : '' });
    }).catch(() => {
      if (active && revision === initialRevision) setAuth({ loading: false, session: null, recovery: false,
        error: 'Não foi possível verificar sua sessão. Confira sua conexão e tente novamente.' });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client, retry]);
  async function signOut() {
    setSigningOut(true); setSignOutError('');
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setAuth({ loading: false, session: null, recovery: false, error: '' });
    } catch (failure) { setSignOutError(serviceMessage(failure, 'Não foi possível sair. Tente novamente.')); }
    finally { setSigningOut(false); }
  }
  return <main className="container cloud-app">
    <header><h1>TempControl</h1><p className="subtitle">Controle de temperatura de equipamentos</p></header>
    {auth.loading ? <p role="status">Verificando sessão…</p> : auth.error ? <>
      <p role="alert">{auth.error}</p>
      <button onClick={() => { setAuth(value => ({ ...value, loading: true })); setRetry(value => value + 1); }}>Tentar novamente</button>
    </> : !auth.session || auth.recovery ? <AuthForm key={auth.recovery ? 'recovery' : 'access'} client={client}
      recovery={auth.recovery} onRecovered={() => setAuth(value => ({ ...value, recovery: false }))} /> : <>
      <div className="session-bar"><span>{auth.session.user.email}</span>
        <button disabled={signingOut} onClick={signOut}>{signingOut ? 'Saindo…' : 'Sair'}</button></div>
      {signOutError && <p role="alert">{signOutError}</p>}
      <Dashboard key={auth.session.user.id} user={auth.session.user} repository={repository} />
    </>}
  </main>;
}
