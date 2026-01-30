import type { TerraDraw, TerraDrawEventListeners } from 'terra-draw';
import type { EditorDoc } from '../editorDoc.svelte';
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
 * this function returns the full terra draw feature id.
 */
export function recordAddition(
  doc: EditorDoc,
  draw: TerraDraw,
  id: FeatureId,
  context: Context,
  destinationLayerId: string
) {
  let { layerId, featureId } = parseFeatureId(id);
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

  // find the largest negative ID not already used in the destination layer
  // and use that as the new feature ID
  const tracker = doc.trackedEdits[destinationLayerId];
  const existingFeatureIds = new Set([...tracker.deletedIds, ...tracker.addedIds, ...tracker.modifiedIds]);
  const usedIds = [...existingFeatureIds].filter((id): id is number => typeof id === 'number' && id < 0);
  let newId = -1;
  while (usedIds.includes(newId)) {
    newId--;
  }

  // reassign the feature to the destination layer
  const newFeatureId = `${newId}.${destinationLayerId}`;
  draw.removeFeatures([id]);
  draw.addFeatures([{ ...feature, id: newFeatureId }]);

  // record the finished edit
  doc.trackedEdits.registerModifications(destinationLayerId, [normalizeFeature({ ...feature, id: newId })]);
  return newFeatureId;
}

type FeatureId = Parameters<TerraDrawEventListeners['finish']>[0];
type Context = Parameters<TerraDrawEventListeners['finish']>[1];
