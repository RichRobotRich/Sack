# Fix für Secondary App: webhookPlanProSync

Das Problem: `base44.asServiceRole.users` existiert nicht.
`inviteUser` ist nur über `base44.users` verfügbar – aber das benötigt einen Auth-Context.

## Lösung: BASE44_SERVICE_TOKEN verwenden

In der Secondary App muss die Funktion so aussehen:

```js
import { createClient } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const apiKey = req.headers.get('x-api-key') || req.headers.get('api_key');
        const expectedKey = Deno.env.get('SECONDARY_APP_API_KEY');

        if (!apiKey || apiKey !== expectedKey) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { email, planpro } = await req.json();

        if (!email) {
            return Response.json({ error: 'Missing email' }, { status: 400 });
        }

        const base44 = createClient({
            appId: Deno.env.get('BASE44_APP_ID'),
        });

        if (planpro === true) {
            await base44.users.inviteUser(email, 'user');
            return Response.json({ success: true, action: 'invited', email });
        } else {
            const users = await base44.asServiceRole.entities.User.filter({ email });
            const user = users?.[0];

            if (user && user.role !== 'admin') {
                await base44.asServiceRole.entities.User.delete(user.id);
                return Response.json({ success: true, action: 'removed', email });
            }

            return Response.json({ success: true, action: 'skipped', email });
        }
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
``