import LocalApp from './LocalApp';
import RestaurantApp from './cloud/RestaurantApp';
import { configuration, supabase } from './lib/supabase';
import './App.css';

export default function App() {
  if (supabase) return <RestaurantApp client={supabase} />;
  if (configuration.kind === 'missing' && import.meta.env.DEV) {
    return <>
      <aside className="demo-notice">Modo local de desenvolvimento. Configure o Supabase para usar dados compartilhados do restaurante.</aside>
      <LocalApp />
    </>;
  }
  return <main className="container">
    <h1>TempControl</h1>
    <p role="alert">{configuration.message || 'Aplicação não configurada. Defina as variáveis públicas do Supabase e gere um novo build.'}</p>
  </main>;
}
