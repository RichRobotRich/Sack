import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Alle Assignments mit vehicle_id ab heute laden und bereinigen
    const allAssignments = await base44.asServiceRole.entities.Assignment.list();
    const toReset = allAssignments.filter(a => a.vehicle_id && a.date >= todayStr);

    if (toReset.length === 0) {
      return Response.json({ message: 'Keine Einträge zu bereinigen', count: 0 });
    }

    await Promise.all(toReset.map(a =>
      base44.asServiceRole.entities.Assignment.update(a.id, { vehicle_id: null })
    ));

    return Response.json({ message: `${toReset.length} Fahrzeugzuweisungen ab heute entfernt`, count: toReset.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});