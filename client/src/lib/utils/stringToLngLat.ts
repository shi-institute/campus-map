import { LngLat } from 'maplibre-gl';

/**
 * Attempts to convert a given string to a `LngLat` object. If the conversion fails,
 * the function returns `undefined`.
 */
export function stringToLngLat(
  inputText: string | undefined,
  variant: 'lat-lng' | 'lng-lat'
): maplibregl.LngLat | undefined {
  if (!inputText) {
    return undefined;
  }

  // trim preceding @
  if (inputText.startsWith('@')) {
    inputText = inputText.slice(1);
  }

  try {
    const parts = inputText.split(',').map((coord) => parseFloat(coord.trim())) as [number, number];

    if (variant === 'lat-lng') {
      // swap lat and lng (y-x) to (x-y)
      [parts[0], parts[1]] = [parts[1], parts[0]];
    }

    return LngLat.convert(parts);
  } catch {
    return undefined;
  }
}
