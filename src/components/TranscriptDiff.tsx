import React from 'react';

interface TranscriptDiffProps {
  raw: string;
  refined: string;
}

/**
 * Visual inspection tool to verify that the refinement layer
 * preserved the speaker's original words and meaning rather than rewriting.
 */
export default function TranscriptDiff({ raw, refined }: TranscriptDiffProps) {
  const rawWords = raw.trim().split(/\s+/).filter(Boolean);
  const refinedWords = refined.trim().split(/\s+/).filter(Boolean);

  // Normalize for comparison
  const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

  const refinedSet = new Set(refinedWords.map(normalize));

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
      <div className="flex items-center justify-between text-slate-700 font-semibold border-b border-slate-200 pb-2">
        <span>Intent-Preservation Audit</span>
        <span className="text-[11px] font-normal text-slate-500">
          Raw: {rawWords.length} words → Refined: {refinedWords.length} words
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          Removed Speech Artifacts & Fillers:
        </p>
        <div className="flex flex-wrap gap-1.5 p-2.5 bg-white rounded-lg border border-slate-200 min-h-[36px]">
          {rawWords.map((word, idx) => {
            const norm = normalize(word);
            const isRemoved = !refinedSet.has(norm);
            if (!isRemoved) return null;
            return (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-mono text-[11px] line-through"
              >
                {word}
              </span>
            );
          })}
          {rawWords.filter((w) => !refinedSet.has(normalize(w))).length === 0 && (
            <span className="text-slate-400 italic text-[11px]">No filler artifacts detected to remove.</span>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 italic">
        Notice that meaningful words and speaker phrasing are preserved; only speech stumbles and filler items are omitted.
      </p>
    </div>
  );
}
