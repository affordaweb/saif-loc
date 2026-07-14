import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata = {
  title: 'Share Loc',
  description: 'Real-time location sharing',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📍</text></svg>" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
