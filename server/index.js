const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const socketToRoom = {};
const usersInRoom = {};

io.on('connection', socket => {
  socket.on("join room", roomID => {
    if (usersInRoom[roomID]) {
      usersInRoom[roomID].push(socket.id);
    } else {
      usersInRoom[roomID] = [socket.id];
    }
    socketToRoom[socket.id] = roomID;
    const usersInThisRoom = usersInRoom[roomID].filter(id => id !== socket.id);

    socket.emit("all users", usersInThisRoom);
  });

  socket.on("sending signal", payload => {
    io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
  });

  socket.on("returning signal", payload => {
    io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
  });

  socket.on('disconnect', () => {
    const roomID = socketToRoom[socket.id];
    let room = usersInRoom[roomID];
    if (room) {
      room = room.filter(id => id !== socket.id);
      usersInRoom[roomID] = room;
    }
    socket.broadcast.emit('user left', socket.id);
  });

});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
