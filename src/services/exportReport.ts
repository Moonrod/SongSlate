import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { exportFileBaseName, sessionToCsv, sessionToHtml } from '../domain/report';
import type { Session } from '../domain/types';

async function share(uri: string, mimeType: string, UTI: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: title });
}

export async function exportCsv(session: Session): Promise<void> {
  const file = new File(Paths.cache, `${exportFileBaseName(session)}.csv`);
  if (file.exists) file.delete();
  file.create();
  // BOM so Excel opens UTF-8 (accents in artist names) correctly.
  await file.write("\uFEFF" + sessionToCsv(session));
  await share(file.uri, 'text/csv', 'public.comma-separated-values-text', `${session.name} (CSV)`);
}

export async function exportPdf(session: Session): Promise<void> {
  const { uri } = await Print.printToFileAsync({
    html: sessionToHtml(session),
    width: 842, // A4 landscape, points
    height: 595,
  });
  // Give the PDF a meaningful name instead of the random one expo-print uses.
  const target = new File(Paths.cache, `${exportFileBaseName(session)}.pdf`);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await share(target.uri, 'application/pdf', 'com.adobe.pdf', `${session.name} (PDF)`);
}
