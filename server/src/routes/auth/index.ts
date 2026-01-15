import Router from '@koa/router';
import ActiveDirectory from 'activedirectory2';
import dotenv from 'dotenv';
import { isIP } from 'is-ip';
import jwt from 'jsonwebtoken';
import type Koa from 'koa';
import type { Context } from 'koa';
import passport from 'koa-passport';
import { createSession } from 'koa-session';
import ActiveDirectoryStrategy from 'passport-activedirectory';
import { generateServiceDirectoryHeader, initDoc } from '../../utils/index.js';

// load environment variables from .env file
dotenv.config({ override: true, quiet: true });

if (!process.env.DOMAIN_USERNAME || !process.env.DOMAIN_PASSWORD) {
  throw new Error(
    'DOMAIN_USERNAME and DOMAIN_PASSWORD environment variables must be set for Active Directory authentication.'
  );
}
const activeDirectory = new ActiveDirectory({
  url: 'ldap://AD-DC-2204.fu.campus',
  baseDN: 'DC=fu,DC=campus',
  username: process.env.DOMAIN_USERNAME,
  password: process.env.DOMAIN_PASSWORD,
});

const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';

export default async (router: Router, app: Koa) => {
  app.keys = [process.env.SESSION_SECRET || 'default_session_secret'];
  app.use(createSession(app));

  app.use(passport.initialize());
  app.use(passport.session());

  // accept token in query string, body, or header for authentication via any endpoint
  app.use(async (ctx, next) => {
    // extract the token from the query string, body, or headers
    let token = ctx.request.query.token;
    if (
      typeof token !== 'string' &&
      typeof ctx.request.body === 'object' &&
      typeof ctx.request.body.token === 'string'
    ) {
      token = ctx.request.body.token;
    }
    if (typeof token !== 'string' && ctx.request.headers['X-Esri-Authorization']) {
      const authHeader = ctx.request.headers['X-Esri-Authorization'];
      if (typeof authHeader === 'string') {
        const match = /^Bearer (.+)$/.exec(authHeader);
        if (match) {
          token = match[1];
        }
      }
    }
    if (typeof token !== 'string' && ctx.request.headers['Authorization']) {
      const authHeader = ctx.request.headers['Authorization'];
      if (typeof authHeader === 'string') {
        const match = /^Bearer (.+)$/.exec(authHeader);
        if (match) {
          token = match[1];
        }
      }
    }
    if (typeof token !== 'string') {
      return next();
    }

    const invalidTokenResponse = (reason?: string) => {
      ctx.status = 401;
      ctx.body = (() => {
        const { document, body, titleElement } = initDoc('Access Denied');

        // write header
        const headerTables = generateServiceDirectoryHeader(
          { document, user: ctx.state.user },
          { serviceRootPathname: '/rest/services', currentPathname: ctx.path }
        );
        headerTables.forEach((table) => body.appendChild(table));
        body.appendChild(titleElement);

        // body
        const rbody = document.createElement('div');
        rbody.setAttribute('class', 'rbody');
        body.appendChild(rbody);

        // reason message
        const messageElement = document.createElement('p');
        messageElement.appendChild(document.createTextNode(reason ?? 'Invalid token'));
        rbody.appendChild(messageElement);

        // clear token link
        const clearTokenLink = document.createElement('a');
        clearTokenLink.setAttribute('href', ctx.path);
        clearTokenLink.setAttribute('data-no-token', '');
        clearTokenLink.appendChild(document.createTextNode('Clear token and continue'));
        rbody.appendChild(clearTokenLink);

        return document.toString();
      })();
    };

    // verify the token and then inject the user into the request state
    try {
      const decoded = jwt.verify(token, jwtSecret, { issuer: 'campus-map-server', complete: true });
      const userPrincipalName = (decoded.payload as { upn: string }).upn;
      if (!userPrincipalName) {
        return invalidTokenResponse();
      }

      const audience = (decoded.payload as { aud: string }).aud;
      if (typeof audience !== 'string') {
        return invalidTokenResponse('Missing token audience');
      }

      // if the audience is an IP address, ensure the request is coming from that IP
      const audienceIsIp = isIP(audience);
      if (audienceIsIp) {
        const requestIp = ctx.request.ip;
        if (audience !== requestIp) {
          return invalidTokenResponse('Token audience IP does not match request IP');
        }
      }

      // if audience is an http referer, ensure the request's referer header matches
      if (!audienceIsIp && audience !== 'any') {
        let referer = ctx.request.get('Referer') || '';
        if (ctx.method === 'HEAD' && referer === '') {
          // for head requests, the referrer is not often unavailable, so we must skip the check
          referer = audience;
        }

        // ensure that the referer is a valid URL
        try {
          new URL(referer);
        } catch {
          return invalidTokenResponse('Invalid request referer');
        }

        // ensure that the audience is a valid URL
        try {
          new URL(audience);
        } catch {
          return invalidTokenResponse('Invalid token audience');
        }

        // ensure that the referer starts with the audience
        // (e.g. audience is "https://example.com/app" and referer is "https://example.com/app/page")
        if (!referer.startsWith(audience)) {
          return invalidTokenResponse('Token audience referer does not match request referer');
        }
      }

      const user = await getUserByPrincipalName(activeDirectory, userPrincipalName);
      if (user) {
        ctx.state.user = user;
        return next();
      }
      return invalidTokenResponse();
    } catch {
      return invalidTokenResponse();
    }
  });

  router.get('/rest/login', async (ctx) => {
    const html = generateLoginHtml(ctx);

    ctx.body = html;
    ctx.type = 'text/html';
  });

  router.post('/rest/login', async (ctx, next) => {
    if (typeof ctx.request.body !== 'object') {
      const html = generateLoginHtml(ctx, 'Invalid request body.');
      ctx.status = 400;
      ctx.body = html;
      ctx.type = 'text/html';
      return;
    }

    const username = ctx.request.body?.username;
    const password = ctx.request.body?.password;
    if (typeof username !== 'string' || typeof password !== 'string') {
      ctx.status = 400;
      const html = generateLoginHtml(ctx, 'Missing Username or Password');
      ctx.body = html;
      ctx.type = 'text/html';
      return;
    }

    return passport.authenticate('ActiveDirectory', async (err, user, info) => {
      if (err) {
        console.error('Authentication error:', err);
        const html = generateLoginHtml(ctx, 'Authentication error occurred.');
        ctx.status = 500;
        ctx.body = html;
        ctx.type = 'text/html';
        return;
      }
      if (!user) {
        const html = generateLoginHtml(ctx, 'Invalid Username or Password');
        ctx.status = 401;
        ctx.body = html;
        ctx.type = 'text/html';
        return;
      }
      ctx.login(user, function (loginError: unknown) {
        if (loginError) {
          console.error('Login error:', loginError);
          const html = generateLoginHtml(ctx, 'Login error occurred.');
          ctx.status = 500;
          ctx.body = html;
          ctx.type = 'text/html';
          return;
        }
        ctx.redirect('/rest/services');
      });
    })(ctx, next);
  });

  router.all('/rest/logout', async (ctx, next) => {
    if (ctx.method !== 'GET' && ctx.method !== 'POST') {
      ctx.status = 405; // Method Not Allowed
      return;
    }

    ctx.logout();
    ctx.body = generateLogoutHtml(ctx);
    ctx.type = 'text/html';
  });

  router.all('/rest/generateToken', async (ctx, next) => {
    // rewrite to /tokens endpoint
    ctx.path = '/tokens';
    await router.routes()(ctx, next);
  });

  router.get('/tokens', (ctx) => {
    ctx.body = generateTokenHtml(ctx);
    ctx.type = 'text/html';
  });

  router.post('/tokens', async (ctx, next) => {
    const parameters = ctx.request.body;
    if (typeof parameters !== 'object' || parameters === null) {
      ctx.status = 400;
      ctx.body = 'Invalid request body';
      return;
    }

    const format: unknown | 'html' | 'json' = parameters.f;
    if (format !== 'html' && format !== 'json') {
      ctx.status = 400;
      ctx.body = 'Invalid format specified';
      return;
    }

    function respondWithError(message: string) {
      if (format === 'json') {
        ctx.type = 'application/json';
        ctx.body = JSON.stringify({ error: message });
      } else {
        ctx.status = 400;
        ctx.body = `<html><body><h1>Error</h1><p>${message}</p></body></html>`;
        ctx.type = 'text/html';
      }
    }

    const username = parameters.username;
    if (typeof username !== 'string' || username.trim() === '') {
      respondWithError('Username is required');
      return;
    }

    const password = parameters.password;
    if (typeof password !== 'string' || password.trim() === '') {
      respondWithError('Password is required');
      return;
    }

    const client: unknown | 'referer' | 'ip' | 'requestip' = parameters.client || 'requestip';
    if (client !== 'referer' && client !== 'ip' && client !== 'requestip') {
      respondWithError('Invalid client specified');
      return;
    }

    const expiration = Number(parameters.expiration) || 60; // default to 60 minutes
    if (isNaN(expiration) || expiration <= 0) {
      respondWithError('Invalid expiration specified');
      return;
    }

    let referer: string | undefined = undefined;
    if (client === 'referer') {
      const _referer = parameters.referer;
      if (typeof _referer !== 'string' || _referer.trim() === '') {
        respondWithError('HTTP referer is required for client type "referer"');
        return;
      }
      referer = _referer;
    }

    let ip: string | undefined = undefined;
    if (client === 'ip') {
      const _ip = parameters.ip;
      if (typeof _ip !== 'string' || _ip.trim() === '') {
        respondWithError('IP is required for client type "ip"');
        return;
      }
      ip = _ip;
    }
    if (client === 'requestip') {
      ip = ctx.request.ip;
    }

    const tokenUser = await new Promise<Express.User>((resolve, reject) => {
      // the active directory strategy will use the username and password from the body
      passport.authenticate('ActiveDirectory', async (error, user: Express.User) => {
        if (error) {
          reject(error);
          return;
        }
        if (!user) {
          reject(new Error('Failed to get token user'));
          return;
        }
        resolve(user);
      })(ctx, next);
    }).catch((error) => {
      if (error instanceof Error) {
        return error;
      }
      return new Error(error || 'Unknown authentication error');
    });
    if (tokenUser instanceof Error) {
      console.error('Token authentication error:', tokenUser);
      respondWithError(`Authentication failed: ${tokenUser.message}`);
      return;
    }

    // create token
    const token = jwt.sign(
      {
        upn: tokenUser.userPrincipalName,
        audience: referer || ip || 'any',
      },
      jwtSecret,
      {
        expiresIn: expiration * 60, // expiration is in minutes, but expiresIn needs seconds
        issuer: 'campus-map-server',
        audience: referer || ip || 'any',
        subject: tokenUser.userPrincipalName,
      }
    );

    if (format === 'json') {
      ctx.type = 'application/json';
      ctx.body = JSON.stringify({ token: token, expires: Date.now() + expiration * 60 * 1000 });
      return;
    }

    ctx.body = generateTokenHtml(ctx, token);
    ctx.type = 'text/html';
  });
};

