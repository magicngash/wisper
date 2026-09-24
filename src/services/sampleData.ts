import { SampleSpeech } from '../types.ts';

export const SAMPLE_SPEECHES: SampleSpeech[] = [
  {
    id: 'self-correction',
    title: 'Self-Correction & Fillers',
    category: 'Self-Correction',
    description: 'Demonstrates immediate self-correction and filler stripping ("text-to-speech, I mean speech-to-text").',
    rawText: 'um so yesterday I wanted to test out text-to-speech I mean speech-to-text with our team and uh you know we noticed that the raw output has like a lot of stumbles so we really need a cleaning layer',
  },
  {
    id: 'repetition-meaning',
    title: 'Repetition (Accidental vs Intentional)',
    category: 'Repetition Logic',
    description: 'Tests rule: removes accidental "I think, I think" but strictly preserves meaningful "No, no, no".',
    rawText: 'I think I think we should talk to Sarah first uh but no no no that is definitely not the priority right now we need to focus on shipping the core app',
  },
  {
    id: 'list-enumeration',
    title: 'List Formatting & False Starts',
    category: 'Formatting & Flow',
    description: 'Demonstrates converting verbal lists into readable structure without rearranging sequence.',
    rawText: 'so we have um three action items for today first finish the audio capture interface second wait actually before that no second test the refinement prompt and third deploy the web application to production',
  },
  {
    id: 'natural-meeting-notes',
    title: 'Technical Discussion',
    category: 'Preserve Wording',
    description: 'Tests preserving exact casual engineering wording without corporate or academic over-formalization.',
    rawText: 'the client wants something super lightweight you know not a giant bloated dashboard just a clean button where they talk it grabs the words cleans the junk out and they can paste it right into Slack',
  },
];
