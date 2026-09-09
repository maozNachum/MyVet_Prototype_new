import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authenticatedEmail, isAllowedEmail } from './auth';
import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
export const metadata: Metadata = {
  title: 'MyVet Workspace',
  description: 'סביבת העבודה של MyVet לניהול משימות, פרויקטים והתקדמות החברה.',
  openGraph: { title: 'MyVet Workspace', description: 'מנהלים את החברה. מתקדמים ביחד.', images: [{ url: '/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: 'MyVet Workspace', description: 'מנהלים את החברה. מתקדמים ביחד.', images: ['/og.png'] },
};
export const dynamic = 'force-dynamic';

export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  const requestHeaders = await headers();
  const email = authenticatedEmail(requestHeaders);
  if (!email) redirect('/signin-with-chatgpt?return_to=/');
  const allowed = isAllowedEmail(email);
  return <html lang="he" dir="rtl"><body className={geist.variable} data-user-email={email}>{allowed?children:<main className="access-gate"><section><span className="brand-mark">M</span><p>MyVet Workspace</p><h1>אין הרשאה לחשבון הזה</h1><p>החשבון <b dir="ltr">{email}</b> אינו מורשה לצפות בסביבת העבודה.</p><a href="/signout-with-chatgpt?return_to=/">התחברות עם חשבון אחר</a></section></main>}</body></html>
}
