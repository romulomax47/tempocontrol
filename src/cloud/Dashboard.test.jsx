import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import EquipmentManager from './EquipmentManager';
import RestaurantSetup from './RestaurantSetup';

const user = { id: 'user-a' };
afterEach(() => vi.restoreAllMocks());
const device = { id: 'freezer-a', name: 'Freezer A', minimum: -25, maximum: -18, active: true };
const saved = { id: 'reading-a', equipment_id: device.id, equipment_name: 'Freezer A', temperature: -20,
  minimum: -25, maximum: -18, status: 'normal', recorded_by: user.id, responsible_name: 'Ana', recorded_at: '2026-10-07T15:00:00Z' };
function workspace(role = 'staff') {
  return { member: { restaurant_id: 'restaurant-a', display_name: 'Ana', role,
    restaurants: { name: 'Restaurante A', timezone: 'America/Sao_Paulo' } },
  equipment: [device, { ...device, id: 'inactive', name: 'Inativo', active: false }], members: [], records: [], hasMore: false };
}
function repository(data = workspace()) {
  return { loadWorkspace: vi.fn().mockResolvedValue(data), recordMeasurement: vi.fn().mockResolvedValue(saved),
    history: vi.fn(), saveEquipment: vi.fn(), createRestaurant: vi.fn(), addMember: vi.fn() };
}
async function fillMeasurement(value) {
  await screen.findByRole('heading', { name: 'Restaurante A' });
  await userEvent.selectOptions(screen.getByLabelText('Equipamento'), device.id);
  await userEvent.type(screen.getByLabelText('Temperatura (°C)'), String(value));
}
async function submit() { await userEvent.click(screen.getByRole('button', { name: 'Registrar temperatura' })); }

