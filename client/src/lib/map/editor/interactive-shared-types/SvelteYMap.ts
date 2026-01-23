import { createSubscriber } from 'svelte/reactivity';
import * as Y from 'yjs';
import { SvelteYAbstractType } from './SvelteYAbstractType';
import { SvelteYArray } from './SvelteYArray';

class _SvelteYMap<T extends Record<string, unknown>> extends SvelteYAbstractType<Y.Map<T>, Y.YMapEvent<T>> {
  private __ymap: Y.Map<T>;
  protected __subscribe: () => void;
  protected __deepSubscribe: () => void;
  __type = 'Map' as const;

  private __abstractTypeTransforms: Record<string, 'Array' | 'Map'> = {};

  constructor(getter: () => Y.Map<T>, ...args: DefaultValuesArg<T>) {
    super();
    this.__ymap = getter();
    if (!this.doc && this.__ymap.doc) {
      this.doc = this.__ymap.doc;
    }

    const defaultValues = (args[0] || ((map: Y.Map<T>) => ({}) as DefaultValues<T>))(this.__ymap);

    this.__subscribe = createSubscriber((update) => {
      // whenever a change happens in the Y.Map, re-run any effects that read `this.current`
      this.__ymap.observe(update);

      // stop observing when all effects are destroyed
      return () => this.__ymap.unobserve(update);
    });

    this.__deepSubscribe = createSubscriber((update) => {
      this.__ymap.observeDeep(update);
      return () => this.__ymap.unobserveDeep(update);
    });

    // set any default values that were missing
    const setDefaults = () => {
      for (const key in defaultValues) {
        let valueToSet = defaultValues[key];

        // transform abstract types to their underlying Yjs types
        if (valueToSet && valueToSet instanceof SvelteYAbstractType) {
          valueToSet = (valueToSet as unknown as SvelteYAbstractType<never, never>).current;
        }

        if (!this.__ymap.has(key) && valueToSet !== undefined && valueToSet !== null) {
          // @ts-expect-error Yjs has the wrong type for the value parameter
          this.__ymap.set(key, valueToSet);
        }
      }
    };
    if (this.__ymap.doc) {
      this.__ymap.doc?.transact(() => {
        setDefaults();
      });
    } else {
      setDefaults();
    }

    // return a proxy that intercepts property gets/sets/deletes
    // to read/write/delete keys in the Y.Map
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (target.isUnderlyingProperty(prop)) {
          return Reflect.get(target.__ymap, prop, receiver);
        }

        // if the property name is a method, property, or getter on the class, return that
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }

        // otherwise, assume it is a key in the Y.Map
        if (typeof prop === 'string') {
          target.__subscribe();
          return target.getWithTransform(prop);
        }

        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (target.isUnderlyingProperty(prop)) {
          return Reflect.set(target.__ymap, prop, value, receiver);
        }

        if (prop in target) {
          return Reflect.set(target, prop, value, receiver);
        }

        // assume it is a key in the Y.Map
        if (typeof prop === 'string') {
          target.__subscribe();

          // transform abstract types to their underlying Yjs types
          if (value && value instanceof SvelteYAbstractType) {
            value = value.current;
          }

          target.__ymap.set(prop, value);
          return true;
        }

        return Reflect.set(target, prop, value, receiver);
      },
      deleteProperty(target, prop) {
        if (prop in target) {
          return false;
        }

        if (typeof prop === 'string') {
          target.__ymap.delete(prop);
          return true;
        }

        return false;
      },
    });
  }

  protected isUnderlyingProperty(prop: string | symbol): boolean {
    const stringProp = String(prop);
    return (
      (stringProp.startsWith('_') && !stringProp.startsWith('__')) ||
      (prop in Y.Map.prototype && !(prop in this)) ||
      prop === 'doc'
    );
  }

  /**
   * Gets the value for the given key.
   *
   * If the the value is an abstract type that requires transformation,
   * it will be transformed before being returned.
   */
  private getWithTransform(key: string) {
    const value = this.__ymap.get(key) as T[keyof T] | undefined;
    if (value) {
      if (value instanceof Y.Array) {
        return new SvelteYArray(() => value);
      }
      if (value instanceof Y.Map) {
        const svelteYMap = new _SvelteYMap(() => value);
        return svelteYMap;
      }
    }
    return value;
  }

  get current() {
    this.__deepSubscribe();
    return this.__ymap;
  }

  clear() {
    this.__ymap.clear();
  }

  get json() {
    this.__deepSubscribe();
    return this.__ymap.toJSON();
  }

  toJSON() {
    return this.json;
  }

  get size(): number {
    this.__subscribe();
    return this.__ymap.size;
  }

  clone(): Y.Map<T> {
    return this.__ymap.clone();
  }

  has(key: keyof T & string): boolean {
    this.__subscribe();
    return this.__ymap.has(key);
  }

  *entries(): IterableIterator<Entry<T>> {
    this.__subscribe();

    for (const entry of this.__ymap.entries()) {
      yield entry as Entry<T>;
    }
  }

  *values(): IterableIterator<T[keyof T]> {
    this.__subscribe();

    for (const value of this.__ymap.values()) {
      yield value as T[keyof T];
    }
  }

  *keys(): IterableIterator<keyof T & string> {
    this.__subscribe();

    for (const key of this.__ymap.keys()) {
      yield key as keyof T & string;
    }
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  forEach(callback: (entry: Entry<T>, map: Y.Map<T>) => void) {
    for (const [key, value] of this.entries()) {
      callback([key, value], this.__ymap);
    }
  }

  map<U>(callback: (entry: Entry<T>, map: Y.Map<T>) => U): U[] {
    const results: U[] = [];

    for (const [key, value] of this.entries()) {
      results.push(callback([key, value], this.__ymap));
    }

    return results;
  }
}

/**
 * A helper type that extracts the required keys of T.
 */
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];

/**
 * A helper type that requires only the non-optional properties of T
 */
type DefaultValues<T> = Pick<T, RequiredKeys<T>> & Partial<T>;

/**
 * A helper type that represents an entry in an object as a tuple of key and value.
 * This type correctly infers the value type based on the key.
 */
type Entry<Obj> = { [K in keyof Obj & string]: [K, Obj[K]] }[keyof Obj & string];

/**
 * A type that represents the argument for default values in the SvelteYMap constructor.
 * If T has no required keys, the argument is optional. Otherwise, it is required.
 */
type DefaultValuesArg<T> =
  RequiredKeys<T> extends never
    ? [defaultValues?: (map: Y.Map<T>) => DefaultValues<T>]
    : [defaultValues: (map: Y.Map<T>) => DefaultValues<T>];

export type SvelteYMap<T extends Record<string, unknown>> = _SvelteYMap<T> & T & { [key: string]: unknown };

/**
 * A reactive version of the a Yjs `Y.Map`.
 *
 * Reading contents of the map can be done by interating over it
 * or by reading `map[key]`. Set values by assigning to `map[key]`.
 * Delete keys by using the `delete` operator. Check if a key
 * exists by using the `in` operator.
 *
 * Access a deeply-reactive version of the underlying Y.Map
 * via the `current` property. Similarly, get a JSON representation
 * of the map via the `json` property.
 *
 * Setting, getting, and deleting keys via property access
 * only works for keys that are not the same name as the class methods
 * or properties.
 */
export const SvelteYMap = _SvelteYMap as new <T extends Record<string, unknown>>(
  getter: () => Y.Map<T>,
  ...args: DefaultValuesArg<T>
) => SvelteYMap<T>;
