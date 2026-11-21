import { isAxiosError } from 'axios';
import { http } from '@/shared/api/http';

/**
 * A stored file (a PDF, or a contract's Word document), fetched with the access token (it lives
 * in memory: a plain link has none).
 */
export async function fetchPdf(url: string, params?: Record<string, string>) {
  try {
    return (await http.get<Blob>(url, { params, responseType: 'blob' })).data;
  } catch (error) {
    // With responseType 'blob' the JSON error body arrives as a Blob too: read it back so
    // toApiError() can show the server's message.
    if (isAxiosError(error) && error.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        error.response.data = undefined;
      }
    }
    throw error;
  }
}

/**
 * Opens a PDF in a new tab. The tab is opened right away, inside the click (a tab opened after
 * an await is blocked as a pop-up), and gets the file once it is loaded. If the browser still
 * blocks it, the file is downloaded instead.
 */
export async function openPdf(load: () => Promise<Blob>, fileName: string) {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await load());
    if (tab) {
      tab.location.href = url;
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
    }
    // The tab has its own copy by then; a minute is plenty for slow machines.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Downloads a stored file (a Word document: the browser does not open it in a tab). */
export async function downloadFile(load: () => Promise<Blob>, fileName: string) {
  const url = URL.createObjectURL(await load());
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