function generateLoginHtml(ctx: Context, errorMessage?: string) {
  const { document, body, titleElement } = initDoc('REST API Sign In');

  // write header
  const headerTables = generateServiceDirectoryHeader(
    { document, user: ctx.state.user },
    {
      serviceRootPathname: '/rest/services',
      currentPathname: ctx.path,
    }
  );
  headerTables.forEach((table) => body.appendChild(table));
  body.appendChild(titleElement);

  // body
  const rbody = document.createElement('div');
  rbody.setAttribute('class', 'rbody');
  body.appendChild(rbody);

  // error message
  if (errorMessage) {
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('style', 'color:#ff6666');
    errorDiv.appendChild(document.createTextNode(errorMessage));
    const br = document.createElement('br');
    errorDiv.appendChild(br);
    rbody.appendChild(errorDiv);
  }

  // form
  const form = document.createElement('form');
  form.setAttribute('method', 'POST');
  form.setAttribute('action', ctx.path);
  rbody.appendChild(form);

  const formTable = document.createElement('table');
  formTable.setAttribute('class', 'formTable');
  form.appendChild(formTable);

  const _createInput = createInput.bind(null, document);
  formTable.appendChild(_createInput('username', 'username', 'username', 'Username'));
  formTable.appendChild(_createInput('password', 'password', 'password', 'Password'));

  const submitRow = document.createElement('tr');
  const submitCell = document.createElement('td');
  submitCell.setAttribute('colspan', '2');
  submitCell.setAttribute('align', 'left');
  const submitButton = document.createElement('input');
  submitButton.setAttribute('type', 'submit');
  submitButton.setAttribute('value', 'Sign in');
  submitCell.appendChild(submitButton);
  submitRow.appendChild(submitCell);
  formTable.appendChild(submitRow);

  return document.toString();
}

