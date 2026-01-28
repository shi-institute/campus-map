import { getCurrentUser } from '$lib/utils/auth';
import { getFeatureFromService } from '$lib/utils/features';
import { TrysteroProvider as WebrtcProvider } from '@winstonfassett/y-webrtc-trystero';
import type { getMapContext } from 'svelte-maplibre-gl';
import { createSubscriber } from 'svelte/reactivity';
import type { GeoJSONStoreFeatures, TerraDraw } from 'terra-draw';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';
import { SvelteYArray, SvelteYAwareness, SvelteYMap } from './interactive-shared-types';
import { inferMode, normalizeFeature } from './terra-draw';

export class EditorDoc {
  ydoc: Y.Doc;
  #globalMap: SvelteYMap<{}>;
  #trackedEdits: TrackedEdits;
  #readySubscriber: () => void;

  awareness: SvelteYAwareness;
  persistence: IndexeddbPersistence;
  webrtcProvider: WebrtcProvider;

  constructor(roomName: string) {
    this.ydoc = new Y.Doc();
    this.#globalMap = new SvelteYMap(() => this.ydoc.getMap('global'));
    this.#trackedEdits = new TrackedEdits(this.ydoc);

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
  constructor(ydoc: Y.Doc) {
    super(() => ydoc.getMap('trackedEdits'));

    return new Proxy(this, {
      get(target, prop, receiver) {
        // if the property name is a method, property, or getter on the class, return that
        if (Reflect.has(target, prop)) {
          return Reflect.get(target, prop, receiver);
        }

        if (typeof prop === 'string') {
          // create a TrackedLayerEdits for this layer if it does not exist
          if (!target.has(prop)) {
            target[prop] = new TrackedLayerEdits(target, prop);
          }
          return new TrackedLayerEdits(target, prop);
        }

        return Reflect.get(target, prop, receiver);
      },
    });
  }

  /**
   * Gets the filters that must be applied to each layer on the map
   * to hide features that have been edited. The features are rendered
   * by terra draw, so they must be hidden on the map layer.
   */
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  protected get layerFilters() {
    const filters: { [key: LayerId]: maplibregl.ExpressionSpecification | undefined } = {};

    for (const layerId of this.keys()) {
      const layerEdits = this[layerId];
      const excludedIds = layerEdits.modifiedOrDeletedIds.map((id) => id.toString());
      if (excludedIds.length > 0) {
        filters[layerId] = ['!', ['in', ['to-string', ['id']], ['literal', excludedIds]]];
      }
    }

    return filters;
  }

  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  protected applyLayerFilters(map: maplibregl.Map, sourceId: string) {
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

      const filter = this.layerFilters[layerName];
      if (filter) {
        const existingFilter = map.getFilter(layerName);
        if (!existingFilter) {
          map.setFilter(layerName, filter);
          continue;
        }

        const isTrackedEditsFilter = (expr: maplibregl.ExpressionSpecification) => {
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
        };

        // if the existing filter is a tracked edits filter, replace it
        if (isTrackedEditsFilter(existingFilter as maplibregl.ExpressionSpecification)) {
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
        const existingTrackedEditsFilterIndex = existingExpressions.findIndex(isTrackedEditsFilter);
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
  }

  /**
   * Applies the current tracked edits to the given TerraDraw instance
   * whenever the edits change. This ensures that TerraDraw is always
   * aware of the current state of edits in the document.
   */
  // @ts-expect-error Typescript does not like that this is not a TrackedLayerEdits class instance
  sync(draw: TerraDraw, mapCtx: ReturnType<typeof getMapContext>) {
    this.__deepSubscribe();

    for (const layerId of this.keys()) {
      const layerEdits = this[layerId];

      const applyEditsToTerraDraw = () => {
        const featuresToRemove: string[] = [];
        const featuresToAdd: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[] = [];
        const featuresToModify: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[] = [];

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
            featuresToModify.push(feature);
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
            featuresToModify.push(feature);
            continue;
          }

          const mode = inferMode(feature.geometry);
          featuresToAdd.push({
            ...feature,
            id: terraDrawFeatureId,
            properties: { ...feature.properties, mode },
          });
        }

        draw.removeFeatures(featuresToRemove);
        draw.addFeatures(featuresToAdd);
        for (const feature of featuresToModify) {
          const terraDrawFeatureId = `${feature.id}.${layerId}`;
          draw.updateFeatureGeometry(terraDrawFeatureId, feature.geometry);
          draw.updateFeatureProperties(terraDrawFeatureId, feature.properties);
        }
      };
      applyEditsToTerraDraw();
    }

    mapCtx.waitForSourceLoaded('esri', (map) => {
      this.applyLayerFilters(map, 'esri');
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

class TrackedLayerEdits extends SvelteYMap<{
  /** The features added within this layer */
  added: SvelteYArray<GeoJSON.Feature<AllowedGeometries, AllowedProperties>>;
  /** The IDs of deleted features within this layer */
  deleted: SvelteYArray<FeatureId>;
  /** The modified features within this layer, stored  */
  modified: SvelteYArray<GeoJSON.Feature<AllowedGeometries, AllowedProperties>>;
}> {
  private __layerId: string;

  constructor(parent: TrackedEdits, layerId: string) {
    if (!parent.doc) {
      throw new Error('Parent TrackedEdits must have a Y.Doc associated with it.');
    }

    super(
      () => parent[layerId]?.current || new Y.Map(),
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
        };
      }
    );

    this.__layerId = layerId;

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

  get layerId() {
    return this.__layerId;
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

    this.doc.transact(() => {
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
    });
  }

  /**
   * Records that the given features have been added.
   */
  add(features: GeoJSON.Feature<AllowedGeometries, AllowedProperties>[]) {
    if (!this.doc) {
      throw new Error('TrackedLayerEdits must have a Y.Doc associated with it.');
    }

    this.doc.transact((tr) => {
      this.added.push(features);
    });
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

    this.doc.transact(async () => {
      for await (const feature of features) {
        if (feature.id === undefined) {
          console.warn('Cannot register modification for feature without ID:', feature);
          continue;
        }

        // if the feature is already in additions, update it there instead
        const additionIndex = this.added.array.findIndex((f) => f.id === feature.id);
        if (additionIndex !== -1) {
          this.added.delete(additionIndex);
          this.added.insert(additionIndex, [feature]);
          continue;
        }

        // if the feature is already in modifications, update it there
        const modificationIndex = this.modified.array.findIndex((f) => f.id === feature.id);
        if (modificationIndex !== -1) {
          this.modified.delete(modificationIndex);
          this.modified.insert(modificationIndex, [feature]);
          continue;
        }

        // check if the feature ID is in deletions; if so, skip it
        if (this.deletedIds.includes(feature.id as FeatureId)) {
          continue;
        }

        // if the feature ID does not already exist on the feature service,
        // we should treat this as an addition, not a modification
        const foundFeature = await getFeatureFromService(`data/data."${this.__layerId}"`, feature.id);
        if (!foundFeature) {
          this.added.push([feature]);
          continue;
        }

        // otherwise, add it to modifications
        this.modified.push([feature]);
      }
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
