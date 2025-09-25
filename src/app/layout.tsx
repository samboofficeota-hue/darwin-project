import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '智の泉 - 公益資本主義の知識ベース',
  description: '公益資本主義で経済社会システムをアップデートしていくための「智の泉」',
  keywords: ['公益資本主義', '知識ベース', 'RAG', 'AI', 'GenSpark'],
  authors: [{ name: 'Darwin Project Team' }],
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
