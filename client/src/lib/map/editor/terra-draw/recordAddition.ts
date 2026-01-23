import type { TerraDraw, TerraDrawEventListeners } from 'terra-draw';
import type { EditorDoc } from '../editorDoc';
import { normalizeFeature } from './normalizeFeature';
import { parseFeatureId } from './parseFeatureId';

/**
 * Records a feature that was added via Terra Draw.
 *
 * The `id` and `context` parameters are directly from the Terra Draw
 * `finish` event. Call this function from within a Terra Draw finish event listener
 * and provide those parameters using the values passed to the event listener.
 *
 * The `destinationLayerId` parameter should be the ID of the layer
 * where the newly drawn feature should be added.
 *
 * If the feature is not considered a valid newly drawn feature,
 * this function does nothing and returns false.
 *
 * If the feature is successfully recorded as a new addition,
 * this function returns true.
 */
export function recordAddition(
  doc: EditorDoc,
  draw: TerraDraw,
  id: FeatureId,
  context: Context,
  destinationLayerId: string
) {
  const { layerId, featureId } = parseFeatureId(id);
  const isTerraDrawLayer = layerId === 'terra-draw';

  const isNewlyDrawnFeature = featureId < 0 && isTerraDrawLayer && context.action === 'draw';
  if (!isNewlyDrawnFeature) {
    return false;
  }

  const feature = draw.getSnapshotFeature(id);
  if (!feature) {
    console.error('Feature not found:', id);
    draw.removeFeatures([id]);
    return false;
  }

  if (!destinationLayerId) {
    console.error('No layer selected for new features.');
    draw.removeFeatures([id]);
    return false;
  }

  // reassign the feature to the destination layer
  const newFeatureId = `${featureId}.${destinationLayerId}`;
  draw.removeFeatures([id]);
  draw.addFeatures([{ ...feature, id: newFeatureId }]);

  // record the finished edit
  doc.trackedEdits.registerModifications(destinationLayerId, [
    normalizeFeature({ ...feature, id: featureId }),
  ]);
  return true;
}

type FeatureId = Parameters<TerraDrawEventListeners['finish']>[0];
type Context = Parameters<TerraDrawEventListeners['finish']>[1];
