import { Link } from 'react-router-dom';
import StatusBadge from '../../shared/ui/StatusBadge.jsx';
import PageHeader from '../../shared/ui/PageHeader.jsx';
import PanelHeading from '../../shared/ui/PanelHeading.jsx';
import Panel from '../../shared/ui/Panel.jsx';
import { buttonClass } from '../../shared/ui/Button.jsx';
import { useAuth } from '../../app/state/AuthContext.jsx';
import { useData } from '../../app/state/DataContext.jsx';

const indicators = [
  { key: 'pending', label: 'Pendientes', hint: 'Requieren una decisión' },
  { key: 'review', label: 'En revisión', hint: 'Casos derivados' },
  { key: 'confirmed', label: 'Resueltos', hint: 'Confirmados o corregidos' },
];

export default function HomePage() {
  const { user } = useAuth();
  const { cases, metrics, activeDataset } = useData();
  const pending = cases.filter(item => ['pendiente', 'revision'].includes(item.estado)).slice(0, 4);
  const canCode = ['analista', 'supervisor', 'admin'].includes(user.role);
  const canLoad = ['operador', 'admin'].includes(user.role);
  const firstName = user.name.split(' ')[0];

  let primaryAction = null;
  if (canCode) primaryAction = <Link className={buttonClass()} to="/casos">Continuar codificando</Link>;
  else if (canLoad) primaryAction = <Link className={buttonClass()} to="/bases">Procesar nueva base</Link>;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        icon="house-door"
        title={`Buenos días, ${firstName}`}
        description={<>Base activa: <strong className="text-ink-strong">{activeDataset?.name}</strong> · {activeDataset?.period}</>}
        actions={primaryAction}
      />

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {indicators.map(indicator => (
          <Panel key={indicator.key} className="grid grid-cols-1 gap-1 p-5">
            <span className="text-sm font-semibold text-muted">{indicator.label}</span>
            <strong className="text-3xl font-bold text-ink-strong">{metrics[indicator.key]}</strong>
            <small className="text-xs text-muted">{indicator.hint}</small>
          </Panel>
        ))}
      </section>

      <Panel className="p-5">
        <PanelHeading
          title="Trabajo reciente"
          description="Casos pendientes o derivados que requieren atención."
          actions={canCode ? <Link to="/casos" className="text-sm font-semibold text-brand hover:underline">Ver todos</Link> : null}
        />
        {pending.length ? (
          <ul className="divide-y divide-line">
            {pending.map(item => (
              <li key={item.id_registro} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <strong className="text-ink-strong">{item.id_registro}</strong>
                  <p className="text-sm text-muted">{item.p309}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.estado} />
                  {canCode && <Link to={`/casos/${item.id_registro}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Abrir</Link>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No hay casos que requieran atención.</p>
        )}
      </Panel>
    </div>
  );
}
