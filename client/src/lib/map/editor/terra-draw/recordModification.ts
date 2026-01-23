import type { TerraDraw, TerraDrawEventListeners } from 'terra-draw';
import type { EditorDoc } from '../editorDoc';
import { normalizeFeature } from './normalizeFeature';
import { parseFeatureId } from './parseFeatureId';

/**
 * Records a feature that was modified via Terra Draw.
 *
 * The `id` and `context` parameters are directly from the Terra Draw
 * `finish` event. Call this function from within a Terra Draw finish event listener
 * and provide those parameters using the values passed to the event listener.
 *
 * If the feature is not considered a valid modified feature,
 * this function does nothing and returns false.
 *
 * If the feature is successfully recorded as a modification,
 * this function returns true.
 */
export function recordModification(doc: EditorDoc, draw: TerraDraw, id: FeatureId) {
  const { layerId, featureId } = parseFeatureId(id);
  const isTerraDrawLayer = layerId === 'terra-draw';

  if (isTerraDrawLayer) {
    // Edits to features on the terra-draw layer are not tracked.
    // All new features on the terra-draw layer should have been
    // reassigned to a proper layer via the recordAddition function.
    console.warn('Modifications to features on the terra-draw layer are not tracked:', id);
    return false;
  }

  // get a full copy of the finished feature with
  // terra draw properties removed
  const feature = normalizeFeature(draw.getSnapshotFeature(id));
  if (!feature) {
    console.error('Feature not found:', id);
    return false;
  }

  // use the feature id instead of the full id with layer prefix
  feature.id = featureId;

  // record the finished edit
  doc.trackedEdits.registerModifications(layerId, [feature]);
  return true;
}

type FeatureId = Parameters<TerraDrawEventListeners['finish']>[0];
type Context = Parameters<TerraDrawEventListeners['finish']>[1];
