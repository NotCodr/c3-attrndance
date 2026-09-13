import { toast } from 'sonner';

/** Copies text and says so, or says it could not (no clipboard permission, old browser). */
export async function copyText(text, message = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error('Could not copy that. Try again, or copy it from the address bar.');
  }
}
