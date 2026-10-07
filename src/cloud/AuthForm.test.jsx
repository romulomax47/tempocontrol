import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AuthForm from './AuthForm';
import RestaurantApp from './RestaurantApp';

function authClient() {
  return { auth: {
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
  } };
}
async function credentials() {
  await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.test');
  await userEvent.type(screen.getByLabelText('Senha'), 'password123');
}
describe('acesso real via cliente de Auth', () => {
  it('valida campos antes de enviar credenciais', async () => {
    const client = authClient(); render(<AuthForm client={client} />);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('e-mail válido');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('apresenta falha de autenticação sem abrir o restaurante', async () => {
    const client = authClient();
    client.auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } });
    render(<AuthForm client={client} />); await credentials();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos');
    expect(screen.queryByRole('heading', { name: 'Histórico de medições' })).not.toBeInTheDocument();
  });
  it('desabilita o formulário enquanto a autenticação está pendente', async () => {
    const client = authClient(); let resolve;
    client.auth.signInWithPassword.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<AuthForm client={client} />); await credentials();
    await userEvent.click(screen.getByRole('button', { name: 'Entrar', exact: true }));
    expect(screen.getByRole('button', { name: 'Aguarde…' })).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    await act(async () => resolve({ error: null }));
    expect(screen.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();
  });
  it('solicita confirmação por e-mail no cadastro e limpa a senha', async () => {
    const client = authClient(); render(<AuthForm client={client} />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
    await credentials(); await userEvent.click(screen.getByRole('button', { name: 'Criar conta', exact: true }));
    expect(await screen.findByRole('status')).toHaveTextContent('Confira seu e-mail');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.test', password: 'password123' }));
  });
  it('recupera senha sem revelar se o e-mail existe', async () => {
    const client = authClient(); render(<AuthForm client={client} />);
    await userEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.test');
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar senha' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se a conta existir');
  });
  it('salva uma nova senha durante a recuperação', async () => {
    const client = authClient(); const onRecovered = vi.fn();
    render(<AuthForm client={client} recovery onRecovered={onRecovered} />);
    await userEvent.type(screen.getByLabelText('Nova senha'), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Senha atualizada');
    expect(onRecovered).toHaveBeenCalledOnce();
  });
  it('não recupera uma sessão antiga depois de receber SIGNED_OUT', async () => {
    let resolve, notify;
    const client = authClient();
    client.auth.getSession = vi.fn(() => new Promise(done => { resolve = done; }));
    const unsubscribe = vi.fn();
    client.auth.onAuthStateChange = vi.fn(callback => { notify = callback; return { data: { subscription: { unsubscribe } } }; });
    const view = render(<RestaurantApp client={client} />);
    expect(screen.getByRole('status')).toHaveTextContent('Verificando sessão');
    act(() => notify('SIGNED_OUT', null));
    await act(async () => resolve({ data: { session: { user: { id: 'old', email: 'old@example.test' } } }, error: null }));
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByText('old@example.test')).not.toBeInTheDocument();
    view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('permite repetir a verificação da sessão após uma falha de rede', async () => {
    const client = authClient();
    client.auth.getSession = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({ data: { session: null }, error: null });
    client.auth.onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
    render(<RestaurantApp client={client} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível verificar');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });
  it('limpa os dados do restaurante ao sair e preserva a tela quando o logout falha', async () => {
    const client = authClient();
    client.auth.getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-a', email: 'ana@example.test' } } }, error: null });
    client.auth.onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
    client.auth.signOut = vi.fn().mockResolvedValueOnce({ error: new Error('network') }).mockResolvedValue({ error: null });
    client.from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }));
    render(<RestaurantApp client={client} />);
    await screen.findByRole('heading', { name: 'Vincule sua conta a um restaurante' });
    await userEvent.click(screen.getByRole('button', { name: 'Sair', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível sair');
    expect(screen.getByText('ana@example.test')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sair', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByText('ana@example.test')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Vincule sua conta a um restaurante' })).not.toBeInTheDocument();
  });
});