function generateLogoutHtml(ctx: Context) {
  const { document, body, titleElement } = initDoc();

  // write header
  const headerTables = generateServiceDirectoryHeader(
    { document, user: ctx.state.user },
    {
      serviceRootPathname: '/rest/services',
      currentPathname: ctx.path,
    }
  );
  headerTables.forEach((table) => body.appendChild(table));
  body.appendChild(titleElement);

  // body
  const rbody = document.createElement('div');
  rbody.setAttribute('class', 'rbody');
  body.appendChild(rbody);

  // login link
  const loginLink = document.createElement('a');
  loginLink.setAttribute('href', '/rest/login');
  loginLink.appendChild(document.createTextNode('Sign in as a different user'));
  rbody.appendChild(loginLink);

  return document.toString();
}

function generateTokenHtml(ctx: Context, token?: string) {
  const { document, body, titleElement } = initDoc('Generate Token');

  // write header
  body.appendChild(titleElement);

  // body
  const rbody = document.createElement('div');
  rbody.setAttribute('class', 'gwDiv');
  body.appendChild(rbody);

  // form
  const form = document.createElement('form');
  form.setAttribute('method', 'POST');
  form.setAttribute('action', ctx.path);
  rbody.appendChild(form);

  const formTable = document.createElement('table');
  formTable.setAttribute('class', 'formTable');
  form.appendChild(formTable);

  const _createInput = createInput.bind(null, document);
  formTable.appendChild(_createInput('username', 'username', 'username', 'Username'));
  formTable.appendChild(_createInput('password', 'password', 'password', 'Password'));
  formTable.appendChild(
    _createInput('select', 'client', 'client', 'Client', [
      { label: 'HTTP Referer', value: 'referer' },
      { label: 'IP', value: 'ip' },
      { label: 'Request IP', value: 'requestip' },
    ])
  );
  formTable.appendChild(_createInput('referer', 'referer', 'referer', 'HTTP referer'));
  formTable.appendChild(_createInput('ip', 'ip', 'ip', 'IP'));
  formTable.appendChild(
    _createInput('select', 'expiration', 'expiration', 'Expiration', [
      { label: '1 hour', value: '60' },
      { label: '1 day', value: '1440' },
      { label: '1 week', value: '10080' },
      { label: '1 month', value: '43200' },
      { label: '1 year', value: '525600' },
    ])
  );
  formTable.appendChild(
    _createInput('select', 'f', 'f', 'Format', [
      { label: 'HTML', value: 'html' },
      { label: 'JSON', value: 'json' },
    ])
  );

  const submitRow = document.createElement('tr');
  const submitCell = document.createElement('td');
  submitCell.setAttribute('colspan', '2');
  submitCell.setAttribute('align', 'left');
  const submitButton = document.createElement('input');
  submitButton.setAttribute('type', 'submit');
  submitButton.setAttribute('value', 'Generate Token');
  submitCell.appendChild(submitButton);
  submitRow.appendChild(submitCell);
  formTable.appendChild(submitRow);

  // token table
  if (token) {
    const tokenTable = document.createElement('table');
    tokenTable.setAttribute('class', 'formTable');
    rbody.appendChild(tokenTable);

    const tokenRow = document.createElement('tr');
    const tokenLabelCell = document.createElement('td');
    tokenLabelCell.appendChild(document.createTextNode('Generated Token: '));
    tokenRow.appendChild(tokenLabelCell);

    const tokenValueCell = document.createElement('td');
    tokenValueCell.setAttribute('class', 'whiteTd');
    const tokenValue = document.createElement('b');
    tokenValue.appendChild(document.createTextNode(token));
    tokenValueCell.appendChild(tokenValue);
    tokenRow.appendChild(tokenValueCell);

    tokenTable.appendChild(tokenRow);
  }

  return document.toString();
}

