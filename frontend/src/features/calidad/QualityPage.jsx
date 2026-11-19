import { useData } from '../../app/state/DataContext.jsx';
import ReferenceComparisonPanel from './ReferenceComparisonPanel.jsx';

export default function QualityPage({ datasetId, view, hasCoding }) {
  const { datasets } = useData();
  const datasetName = datasets.find(item => String(item.id) === String(datasetId))?.name;
  return <div hidden={view !== 'comparaciones'}><ReferenceComparisonPanel datasetId={datasetId} datasetName={datasetName} hideSummary={hasCoding} /></div>;
}
