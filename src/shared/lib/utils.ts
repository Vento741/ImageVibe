/** Format cost as display string */
export function formatCostDisplay(costUsd: number): string {
  if (costUsd === 0) return '$0.00';
  if (costUsd < 0.001) return `$${costUsd.toFixed(4)}`;
  if (costUsd < 0.01) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

/** Generate a unique ID */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Debounce function */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Check if user is typing in an input element */
export function isTypingInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Get short display name from model ID (e.g., "black-forest-labs/flux.2-pro" → "flux.2-pro") */
export function getModelShortName(modelId: string): string {
  return modelId.split('/')[1] ?? modelId;
}

/** Generate a random seed (0 to INT32_MAX) */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/** Format date string for Russian locale */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU');
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
