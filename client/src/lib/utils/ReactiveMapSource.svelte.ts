/**
 * A reactive wrapper around a MapLibre GL JS source.
 *
 * This class listens to source data events on the provided map
 * and updates its internal state to reflect the current status
 * of the specified source.
 *
 * It exposes reactive properties for the source ID, source
 * specification, and loaded status.
 */
export class ReactiveMapSource {
  private state = $state<{ sourceId: string; source?: maplibregl.SourceSpecification; loaded: boolean }>({
    sourceId: '',
    loaded: false,
  });

  constructor(map: maplibregl.Map | undefined | null, sourceId: string) {
    this.state.sourceId = sourceId;
    this.state.loaded = this.sourceIsLoaded(map);

    // bind to class instance so that "this" does not change context in the $effect
    const handleSourceData = this.handleSourceData.bind(this);

    $effect(() => {
      map?.on('sourcedata', handleSourceData);
      map?.on('sourcedataloading', handleSourceData);
      map?.on('sourcedataaboirt', handleSourceData);
      return () => {
        map?.off('sourcedata', handleSourceData);
        map?.off('sourcedataloading', handleSourceData);
        map?.off('sourcedataabort', handleSourceData);
      };
    });
  }

  /**
   * Checks whether the source is loaded on the map.
   */
  private sourceIsLoaded(map: maplibregl.Map | null | undefined) {
    try {
      return map?.getSource(this.state.sourceId) !== undefined;
    } catch {
      // catches if the source does not exist yet
      return false;
    }
  }

  private handleSourceData(event: maplibregl.MapSourceDataEvent) {
    if (event.sourceId !== this.state.sourceId) return;
    this.state.source = event.source;
    this.state.loaded = event.isSourceLoaded;
  }

  get loaded() {
    return this.state.loaded;
  }

  get source() {
    return this.state.source;
  }

  get sourceId() {
    return this.state.sourceId;
  }
}
