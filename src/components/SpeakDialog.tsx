import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Square, X } from 'lucide-react';
import { assessSpeech, type Assessment, type SpeechPrompt } from '../utils/speechAssessment';

type SpeechState =
  | { kind: 'ready' | 'starting' | 'scoring' }
  | { kind: 'recording'; stop: () => void }
  | { kind: 'result'; result: Assessment }
  | { kind: 'error'; message: string };

const gradeLabels = {
  retry: { label: 'Keep Practicing', className: 'bg-amber-50 text-amber-900' },
  good: { label: 'Good Job!', className: 'bg-indigo-50 text-indigo-800' },
  great: { label: 'Great Job!', className: 'bg-emerald-50 text-emerald-800' },
};

const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer';

export function SpeakDialog({ prompt, onClose }: { prompt: SpeechPrompt; onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<AbortController | null>(null);
  const [state, setState] = useState<SpeechState>({ kind: 'ready' });
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      attempt.current?.abort();
      element?.close();
    };
  }, []);

  const startRecording = () => {
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    setPlaybackError(false);
    setState({ kind: 'starting' });
    void assessSpeech(prompt, controller.signal, {
      onRecording: (stop) => setState({ kind: 'recording', stop }),
      onScoring: () => setState({ kind: 'scoring' }),
      onResult: (result) => setState({ kind: 'result', result }),
      onError: (message) => setState({ kind: 'error', message }),
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not start speech scoring.' });
    });
  };

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[390px] rounded-[28px] border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/45"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="font-display text-2xl font-extrabold">Speak</h2>
        <button type="button" onClick={onClose} aria-label="Close speech practice" className="-mt-2 -mr-2 inline-flex size-11 items-center justify-center rounded-2xl text-slate-600 hover:bg-slate-100 cursor-pointer">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 font-display text-xl font-bold leading-snug text-indigo-800">{prompt.text}</p>

      <div className="mt-5">
        {state.kind === 'ready' && (
          <>
            <p className="mb-4 text-sm text-slate-600">Your recording is sent to Alibaba Cloud for scoring and playback.</p>
            <button type="button" className={actionClass} onClick={startRecording}>
              <Mic className="size-4" aria-hidden="true" />
              Start Recording
            </button>
          </>
        )}
        {state.kind === 'starting' && <p role="status" className="text-sm text-slate-600">Opening microphone…</p>}
        {state.kind === 'recording' && (
          <>
            <p role="status" className="mb-3 text-sm font-semibold text-rose-700">Recording…</p>
            <button type="button" onClick={state.stop} className={actionClass}>
              <Square className="size-4" aria-hidden="true" />
              Stop Recording
            </button>
          </>
        )}
        {state.kind === 'scoring' && <p role="status" className="text-sm text-slate-600">Scoring…</p>}
        {state.kind === 'error' && (
          <>
            <p role="alert" className="mb-4 text-sm text-slate-700">{state.message}</p>
            <button type="button" className={actionClass} onClick={startRecording}>Try Again</button>
          </>
        )}
        {state.kind === 'result' && (
          <>
            <p role="status" className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 font-semibold ${gradeLabels[state.result.grade].className}`}>
              <span>{gradeLabels[state.result.grade].label}</span>
              <span className="tabular-nums">{state.result.score} / 100</span>
            </p>
            {state.result.recordingUrl && !playbackError ? (
              <div className="mt-4">
                <p className="mb-1.5 text-sm font-semibold text-slate-700">My Recording</p>
                <audio controls preload="none" aria-label="My Recording" className="w-full" src={state.result.recordingUrl} onError={() => setPlaybackError(true)} />
              </div>
            ) : (
              <p role="status" className="mt-4 text-sm text-slate-600">Recording playback is unavailable.</p>
            )}
            {state.result.grade === 'retry' && (
              <button type="button" onClick={startRecording} className={`mt-4 ${actionClass}`}>Try Again</button>
            )}
          </>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
