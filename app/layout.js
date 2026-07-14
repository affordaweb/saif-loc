import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata = {
  title: 'Share Loc',
  description: 'Real-time location sharing — meet up with friends',
  manifest: '/manifest.json',
  keywords: ['location', 'sharing', 'meetup', 'real-time', 'maps'],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#a78bfa',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='20' r='12' fill='%23f44336'/%3E%3Cpath d='M32 44 L20 58 L32 50 L44 58 Z' fill='%23f44336'/%3E%3C/svg%3E" />
        <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='20' r='12' fill='%23f44336'/%3E%3Cpath d='M32 44 L20 58 L32 50 L44 58 Z' fill='%23f44336'/%3E%3C/svg%3E" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
