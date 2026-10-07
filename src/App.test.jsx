import { StrictMode } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import App from './App';

const upper = 'Tempcontrol_medicoes';
const lower = 'tempcontrol_medicoes';
const record = (temperature = -20, date = '07/10/2026, 10:00:00') => ({
  equipamento: 'Freezer 01', temperatura: temperature, minimo: -25, maximo: -18,
  status: temperature >= -25 && temperature <= -18 ? 'normal' : 'alerta', dataHora: date,
});
const cards = () => screen.getAllByText('Freezer 01', { selector: 'strong' });
async function register(temperature, equipment = '1') {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Equipamento'), equipment);
  await user.type(screen.getByLabelText('Temperatura'), String(temperature));
  await user.click(screen.getByRole('button', { name: 'Registrar temperatura' }));
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('registro de temperaturas', () => {
  it.each([
    ['1', -20.55, 'Normal'], ['1', -26, 'Alerta'], ['1', -17, 'Alerta'],
    ['1', -25, 'Normal'], ['1', -18, 'Normal'],
    ['2', 0, 'Normal'], ['2', 5, 'Normal'], ['2', 5.1, 'Alerta'],
    ['3', 0, 'Normal'], ['3', 5, 'Normal'], ['3', -0.1, 'Alerta'],
  ])('registra equipamento %s a %s °C como %s', async (equipment, value, status) => {
    render(<App />);
    await register(value, equipment);
    expect(screen.getByRole('img', { name: status })).toBeInTheDocument();
    expect(screen.getByText('Medição registrada e salva.')).toBeInTheDocument();
    expect(screen.getByLabelText('Temperatura')).toHaveValue(null);
  });
  it('exige equipamento e temperatura com erros associados aos campos', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByLabelText('Equipamento')).toHaveAccessibleDescription('Selecione um equipamento válido.');
    expect(screen.getByLabelText('Temperatura')).toHaveAccessibleDescription('Informe uma temperatura numérica finita.');
    expect(screen.queryByRole('heading', { name: 'Histórico de medições' })).not.toBeInTheDocument();
  });
  it('rejeita equipamento ausente mesmo com temperatura válida', async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText('Temperatura'), '-20');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('alert')).toHaveTextContent('equipamento válido');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it.each(['abc', 'Infinity', 'NaN', '1e999', ' '])('rejeita temperatura inválida %s', async value => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Equipamento'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Temperatura'), { target: { value } });
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('alert')).toHaveTextContent('temperatura numérica finita');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('mantém medições depois de remontar e permite registros repetidos', async () => {
    const view = render(<App />);
    await register(-20.5);
    await register(-20.5);
    view.unmount();
    render(<StrictMode><App /></StrictMode>);
    expect(cards()).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: 'Normal' })).toHaveLength(2);
  });
});

describe('recuperação do histórico', () => {
  it.each([upper, lower])('recupera registros da chave %s', key => {
    localStorage.setItem(key, JSON.stringify([record()]));
    const view = render(<App />);
    expect(cards()).toHaveLength(1);
    view.unmount();
    render(<App />);
    expect(cards()).toHaveLength(1);
  });
  it('une chaves sem duplicar cópias e preserva repetições legítimas', () => {
    localStorage.setItem(upper, JSON.stringify([record(), record(), record(-26)]));
    localStorage.setItem(lower, JSON.stringify([record(), record(-19)]));
    const view = render(<StrictMode><App /></StrictMode>);
    expect(cards()).toHaveLength(4);
    view.unmount();
    render(<App />);
    expect(cards()).toHaveLength(4);
  });
  it.each(['{quebrado', '{}', 'null'])('preserva JSON danificado %s e recupera a outra chave', async raw => {
    localStorage.setItem(lower, raw);
    localStorage.setItem(upper, JSON.stringify([record()]));
    render(<App />);
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('originais foram preservados');
    expect(localStorage.getItem(lower + '.backup')).toBe(raw);
    await register(-21);
    expect(cards()).toHaveLength(2);
  });
  it('isola registros inválidos sem perder os válidos ou os dados originais', () => {
    const raw = JSON.stringify([record(), null, {}, { ...record(), temperatura: '20' },
      { ...record(), equipamento: 'Desconhecido' }, { ...record(), status: 'x' }]);
    localStorage.setItem(lower, raw);
    render(<App />);
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('registros inválidos');
    expect(localStorage.getItem(lower + '.backup')).toBe(raw);
  });
  it('não sobrescreve dados corrompidos se o backup falhar', async () => {
    localStorage.setItem(lower, '{original');
    localStorage.setItem(lower + '.backup', 'backup anterior');
    render(<App />);
    await register(-20);
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('apenas nesta sessão');
    expect(localStorage.getItem(lower)).toBe('{original');
    expect(localStorage.getItem(lower + '.backup')).toBe('backup anterior');
  });
  it('continua utilizável quando a leitura do armazenamento falha', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('negado'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    render(<App />);
    await register(-20);
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('apenas nesta sessão');
    expect(write).not.toHaveBeenCalled();
  });
  it('preserva o histórico e avisa quando a gravação falha', async () => {
    localStorage.setItem(lower, JSON.stringify([record()]));
    const view = render(<App />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await register(-21);
    expect(cards()).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('apenas nesta sessão');
    view.unmount();
    render(<App />);
    expect(cards()).toHaveLength(1);
    expect(within(screen.getByRole('main')).getByRole('alert')).toHaveTextContent('Não foi possível salvar');
  });
});
