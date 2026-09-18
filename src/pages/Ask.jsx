import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Search, Loader2, FileText, ThumbsUp, ThumbsDown, AlertCircle, History,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

/**
 * Fachliche Fragen an die hinterlegten Firmenunterlagen.
 *
 * Findet sich keine Quelle, steht das hier ausdrücklich – und zwar sichtbar
 * anders als eine Antwort. Das ist der ganze Zweck: eine erfundene Angabe zu
 * einem Prüfdruck ist auf der Baustelle gefährlicher als keine Angabe.
 */

const BEISPIELE = [
  'Welcher Prüfdruck gilt bei der Dichtheitsprüfung?',
  'Mindestgefälle bei Abwasserleitungen DN 100?',
  'Welche Dämmstärke bei Heizungsrohren im unbeheizten Keller?',
];

export default function Ask() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  const loadHistory = () => {
    api.entities.KnowledgeQuery.list('-created_date')
      .then((rows) => setHistory(rows.slice(0, 10)))
      .catch(() => { /* Verlauf ist Beiwerk – ohne ihn geht es auch */ });
  };

  useEffect(() => { loadHistory(); }, []);

  const ask = async (text) => {
    const frage = (text ?? question).trim();
    if (frage.length < 3) {
      toast.error('Bitte eine Frage eingeben.');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await api.functions.invoke('askKnowledge', { question: frage });
      setResult({ ...response.data, question: frage });
      loadHistory();
    } catch (error) {
      toast.error(error.message ?? 'Die Frage konnte nicht beantwortet werden.');
    } finally {
      setLoading(false);
    }
  };

  const rate = async (id, feedback) => {
    try {
      await api.entities.KnowledgeQuery.update(id, { feedback });
      toast.success('Danke');
      loadHistory();
    } catch (error) {
      toast.error(`Rückmeldung fehlgeschlagen: ${error.message}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fragen</h1>
        <p className="text-sm text-slate-500">
          Antworten kommen ausschließlich aus den hinterlegten Firmenunterlagen.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) ask();
            }}
            placeholder="Welcher Prüfdruck gilt bei der Dichtheitsprüfung?"
            rows={3}
            disabled={loading}
          />
          <Button onClick={() => ask()} disabled={loading} className="h-12 w-full text-base">
            {loading ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Sucht in den Unterlagen …</>
            ) : (
              <><Search className="mr-2 h-5 w-5" /> Fragen</>
            )}
          </Button>

          {!result && !loading && (
            <div className="flex flex-wrap gap-2 pt-1">
              {BEISPIELE.map((beispiel) => (
                <button
                  key={beispiel}
                  type="button"
                  onClick={() => { setQuestion(beispiel); ask(beispiel); }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {beispiel}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {result && <AnswerCard result={result} />}

      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-2 pt-2 text-sm font-medium text-slate-600">
            <History className="h-4 w-4" /> Zuletzt gefragt
          </h2>
          {history.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-1 py-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-slate-800 hover:underline"
                    onClick={() => { setQuestion(item.question); ask(item.question); }}
                  >
                    {item.question}
                  </button>
                  {!item.answered && (
                    <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">
                      ohne Quelle
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{format(parseISO(item.created_date), 'd. MMM, HH:mm', { locale: de })}</span>
                  {item.channel === 'whatsapp' && <span>WhatsApp</span>}
                  {item.answered && (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => rate(item.id, 'hilfreich')} aria-label="hilfreich">
                        <ThumbsUp className={`h-3.5 w-3.5 ${item.feedback === 'hilfreich' ? 'text-green-600' : 'text-slate-300'}`} />
                      </button>
                      <button type="button" onClick={() => rate(item.id, 'nicht_hilfreich')} aria-label="nicht hilfreich">
                        <ThumbsDown className={`h-3.5 w-3.5 ${item.feedback === 'nicht_hilfreich' ? 'text-red-600' : 'text-slate-300'}`} />
                      </button>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerCard({ result }) {
  if (!result.answered) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-medium text-amber-900">Keine passenden Informationen gefunden</p>
            <p className="text-sm text-amber-800">
              In den hinterlegten Unterlagen steht dazu nichts. Es wird bewusst nicht geraten –
              bitte im Büro nachfragen, und das Dokument gegebenenfalls der Wissensdatenbank
              hinzufügen.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="whitespace-pre-wrap text-slate-900">{result.answer}</p>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Quellen</p>
          {result.sources.map((source) => (
            <div key={source.chunk_id} className="flex items-start gap-2 text-sm">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="text-slate-700">
                {source.web_url ? (
                  <a href={source.web_url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    {source.title}
                  </a>
                ) : source.title}
                {source.page ? `, Seite ${source.page}` : ''}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
