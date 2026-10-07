import { useState } from "react";
import "./App.css";
import { equipamentos, loadHistory, saveHistory } from "./history";

function App() {
  const [equipamentoId, setEquipamentoId] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [history] = useState(() => {
    const loaded = loadHistory();
    if (!saveHistory(loaded, loaded.records)) {
      loaded.warning += " Não foi possível salvar o histórico. Novas medições ficarão apenas nesta sessão.";
    }
    return loaded;
  });
  const [medicoes, setMedicoes] = useState(history.records);
  const [mensagem, setMensagem] = useState('');
  const [erros, setErros] = useState({});

  function registrarTemperatura(e) {
    e.preventDefault();

    const equipamento = equipamentos.find(
      (item) => item.id === Number(equipamentoId)
    );

    const temperaturaNumero = Number(temperatura);
    const novosErros = {};
    if (!equipamento) novosErros.equipamento = 'Selecione um equipamento válido.';
    if (!temperatura.trim() || !Number.isFinite(temperaturaNumero)) {
      novosErros.temperatura = 'Informe uma temperatura numérica finita.';
    }
    setErros(novosErros);
    setMensagem('');
    if (Object.keys(novosErros).length) return;

    const dentroDoPadrao =
      temperaturaNumero >= equipamento.minimo &&
      temperaturaNumero <= equipamento.maximo;

    const novaMedicao = {
      equipamento: equipamento.nome,
      temperatura: temperaturaNumero,
      minimo: equipamento.minimo,
      maximo: equipamento.maximo,
      status: dentroDoPadrao ? "normal" : "alerta",
      dataHora: new Date().toLocaleString("pt-BR"),
    };

    const novasMedicoes = [novaMedicao, ...medicoes];
    setMedicoes(novasMedicoes);
    const saved = saveHistory(history, novasMedicoes);
    setMensagem(saved
      ? 'Medição registrada e salva.'
      : 'Medição registrada apenas nesta sessão. Não foi possível salvar o histórico; os dados existentes foram preservados.');

    setTemperatura("");
  }

  return (
    <main className="container">
      <h1>TempControl</h1>

      <p className="subtitle">
        Controle de temperatura de equipamentos
      </p>

      <form onSubmit={registrarTemperatura} noValidate>
        {history.warning && <p role="alert">{history.warning}</p>}
        <p role="status">{mensagem}</p>
        <label htmlFor="equipamento">Equipamento</label>

        <select
          id="equipamento"
          aria-invalid={Boolean(erros.equipamento)}
          aria-describedby={erros.equipamento ? "erro-equipamento" : undefined}
          value={equipamentoId}
          onChange={(e) => setEquipamentoId(e.target.value)}
        >
          <option value="">Selecione</option>

          {equipamentos.map((equipamento) => (
            <option key={equipamento.id} value={equipamento.id}>
              {equipamento.nome}
            </option>
          ))}
        </select>
        {erros.equipamento && <p id="erro-equipamento" role="alert">{erros.equipamento}</p>}

        <label htmlFor="temperatura">Temperatura</label>

        <div className="temperature-input">
          <input
            id="temperatura"
            aria-invalid={Boolean(erros.temperatura)}
            aria-describedby={erros.temperatura ? "erro-temperatura" : undefined}
            type="number"
            step="any"
            placeholder="Ex: -20.5"
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value)}
          />

          <span>°C</span>
        </div>

        {erros.temperatura && <p id="erro-temperatura" role="alert">{erros.temperatura}</p>}
        <button type="submit">Registrar temperatura</button>
      </form>

      {medicoes.length > 0 && (
        <section className="historico">
          <h2>Histórico de medições</h2>

          {medicoes.map((medicao, index) => (
            <div
              key={index}
              className={
                medicao.status === "normal"
                  ? "medicao normal"
                  : "medicao alerta"
              }
            >
              <div className="medicao-topo">
                <strong>{medicao.equipamento}</strong>

                <span role="img" aria-label={medicao.status === "normal" ? "Normal" : "Alerta"}>
                  {medicao.status === "normal" ? "✅" : "⚠️"}
                </span>
              </div>

              <p>
                <strong>Temperatura:</strong> {medicao.temperatura} °C
              </p>

              <p>
                <strong>Limite:</strong> {medicao.minimo} °C até{" "}
                {medicao.maximo} °C
              </p>

              <small>{medicao.dataHora}</small>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

export default App;