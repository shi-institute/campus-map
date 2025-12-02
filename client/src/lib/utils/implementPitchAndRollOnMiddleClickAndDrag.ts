/**
 * Registers event listeners on a map that implement middle click and drag to adjust pitch
 * and roll behavior similar to ArcGIS products.
 *
 * Pitch adjusts the angle of the map view. A pitch of 0 degrees means looking straight down at the map.
 * The pitch adjusts based on the vertical movement of the mouse while the middle mouse button is held down.
 *
 * Roll adjusts the rotation of the map view around the center point. A roll of 0 degrees means north is up.
 * The roll adjusts based on the horizontal movement of the mouse while the middle mouse button is held down.
 *
 * @param map The MapLibre map instance
 * @param pitchSensitivity The sensitivity of the pitch adjustment (default: 0.25)
 * @param rollSensitivity The sensitivity of the roll adjustment (default: 0.1)
 */
export function implementPitchAndRollOnMiddleClickAndDrag(
  map: maplibregl.Map,
  pitchSensitivity = 0.25,
  rollSensitivity = 0.1
) {
  let isMiddleMouseDown = false;
  let around: maplibregl.LngLat | null = null;
  let startX: number | null = null;
  let startY: number | null = null;

  const cursor = 'url(/cursors/pitch-roll.svg) 16 16, auto';

  map.getCanvas().addEventListener('mousedown', (event) => {
    if (event.button !== 1) {
      return;
    }

    // once the middle mouse button is pressed, start tracking movement
    isMiddleMouseDown = true;
    startX = event.clientX;
    startY = event.clientY;
    around = map.unproject([event.clientX, event.clientY]);

    // also change the cursor to indicate pitch and roll mode
    map.getCanvas().style.cursor = cursor;
  });

  map.getCanvas().addEventListener('mouseup', (event) => {
    if (event.button !== 1) {
      return;
    }

    // stop tracking movement once the middle mouse button is released
    isMiddleMouseDown = false;
    startX = null;
    startY = null;
    around = null;

    // reset the cursor back to default
    map.getCanvas().style.cursor = '';
  });

  map.getCanvas().addEventListener('mousemove', (event) => {
    if (!isMiddleMouseDown || around === null || startX === null || startY === null) {
      return;
    }

    // track the change in mouse position since the mouse down event
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // calculate how much to change the pitch and roll
    // based on the change in mouse position
    const pitchChange = deltaY * pitchSensitivity;
    const rollChange = deltaX * rollSensitivity;

    // apply the pitch change to the map without animation
    map.setPitch(map.getPitch() - pitchChange);

    // apply the roll change to the map without animation
    map.rotateTo((map.getBearing() + rollChange) % 360, { animate: false, around });

    // reset the starting position for the next mouse move event
    startX = event.clientX;
    startY = event.clientY;
  });
}
