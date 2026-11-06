/**
 * Web (browser preview) export. The phone app hands CSV/PDF files to the share
 * sheet; a browser preview can't save files, so CSV goes to the clipboard
 * (paste straight into a spreadsheet) and PDF explains where it lives.
 */
import { Alert } from 'react-native';

import { sessionToCsv } from '../domain/report';
import type { Session } from '../domain/types';

export async function exportCsv(session: Session): Promise<void> {
  const csv = sessionToCsv(session);
  try {
    // Called synchronously from the tap, which the clipboard requires.
    await navigator.clipboard.writeText(csv);
    Alert.alert(
      'CSV copied',
      `${session.takes.length} take(s) copied to the clipboard. Paste into Excel, Numbers or Google Sheets.\n\nIn the phone app this opens the share sheet instead (email, AirDrop, Files).`,
    );
  } catch {
    Alert.alert(
      'Clipboard unavailable',
      'This browser blocked clipboard access. In the phone app, CSV export opens the share sheet (email, AirDrop, Files).',
    );
  }
}

export async function exportPdf(_session: Session): Promise<void> {
  Alert.alert(
    'PDF export is in the phone app',
    'On iOS and Android this creates an A4 landscape PDF of the session and opens the share sheet. The browser preview can’t save files, so try Export CSV here instead.',
  );
}
