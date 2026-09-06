import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Verify JWT signed with JWT_SECRET (HS256)
async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const data = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

  return payload;
}

Deno.serve(async (req) => {
  const jwtSecret = Deno.env.get('JWT_SECRET');
  const apiKey = Deno.env.get('SECONDARY_APP_API_KEY');

  // Auth: accept either API key or valid JWT
  const headerApiKey = req.headers.get('x-api-key');
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let authenticated = false;

  if (headerApiKey && headerApiKey === apiKey) {
    authenticated = true;
  } else if (bearerToken && jwtSecret) {
    try {
      await verifyJWT(bearerToken, jwtSecret);
      authenticated = true;
    } catch {
      // invalid token
    }
  }

  if (!authenticated) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse which entity to fetch from query params or body
  const url = new URL(req.url);
  let entity = url.searchParams.get('entity');

  if (!entity && req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    entity = body.entity;
  }

  const base44 = createClientFromRequest(req);

  // Supported entities
  const supportedEntities = [
    'User', 'Employee', 'Project', 'Assignment', 'Vehicle',
    'TempWorker', 'TempAssignment', 'Role', 'LeaveRequest',
    'WorkshopTask', 'News', 'WeeklyReport'
  ];

  if (entity) {
    // Single entity fetch
    if (!supportedEntities.includes(entity)) {
      return Response.json({ error: `Entity '${entity}' not supported. Supported: ${supportedEntities.join(', ')}` }, { status: 400 });
    }
    const data = await base44.asServiceRole.entities[entity].list();
    return Response.json({ entity, data, count: data.length });
  }

  // No entity specified → return all
  const results = {};
  await Promise.all(
    supportedEntities.map(async (name) => {
      results[name] = await base44.asServiceRole.entities[name].list();
    })
  );

  return Response.json({ data: results });
});