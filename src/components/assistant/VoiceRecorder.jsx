import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Sprachaufnahme im Browser.
 *
 * Der wichtigste Eingabeweg auf der Baustelle: mit Handschuhen tippt niemand
 * einen Tagesbericht. Die Aufnahme geht als Datei an die Erfassung und wird
 * dort abgetippt.
 *
 * Safari braucht audio/mp4, Chrome und Firefox liefern audio/webm. Wird kein
 * Format unterstützt, verschwindet die Aufnahme statt kaputt anzubieten –
 * Text und Fotos gehen weiterhin.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? null;
};

const extensionFor = (mimeType) => {
  if (mimeType?.includes('mp4')) return 'm4a';
  if (mimeType?.includes('ogg')) return 'ogg';
  return 'webm';
};

const formatDuration = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function VoiceRecorder({ file, onChange, disabled }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [supported, setSupported] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    setSupported(Boolean(pickMimeType()) && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
  }, []);

  // Die Adresse zum Abspielen gehört an den Lebenszyklus der Datei: sonst
  // bleibt bei jeder neuen Aufnahme die alte im Speicher liegen.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const startRecording = async () => {
    const mimeType = pickMimeType();
    if (!mimeType) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const name = `sprachnachricht-${Date.now()}.${extensionFor(mimeType)}`;
        onChange(new File([blob], name, { type: mimeType }));
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (error) {
      console.error(error);
      toast.error('Kein Zugriff auf das Mikrofon. Bitte in den Browsereinstellungen erlauben.');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const discard = () => {
    setPlaying(false);
    setSeconds(0);
    onChange(null);
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  if (!supported) {
    return (
      <p className="text-sm text-slate-500">
        Dieser Browser kann keine Sprachaufnahmen aufzeichnen. Text und Fotos gehen trotzdem.
      </p>
    );
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Button type="button" variant="outline" size="icon" onClick={togglePlayback} disabled={disabled}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">Sprachaufnahme</p>
          <p className="text-xs text-slate-500">{formatDuration(seconds)} · wird beim Senden abgetippt</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={discard} disabled={disabled}>
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
        <audio
          ref={audioRef}
          src={previewUrl ?? undefined}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant={recording ? 'destructive' : 'outline'}
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled}
      className="h-14 w-full text-base"
    >
      {recording ? (
        <>
          <Square className="mr-2 h-5 w-5" />
          Aufnahme beenden ({formatDuration(seconds)})
        </>
      ) : (
        <>
          <Mic className="mr-2 h-5 w-5" />
          Sprachnachricht aufnehmen
        </>
      )}
    </Button>
  );
}
