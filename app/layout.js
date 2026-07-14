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
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📍</text></svg>" />
        <link rel="apple-touch-icon" href="https://ui-avatars.com/api/?name=SL&background=a78bfa&color=fff&size=180&rounded=true&bold=true" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
