import type { TerraDraw, TerraDrawEventListeners } from 'terra-draw';
import type { EditorDoc } from '../editorDoc';
import { parseFeatureId } from './parseFeatureId';

/**
 * Resets features that were modified via Terra Draw back to their original state.
 */
export function resetFeature(doc: EditorDoc, draw: TerraDraw, featureId: FeatureId) {
  const { layerId, featureId: fid } = parseFeatureId(featureId);

  const layerEdits = doc.trackedEdits[layerId];
  if (!layerEdits) {
    console.warn(`No tracked edits for layer ${layerId}`);
    return;
  }

  const index = layerEdits.modified.array.findIndex((feature) => feature.id === fid);
  if (index === -1) {
    console.warn(`Feature ${fid} not found in modified features for layer ${layerId}`);
    return;
  }

  // remove the feature from the modified features array
  layerEdits.modified.delete(index, 1);

  // Since we are removing the feature from terra draw
  // in order to reset it, Terra Draw will add it to the
  // deleted features array. We need to remove it from there
  // to ensure that the feature is reset rather than deleted.
  const removeFromDeletions = ((event, tr) => {
    const newValues = layerEdits.deleted.array;
    if (newValues.includes(fid)) {
      const delIndex = newValues.indexOf(fid);
      layerEdits.deleted.delete(delIndex, 1);
      layerEdits.deleted.current.unobserve(removeFromDeletions);
    }
  }) satisfies Parameters<typeof layerEdits.deleted.current.observe>[0];
  layerEdits.deleted.current.observe(removeFromDeletions);

  // remove from terra draw
  draw.removeFeatures([featureId]);
  draw.deselectFeature(featureId);
}

type FeatureId = Parameters<TerraDrawEventListeners['finish']>[0];
