/**
 * Fachliche Frage an die Wissensdatenbank.
 *
 * Antwortet ausschließlich aus hinterlegten Unterlagen. Findet sich nichts,
 * kommt das ausdrücklich zurück - nicht eine Antwort aus dem Modellwissen.
 * Wie das sichergestellt wird, steht in _shared/knowledge.ts.
 */

import { corsHeaders, jsonResponse, requireApprovedCaller, serviceRoleClient } from '../_shared/context.ts';
import { isConfigured } from '../_shared/ai.ts';
import { answerQuestion } from '../_shared/knowledge.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  if (!isConfigured()) {
    return jsonResponse({ error: 'Die KI-Dienste sind nicht eingerichtet.' }, 503);
  }

  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== 'string' || question.trim().length < 3) {
    return jsonResponse({ error: 'Bitte eine Frage eingeben.' }, 400);
  }

  try {
    const antwort = await answerQuestion(serviceRoleClient(), {
      question,
      channel: 'web',
      createdBy: check.caller.email,
    });
    return jsonResponse({ success: true, ...antwort });
  } catch (error) {
    console.error('Frage fehlgeschlagen:', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