function createInput(
  document: Document,
  type: string,
  name: string,
  id: string,
  label: string,
  options?: { label?: string; value: string }[]
) {
  const row = document.createElement('tr');
  row.setAttribute('valign', 'top');

  const labelCell = document.createElement('td');
  const labelElem = document.createElement('label');
  labelElem.setAttribute('for', id);
  labelElem.appendChild(document.createTextNode(`${label}: `));
  labelCell.appendChild(labelElem);
  row.appendChild(labelCell);

  const inputCell = document.createElement('td');

  if (type === 'select' && options) {
    const select = document.createElement('select');
    select.setAttribute('name', name);
    select.setAttribute('id', id);
    options.forEach((option) => {
      const optionElem = document.createElement('option');
      optionElem.setAttribute('value', option.value);
      optionElem.appendChild(document.createTextNode(option.label || option.value));
      select.appendChild(optionElem);
    });
    inputCell.appendChild(select);
  } else {
    const input = document.createElement('input');
    input.setAttribute('type', type);
    input.setAttribute('name', name);
    input.setAttribute('id', id);
    if (type === 'username' && name === 'username') {
      input.setAttribute('autofocus', 'true');
      input.setAttribute('autocomplete', 'username');
    }
    if (type === 'password' && name === 'password') {
      input.setAttribute('autocomplete', 'current-password');
    }
    inputCell.appendChild(input);
  }

  row.appendChild(inputCell);

  return row;
}

