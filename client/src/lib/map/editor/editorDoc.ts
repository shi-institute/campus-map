import { getCurrentUser } from '$lib/utils/auth';
import { getFeatureFromService } from '$lib/utils/features';
import { TrysteroProvider as WebrtcProvider } from '@winstonfassett/y-webrtc-trystero';
import type { getMapContext } from 'svelte-maplibre-gl';
import { createSubscriber } from 'svelte/reactivity';
import type { GeoJSONStoreFeatures, TerraDraw } from 'terra-draw';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { SvelteYArray, SvelteYAwareness, SvelteYMap, SvelteYUndoManager } from './interactive-shared-types';
import { inferMode, normalizeFeature, parseFeatureId } from './terra-draw';
import { untrackNextDeletion } from './terra-draw/recordDeletions';

export class EditorDoc {
  ydoc: Y.Doc;
  #globalMap: SvelteYMap<{}>;
  #trackedEdits: TrackedEdits;
  #readySubscriber: () => void;
  undoManager: SvelteYUndoManager;

  awareness: SvelteYAwareness;
  persistence: IndexeddbPersistence;
  webrtcProvider: WebrtcProvider;

  constructor(roomName: string) {
    this.ydoc = new Y.Doc();
    this.#globalMap = new SvelteYMap(() => this.ydoc.getMap('global'));

    const awareness = new SvelteYAwareness(this.ydoc);
    getCurrentUser().then((userInfo) => {
      if (!userInfo) {
        console.warn('Could not get current user info for awareness');
      }

      awareness.localUser = {
        name: userInfo?.displayName || userInfo?.userPrincipalName || 'Unknown',
        color:
          '#' +
          Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0'),
      };
    });

    // // log what is changed
    // this.ydoc.on('afterTransaction', (tr) => {
    //   const top = Array.from(tr.changedParentTypes).find(([type, events], index, obj) => {
    //     return !type.parent || obj.map((o) => o[0]).includes(type.parent);
    //   });

    //   if (top) {
    //     const deltas = top[1].map((event) => event.delta);
    //     console.log(top[0], ...deltas);
    //   }
    // });

    const userTrackedEditsOrigin = `tracked-edits_${awareness.clientId}`;
    this.#trackedEdits = new TrackedEdits(this, userTrackedEditsOrigin);
    this.undoManager = new SvelteYUndoManager(this.ydoc, {
      trackedOrigins: new Set([userTrackedEditsOrigin, this.ydoc]),
    });

    const persistence = new IndexeddbPersistence(roomName, this.ydoc);
    const webrtcProvider = new WebrtcProvider(roomName, this.ydoc, {
      appId: 'campus-map-editor',
      awareness: awareness.current,
      filterBcConns: true,
    });

    this.awareness = awareness;
    this.persistence = persistence;
    this.webrtcProvider = webrtcProvider;

    this.#readySubscriber = createSubscriber((update) => {
      persistence.once('synced', update);
    });
  }

  destroy() {
    this.webrtcProvider.room?.disconnect();
    this.webrtcProvider.destroy();
    this.awareness.destroy();
    this.ydoc.destroy();
  }

  get ready() {
    this.#readySubscriber();
    return this.persistence.synced;
  }

  get trackedEdits() {
    return this.#trackedEdits;
  }
}

type LayerId = string;
type FeatureId = number | string;
type AllowedGeometries = GeoJSONStoreFeatures['geometry'];
type AllowedProperties = GeoJSONStoreFeatures['properties'];

class TrackedEdits extends SvelteYMap<{ [layerId: LayerId]: TrackedLayerEdits }> {
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  layerFilters: LayerFiltersHelper;
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  editorDoc: EditorDoc;

