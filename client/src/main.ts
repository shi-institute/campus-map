import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

export default app;

// ensure BIGINTs are serialized properly in JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString() + 'n';
};

// ensure JSON-serialized BigInts can be parsed back to BigInts
const originalJSONParse = JSON.parse;
JSON.parse = function (text, reviver, { skipBigIntRestore = false } = {}) {
  return originalJSONParse(text, (key, value) => {
    // treat strings that only contain digits followed by 'n' as BigInts
    if (!skipBigIntRestore && typeof value === 'string' && /^[0-9]+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return reviver ? reviver(key, value) : value;
  });
};

// // ensure fetched JSON responses parse BigInts correctly
// const originalResponseJson = Response.prototype.json;
// Response.prototype.json = async function (...args) {
//   const data = await originalResponseJson.apply(this, args);

//   /**
//    * Identifies strings containing numbers followed by 'n' and converts them to BigInts.
//    */
//   function restoreBigInts(obj: any): any {
//     // process the strings
//     if (typeof obj === 'string' && /^[0-9]+n$/.test(obj)) {
//       return BigInt(obj.slice(0, -1));
//     }

//     // recursively process array elements
//     else if (Array.isArray(obj)) {
//       return obj.map(restoreBigInts);
//     }

//     // recursively process object properties
//     else if (obj && typeof obj === 'object') {
//       for (const key of Object.keys(obj)) {
//         obj[key] = restoreBigInts(obj[key]);
//       }
//     }

//     return obj;
//   }

//   return restoreBigInts(data);
// };
