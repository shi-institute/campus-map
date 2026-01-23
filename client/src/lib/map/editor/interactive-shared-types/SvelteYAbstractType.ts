import * as Y from 'yjs';

export abstract class SvelteYAbstractType<T, E> extends Y.AbstractType<E> {
  doc: Y.Doc | null = null;
  abstract __type: 'Map' | 'Array';

  abstract get current(): T;

  protected abstract isUnderlyingProperty(prop: string | symbol): boolean;
}