  /**
   * Creates a new TrackedEdits instance to track edits across multiple layers.
   *
   * Data are backed by the 'trackedEdits' Y.Map in the given Y.Doc.
   *
   * @param ydoc
   * @param origin Origin of who started the transaction. Will be stored on `transaction.origin`.
   * @returns
   */
  constructor(editorDoc: EditorDoc, origin?: string) {
    super(() => editorDoc.ydoc.getMap('trackedEdits'), origin);
    this.editorDoc = editorDoc;

    const proxy = new Proxy(this, {
      get(target, prop, receiver) {
        // override the entries method to yield TrackedLayerEdits instances
        if (prop === 'entries') {
          const originalEntries = Reflect.get(target, prop, receiver);
          return function* () {
            for (const [key, value] of originalEntries.call(target)) {
              if (value instanceof SvelteYMap && value.layerId) {
                yield [key, new TrackedLayerEdits(target, value.layerId, origin)];
              } else {
                yield [key, value];
              }
            }
          };
        }

        // override the values method to yield TrackedLayerEdits instances
        if (prop === 'values') {
          const originalValues = Reflect.get(target, prop, receiver);
          return function* () {
            for (const value of originalValues.call(target)) {
              if (value instanceof SvelteYMap && value.layerId) {
                yield new TrackedLayerEdits(target, value.layerId, origin);
              } else {
                yield value;
              }
            }
          };
        }

        // if the property name is a method, property, or getter on the class, return that
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        if (typeof prop === 'string') {
          // create a TrackedLayerEdits for this layer if it does not exist
          if (!target.has(prop)) {
            target[prop] = new TrackedLayerEdits(target, prop, origin);
          }
          return new TrackedLayerEdits(target, prop, origin);
        }

        return Reflect.get(target, prop, receiver);
      },
    });

    this.layerFilters = new LayerFiltersHelper(proxy);

    return proxy;
  }

  /**
   * Applies the current tracked edits to the given TerraDraw instance
   * whenever the edits change. This ensures that TerraDraw is always
   * aware of the current state of edits in the document.
   */
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  sync(draw: TerraDraw, mapCtx: ReturnType<typeof getMapContext>, done?: () => void) {
    this.__deepSubscribe();

    const featuresToRemove: string[] = [];
    const featuresToReset: string[] = [];
    const featuresToAdd: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[] = [];
    const featuresToModify: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[] = [];

    for (const layerId of this.keys()) {
      const layerEdits = this[layerId];

      const applyEditsToTerraDraw = () => {
        // remove deleted features from TerraDraw
        for (const featureId of layerEdits.deletedIds) {
          const terraDrawFeatureId = `${featureId}.${layerId}`;
          const exists = !!draw.getSnapshotFeature(terraDrawFeatureId);
          if (exists) {
            featuresToRemove.push(terraDrawFeatureId);
          }
        }

        // add added features in TerraDraw
        for (const feature of layerEdits.added) {
          const terraDrawFeatureId = `${feature.id}.${layerId}`;
          const terraDrawFeature = normalizeFeature(draw.getSnapshotFeature(terraDrawFeatureId));
          if (terraDrawFeature) {
            terraDrawFeature.id = feature.id;
          }

          const isDifferent =
            !terraDrawFeature || JSON.stringify(terraDrawFeature) !== JSON.stringify(feature);
          if (!isDifferent) {
            continue;
          }

          if (terraDrawFeature) {
            featuresToModify.push({ ...feature, id: terraDrawFeatureId });
            continue;
          }

          const mode = inferMode(feature.geometry);
          featuresToAdd.push({
            ...feature,
            id: terraDrawFeatureId,
            properties: { ...feature.properties, mode },
          });
        }

        // add or update modified features in TerraDraw
        for (const feature of layerEdits.modified) {
          const terraDrawFeatureId = `${feature.id}.${layerId}`;
          const terraDrawFeature = normalizeFeature(draw.getSnapshotFeature(terraDrawFeatureId));
          if (terraDrawFeature) {
            terraDrawFeature.id = feature.id;
          }

          const isDifferent =
            !terraDrawFeature || JSON.stringify(terraDrawFeature) !== JSON.stringify(feature);
          if (!isDifferent) {
            continue;
          }

          if (terraDrawFeature) {
            featuresToModify.push({ ...feature, id: terraDrawFeatureId });
            continue;
          }

          const mode = inferMode(feature.geometry);
          featuresToAdd.push({
            ...feature,
            id: terraDrawFeatureId,
            properties: { ...feature.properties, mode },
          });
        }
      };
      applyEditsToTerraDraw();
    }

    // search for features that exist in terra-draw but were not found in
    // the tracked edits (in case the edits were cleared or undone)
    const allTrackedIds = new Map<string, Set<FeatureId>>();
    for (const [layerId, layerEdits] of this) {
      allTrackedIds.set(
        layerId,
        new Set<FeatureId>([...layerEdits.addedIds, ...layerEdits.modifiedIds, ...layerEdits.deletedIds])
      );
    }
    draw.getSnapshot().forEach((feature) => {
      if (!feature.id) {
        return;
      }

      const { layerId, featureId } = parseFeatureId(feature.id);
      if ([...allTrackedIds.keys()].includes(layerId) === false) {
        return;
      }

      const isTracked = allTrackedIds.get(layerId)?.has(featureId);
      if (isTracked) {
        return;
      }

      const terraDrawFeatureId = `${featureId}.${layerId}`;
      featuresToReset.push(terraDrawFeatureId);
    });

    if (
      featuresToRemove.length === 0 &&
      featuresToAdd.length === 0 &&
      featuresToModify.length === 0 &&
      featuresToReset.length === 0
    ) {
      return;
    }

    // pause the undo manager to prevent external changes from
    // being included in the undo manager history
    const resumeUndoManager = this.editorDoc.undoManager.pause();

    draw.removeFeatures(featuresToRemove);
    draw.addFeatures(featuresToAdd);
    for (const feature of featuresToModify) {
      draw.updateFeatureGeometry(feature.id as string, feature.geometry);
      draw.updateFeatureProperties(feature.id as string, feature.properties);
    }
    for (const terraDrawFeatureId of featuresToReset) {
      untrackNextDeletion.set(terraDrawFeatureId, true);
    }
    draw.removeFeatures(featuresToReset);

    resumeUndoManager();

    mapCtx.waitForSourceLoaded('esri', (map) => {
      this.layerFilters.apply(map, 'esri');
      done?.();
    });
  }

