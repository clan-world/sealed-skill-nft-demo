import { ANIMAL_SOUNDS } from '@sealed-skill/protocol';

export function answerAnimalSound(animal: string): string {
  const normalized = animal.toLowerCase().trim();
  const sound = ANIMAL_SOUNDS[normalized];
  if (!sound) return 'unknown sound';
  return sound;
}

export function isAllowedPrompt(prompt: string): boolean {
  return prompt.trim().toLowerCase() === 'what sound does this animal make?';
}

export function redactSecretArtifact(value: unknown): string {
  void value;
  return '[secret artifact hidden]';
}
