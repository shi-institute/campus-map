import { LngLat } from 'maplibre-gl';
import { createSubscriber } from 'svelte/reactivity';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import * as Y from 'yjs';
import z from 'zod';

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

export class SvelteYAwareness {
  awareness: awarenessProtocol.Awareness;
  private subscribeWithLatLng: () => void;
  private subscribeWithoutLatLng: () => void;

  constructor(ydoc: Y.Doc) {
    this.awareness = new awarenessProtocol.Awareness(ydoc);

    this.subscribeWithLatLng = createSubscriber((update) => {
      let stateCache: Map<number, any> = new Map();
      const updateChecker = (changes: AwarenessChange) => {
        const hasChanged = this.handleIncomingChange(changes, { ignoreUserLatLng: false, stateCache });
        if (hasChanged) {
          update();
        }
      };
      this.awareness.on('change', updateChecker);
      return () => {
        this.awareness.off('change', updateChecker);
        stateCache = new Map();
      };
    });

    this.subscribeWithoutLatLng = createSubscriber((update) => {
      let stateCache: Map<number, any> = new Map();
      const updateChecker = (changes: AwarenessChange) => {
        const hasChanged = this.handleIncomingChange(changes, { ignoreUserLatLng: true, stateCache });
        if (hasChanged) {
          update();
        }
      };
      this.awareness.on('change', updateChecker);
      return () => {
        this.awareness.off('change', updateChecker);
        stateCache = new Map();
      };
    });
  }

  private handleIncomingChange(
    { added, updated, removed }: AwarenessChange,
    { ignoreUserLatLng, stateCache }: { ignoreUserLatLng: boolean; stateCache: Map<number, any> }
  ) {
    if (added.length > 0 || removed.length > 0) {
      return true;
    }

    let hasChanged = false;

    for (const clientId of updated) {
      const state = this.awareness.getStates().get(clientId);

      // remove lngLat because we do not want to track it
      const sortedStateTemporary = Object.fromEntries(
        Object.entries(state || {}).sort(([a], [b]) => a.localeCompare(b))
      );
      const newState = JSON.parse(JSON.stringify(sortedStateTemporary)); // deep clone

      if (ignoreUserLatLng) {
        delete newState.user?.lngLat;
      }

      const lastState = stateCache.get(clientId);
      hasChanged = JSON.stringify(newState) !== JSON.stringify(lastState);
      if (hasChanged) {
        stateCache.set(clientId, newState);
        break;
      }
    }

    return hasChanged;
  }

  get current() {
    this.subscribeWithLatLng();
    return this.awareness;
  }

  destroy() {
    this.awareness.destroy();
  }

  get clientId() {
    return this.awareness.clientID;
  }

  get localUser(): z.infer<typeof awarenessUserSchema> {
    this.subscribeWithoutLatLng();
    const maybeUser = this.awareness.getLocalState()?.user;
    const parsed = awarenessUserSchema.safeParse(maybeUser);
    if (!parsed.success) {
      return { name: 'Unknown', color: '#ff0000', clientId: this.clientId };
    }
    return parsed.data;
  }

  set localUser(user: {
    name: string;
    color: string;
    lngLat?: maplibregl.LngLat;
    selectedLayerFeatureId?: string;
  }) {
    this.awareness.setLocalStateField('user', { ...user, clientId: this.clientId });
  }

  get users() {
    this.subscribeWithoutLatLng();
    const states = Array.from(this.awareness.getStates().values());
    return states
      .map((state) => state.user)
      .filter((x) => !!x)
      .map((maybeUser) => {
        const parsed = awarenessUserSchema.safeParse(maybeUser);
        if (!parsed.success) {
          console.warn('Skipping invalid awareness user state:', parsed.error);
        }
        return parsed.data;
      })
      .filter((x) => !!x);
  }

  /**
   * Get the cursors of other users (excluding the local user) who have a defined lngLat.
   * @reactive
   */
  get cursors() {
    this.subscribeWithLatLng();
    return this.users
      .filter((user) => user.lngLat && user.clientId !== this.clientId)
      .map((user) => ({
        clientId: user.clientId,
        name: user.name,
        color: user.color,
        lngLat: user.lngLat as maplibregl.LngLat,
      }));
  }

  get globalSelectedLayerFeatureIds() {
    const ids: string[] = [];
    for (const user of this.users) {
      if (user.selectedLayerFeatureId) {
        ids.push(user.selectedLayerFeatureId);
      }
    }

    const ourIds = this.localUser.selectedLayerFeatureId ? [this.localUser.selectedLayerFeatureId] : [];
    const theirIds = ids.filter((id) => !ourIds.includes(id));

    return { ourIds, theirIds };
  }
}

const awarenessUserSchema = z.object({
  name: z.string(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  clientId: z.number(),
  lngLat: z
    .object({ lng: z.number(), lat: z.number() })
    .transform((obj) => new LngLat(obj.lng, obj.lat))
    .optional(),
  selectedLayerFeatureId: z.string().optional(),
});
