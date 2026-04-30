import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function generateId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Extracts template and scripts from a full HTML document for AppShell registration.
 */
export function extractScreenComponents(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Get body content
  // Remove any injected scripts from the body content to keep template clean
  const bodyClone = doc.body.cloneNode(true) as HTMLElement;
  bodyClone.querySelectorAll('script').forEach(s => s.remove());
  const template = bodyClone.innerHTML;
  
  // Get all scripts
  const scripts = Array.from(doc.querySelectorAll('script'))
    .map(s => s.textContent)
    .filter(Boolean)
    .join('\n');
    
  return { template, scripts };
}