export async function requireToken(ctx: Context, next: Koa.Next) {
  if (!ctx.state.user) {
    ctx.status = 200;
    const code = 499;
    const message = 'Token Required';

    const acceptsJson = ctx.request.accepts('application/json') && !ctx.request.accepts('text/html');
    if (acceptsJson || ctx.request.query.f === 'json') {
      ctx.type = 'application/json';
      ctx.body = { error: { code, message, details: [] } };
    } else if (ctx.request.query.f === 'pjson') {
      ctx.type = 'text/plain';
      ctx.body = JSON.stringify({ error: { code, message, details: [] } }, null, 2);
    } else {
      ctx.type = 'text/html';

      ctx.body = (() => {
        const { document, body, titleElement } = initDoc('Access Denied');

        // write header
        const headerTables = generateServiceDirectoryHeader(
          { document, user: ctx.state.user },
          { serviceRootPathname: '/rest/services', currentPathname: ctx.path }
        );
        headerTables.forEach((table) => body.appendChild(table));
        body.appendChild(titleElement);

        // body
        const rbody = document.createElement('div');
        rbody.setAttribute('class', 'rbody');
        body.appendChild(rbody);

        // access denied message
        const messageElement = document.createElement('p');
        messageElement.appendChild(document.createTextNode(message));
        rbody.appendChild(messageElement);

        return document.toString();
      })();
    }

    return;
  }
  await next();
}

/**
 * Stores the userPrincipalName in the session cookie.
 */
passport.serializeUser(function (user, done) {
  done(null, user.userPrincipalName);
});

/**
 * Retrieves the full user details from Active Directory using the userPrincipalName stored in the session cookie.
 */
passport.deserializeUser(async (userPrincipalName: string, done) => {
  try {
    const user = await getUserByPrincipalName(activeDirectory, userPrincipalName);
    done(null, user);
  } catch (err) {
    done(err as Error);
  }
});

/**
 * Adds the handler for authentication using Active Directory.
 */
passport.use(
  new ActiveDirectoryStrategy({ integrated: false, ldap: activeDirectory }, async (profile, ad, done) => {
    if (!profile || !profile._json || !profile._json.dn) {
      return done(new Error('Invalid user profile returned from Active Directory.'));
    }
    if (!profile._json.userPrincipalName) {
      return done(new Error('User does not have a userPrincipalName attribute.'));
    }

    try {
      const user = await getUserByPrincipalName(ad, profile._json.userPrincipalName);
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  })
);

/**
 * Creates an Express.User object by querying Active Directory for the given userPrincipalName.
 */
async function getUserByPrincipalName(
  activeDirectory: ActiveDirectory,
  username: string
): Promise<Express.User> {
  const user = await new Promise<{
    distinguishedName: string;
    userPrincipalName: string;
    employeeId: string;
    displayName?: string;
    [key: string]: unknown;
  }>((resolve, reject) => {
    activeDirectory.findUser(username, function (err, user) {
      if (err) {
        return reject(err);
      }
      if (!user) {
        return reject(new Error('User not found'));
      }
      if (!('dn' in user) || typeof user.dn !== 'string') {
        return reject(new Error('User does not have a distinguished name (dn) attribute.'));
      }
      if (!('userPrincipalName' in user) || typeof user.userPrincipalName !== 'string') {
        return reject(new Error('User does not have a userPrincipalName attribute.'));
      }
      if (!('employeeID' in user) || typeof user.employeeID !== 'string') {
        return reject(new Error('User does not have an employeeID attribute.'));
      }
      if ('displayName' in user && typeof user.displayName !== 'string') {
        delete user.displayName;
      }
      return resolve({
        ...user,
        distinguishedName: user.dn,
        employeeId: user.employeeID,
        userPrincipalName: user.userPrincipalName,
        displayName: 'displayName' in user ? (user.displayName as string) : undefined,
      });
    });
  });

  // check if user is a member of the GIS Admins group
  const isGisAdmin = await new Promise<boolean>((resolve, reject) => {
    activeDirectory.isUserMemberOf(
      user.distinguishedName,
      'CN=GIS Admins,OU=File-Share-Groups,DC=fu,DC=campus',
      function (err, isMember) {
        if (err) {
          return reject(err);
        }
        return resolve(isMember);
      }
    );
  }).catch(() => false);

  return {
    ...user,
    isGisAdmin,
  };
}
