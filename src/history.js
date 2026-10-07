export const equipamentos = [
    {
      id: 1,
      nome: "Freezer 01",
      minimo: -25,
      maximo: -18,
    },
    {
      id: 2,
      nome: "Geladeira 01",
      minimo: 0,
      maximo: 5,
    },
    {
      id: 3,
      nome: "Câmara Fria",
      minimo: 0,
      maximo: 5,
    },
  ];


export const STORAGE_KEY = 'tempcontrol_medicoes';
const LEGACY_KEY = 'Tempcontrol_medicoes';

function valid(record) {
  return record && typeof record === 'object' &&
    equipamentos.some(item => item.nome === record.equipamento) &&
    ['temperatura', 'minimo', 'maximo'].every(key => Number.isFinite(record[key])) &&
    record.minimo <= record.maximo &&
    ['normal', 'alerta'].includes(record.status) &&
    typeof record.dataHora === 'string' && record.dataHora.trim() !== '';
}

function identity(record) {
  return JSON.stringify([record.equipamento, record.temperatura, record.minimo,
    record.maximo, record.status, record.dataHora]);
}

export function saveHistory(history, records) {
  if (!history.readable) return false;
  try {
    for (const [key, raw] of history.damaged) {
      const backupKey = key + '.backup';
      const backup = localStorage.getItem(backupKey);
      if (backup !== null && backup !== raw) return false;
      localStorage.setItem(backupKey, raw);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function loadHistory() {
  const history = { records: [], damaged: [], readable: true, warning: '' };
  const counts = new Map();
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    let raw;
    try { raw = localStorage.getItem(key); }
    catch {
      history.readable = false;
      history.warning = 'Não foi possível acessar o histórico. Novas medições ficarão apenas nesta sessão.';
      continue;
    }
    if (raw === null) continue;
    let records;
    try { records = JSON.parse(raw); } catch { records = null; }
    if (!Array.isArray(records)) {
      history.damaged.push([key, raw]);
      continue;
    }
    const sourceCounts = new Map();
    for (const record of records) {
      if (!valid(record)) {
        if (!history.damaged.some(([source]) => source === key)) history.damaged.push([key, raw]);
        continue;
      }
      const id = identity(record);
      const count = (sourceCounts.get(id) || 0) + 1;
      sourceCounts.set(id, count);
      // Merge copies across keys, retaining repeated measurements within a source.
      if (count > (counts.get(id) || 0)) history.records.push(record);
    }
    for (const [id, count] of sourceCounts) counts.set(id, Math.max(count, counts.get(id) || 0));
  }
  if (history.damaged.length) history.warning = 'Há dados corrompidos ou registros inválidos no histórico. Os originais foram preservados; somente registros válidos são exibidos.';
  return history;
}
