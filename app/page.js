'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function generateId() {
  return Math.random().toString(36).substring(2, 8)
}

export default function Home() {
  const router = useRouter()
  const [roomId, setRoomId] = useState('')

  const createRoom = () => {
    router.push(`/r/${generateId()}`)
  }

  const joinRoom = (e) => {
    e.preventDefault()
    const id = roomId.trim().toLowerCase()
    if (id) router.push(`/r/${id}`)
  }

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur rounded-3xl mb-6">
            <span className="text-4xl">📍</span>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Saif Loc</h1>
          <p className="text-blue-200 mt-2 text-sm">Real-time location sharing</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 space-y-4 border border-white/10">
          <button
            onClick={createRoom}
            className="w-full bg-white text-blue-700 font-semibold py-3.5 px-6 rounded-2xl hover:bg-blue-50 transition shadow-lg shadow-black/10"
          >
            Create a Room
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs font-medium">OR</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              type="text"
              placeholder="Enter room code"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent text-sm"
            />
            <button
              type="submit"
              className="bg-white/20 hover:bg-white/30 text-white font-semibold py-3.5 px-5 rounded-2xl transition border border-white/10"
            >
              Join
            </button>
          </form>
        </div>

        <p className="text-center text-blue-300/60 text-xs mt-6">
          Share the link with a friend to meet up
        </p>
      </div>
    </div>
  )
}
