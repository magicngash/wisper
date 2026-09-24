import { Mic, FileText, Sparkles, CheckCircle2 } from 'lucide-react';
import { RecordingState } from '../types.ts';

interface StageProgressProps {
  state: RecordingState;
  hasRawText: boolean;
  hasRefinedText: boolean;
}

export default function StageProgress({ state, hasRawText, hasRefinedText }: StageProgressProps) {
  const steps = [
    {
      id: 'voice',
      label: 'Voice Input',
      sub: 'Speak naturally',
      icon: Mic,
      isActive: state === 'recording',
      isCompleted: state === 'transcribing' || state === 'refining' || hasRawText,
    },
    {
      id: 'stage1',
      label: 'Stage 1: Raw STT',
      sub: 'Unedited transcription',
      icon: FileText,
      isActive: state === 'transcribing',
      isCompleted: hasRawText && state !== 'transcribing',
    },
    {
      id: 'stage2',
      label: 'Stage 2: AI Refinement',
      sub: 'Intent-preserving cleanup',
      icon: Sparkles,
      isActive: state === 'refining',
      isCompleted: hasRefinedText,
    },
    {
      id: 'output',
      label: 'Clean Text',
      sub: 'Ready to copy',
      icon: CheckCircle2,
      isActive: false,
      isCompleted: hasRefinedText && state === 'idle',
    },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto py-3 px-4">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />
        {steps.map((step) => {
          const Icon = step.icon;
          let circleClass = 'bg-white border-2 border-slate-300 text-slate-400';
          if (step.isActive) {
            circleClass = 'bg-indigo-600 border-2 border-indigo-600 text-white ring-4 ring-indigo-100 shadow-md animate-pulse';
          } else if (step.isCompleted) {
            circleClass = 'bg-emerald-600 border-2 border-emerald-600 text-white shadow-sm';
          }

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center group">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${circleClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="mt-2 text-center">
                <p className={`text-xs font-semibold ${step.isActive ? 'text-indigo-600' : step.isCompleted ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-slate-400 hidden sm:block">
                  {step.sub}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
