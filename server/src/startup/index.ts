import { types } from 'pg';
import { initializeKart } from './initializeKart.js';

/**
 * Initializes required external services.
 */
export default async () => {
  await initializeKart();
};

// ensure BIGINTs are returned as BigInts, not strings
types.setTypeParser(types.builtins.INT8, function (val) {
  return BigInt(val);
});

// ensure BIGINTs are serialized properly in JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString() + 'n';
};

// ensure JSON-serialized BigInts can be parsed back to BigInts
const originalJSONParse = JSON.parse;
JSON.parse = function (text, reviver) {
  return originalJSONParse(text, (key, value) => {
    // treat strings that only contain digits followed by 'n' as BigInts
    if (typeof value === 'string' && /^[0-9]+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return reviver ? reviver(key, value) : value;
  });
};
