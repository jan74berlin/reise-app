import { google } from 'googleapis';
import { Readable } from 'stream';

function getAuth() {
  const json = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '{}');
  return new google.auth.GoogleAuth({
    credentials: json,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export async function uploadToDrive(
  filename: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ fileId: string; viewUrl: string }> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const stream = Readable.from(buffer);
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID ?? ''],
    },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  const fileId = res.data.id!;
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    fileId,
    viewUrl: `https://drive.google.com/uc?id=${fileId}`,
  };
}