  /**
   * Deletes the given feature IDs from the specified layer's tracked edits.
   */
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  registerDeletions(layerId: LayerId, featureIds: FeatureId[]) {
    const layerEdits = this[layerId];
    if (!layerEdits) {
      throw new Error(`No tracked edits found for layer ID: ${layerId}`);
    }
    layerEdits.delete(featureIds);
  }

  /**
   * Adds the given features to the specified layer's tracked edits.
   */
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  registerAdditions(layerId: LayerId, features: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[]) {
    const layerEdits = this[layerId];
    if (!layerEdits) {
      throw new Error(`No tracked edits found for layer ID: ${layerId}`);
    }
    layerEdits.add(features);
  }

  /**
   * Records feature additions or modifications in the specified layer's tracked edits.
   *
   * - If the modified feature was previously added, its addition is updated.
   * - If the modified feature was previously modified, its modification is updated.
   * - If the modified feature was not previously added or modified, but is marked for deletion, it is skipped.
   * - If the modified feature was not previously added or modified, but it does not exist on the feature service, it is recorded as an addition.
   * - Otherwise, the feature is added to the modifications list.
   */
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  registerModifications(layerId: LayerId, features: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[]) {
    const layerEdits = this[layerId];
    if (!layerEdits) {
      throw new Error(`No tracked edits found for layer ID: ${layerId}`);
    }
    layerEdits.modify(features);
  }
}

/**
 * A helper class for hiding features that have been edited
 * from the vector tile layers on the map. Layers are hidden
 * by applying filters to the map layers to exclude features
 * with IDs that have been edited. Call `apply` to apply the
 * filters to the map, and `reset` to remove them.
 */
class LayerFiltersHelper {
  private trackedEdits: TrackedEdits;

