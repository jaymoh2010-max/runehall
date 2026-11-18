import type { AudioMood } from "./types";

export const AUDIO_MOODS: { id: AudioMood; label: string; hint: string }[] = [
  { id: "battle", label: "Battle", hint: "Combat, chases, and boss fights" },
  { id: "exploration", label: "Exploration", hint: "Travel, towns, and discovery" },
  { id: "tavern", label: "Tavern", hint: "Inns, markets, and downtime" },
  { id: "relaxing", label: "Relaxing", hint: "Calm ambience and camp scenes" },
  { id: "mystery", label: "Mystery", hint: "Dungeons, secrets, and tension" },
];

export function isAudioMood(value: unknown): value is AudioMood {
  return AUDIO_MOODS.some((mood) => mood.id === value);
}

export function audioMoodLabel(value: AudioMood): string {
  return AUDIO_MOODS.find((mood) => mood.id === value)?.label ?? "Music";
}
