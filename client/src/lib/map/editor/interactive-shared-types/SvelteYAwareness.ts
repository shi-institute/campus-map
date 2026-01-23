import { LngLat } from 'maplibre-gl';
import { createSubscriber } from 'svelte/reactivity';
import * as awarenessProtocol from 'y-protocols/awareness.js';
import * as Y from 'yjs';
import z from 'zod';

export class SvelteYAwareness {
  awareness: awarenessProtocol.Awareness;
  private subscribe: () => void;

  constructor(ydoc: Y.Doc) {
    this.awareness = new awarenessProtocol.Awareness(ydoc);

    this.subscribe = createSubscriber((update) => {
      this.awareness.on('change', update);
      return () => this.awareness.off('change', update);
    });
  }

  get current() {
    this.subscribe();
    return this.awareness;
  }

  destroy() {
    this.awareness.destroy();
  }

  get clientId() {
    return this.awareness.clientID;
  }

  get localUser(): z.infer<typeof awarenessUserSchema> {
    this.subscribe();
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
    this.subscribe();
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
