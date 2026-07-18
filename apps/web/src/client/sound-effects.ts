export interface MusicalNote {
  frequency: number;
  start: number;
  end: number;
}

export const LOGIN_STING_NOTES: readonly MusicalNote[] = [
  { frequency: 196, start: 0, end: 0.72 },
  { frequency: 293.66, start: 0.12, end: 0.88 },
  { frequency: 392, start: 0.25, end: 1.08 },
  { frequency: 587.33, start: 0.46, end: 1.42 }
];

let audioContext: AudioContext | null = null;

function browserAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export async function playLoginSting(): Promise<boolean> {
  const context = browserAudioContext();
  if (!context) return false;

  try {
    await context.resume();
  } catch {
    return false;
  }

  const now = context.currentTime + 0.015;
  const master = context.createGain();
  master.gain.setValueAtTime(0.36, now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.48);
  master.connect(context.destination);

  LOGIN_STING_NOTES.forEach((note, index) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const startsAt = now + note.start;
    const endsAt = now + note.end;

    oscillator.type = index === LOGIN_STING_NOTES.length - 1 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(note.frequency, startsAt);
    envelope.gain.setValueAtTime(0.0001, startsAt);
    envelope.gain.exponentialRampToValueAtTime(index === 0 ? 0.18 : 0.11, startsAt + 0.045);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.02);
  });

  return true;
}

export function previewSoundLabel(muted: boolean): string {
  return muted ? "Turn on automatic preview sound" : "Mute automatic preview";
}
