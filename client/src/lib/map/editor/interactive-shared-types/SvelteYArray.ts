import { createSubscriber } from 'svelte/reactivity';
import * as Y from 'yjs';
import { SvelteYAbstractType } from './SvelteYAbstractType';

export class SvelteYArray<T> extends SvelteYAbstractType<Y.Array<T>, Y.YArrayEvent<T>> {
  private __yarray: Y.Array<T>;
  protected __subscribe: () => void;
  protected __deepSubscribe: () => void;
  __type = 'Array' as const;

  constructor(getter: () => Y.Array<T>) {
    super();
    this.__yarray = getter();

    this.__subscribe = createSubscriber((update) => {
      // whenever a change happens in the Y.Array, re-run any effects that read `this.current`
      this.__yarray.observe(update);

      // stop observing when all effects are destroyed
      return () => this.__yarray.unobserve(update);
    });

    this.__deepSubscribe = createSubscriber((update) => {
      this.__yarray.observeDeep(update);
      return () => this.__yarray.unobserveDeep(update);
    });

    // return a proxy that intercepts property gets/sets/deletes
    // to read/write/delete keys in the Y.Array
    return new Proxy(this, {
      get(target, prop, receiver) {
        // if it is a YJS property, get it from the underlying Y.Array
        if (target.isUnderlyingProperty(prop)) {
          return Reflect.get(target.__yarray, prop, receiver);
        }

        // if the property name is a method, property, or getter on the class, return that
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }

        // otherwise, for numeric properties, assume it is an index in the Y.Array
        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          const index = Number(prop);
          target.__subscribe();
          return target.__yarray.get(index);
        }

        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        // if it is a YJS property, set it on the underlying Y.Array
        if (target.isUnderlyingProperty(prop)) {
          return Reflect.set(target.__yarray, prop, receiver);
        }

        // for array indices, set the value in the Y.Array
        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          const index = Number(prop);

          const existingValue = target.__yarray.get(index);
          if (existingValue === value) {
            return true;
          }

          target.__yarray.doc?.transact(() => {
            target.__yarray.delete(index, 1);
            target.__yarray.insert(index, [value]);
          });

          return true;
        }

        return Reflect.set(target, prop, value, receiver);
      },
      deleteProperty(target, prop) {
        if (target.isUnderlyingProperty(prop)) {
          return delete target.__yarray[prop as keyof Y.Array<T>];
        }

        if (prop in target) {
          return false;
        }

        if (typeof prop === 'string' && !isNaN(Number(prop))) {
          const index = Number(prop);
          target.__yarray.delete(index, 1);
          return true;
        }

        return false;
      },
    });
  }

  protected isUnderlyingProperty(prop: string | symbol): boolean {
    const stringProp = String(prop);

    const existsOnYArray =
      (stringProp.startsWith('_') && !stringProp.startsWith('__')) ||
      (prop in Y.Array.prototype && !(prop in this)) ||
      prop === 'doc';

    return existsOnYArray && !(prop in SvelteYArray.prototype);
  }

  get current() {
    this.__deepSubscribe();
    return this.__yarray;
  }

  /**
   * The parent that holds this type. Is `null` if this `yarray` is a top-level type.
   */
  get parent() {
    return this.__yarray.parent;
  }

  get length() {
    this.__subscribe();
    return this.__yarray.length;
  }

  clone(): Y.Array<T> {
    return this.__yarray.clone();
  }

  insert(index: number, content: T[]) {
    this.__yarray.insert(index, content);
  }

  delete(index: number, length?: number) {
    this.__yarray.delete(index, length);
  }

  /**
   * Appends the given content to the end of the array.
   */
  push(content: T[]) {
    this.__yarray.push(content);
  }

  /**
   * Prepends the given content to the start of the array.
   */
  unshift(content: T[]) {
    this.__yarray.unshift(content);
  }

  get(index: number): T | undefined {
    this.__subscribe();
    return this.__yarray.get(index);
  }

  slice(start: number, end?: number): T[] {
    this.__subscribe();
    return this.__yarray.slice(start, end);
  }

  get array(): T[] {
    this.__deepSubscribe();
    return this.__yarray.toArray() ?? [];
  }

  toArray() {
    return this.array;
  }

  get json(): T[] {
    this.__deepSubscribe();
    return this.__yarray.toJSON();
  }

  toJSON() {
    return this.json;
  }

  *[Symbol.iterator]() {
    this.__subscribe();

    for (const element of this.__yarray) {
      yield element;
    }
  }

  forEach(callback: (entry: T, index: number, array: Y.Array<T>) => void) {
    let index = 0;
    for (const element of this) {
      callback(element, index, this.__yarray);
      index++;
    }
  }

  map<U>(callback: (entry: T, index: number, array: Y.Array<T>) => U): U[] {
    const results: U[] = [];
    let index = 0;

    for (const element of this) {
      results.push(callback(element, index, this.__yarray));
      index++;
    }

    return results;
  }
}
