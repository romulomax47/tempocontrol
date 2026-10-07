export function finiteTemperature(value) {
  const text = String(value ?? '').trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
export function measurementErrors(equipment, equipmentId, temperature) {
  const errors = {};
  if (!equipment.some(item => item.id === equipmentId && item.active)) errors.equipment = 'Selecione um equipamento ativo válido.';
  if (finiteTemperature(temperature) === null) errors.temperature = 'Informe uma temperatura numérica finita.';
  return errors;
}
export function serviceMessage(error, fallback = 'Não foi possível concluir a operação. Tente novamente.') {
  if (error?.code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (error?.code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (error?.code === 'user_already_exists') return 'Já existe uma conta com esse e-mail.';
  if (error?.status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if (error?.code === '42501') return 'Acesso negado. Confira sua sessão e as permissões do restaurante.';
  if (['PGRST205', 'PGRST202', '42P01'].includes(error?.code)) return 'Banco não configurado. Solicite a aplicação das migrations do TempControl.';
  if (error?.code === 'P0001') return error.message;
  return fallback;
}
