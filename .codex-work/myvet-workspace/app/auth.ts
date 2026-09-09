export const allowedEmails = new Set([
  'maoz123000@gmail.com',
  'nisank2@gmail.com',
]);

type HeaderReader = { get(name: string): string | null };

export function authenticatedEmail(headers: HeaderReader) {
  const userId = headers.get('oai-authenticated-user-id')?.trim();
  const email = headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return userId && email ? email : null;
}

export function isAllowedEmail(email: string | null) {
  return Boolean(email && allowedEmails.has(email));
}
