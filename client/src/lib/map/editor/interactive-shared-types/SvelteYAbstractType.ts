import * as Y from 'yjs';

export abstract class SvelteYAbstractType<T, E> extends Y.AbstractType<E> {
  doc: Y.Doc | null = null;
  abstract __type: 'Map' | 'Array';

  static __registeredTypes: Map<'SvelteYMap' | 'SvelteYArray', SvelteYAbstractTypeImplementation> = new Map();

  abstract get current(): T;

  protected abstract isUnderlyingProperty(prop: string | symbol): boolean;

  protected toReactiveSharedType<V>(value: V, additionalTransformers?: SvelteYGetterTransformer[]): V {
    for (const [proto, transformer] of additionalTransformers || []) {
      if (value instanceof proto) {
        return transformer(value);
      }
    }
    if (value instanceof Y.Array && SvelteYAbstractType.__registeredTypes.has('SvelteYArray')) {
      const SvelteYArray = SvelteYAbstractType.__registeredTypes.get('SvelteYArray')!;
      return new SvelteYArray(() => value) as V;
    }
    if (value instanceof Y.Map && SvelteYAbstractType.__registeredTypes.has('SvelteYMap')) {
      const SvelteYMap = SvelteYAbstractType.__registeredTypes.get('SvelteYMap')!;
      return new SvelteYMap(() => value) as V;
    }
    return value;
  }
}

export type SvelteYGetterTransformer<P = any, R = any> = [proto: P, transformer: (v: any) => R];
type SvelteYAbstractTypeImplementation = new (...args: any[]) => SvelteYAbstractType<any, any>;
