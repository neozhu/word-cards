import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mic, Play, RotateCcw, Sparkles, Square, Star } from 'lucide-react';
import { recordSpeech } from '../utils/localSpeechRecording';
import {
  assessSpeech,
  getDemoAssessment,
  warmSpeechAssessment,
  type Assessment,
  type SpeechPrompt,
} from '../utils/speechAssessment';
import { soundEngine } from '../utils/soundEngine';

export interface PracticeResult extends Assessment {
  audio: Blob | null;
  demo: boolean;
}

type PracticeState =
  | { kind: 'idle' | 'preparing' | 'checking' }
  | { kind: 'recording'; prompt: SpeechPrompt }
  | { kind: 'result'; result: PracticeResult };

type LevelListener = (level: number | null) => void;

const grades = {
  retry: { label: 'Try again!', stars: 1, strip: 'border-amber-200 bg-amber-50 text-amber-900', badge: 'bg-amber-700' },
  good: { label: 'Good job!', stars: 2, strip: 'border-indigo-200 bg-indigo-50 text-indigo-900', badge: 'bg-indigo-600' },
  great: { label: 'Awesome!', stars: 3, strip: 'border-emerald-200 bg-emerald-50 text-emerald-900', badge: 'bg-emerald-700' },
};

export function useSpeechPractice(
  isPresent: boolean,
  isFlipped: boolean,
  stopListen: () => void,
  onResult: (result: PracticeResult) => void
) {
  const [state, setState] = useState<PracticeState>({ kind: 'idle' });
  const [playing, setPlaying] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [micNotice, setMicNotice] = useState('');
  const lastResult = useRef<PracticeResult | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const stopRecording = useRef<(() => void) | null>(null);
  const releaseVoice = useRef<(() => void) | null>(null);
  const levelRef = useRef<number | null>(null);
  const levelListeners = useRef(new Set<LevelListener>());
  const stateKindRef = useRef<PracticeState['kind']>('idle');
  stateKindRef.current = state.kind;

  const setLevel = useCallback((next: number | null) => {
    levelRef.current = next;
    levelListeners.current.forEach((listener) => listener(next));
  }, []);

  const getLevel = useCallback(() => levelRef.current, []);

  const subscribeLevel = useCallback((listener: LevelListener) => {
    levelListeners.current.add(listener);
    return () => {
      levelListeners.current.delete(listener);
    };
  }, []);

  useLayoutEffect(() => {
    lastResult.current = null;
    attempt.current = null;
    stopRecording.current = null;
    setLevel(null);
    setPlaying(false);
    setPlaybackFailed(false);
    setMicNotice('');
    setState({ kind: 'idle' });
    return () => {
      attempt.current?.abort();
      attempt.current = null;
      releaseVoice.current?.();
      releaseVoice.current = null;
      stopRecording.current = null;
    };
  }, [isPresent, isFlipped, setLevel]);

  const stopVoice = useCallback(() => {
    releaseVoice.current?.();
    releaseVoice.current = null;
    setPlaying(false);
  }, []);

  const prepareListen = useCallback(() => {
    stopVoice();
    setMicNotice('');
    const kind = stateKindRef.current;
    if (kind !== 'preparing' && kind !== 'recording' && kind !== 'checking') return;
    attempt.current?.abort();
    attempt.current = null;
    stopRecording.current = null;
    setLevel(null);
    setState(lastResult.current ? { kind: 'result', result: lastResult.current } : { kind: 'idle' });
  }, [setLevel, stopVoice]);

  const start = async (prompt: SpeechPrompt) => {
    stopListen();
    stopVoice();
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    const { signal } = controller;

    setPlaybackFailed(false);
    setMicNotice('');
    setLevel(null);
    setState({ kind: 'preparing' });
    soundEngine.playTabClick();
    warmSpeechAssessment();

    const recording = recordSpeech({
      limit: prompt.kind === 'word' ? 3600 : 10000,
      signal,
      onStarted: () => {
        if (!signal.aborted) {
          setState({ kind: 'recording', prompt });
        }
      },
      onChecking: () => {
        stopRecording.current = null;
        if (!signal.aborted) {
          setLevel(null);
          setState({ kind: 'checking' });
        }
      },
      onLevel: setLevel,
    });
    stopRecording.current = recording.stop;

    const capture = await recording.result;
    if (signal.aborted) return;
    if (!capture) {
      setLevel(null);
      setState(lastResult.current ? { kind: 'result', result: lastResult.current } : { kind: 'idle' });
      return;
    }

    if (capture.unavailableReason === 'permission-denied') {
      setLevel(null);
      setMicNotice('Microphone access is blocked. Allow mic permission to practice.');
      setState(lastResult.current ? { kind: 'result', result: lastResult.current } : { kind: 'idle' });
      return;
    }

    let assessment: Assessment | undefined;
    if (capture.audio) {
      try {
        assessment = await assessSpeech(prompt, capture.audio, signal);
      } catch {
        if (signal.aborted) return;
      }
    }
    const demo = !assessment;
    if (demo) {
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, 420);
        function done() {
          window.clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done, { once: true });
      });
    }
    if (signal.aborted) return;
    const result = { ...(assessment ?? getDemoAssessment(capture.duration)), audio: capture.audio, demo };
    lastResult.current = result;
    setState({ kind: 'result', result });
    onResult(result);
  };

  const toggleVoice = (result: PracticeResult) => {
    if (releaseVoice.current) {
      stopVoice();
      return;
    }
    stopListen();
    setPlaybackFailed(false);
    setPlaying(true);
    if (!result.audio) {
      const timer = window.setTimeout(stopVoice, 1100);
      releaseVoice.current = () => window.clearTimeout(timer);
      return;
    }
    const url = URL.createObjectURL(result.audio);
    const player = new Audio(url);
    const release = () => {
      player.onended = null;
      player.onerror = null;
      player.pause();
      player.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
    releaseVoice.current = release;
    const fail = () => {
      if (releaseVoice.current !== release) return;
      stopVoice();
      setPlaybackFailed(true);
    };
    player.onended = stopVoice;
    player.onerror = fail;
    void player.play().catch(fail);
  };

  return {
    state,
    playing,
    playbackFailed,
    micNotice,
    subscribeLevel,
    getLevel,
    prepareListen,
    start,
    toggleVoice,
    stop: () => stopRecording.current?.(),
  };
}

