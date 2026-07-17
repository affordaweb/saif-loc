const { PeerServer } = require('peer')

const PORT = process.env.PORT || 10000
const server = PeerServer({
  port: PORT,
  path: '/',
  proxied: true,
})

server.on('connection', (client) => {
  console.log('Client connected:', client.getId())
})

server.on('disconnect', (client) => {
  console.log('Client disconnected:', client.getId())
})

console.log(`PeerJS server running on port ${PORT}`)
