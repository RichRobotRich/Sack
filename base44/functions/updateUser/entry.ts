import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Nur Admins dürfen andere Benutzer aktualisieren
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { user_id, role_id, employee_id, is_approved, location, role, planpro } = await req.json();

    if (!user_id) {
      return Response.json({ error: 'user_id is required' }, { status: 400 });
    }

    const updateData = {};
    
    if (role_id !== undefined) updateData.role_id = role_id;
    if (employee_id !== undefined) updateData.employee_id = employee_id;
    if (is_approved !== undefined) {
      updateData.is_approved = is_approved;
      if (is_approved) {
        updateData.approved_by = user.email;
        updateData.approved_at = new Date().toISOString();
      }
    }
    if (location !== undefined) updateData.location = location;
    if (role !== undefined) updateData.role = role;
    if (planpro !== undefined) updateData.planpro = planpro;

    await base44.asServiceRole.entities.User.update(user_id, updateData);

    // Webhook an Bau-App senden wenn planpro sich ändert
    if (planpro !== undefined) {
      const webhookUrl = Deno.env.get('SECONDARY_APP_WEBHOOK_URL');
      const apiKey = Deno.env.get('SECONDARY_APP_API_KEY');
      
      console.log('[planpro webhook] planpro changed to:', planpro);
      console.log('[planpro webhook] webhookUrl:', webhookUrl ? 'SET' : 'NOT SET');
      console.log('[planpro webhook] apiKey:', apiKey ? 'SET' : 'NOT SET');
      
      if (webhookUrl && apiKey) {
        const updatedUser = await base44.asServiceRole.entities.User.get(user_id);
        console.log('[planpro webhook] sending to:', webhookUrl, 'for email:', updatedUser.email);
        
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api_key': apiKey
          },
          body: JSON.stringify({
            email: updatedUser.email,
            planpro: planpro
          })
        });
        
        const responseText = await webhookResponse.text();
        console.log('[planpro webhook] response status:', webhookResponse.status, 'body:', responseText);
      } else {
        console.warn('[planpro webhook] Skipped: missing webhookUrl or apiKey');
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});