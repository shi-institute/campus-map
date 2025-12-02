/**
 * Registers event listeners on a map that implement right click and drag to zoom behavior
 * similar to ArcGIS products.
 *
 * The change in the mouse's y-axis position while right clicking and dragging is used to
 * determine how much to zoom in or out. The sensitivity parameter controls how much
 * zooming occurs for a given change in mouse position.
 *
 * @param map The MapLibre map instance
 * @param sensitivity The sensitivity of the zooming behavior (default: 0.01)
 */
export function implementZoomOnRightClickAndDrag(map: maplibregl.Map, sensitivity = 0.01) {
  let isRightMouseDown = false;
  let around: maplibregl.LngLat | null = null;
  let startY: number | null = null;
  let wasDragging = false;

  const cursor = 'url(/cursors/zoom.png) 8 8, auto';

  map.getCanvas().addEventListener('contextmenu', (event) => {
    // if any dragging occurred, prevent the context menu from appearing
    if (wasDragging) {
      event.preventDefault();
      wasDragging = false;
    }
  });

  map.getCanvas().addEventListener('mousedown', (event) => {
    if (event.button !== 2) {
      return;
    }

    // once the right mouse button is pressed, start tracking movement
    isRightMouseDown = true;
    startY = event.clientY;
    around = map.unproject([event.clientX, event.clientY]);

    // also change the cursor to indicate zoom mode
    map.getCanvas().style.cursor = cursor;
  });

  map.getCanvas().addEventListener('mouseup', (event) => {
    if (event.button !== 2) {
      return;
    }

    // stop tracking movement once the right mouse button is released
    isRightMouseDown = false;
    startY = null;
    around = null;

    // reset the cursor back to default
    map.getCanvas().style.cursor = '';
  });

  map.getCanvas().addEventListener('mousemove', (event) => {
    if (!isRightMouseDown || around === null || startY === null) {
      return;
    }

    // track the change in mouse position since the mouse down event
    const deltaY = event.clientY - startY;

    // calculate how much to change the zoom level based on
    // the change in mouse position and the given sensitivity
    const zoomChange = deltaY * sensitivity;

    // apply the zoom change to the map without animation
    map.zoomTo(map.getZoom() + zoomChange, { animate: false, around });

    // reset the starting position for the next mouse move event
    startY = event.clientY;

    // indicate that dragging has occurred
    // so we can block the context menu
    wasDragging = true;
  });
}