describe('medições compartilhadas', () => {
  it('carrega o restaurante e não mistura o histórico local de outro contexto', async () => {
    localStorage.setItem('tempcontrol_medicoes', JSON.stringify([{ equipamento: 'Legado' }]));
    const repo = repository(); let resolve;
    repo.loadWorkspace.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<Dashboard user={user} repository={repo} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando restaurante');
    await act(async () => resolve(workspace()));
    expect(screen.getByText('Nenhuma medição registrada.')).toBeInTheDocument();
    expect(screen.queryByText('Legado')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Equipamentos e limites' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inativo' })).not.toBeInTheDocument();
  });
  it.each([[-25, 'normal'], [-18, 'normal'], [-20.55, 'normal'], [-26, 'alerta'], [-17.5, 'alerta']])('registra %s e exibe status %s retornado pelo banco', async (temperature, status) => {
    const repo = repository(); repo.recordMeasurement.mockResolvedValue({ ...saved, temperature, status });
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<Dashboard user={user} repository={repo} />); await fillMeasurement(temperature);
    if (status === 'alerta') expect(screen.getByText(/A medição será registrada com alerta/)).toBeInTheDocument();
    await submit();
    const card = await screen.findByRole('article');
    expect(card).toHaveTextContent(`${temperature} °C`);
    expect(card).toHaveTextContent(status === 'normal' ? 'Normal' : 'Alerta');
    expect(card).toHaveTextContent('Responsável: Ana');
    expect(card.querySelector('time')).toHaveAttribute('datetime', saved.recorded_at);
    expect(screen.getByLabelText('Temperatura (°C)')).toHaveValue(null);
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  });
  it('usa limites e status autoritativos do banco mesmo se a tela estava desatualizada', async () => {
    const repo = repository(); repo.recordMeasurement.mockResolvedValue({ ...saved, maximum: -22, status: 'alerta' });
    render(<Dashboard user={user} repository={repo} />); await fillMeasurement(-20); await submit();
    expect(await screen.findByRole('article')).toHaveTextContent('-25 °C até -22 °C');
    expect(screen.getByRole('article')).toHaveTextContent('Alerta');
  });
  it('rejeita entradas inválidas antes de gravar', async () => {
    const repo = repository(); render(<Dashboard user={user} repository={repo} />);
    await screen.findByRole('heading', { name: 'Restaurante A' }); await submit();
    expect(screen.getByLabelText('Equipamento')).toHaveAccessibleDescription('Selecione um equipamento ativo válido.');
    expect(screen.getByLabelText('Temperatura (°C)')).toHaveAccessibleDescription('Informe uma temperatura numérica finita.');
    fireEvent.change(screen.getByLabelText('Temperatura (°C)'), { target: { value: '1e999' } });
    await submit(); expect(repo.recordMeasurement).not.toHaveBeenCalled();
  });
  it('não anuncia sucesso antes da confirmação e impede envio duplicado pendente', async () => {
    const repo = repository(); let resolve;
    repo.recordMeasurement.mockReturnValue(new Promise(done => { resolve = done; }));
    render(<Dashboard user={user} repository={repo} />); await fillMeasurement(-20); await submit();
    expect(screen.getByRole('button', { name: 'Registrando…' })).toBeDisabled();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Registrar medição' }));
    expect(repo.recordMeasurement).toHaveBeenCalledOnce();
    await act(async () => resolve(saved)); expect(screen.getByRole('article')).toBeInTheDocument();
  });
  it('mantém valores e reutiliza a identidade do envio após resposta incerta', async () => {
    const repo = repository(); repo.recordMeasurement.mockRejectedValueOnce(new Error('network')).mockResolvedValue(saved);
    render(<Dashboard user={user} repository={repo} />); await fillMeasurement(-20); await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar');
    expect(screen.getByLabelText('Temperatura (°C)')).toHaveValue(-20);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    const firstId = repo.recordMeasurement.mock.calls[0][0].id;
    await submit(); expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(repo.recordMeasurement.mock.calls[1][0].id).toBe(firstId);
  });
  it('consulta o histórico do banco após remontar o componente', async () => {
    const repo = repository(); const view = render(<Dashboard user={user} repository={repo} />);
    await fillMeasurement(-20); await submit(); expect(await screen.findByRole('article')).toBeInTheDocument();
    view.unmount(); repo.loadWorkspace.mockResolvedValue({ ...workspace(), records: [saved] });
    render(<Dashboard user={user} repository={repo} />);
    expect(await screen.findByRole('article')).toHaveTextContent('Responsável: Ana');
    expect(repo.loadWorkspace).toHaveBeenCalledTimes(2);
  });
  it('permite recuperar uma falha de carregamento', async () => {
    const repo = repository(); repo.loadWorkspace.mockRejectedValueOnce(new Error('network'));
    render(<Dashboard user={user} repository={repo} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Restaurante A' })).toBeInTheDocument();
  });
  it('pagina o histórico sem substituir os registros já exibidos', async () => {
    const repo = repository({ ...workspace(), records: [saved], hasMore: true });
    repo.history.mockResolvedValue({ records: [{ ...saved, id: 'older', responsible_name: 'Bia' }], hasMore: false });
    render(<Dashboard user={user} repository={repo} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais medições' }));
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(screen.getAllByRole('article').some(card => card.textContent.includes('Responsável: Bia'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Carregar mais medições' })).not.toBeInTheDocument();
  });
  it('exibe configuração de equipamentos e equipe somente ao proprietário', async () => {
    render(<Dashboard user={user} repository={repository(workspace('owner'))} />);
    expect(await screen.findByRole('heading', { name: 'Equipamentos e limites' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Responsáveis' })).toBeInTheDocument();
  });
  it('confirma a associação de um responsável somente após salvar e atualizar o vínculo', async () => {
    const repo = repository(workspace('owner'));
    repo.loadWorkspace.mockResolvedValueOnce(workspace('owner')).mockResolvedValue({ ...workspace('owner'),
      members: [{ user_id: 'user-bia', display_name: 'Bia', role: 'staff' }] });
    repo.addMember.mockResolvedValue(null);
    render(<Dashboard user={user} repository={repo} />);
    await screen.findByRole('heading', { name: 'Responsáveis' });
    await userEvent.type(screen.getByLabelText('E-mail do responsável'), 'bia@example.test');
    await userEvent.type(screen.getByLabelText('Nome do responsável'), 'Bia');
    await userEvent.click(screen.getByRole('button', { name: 'Associar responsável' }));
    expect(await screen.findByText('Bia — Equipe')).toBeInTheDocument();
    expect(screen.getAllByRole('status').some(node => node.textContent.includes('Responsável associado'))).toBe(true);
  });
});
describe('primeiro uso e limites configuráveis', () => {
  it('valida limites invertidos e salva equipamento com limites decimais negativos', async () => {
    const repo = repository(); repo.saveEquipment.mockResolvedValue(device); const onSaved = vi.fn();
    render(<EquipmentManager equipment={[]} restaurantId="restaurant-a" repository={repo} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText('Nome do equipamento'), 'Freezer A');
    await userEvent.type(screen.getByLabelText('Mínimo (°C)'), '5');
    await userEvent.type(screen.getByLabelText('Máximo (°C)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar equipamento' }));
    expect(screen.getByRole('alert')).toHaveTextContent('mínimo menor ou igual'); expect(repo.saveEquipment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mínimo (°C)'), { target: { value: '-25.5' } });
    fireEvent.change(screen.getByLabelText('Máximo (°C)'), { target: { value: '-18' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar equipamento' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Equipamento salvo'); expect(onSaved).toHaveBeenCalledWith(device);
  });
  it('permite criar restaurante somente após informar os dois nomes', async () => {
    const repo = repository(); const refresh = vi.fn();
    render(<RestaurantSetup repository={repo} refresh={refresh} />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar restaurante' }));
    expect(screen.getByRole('alert')).toHaveTextContent('nome do restaurante'); expect(repo.createRestaurant).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Nome do restaurante'), 'Restaurante A');
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Criar restaurante' }));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('orienta funcionários sem vínculo em vez de escolher um restaurante arbitrário', async () => {
    render(<Dashboard user={user} repository={repository(null)} />);
    expect(await screen.findByRole('heading', { name: 'Vincule sua conta a um restaurante' })).toBeInTheDocument();
    expect(screen.getByText(/Peça ao proprietário para associar/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Restaurante A' })).not.toBeInTheDocument();
  });
});