  constructor(trackedEdits: TrackedEdits) {
    this.trackedEdits = trackedEdits;
  }

  /**
   * Gets the filters that must be applied to each layer on the map
   * to hide features that have been edited. The features are rendered
   * by terra draw, so they must be hidden on the map layer.
   */
  private get toApply() {
    const filters: { [key: LayerId]: maplibregl.ExpressionSpecification | undefined } = {};

    for (const [layerId, layerEdits] of this.trackedEdits) {
      const excludedIds = layerEdits.modifiedOrDeletedIds.map((id) => id.toString());
      if (excludedIds.length > 0) {
        filters[layerId] = ['!', ['in', ['to-string', ['id']], ['literal', excludedIds]]];
      }
    }

    return filters;
  }

  /**
   * Determines if the given expression is a filter that
   * was applied by this helper to hide tracked edits.
   */
  private isTrackedEditsFilter(expr: maplibregl.ExpressionSpecification) {
    return (
      Array.isArray(expr) &&
      expr[0] === '!' &&
      Array.isArray(expr[1]) &&
      expr[1][0] === 'in' &&
      Array.isArray(expr[1][1]) &&
      expr[1][1][0] === 'to-string' &&
      Array.isArray(expr[1][1][1]) &&
      expr[1][1][1][0] === 'id' &&
      Array.isArray(expr[1][2]) &&
      expr[1][2][0] === 'literal' &&
      Array.isArray(expr[1][2][1])
    );
  }

  /**
   * A generator that yields the current layers on the map
   * that are associated with the given source. The generator
   * yields tuples of `[layerName, existingLayerFilter]`.
   */
  private *current(map: maplibregl.Map, sourceId: string) {
    const style = map.getStyle();
    const layers = style.layers || [];
    const sourceLayers = layers.filter((layer) => layer.type !== 'background' && layer.source === sourceId);

    const uniqueLayerNames = new Set<string>();
    for (const layer of sourceLayers) {
      if (layer.type !== 'background' && layer['source-layer']) {
        uniqueLayerNames.add(layer['source-layer']);
      }
    }

    for (const layerName of uniqueLayerNames) {
      const layer = map.getLayer(layerName);
      if (!layer) {
        continue;
      }

      const existingFilter = map.getFilter(layerName);
      yield [layerName, existingFilter || undefined] as const;
    }
  }

  /**
   * Applied the necessary filters to the map to hide
   * features from the specified source that have been
   * edited.
   */
  apply(map: maplibregl.Map, sourceId: string) {
    for (const [layerName, existingFilter] of this.current(map, sourceId)) {
      const filter = this.toApply[layerName];
      if (!filter) {
        continue;
      }

      if (!existingFilter) {
        map.setFilter(layerName, filter);
        continue;
      }

      // if the existing filter is a tracked edits filter, replace it
      if (this.isTrackedEditsFilter(existingFilter as maplibregl.ExpressionSpecification)) {
        map.setFilter(layerName, filter);
        continue;
      }

      const startsWithAllExpression = Array.isArray(existingFilter) && existingFilter[0] === 'all';
      if (!startsWithAllExpression) {
        // combine existing filter with tracked edits filter
        const combinedFilter: maplibregl.ExpressionSpecification = [
          'all',
          existingFilter as maplibregl.ExpressionSpecification,
          filter,
        ];
        map.setFilter(layerName, combinedFilter);
        continue;
      }

      const existingExpressions: maplibregl.ExpressionSpecification[] = startsWithAllExpression
        ? (existingFilter.slice(1) as maplibregl.ExpressionSpecification[])
        : [existingFilter as maplibregl.ExpressionSpecification];

      // if the existing all expression already includes a tracked edits filter, replace it
      const existingTrackedEditsFilterIndex = existingExpressions.findIndex(this.isTrackedEditsFilter);
      if (existingTrackedEditsFilterIndex !== -1) {
        existingExpressions[existingTrackedEditsFilterIndex] = filter;
        map;
        continue;
      }

      // otherwise, add the tracked edits filter to the all expression
      const combinedFilter: maplibregl.ExpressionSpecification = ['all', ...existingExpressions, filter];
      map.setFilter(layerName, combinedFilter);
    }
  }

