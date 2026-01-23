import type { TerraDrawEventListeners } from 'terra-draw';
import type { EditorDoc } from '../editorDoc';
import { parseFeatureId } from './parseFeatureId';

/**
 * Records which features have been deleted via Terra Draw.
 *
 * The `featureIds`, `type`, and `context` parameters are directly from the Terra Draw
 * `change` event. Call this function from within a Terra Draw change event listener
 * and provide those parameters using the values passed to the event listener.
 */
export function recordDeletions(doc: EditorDoc, featureIds: FeatureIds, type: Type, context: Context) {
  if (type !== 'delete') {
    return;
  }

  const deletedFeatures = featureIds
    .map((id) => parseFeatureId(id))
    .filter((x) => x.layerId !== 'terra-draw');
  if (deletedFeatures.length === 0) {
    return;
  }

  const groupedByLayer: Record<string, FeatureIds[number][]> = {};
  for (const { layerId, featureId } of deletedFeatures) {
    if (!(layerId in groupedByLayer)) {
      groupedByLayer[layerId] = [];
    }
    groupedByLayer[layerId].push(featureId);
  }

  for (const layerName in groupedByLayer) {
    const featureIds = groupedByLayer[layerName];
    doc.trackedEdits.registerDeletions(layerName, featureIds);
  }

  return;
}

type FeatureIds = Parameters<TerraDrawEventListeners['change']>[0];
type Type = Parameters<TerraDrawEventListeners['change']>[1];
type Context = Parameters<TerraDrawEventListeners['change']>[2];
