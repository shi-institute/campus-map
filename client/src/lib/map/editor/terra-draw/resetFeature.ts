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

  // remove from terra draw
  draw.removeFeatures([featureId]);
  draw.deselectFeature(featureId);

  // remove the feature from the deleted IDs list
  // since draw.removeFeatures will add it there
  const deletedIndex = layerEdits.deletedIds.indexOf(fid);
  if (deletedIndex !== -1) {
    layerEdits.deleted.delete(deletedIndex, 1);
  }
}

type FeatureId = Parameters<TerraDrawEventListeners['finish']>[0];