  /**
   * Removes any filters applied by the `apply` method
   * for the specified source.
   */
  reset(map: maplibregl.Map, sourceId: string) {
    for (const [layerName, existingFilter] of this.current(map, sourceId)) {
      if (!existingFilter) {
        continue;
      }

      if (this.isTrackedEditsFilter(existingFilter as maplibregl.ExpressionSpecification)) {
        map.setFilter(layerName, undefined);
        continue;
      }

      const startsWithAllExpression = Array.isArray(existingFilter) && existingFilter[0] === 'all';
      if (!startsWithAllExpression) {
        continue;
      }

      const existingExpressions: maplibregl.ExpressionSpecification[] = startsWithAllExpression
        ? (existingFilter.slice(1) as maplibregl.ExpressionSpecification[])
        : [existingFilter as maplibregl.ExpressionSpecification];

      // filter out any tracked edits filters
      const filteredExpressions = existingExpressions.filter((expr) => !this.isTrackedEditsFilter(expr));
      if (filteredExpressions.length === 0) {
        map.setFilter(layerName, undefined);
        continue;
      }
      if (filteredExpressions.length === 1) {
        map.setFilter(layerName, filteredExpressions[0]);
        continue;
      }
      const combinedFilter: maplibregl.ExpressionSpecification = ['all', ...filteredExpressions];
      map.setFilter(layerName, combinedFilter);
    }
  }
}

