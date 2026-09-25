import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Copy,
  Check,
  Sparkles,
  RotateCcw,
  Volume2,
  AlertCircle,
  ShieldCheck,
  FileText,
  Clock,
  ChevronDown,
  Info,
  Wand2,
  SlidersHorizontal,
  Edit3,
} from 'lucide-react';
import { speechRecorder } from './services/speechRecognitionService.ts';
import { refineTranscript } from './services/aiService.ts';
import { SAMPLE_SPEECHES } from './services/sampleData.ts';
import AudioWaveIndicator from './components/AudioWaveIndicator.tsx';
import StageProgress from './components/StageProgress.tsx';
import TranscriptDiff from './components/TranscriptDiff.tsx';
import { RecordingState, SampleSpeech } from './types.ts';

export default function App() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [refinedTranscript, setRefinedTranscript] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSamples, setShowSamples] = useState<boolean>(false);
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(false);
  const [showDiff, setShowDiff] = useState<boolean>(false);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timer on unmount
  useEffect(() => {
    const desktop = window.cleanSpeechDesktop;
    const removeStartListener = desktop?.onStartRecording(() => {
      console.log('[desktop] START received');
      void handleStartRecording();
    });
    const removeStopListener = desktop?.onStopRecording(() => {
      console.log('[desktop] STOP received');
      void handleStopRecording();
    });

    return () => {
      removeStartListener?.();
      removeStopListener?.();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      speechRecorder.cancel();
    };
  }, []);

  // Format recording seconds into mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const statusDetails = {
    idle: {
      label: rawTranscript ? 'Ready for another recording' : 'Ready to record',
      detail: 'Press Record or hold Ctrl+Shift+Space to begin.',
      color: 'slate',
    },
    recording: {
      label: 'Recording your voice',
      detail: 'Speak naturally. Release the shortcut or press Stop when finished.',
      color: 'rose',
    },
    transcribing: {
      label: 'Transcribing locally with Whisper',
      detail: 'Your audio is being processed on this computer. This can take a moment on the first run.',
      color: 'indigo',
    },
    refining: {
      label: 'Cleaning up your transcript',
      detail: 'Preserving your meaning while removing speech stumbles and filler words.',
      color: 'indigo',
    },
    error: {
      label: 'Something needs attention',
      detail: 'Check the notice below and try again.',
      color: 'rose',
    },
  }[recordingState];

  useEffect(() => {
    window.cleanSpeechDesktop?.setOverlayStatus(
      recordingState,
      statusDetails.label,
      statusDetails.detail,
      recordingState === 'recording' ? recordingTime : 0,
    );
  }, [recordingState, recordingTime, statusDetails.detail, statusDetails.label]);

  // Start recording
  const handleStartRecording = async () => {
    setErrorMessage(null);
    setRawTranscript('');
    setRefinedTranscript('');
    setCopied(false);
    setRecordingTime(0);
    setIsEditingRaw(false);

    try {
      setRecordingState('recording');

      // Start elapsed timer
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      await speechRecorder.startRecording(
        (text) => {
          setRawTranscript(text);
        },
        (errorMsg) => {
          setErrorMessage(errorMsg);
        }
      );
    } catch (err: any) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setRecordingState('idle');
      setErrorMessage(err.message || 'Could not access microphone. Please grant permission in your browser.');
    }
  };

  // Stop recording and process two stages
  const handleStopRecording = async () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    try {
      // Stage 1: Obtain Raw Transcript
      setRecordingState('transcribing');

      const capturedRawText = await speechRecorder.stopRecording();
      const cleanRaw = capturedRawText.trim();
      setRawTranscript(cleanRaw);

      if (!cleanRaw) {
        throw new Error('No speech was detected in your recording. Please try speaking again.');
      }

      // Stage 2: AI Refinement Layer
      await runAiRefinement(cleanRaw);
    } catch (err: any) {
      setRecordingState('idle');
      setErrorMessage(err.message || 'An error occurred during transcription.');
    }
  };

  // Run Stage 2 AI Refinement
  const runAiRefinement = async (textToRefine: string) => {
    setRecordingState('refining');
    setErrorMessage(null);

    try {
      const refined = await refineTranscript(textToRefine);
      setRefinedTranscript(refined);
      window.cleanSpeechDesktop?.insertText(refined);
      setRecordingState('idle');
    } catch (err: any) {
      setRecordingState('idle');
      setErrorMessage(err.message || 'AI refinement failed. You can retry with the button below.');
      window.cleanSpeechDesktop?.insertText(textToRefine);
      window.cleanSpeechDesktop?.notifyError(err.message || 'AI refinement failed. Raw transcript inserted.');
    }
  };

  // Copy refined transcript to clipboard
  const handleCopyRefined = async () => {
    if (!refinedTranscript) return;

    try {
      await navigator.clipboard.writeText(refinedTranscript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      // Fallback if clipboard API is restricted in iframe
      const textArea = document.createElement('textarea');
      textArea.value = refinedTranscript;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Load a sample speech prompt for quick testing
  const handleSelectSample = async (sample: SampleSpeech) => {
    setErrorMessage(null);
    setRawTranscript(sample.rawText);
    setRefinedTranscript('');
    setShowSamples(false);
    setIsEditingRaw(false);
    await runAiRefinement(sample.rawText);
  };

  // Reset all
  const handleReset = () => {
    speechRecorder.cancel();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setRecordingState('idle');
    setRecordingTime(0);
    setRawTranscript('');
    setRefinedTranscript('');
    setErrorMessage(null);
    setCopied(false);
    setIsEditingRaw(false);
    setShowDiff(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Banner / Concept Pill */}
      <div className="bg-indigo-950 text-indigo-200 text-xs py-2 px-4 border-b border-indigo-900">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 font-semibold bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded text-[11px] border border-indigo-800">
              <Sparkles className="w-3 h-3 text-indigo-400" /> Proof of Concept
            </span>
            <span className="hidden sm:inline text-indigo-300">
              Voice → Raw Speech-to-Text → Intent-Preserving Refinement → Clean Copyable Text
            </span>
          </div>
          <div className="text-indigo-300 text-[11px] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero rewriting • Speaker words strictly preserved</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-10 flex flex-col gap-8">
        {/* Header */}
        <header className="text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-2 p-1.5 px-3.5 bg-white border border-slate-200 rounded-full shadow-xs text-xs font-semibold text-slate-600 mb-1">
            <Volume2 className="w-4 h-4 text-indigo-600" />
            <span>AI Speech Refinement Layer</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
            Clean Speech
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Speak naturally. Get clean, readable text without changing what you meant.
          </p>
        </header>

        {/* Stage Flow Indicator */}
        <StageProgress
          state={recordingState}
          hasRawText={!!rawTranscript}
          hasRefinedText={!!refinedTranscript}
        />

        {/* Error Notification */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800 shadow-xs animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-rose-900">Notice</p>
              <p className="mt-0.5 leading-normal">{errorMessage}</p>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs text-rose-600 hover:text-rose-900 font-medium px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Recording Control Card */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 text-center relative overflow-hidden transition-all">
          <div className="flex flex-col items-center justify-center gap-4">
            {/* Always-visible activity status, including desktop push-to-talk. */}
            <div
              aria-live="polite"
              className={`w-full max-w-xl rounded-xl border px-4 py-3 text-left flex items-start gap-3 ${
                statusDetails.color === 'rose'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : statusDetails.color === 'indigo'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                recordingState === 'recording'
                  ? 'bg-rose-600 animate-ping'
                  : recordingState === 'transcribing' || recordingState === 'refining'
                    ? 'bg-indigo-600 animate-pulse'
                    : 'bg-slate-400'
              }`} />
              <div className="min-w-0">
                <p className="text-sm font-bold">{statusDetails.label}</p>
                <p className="text-xs mt-0.5 opacity-75">{statusDetails.detail}</p>
              </div>
            </div>

            {/* Live Timer & Indicator when Recording */}
            {recordingState === 'recording' ? (
              <div className="flex flex-col items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-rose-700 text-xs font-semibold animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                  <span>Recording...</span>
                </div>
                <div className="flex items-center gap-1.5 text-2xl font-mono font-bold text-slate-900 tracking-wider">
                  <Clock className="w-5 h-5 text-slate-400" />
                  {formatTime(recordingTime)}
                </div>
                <AudioWaveIndicator />
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <span>Press the button below and speak with natural stumbles, pauses, or ums</span>
              </div>
            )}

            {/* Central Primary Record Button */}
            <div className="relative group">
              {recordingState === 'recording' ? (
                <button
                  onClick={handleStopRecording}
                  type="button"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white shadow-lg shadow-rose-200 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 border-4 border-rose-100 hover:border-rose-200 cursor-pointer"
                  aria-label="Stop Recording"
                >
                  <Square className="w-8 h-8 fill-current text-white" />
                  <span className="text-xs font-bold tracking-wide uppercase">Stop</span>
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={recordingState === 'transcribing' || recordingState === 'refining'}
                  type="button"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-slate-300 disabled:cursor-not-allowed text-white shadow-xl shadow-indigo-200 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 border-4 border-indigo-100 hover:border-indigo-200 cursor-pointer"
                  aria-label="Start Recording"
                >
                  <Mic className="w-8 h-8 text-white" />
                  <span className="text-xs font-bold tracking-wide uppercase">Record</span>
                </button>
              )}
            </div>

            {/* Status Text & Progress Note */}
            <div>
              {recordingState === 'recording' ? (
                <p className="text-sm font-semibold text-rose-600">
                  Stop Recording
                </p>
              ) : recordingState === 'transcribing' ? (
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 animate-pulse">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Stage 1: Transcribing locally with Whisper...</span>
                </div>
              ) : recordingState === 'refining' ? (
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 animate-pulse">
                  <Sparkles className="w-4 h-4 text-indigo-600 animate-spin" />
                  <span>Stage 2: AI refining stumbles & formatting without rewriting...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-800">
                    {rawTranscript ? 'Start Recording to replace' : 'Start Recording'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Or test with pre-recorded messy speech samples
                  </p>
                </div>
              )}
            </div>

            {/* Quick Test Samples Selector */}
            {recordingState === 'idle' && (
              <div className="mt-2 w-full max-w-xl">
                <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setShowSamples(!showSamples)}
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100/80 px-3.5 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Try Sample Natural Speech</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSamples ? 'rotate-180' : ''}`} />
                  </button>

                  {(rawTranscript || refinedTranscript) && (
                    <button
                      onClick={handleReset}
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {/* Sample Presets Drawer */}
                {showSamples && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left animate-in fade-in slide-in-from-top-2 duration-150">
                    {SAMPLE_SPEECHES.map((sample) => (
                      <button
                        key={sample.id}
                        onClick={() => handleSelectSample(sample)}
                        type="button"
                        className="p-3 bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 rounded-xl transition-all cursor-pointer text-left group shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 group-hover:text-indigo-900">
                          <span>{sample.title}</span>
                          <span className="text-[10px] bg-slate-200/70 group-hover:bg-indigo-200 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                            {sample.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 italic">
                          "{sample.rawText}"
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Live Interim Transcript Bubble while recording */}
        {recordingState === 'recording' && rawTranscript && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>Live Speech-to-Text Stream:</span>
            </div>
            <p className="italic text-slate-700 font-mono text-xs leading-relaxed">
              "{rawTranscript}"
            </p>
          </div>
        )}

        {/* Two-Stage Transcript Comparison Section */}
        <div className="grid grid-cols-1 gap-6">
          {/* STAGE 1: Raw Transcript */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="bg-slate-100/90 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <h2 className="text-sm font-bold text-slate-800 tracking-wide uppercase">
                  Raw Transcript
                </h2>
                <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                  Stage 1: Speech-to-Text
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden sm:inline">
                  Verbatim speech as heard (with fillers, stumbles, false starts)
                </span>
                {rawTranscript && (
                  <button
                    onClick={() => setIsEditingRaw(!isEditingRaw)}
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-indigo-600 bg-white hover:bg-slate-50 border border-slate-200 px-2 py-0.5 rounded cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingRaw ? 'View' : 'Edit raw'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between">
              {rawTranscript || isEditingRaw ? (
                <div className="space-y-3">
                  {isEditingRaw ? (
                    <div className="space-y-2">
                      <textarea
                        value={rawTranscript}
                        onChange={(e) => setRawTranscript(e.target.value)}
                        placeholder="Type or edit raw spoken speech here with filler words, stumbles, or repetitions to test..."
                        className="w-full bg-slate-50 border border-indigo-300 rounded-xl p-4 min-h-[100px] text-slate-800 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setIsEditingRaw(false);
                            runAiRefinement(rawTranscript);
                          }}
                          type="button"
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          Save & Refine
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 min-h-[90px] text-slate-800 font-mono text-sm leading-relaxed whitespace-pre-wrap selection:bg-slate-200">
                      {rawTranscript}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                      <span>Original unedited transcription from speech-to-text</span>
                    </div>

                    {recordingState === 'idle' && !isEditingRaw && (
                      <button
                        onClick={() => runAiRefinement(rawTranscript)}
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Re-refine</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <FileText className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-600">No raw transcript yet</p>
                  <p className="text-xs text-slate-400">
                    Press "Record" above and speak, or test using the sample speech presets.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* STAGE 2: Refined Transcript (Primary Focus) */}
          <div className="bg-white rounded-2xl border-2 border-indigo-300 shadow-md shadow-indigo-100/50 overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-indigo-50/90 to-white px-5 py-3 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-indigo-950 tracking-wide uppercase">
                  Refined Transcript
                </h2>
                <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-bold">
                  Stage 2: Intent-Preserving Refinement
                </span>
              </div>
              <span className="text-xs text-indigo-800 font-medium">
                Punctuation & stumbles resolved • Speaker's exact wording preserved
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between">
              {refinedTranscript ? (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 min-h-[120px] text-slate-900 text-base sm:text-lg leading-relaxed whitespace-pre-wrap font-sans selection:bg-indigo-100">
                    {refinedTranscript}
                  </div>

                  {/* Actions & Verification Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                        <span>Original Meaning & Sequence Preserved</span>
                      </span>

                      <button
                        onClick={() => setShowDiff(!showDiff)}
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>{showDiff ? 'Hide cleanup audit' : 'Audit cleaned items'}</span>
                      </button>
                    </div>

                    {/* Prominent Copy Refined Text Button */}
                    <button
                      onClick={handleCopyRefined}
                      type="button"
                      className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 shadow-sm cursor-pointer ${
                        copied
                          ? 'bg-emerald-600 text-white shadow-emerald-200'
                          : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-indigo-200 hover:shadow-md'
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Refined Text</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Optional Diff / Audit Inspector */}
                  {showDiff && (
                    <div className="mt-3 animate-in fade-in duration-150">
                      <TranscriptDiff raw={rawTranscript} refined={refinedTranscript} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Sparkles className="w-8 h-8 text-indigo-300 stroke-[1.5]" />
                  <p className="text-sm font-semibold text-slate-600">
                    Awaiting transcription & refinement
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Speak naturally. The refinement layer removes fillers and formats sentences without paraphrasing or rewriting what you said.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Verification & Intent-Preservation Rules Accordion */}
        <section className="bg-slate-100/80 border border-slate-200 rounded-xl p-5 text-xs text-slate-600 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>How the Refinement Layer Works (Strict Intent-Preservation Rules)</span>
            </h3>
          </div>
          <p className="leading-normal text-slate-600">
            Unlike generative writing assistants or summarizers, Clean Speech applies strict <strong>minimum intervention</strong>:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
              <p className="font-bold text-slate-800 mb-1">Preserves Speaker Wording</p>
              <p className="text-[11px] text-slate-500 leading-normal">
                Never paraphrases or replaces natural phrasing because another word sounds "better" or more corporate.
              </p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
              <p className="font-bold text-slate-800 mb-1">Cleans Stumbles & Fillers</p>
              <p className="text-[11px] text-slate-500 leading-normal">
                Removes "um", "uh", false starts, and accidental repetitions while keeping meaningful repetition (like "no, no, no").
              </p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
              <p className="font-bold text-slate-800 mb-1">Resolves Self-Corrections</p>
              <p className="text-[11px] text-slate-500 leading-normal">
                "I want to use text-to-speech, I mean speech-to-text" automatically resolves cleanly to "I want to use speech-to-text".
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-400 bg-white">
        Clean Speech Proof of Concept • Voice → Raw Speech-to-Text → Intent-Preserving Refinement → Clean Copyable Text
      </footer>
    </div>
  );
}
