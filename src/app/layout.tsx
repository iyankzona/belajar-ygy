import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Campaign Incremental ROAS Analyzer',
  description:
    'Analyze weekly and monthly Google Ads Incremental ROAS and budget recommendations.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${inter.className} font-sans text-[#0f172a]`}>
        {children}
      </body>
    </html>
  )
}