class TrackedLayerEdits extends SvelteYMap<{
  /** The features added within this layer */
  added: SvelteYArray<GeoJSON.Feature<AllowedGeometries, AllowedProperties>>;
  /** The IDs of deleted features within this layer */
  deleted: SvelteYArray<FeatureId>;
  /** The modified features within this layer, stored  */
  modified: SvelteYArray<GeoJSON.Feature<AllowedGeometries, AllowedProperties>>;
  layerId: LayerId;
}> {
  constructor(parent: TrackedEdits, layerId: string, origin: string | undefined) {
    if (!parent.doc) {
      throw new Error('Parent TrackedEdits must have a Y.Doc associated with it.');
    }

    super(
      () => parent[layerId]?.current || new Y.Map(),
      origin,
      (ymap) => {
        const added = ymap.get('added') as
          | Y.Array<GeoJSON.Feature<AllowedGeometries, AllowedProperties>>
          | undefined;
        const deleted = ymap.get('deleted') as Y.Array<FeatureId> | undefined;
        const modified = ymap.get('modified') as
          | Y.Array<GeoJSON.Feature<AllowedGeometries, AllowedProperties>>
          | undefined;
        return {
          added: new SvelteYArray(() => added || new Y.Array()),
          deleted: new SvelteYArray(() => deleted || new Y.Array()),
          modified: new SvelteYArray(() => modified || new Y.Array()),
          layerId,
        };
      }
    );

    return new Proxy(this, {
      get(target, prop, receiver) {
        // if the property name is a method, property, or getter on the class, return that
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        // otherwise, return the property from the underlying Y.Map
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  get changedCount() {
    return this.added.length + this.deleted.length + this.modified.length;
  }

  get modifiedOrDeletedIds() {
    const ids = new Set<FeatureId>([...this.deletedIds, ...this.modifiedIds]);
    return Array.from(ids);
  }

  get deletedIds() {
    const ids = new Set<FeatureId>();

    for (const id of this.deleted) {
      ids.add(id);
    }

    return Array.from(ids);
  }

  get modifiedIds() {
    const ids = new Set<FeatureId>();

    for (const feature of this.modified) {
      if (feature.id !== undefined) {
        ids.add(feature.id);
      }
    }

    return Array.from(ids);
  }

  get addedIds() {
    const ids = new Set<FeatureId>();

    for (const feature of this.added) {
      if (feature.id !== undefined) {
        ids.add(feature.id);
      }
    }

    return Array.from(ids);
  }

  /**
   * Records deletions of the given feature IDs.
   */
  delete(featureIds: FeatureId[]) {
    if (!this.doc) {
      throw new Error('TrackedLayerEdits must have a Y.Doc associated with it.');
    }

    // omit any feature IDs already present in deletions
    const existingDeletedIds = this.deletedIds;
    featureIds = featureIds.filter((id) => !existingDeletedIds.includes(id));

    this.doc.transact((tr) => {
      // for any feature IDs present in added or modifications,
      // remove the feature from those lists
      for (const id of featureIds) {
        if (this.addedIds.includes(id)) {
          const additionIndex = this.added.array.findIndex((feature) => feature.id === id);
          if (additionIndex !== -1) {
            this.added.delete(additionIndex);
          }
        }

        if (this.modifiedIds.includes(id)) {
          const modificationIndex = this.modified.array.findIndex((feature) => feature.id === id);
          if (modificationIndex !== -1) {
            this.modified.delete(modificationIndex);
          }
        }
      }

      this.deleted.push(featureIds);
    }, this.__origin);
  }

  /**
   * Records that the given features have been added.
   */
  add(features: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[]) {
    if (!this.doc) {
      throw new Error('TrackedLayerEdits must have a Y.Doc associated with it.');
    }

    this.doc.transact(() => {
      this.added.push(features);
    }, this.__origin);
  }

  /**
   * Records feature additions or modifications for this layer.
   *
   * - If the modified feature was previously added, its addition is updated.
   * - If the modified feature was previously modified, its modification is updated.
   * - If the modified feature was not previously added or modified, but is marked for deletion, it is skipped.
   * - If the modified feature was not previously added or modified, but it does not exist on the feature service, it is recorded as an addition.
   * - Otherwise, the feature is added to the modifications list.
   */
  modify(features: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[]) {
    if (!this.doc) {
      throw new Error('TrackedLayerEdits must have a Y.Doc associated with it.');
    }

    new Promise<Array<() => void>>(async (resolve, reject) => {
      const actions: Array<() => void> = [];

      for await (const feature of features) {
        if (feature.id === undefined) {
          console.warn('Cannot register modification for feature without ID:', feature);
          continue;
        }

        // if the feature is already in additions, update it there instead
        const additionIndex = this.added.array.findIndex((f) => f.id === feature.id);
        if (additionIndex !== -1) {
          actions.push(() => {
            this.added.delete(additionIndex);
            this.added.insert(additionIndex, [feature]);
          });
          continue;
        }

        // if the feature is already in modifications, update it there
        const modificationIndex = this.modified.array.findIndex((f) => f.id === feature.id);
        if (modificationIndex !== -1) {
          actions.push(() => {
            this.modified.delete(modificationIndex);
            this.modified.insert(modificationIndex, [feature]);
          });
          continue;
        }

        // check if the feature ID is in deletions; if so, skip it
        if (this.deletedIds.includes(feature.id as FeatureId)) {
          continue;
        }

        // if the feature ID does not already exist on the feature service,
        // we should treat this as an addition, not a modification
        const foundFeature = await getFeatureFromService(`data/data."${this.layerId}"`, feature.id);
        if (!foundFeature) {
          actions.push(() => {
            this.added.push([feature]);
          });
          continue;
        }

        // otherwise, add it to modifications
        actions.push(() => {
          this.modified.push([feature]);
        });
      }

      resolve(actions);
    }).then((actions) => {
      this.doc?.transact(() => {
        actions.forEach((action) => action());
      }, this.__origin);
    });
  }

  get featureCollection() {
    const allFeatures: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[] = [];

    for (const feature of this.added) {
      allFeatures.push(feature);
    }

    for (const feature of this.modified) {
      allFeatures.push(feature);
    }

    return { type: 'FeatureCollection', features: allFeatures };
  }
}
