import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const equipamentos = [
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

  const [equipamentoId, setEquipamentoId] = useState("");
  const [temperatura, setTemperatura] = useState("");
  const [medicoes, setMedicoes] = useState(() => {
    const medicoesSalvas = localStorage.getItem("Tempcontrol_medicoes")

    return medicoesSalvas ? JSON.parse(medicoesSalvas)
      : [];
  });

  useEffect(() => {
    localStorage.setItem(
      "tempcontrol_medicoes",
      JSON.stringify(medicoes)
    );
  }, [medicoes]);

  function registrarTemperatura(e) {
    e.preventDefault();

    const equipamento = equipamentos.find(
      (item) => item.id === Number(equipamentoId)
    );

    if (!equipamento || temperatura === "") {
      alert("Preencha todos os campos.");
      return;
    }

    const temperaturaNumero = Number(temperatura);

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

    setMedicoes((medicoesAnteriores) => [
      novaMedicao,
      ...medicoesAnteriores,
    ]);

    setTemperatura("");
  }

  return (
    <main className="container">
      <h1>TempControl</h1>

      <p className="subtitle">
        Controle de temperatura de equipamentos
      </p>

      <form onSubmit={registrarTemperatura}>
        <label>Equipamento</label>

        <select
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

        <label>Temperatura</label>

        <div className="temperature-input">
          <input
            type="number"
            step="0.1"
            placeholder="Ex: -20.5"
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value)}
          />

          <span>°C</span>
        </div>

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

                <span>
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