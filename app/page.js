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
  const [yourName, setYourName] = useState('Saif')
  const [friendName, setFriendName] = useState('')
  const [joinInput, setJoinInput] = useState('')

  const createRoom = () => {
    const h = slug(yourName) || 'saif'
    const f = slug(friendName) || 'friend'
    const code = generateCode()
    router.push(`/r/${h}~${f}~${code}`)
  }

  const joinRoom = (e) => {
    e.preventDefault()
    const val = joinInput.trim()
    if (!val) return
    const match = val.match(/\/r\/(.+)/)
    const slug = match ? match[1] : val
    router.push(`/r/${slug}`)
  }

  return (
    <div className="h-screen w-full bg-gradient-to-br from-rose-200 via-purple-200 to-sky-200 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/70 backdrop-blur rounded-3xl mb-6 shadow-sm">
            <span className="text-4xl">📍</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight">Saif Loc</h1>
          <p className="text-gray-500 mt-2 text-sm">Real-time location sharing</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 space-y-4 shadow-lg shadow-purple-200/50 border border-white/60">
          <input
            type="text"
            placeholder="Your name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            className="w-full bg-white/70 border border-purple-200 rounded-2xl px-4 py-3.5 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent text-sm"
          />
          <input
            type="text"
            placeholder="Friend's name (optional)"
            value={friendName}
            onChange={(e) => setFriendName(e.target.value)}
            className="w-full bg-white/70 border border-purple-200 rounded-2xl px-4 py-3.5 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent text-sm"
          />
          <button
            onClick={createRoom}
            className="w-full bg-gradient-to-r from-rose-400 to-purple-400 hover:from-rose-500 hover:to-purple-500 text-white font-semibold py-3.5 px-6 rounded-2xl transition shadow-md shadow-purple-300/30"
          >
            Create a Room
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-purple-200" />
            <span className="text-gray-400 text-xs font-medium">OR JOIN</span>
            <div className="flex-1 h-px bg-purple-200" />
          </div>

          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              type="text"
              placeholder="Paste room code or link"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              className="flex-1 bg-white/70 border border-purple-200 rounded-2xl px-4 py-3.5 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent text-sm"
            />
            <button
              type="submit"
              className="bg-white/70 hover:bg-white/90 text-gray-600 font-semibold py-3.5 px-5 rounded-2xl transition border border-purple-200 shadow-sm"
            >
              Join
            </button>
          </form>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Share the link with a friend to meet up
        </p>
      </div>
    </div>
  )
}