function VoiceBars({
  subscribeLevel,
  getLevel,
}: {
  subscribeLevel?: (listener: LevelListener) => () => void;
  getLevel?: () => number | null;
}) {
  const reducedMotion = useReducedMotion();
  const [level, setLevel] = useState<number | null>(() => getLevel?.() ?? null);

  useEffect(() => {
    if (!subscribeLevel) return;
    setLevel(getLevel?.() ?? null);
    return subscribeLevel(setLevel);
  }, [subscribeLevel, getLevel]);

  return (
    <span aria-hidden="true" className="inline-flex h-4 w-3.5 shrink-0 items-center justify-center gap-0.5">
      {[0.65, 1, 0.78].map((height, index) => (
        <motion.span key={height}
          className="h-full w-0.5 rounded-full bg-current"
          animate={{ scaleY: reducedMotion ? height : level === null ? [0.25, height, 0.35] : (0.18 + level * 0.82) * height }}
          transition={reducedMotion || level !== null ? { duration: 0.08 } : { duration: 0.65, delay: index * 0.12, repeat: Infinity }}
        />
      ))}
    </span>
  );
}

export function SpeakPractice({ prompt, word, practice, notice, noticeTestId, listen }: {
  prompt: SpeechPrompt;
  word: string;
  practice: ReturnType<typeof useSpeechPractice>;
  notice: string;
  noticeTestId?: string;
  listen: ReactNode;
}) {
  const { state, playing, playbackFailed, micNotice, subscribeLevel, getLevel } = practice;
  const reducedMotion = useReducedMotion();
  const result = state.kind === 'result' ? state.result : null;
  const grade = result ? grades[result.grade] : null;
  const isPreparing = state.kind === 'preparing';
  const isRecording = state.kind === 'recording';
  const isChecking = state.kind === 'checking';
  const high = result?.grade === 'great';
  const low = result?.grade === 'retry';
  const activeNotice = notice || micNotice;
  const actionColor = isRecording ? 'bg-rose-600 text-white hover:bg-rose-700'
    : isPreparing || isChecking ? 'bg-amber-100 text-amber-900'
    : high ? 'bg-emerald-700 text-white hover:bg-emerald-800'
    : low ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
    : 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 active:bg-indigo-800';

  return (
    <div role="region" aria-label="Speech practice" className="mx-auto w-full max-w-[330px] space-y-1.5">
      <div className="grid grid-cols-2 gap-2.5">
        {listen}
        <motion.button
          type="button"
          disabled={isChecking}
          onClick={isRecording || isPreparing ? practice.stop : () => void practice.start(prompt)}
          className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl px-2.5 py-2 text-sm font-semibold cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${actionColor}`}
          animate={reducedMotion ? undefined : {
            scale: high ? [1, 1.06, 1] : 1,
            x: low ? [0, -3, 3, -2, 2, 0] : 0,
            boxShadow: isRecording ? ['0 0 0 2px #fb718580', '0 0 0 5px #fb718535', '0 0 0 2px #fb718580'] : '0 0 0 0px #fb718500',
          }}
          transition={{ scale: { duration: 0.32 }, x: { duration: 0.38 }, boxShadow: { duration: 1.35, repeat: isRecording ? Infinity : 0 } }}
        >
          {isRecording ? <><Square className="size-3.5 fill-current" aria-hidden="true" /> Stop <VoiceBars subscribeLevel={subscribeLevel} getLevel={getLevel} /></>
            : isPreparing ? <><Mic className="size-4" aria-hidden="true" /> Starting...</>
            : isChecking ? 'Checking'
            : high ? <><Sparkles className="size-4" aria-hidden="true" /> Perfect!</>
            : low ? <><RotateCcw className="size-4" aria-hidden="true" /> Try Again</>
            : <><Mic className="size-4" aria-hidden="true" /> Speak</>}
        </motion.button>
      </div>

      <div className="flex min-h-10 items-center justify-center">
        {isPreparing && (
          <p role="status" className="text-center text-xs font-semibold text-amber-800">
            Allow microphone access...
          </p>
        )}
        {isRecording && (
          <p role="status" className="text-center text-xs font-semibold text-rose-700">
            {state.prompt.kind === 'word' ? `Say “${word}” out loud...` : 'Read the sentence aloud...'}
          </p>
        )}
        {isChecking && <p role="status" className="text-center text-xs font-semibold text-amber-800">Scoring pronunciation...</p>}
        {result && grade && (
          <div className={`flex min-h-10 w-full items-center justify-between gap-1 rounded-2xl border px-1.5 py-0.5 ${grade.strip}`}>
            <p role="status" className="flex min-w-0 items-center gap-1 text-[11px] font-semibold sm:gap-1.5 sm:text-xs">
              <span className={`min-w-6 rounded-lg px-1.5 py-0.5 text-center text-white tabular-nums ${grade.badge}`}>
                {result.score}<span className="sr-only"> out of 100</span>
              </span>
              <span className="inline-flex shrink-0 gap-0.5" aria-hidden="true">
                {[1, 2, 3].map((star) => <Star key={star} className={`size-3 ${star <= grade.stars ? 'fill-current' : 'opacity-35'}`} />)}
              </span>
              <span className="sr-only">{grade.stars} out of 3 stars</span>
              <span className="truncate">{grade.label}</span>
              {result.demo && <span className="shrink-0 rounded bg-white/70 px-1 text-[9px] uppercase">Demo</span>}
            </p>
            <button type="button" onClick={() => practice.toggleVoice(result)} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-current/20 bg-white/75 px-2 text-[11px] font-semibold cursor-pointer hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-xs">
              {playing ? <Square className="size-3 fill-current" aria-hidden="true" /> : <Play className="size-3 fill-current" aria-hidden="true" />}
              {playing ? 'Playing' : 'My Voice'}{playing && <VoiceBars />}
            </button>
          </div>
        )}
        {state.kind === 'idle' && (activeNotice ? (
          <p role="status" data-testid={noticeTestId} className="text-center text-xs font-medium text-indigo-700">{activeNotice}</p>
        ) : (
          <p className="text-center text-xs text-slate-500">{prompt.kind === 'word' ? 'Tap card to flip' : 'Tap card to flip back'}</p>
        ))}
      </div>
      {state.kind !== 'idle' && activeNotice && (
        <p role="status" data-testid={noticeTestId} className="text-center text-xs font-medium text-indigo-700">{activeNotice}</p>
      )}
      {playbackFailed && <p role="status" className="text-center text-xs text-amber-800">Could not play your recording.</p>}
    </div>
  );
}
