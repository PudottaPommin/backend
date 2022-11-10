import express from 'express'
import bodyParser from 'body-parser'
import http from 'http'
import { Server } from 'socket.io'

import supabase from '../db/supabase.js'

const app = express()
const httpServer = http.createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://dotabod.com',
      'https://dotabod.vercel.app',
      'https://dotabot.vercel.app',
    ],
    methods: ['GET', 'POST'],
  },
})

function emitAll(prefix, obj, socketids) {
  Object.keys(obj).forEach((key) => {
    // For scanning keys and testing
    // emitter.emit("key", ""+prefix+key);
    // console.log("Emitting '"+prefix+key+"' - " + obj[key]);
    if (socketids.length) {
      io.to(socketids).emit(prefix + key, obj[key])
    }
  })
}

function recursiveEmit(prefix, changed, body, socketids) {
  Object.keys(changed).forEach((key) => {
    if (typeof changed[key] === 'object') {
      if (body[key] != null) {
        // safety check
        recursiveEmit(`${prefix + key}:`, changed[key], body[key], socketids)
      }
    } else if (body[key] != null) {
      // Got a key
      if (typeof body[key] === 'object') {
        // Edge case on added:item/ability:x where added shows true at the top level
        // and doesn't contain each of the child keys
        emitAll(`${prefix + key}:`, body[key], socketids)
      } else if (socketids.length) {
        // For scanning keys and testing
        // emitter.emit("key", ""+prefix+key);
        // console.log("Emitting '"+prefix+key+"' - " + body[key]);
        io.to(socketids).emit(prefix + key, body[key])
      }
    }
  })
}

function processChanges(section) {
  return function handle(req, res, next) {
    if (!req?.client?.socketinfo?.sockets || req?.client?.socketinfo?.sockets?.length === 0) {
      return next()
    }
    if (req.body[section]) {
      // console.log("Starting recursive emit for '" + section + "'");
      recursiveEmit('', req.body[section], req.body, req.client.socketinfo.sockets)
    }
    next()
  }
}

function updateGamestate(req, res, next) {
  req.client.gamestate = req.body

  const players = Object.keys(req?.body?.player || [])

  const isSpectating =
    req?.body?.player?.team_name === 'spectator' ||
    (players.length > 0 && Object.keys(req?.body?.player[players[0]])[0] === 'player0')

  if (isSpectating) {
    if (req?.client?.socketinfo?.sockets?.length) {
      // io.to(req.client.socketinfo.sockets).emit('state', 'DISCONNECTED')
    }

    res.end()
    return
  }

  next()
}

function newData(req, res) {
  if (!req.body?.map?.game_state) {
    // console.log(req.body, req.client.socketinfo)
  } else {
    // console.log(req.client.socketinfo.sockets)
  }
  if (req?.client?.socketinfo?.sockets?.length) {
    io.to(req.client.socketinfo.sockets).emit('state', req.body?.map?.game_state || 'DISCONNECTED')
  }
  res.end()
}

const dotaGSIClients = []

function findUser(token) {
  const user = dotaGSIClients.findIndex((client) => client.token === token)
  return user !== -1 ? dotaGSIClients[user] : null
}

async function checkAuth(req, res, next) {
  // Sent from dota gsi config file
  const token = req.body?.auth?.token

  // Our local memory cache of clients to sockets
  const foundUser = findUser(token)
  if (foundUser) {
    req.client.socketinfo = foundUser
    next()
    return
  }

  if (token) {
    const { data: user, error } = await supabase
      .from('users')
      .select('name')
      .eq('id', token)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (!error) {
      req.client.socketinfo = {
        name: user.name,
        token,
      }

      // sockets[] to be filled in by socket connection
      dotaGSIClients.push({ ...user, token, sockets: [] })
      next()
      return
    }
  }

  console.log(`Dropping message from IP: ${req.ip}, no valid auth token`)
  res.status(401).json({
    error: new Error('Invalid request!'),
  })
}

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.post(
  '/',
  checkAuth,
  updateGamestate,
  processChanges('previously'),
  processChanges('added'),
  newData,
)

// No main page
app.get('/', (req, res) => {
  res.status(401).json({
    error: new Error('Invalid request!'),
  })
})

httpServer.listen(process.env.MAIN_PORT || 3000, () => {
  console.log(`listening on *:${process.env.MAIN_PORT || 3000}`)
})

/// IO
io.use(async (socket, next) => {
  const { token } = socket.handshake.auth
  const connectedGSIClient = findUser(token)

  // Cache to prevent a supabase lookup on every message for username & token validation
  if (connectedGSIClient) {
    // eslint-disable-next-line no-param-reassign
    socket.data = connectedGSIClient
    connectedGSIClient.sockets.push(socket.id)
    return next()
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('name')
    .eq('id', token)
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    return next(new Error('authentication error'))
  }

  // eslint-disable-next-line no-param-reassign
  socket.data.name = user.name
  // eslint-disable-next-line no-param-reassign
  socket.data.token = token
  // In case the socket is connected before the GSI client has!
  dotaGSIClients.push({ ...user, token, sockets: [socket.id] })

  return next()
})

io.on('connection', (socket) => {
  console.log('a user connected: ', socket.data.name, socket.id)

  socket.on('disconnect', () => {
    console.log('a user disconnected: ', socket.data.name, socket.id)

    const connectedGSIClient = findUser(socket.data.token)

    if (connectedGSIClient) {
      connectedGSIClient.sockets = connectedGSIClient.sockets.filter(
        (socketid) => socketid !== socket.id,
      )
    }
  })
})
