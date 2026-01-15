import type { Context } from 'koa';

/**
 * Infers the correct response format for a service endpoint based on
 * query parameters and Accept headers.
 */
export function inferServiceResponseFormat(ctx: Context) {
  // explicily requested format
  const format =
    ctx.request.query.f || (typeof ctx.request.body === 'object' ? ctx.request.body.f : undefined);

  // header-based content negotiation
  const acceptsHtml = ctx.request.accepts('text/html', 'application/json', 'text/plain') === 'text/html';
  const acceptsJson =
    ctx.request.accepts('application/json', 'text/html', 'text/plain') === 'application/json';

  if (format === 'html' || (format === undefined && acceptsHtml)) {
    return 'html';
  } else if (format === 'pjson') {
    return 'pjson';
  } else if (format === 'json' || (format === undefined && acceptsJson)) {
    return 'json';
  } else if (format === 'jsapi') {
    return 'jsapi';
  } else {
    // default to json
    return 'json';
  }
}
