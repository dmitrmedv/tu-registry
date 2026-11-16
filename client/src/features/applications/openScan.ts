import { applicationsApi } from './api';

/**
 * Opens the application's scan in a new tab. The tab is opened right away, inside the click
 * (a tab opened after an await is blocked as a pop-up), and gets the PDF once it is loaded.
 * If the browser still blocks it, the file is downloaded instead.
 */
export async function openScan(applicationId: string, fileName: string) {
  const tab = window.open('', '_blank');
  try {
    const blob = await applicationsApi.scanFile(applicationId);
    const url = URL.createObjectURL(blob);
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
