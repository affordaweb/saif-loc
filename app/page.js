'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function generateCode() {
  return Math.random().toString(36).substring(2, 6)
}

function slug(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'x'
}

export default function Home() {
  const router = useRouter()
  const [yourName, setYourName] = useState('')
  const [friendName, setFriendName] = useState('')

  const startSharing = () => {
    const h = slug(yourName || 'Me')
    const f = slug(friendName || 'Friend')
    const code = generateCode()
    router.push(`/r/${h}~${f}~${code}`)
  }

  const joinRoom = (e) => {
    e.preventDefault()
    const val = e.target.link.value.trim()
    if (!val) return
    const match = val.match(/\/r\/(.+)/)
    const slug = match ? match[1] : val
    router.push(`/r/${slug}`)
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-orange-200 via-amber-200 to-yellow-200 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/70 backdrop-blur rounded-3xl mb-4 shadow-sm">
            <span className="text-4xl">📍</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight font-handwriting">Share Loc</h1>
          <p className="text-gray-500 mt-1 text-sm">Share your live location with a friend</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 space-y-4 shadow-lg shadow-amber-200/50 border border-white/60">
          <input
            type="text"
            placeholder="Your name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            className="w-full bg-white/70 border border-amber-200 rounded-2xl px-4 py-3.5 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent text-sm"
          />
          <input
            type="text"
            placeholder="Friend's name"
            value={friendName}
            onChange={(e) => setFriendName(e.target.value)}
            className="w-full bg-white/70 border border-amber-200 rounded-2xl px-4 py-3.5 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent text-sm"
          />
          <button
            onClick={startSharing}
            className="w-full bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 text-white font-semibold py-3.5 px-6 rounded-2xl transition shadow-md shadow-amber-300/30 text-sm"
          >
            ✦ Start Sharing
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-amber-200" />
            <span className="text-gray-400 text-xs font-medium">OR JOIN</span>
            <div className="flex-1 h-px bg-amber-200" />
          </div>

          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              name="link"
              type="text"
              placeholder="Paste invite link"
              className="flex-1 bg-white/70 border border-amber-200 rounded-2xl px-4 py-3.5 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent text-sm"
            />
            <button
              type="submit"
              className="bg-white/70 hover:bg-white/90 text-gray-600 font-semibold py-3.5 px-5 rounded-2xl transition border border-amber-200 shadow-sm text-sm"
            >
              Join
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-5">
          Share the invite link with a friend to meet up
        </p>
      </div>
    </div>
  )
}
