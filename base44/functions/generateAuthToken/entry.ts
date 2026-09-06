import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Simple JWT signing using Web Crypto API (no external lib needed)
async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const data = `${headerB64}.${payloadB64}`;
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${data}.${sigB64}`;
}

Deno.serve(async (req) => {
  // Validate API key
  const apiKey = req.headers.get('x-api-key');
  if (apiKey !== Deno.env.get('SECONDARY_APP_API_KEY')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jwtSecret = Deno.env.get('JWT_SECRET');
  if (!jwtSecret) {
    return Response.json({ error: 'JWT_SECRET not configured' }, { status: 500 });
  }

  const base44 = createClientFromRequest(req);

  // Fetch users and employees
  const [users, employees, roles] = await Promise.all([
    base44.asServiceRole.entities.User.list(),
    base44.asServiceRole.entities.Employee.list(),
    base44.asServiceRole.entities.Role.list(),
  ]);

  const payload = {
    iss: 'leniger-disposition',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    data: {
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        role_id: u.role_id,
        is_approved: u.is_approved,
      })),
      employees: employees.map(e => ({
        id: e.id,
        full_name: e.full_name,
        employee_type: e.employee_type,
        abbreviation: e.abbreviation,
        is_active: e.is_active,
        is_ef: e.is_ef,
      })),
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        is_admin: r.is_admin,
        allowed_pages: r.allowed_pages,
      })),
    }
  };

  const token = await signJWT(payload, jwtSecret);

  return Response.json({ token, expires_in: 3600 });
});