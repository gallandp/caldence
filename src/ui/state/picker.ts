import { pickWithInput } from './files';

let input: HTMLInputElement | null = null;

/** Registers the one hidden file input; the returned function unregisters it. */
export function registerFileInput(el: HTMLInputElement): () => void {
  input = el;
  return () => {
    if (input === el) input = null;
  };
}

/** Opens the file dialog for the given accept string; null when dismissed or no input is registered. */
export function pickFile(accept: string): Promise<File | null> {
  if (!input) return Promise.resolve(null);
  input.accept = accept;
  return pickWithInput(input, window);
}
