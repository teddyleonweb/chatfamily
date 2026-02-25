const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket']
});

const socketToRoom = {};
const usersInRoom = {};
const socketNames = {};   // socketId → display name

io.on('connection', socket => {
    console.log(`Conectado: ${socket.id}`);

    // payload: { roomID, name }
    socket.on("join room", ({ roomID, name } = {}) => {
        const displayName = (name || '').trim().slice(0, 32) || 'Anónimo';
        socketNames[socket.id] = displayName;
        console.log(`${displayName} (${socket.id}) -> sala: ${roomID}`);

        // Remove from old room if needed
        if (socketToRoom[socket.id]) {
            const oldRoom = socketToRoom[socket.id];
            usersInRoom[oldRoom] = (usersInRoom[oldRoom] || []).filter(id => id !== socket.id);
        }

        if (!usersInRoom[roomID]) usersInRoom[roomID] = [];
        if (!usersInRoom[roomID].includes(socket.id)) usersInRoom[roomID].push(socket.id);
        socketToRoom[socket.id] = roomID;

        // Send existing users WITH their names: [{id, name}]
        const others = usersInRoom[roomID]
            .filter(id => id !== socket.id)
            .map(id => ({ id, name: socketNames[id] || 'Anónimo' }));

        socket.emit("all users", others);
    });

    socket.on("sending signal", payload => {
        // Forward signal + caller name so receiver can label the window
        io.to(payload.userToSignal).emit('user joined', {
            signal: payload.signal,
            callerID: payload.callerID,
            name: socketNames[payload.callerID] || 'Anónimo',
        });
    });

    socket.on("returning signal", payload => {
        io.to(payload.callerID).emit('receiving returned signal', {
            signal: payload.signal,
            id: socket.id,
            name: socketNames[socket.id] || 'Anónimo',
        });
    });

    socket.on('disconnect', () => {
        const roomID = socketToRoom[socket.id];
        console.log(`Desconectado: ${socket.id} (sala: ${roomID})`);
        if (usersInRoom[roomID]) {
            usersInRoom[roomID] = usersInRoom[roomID].filter(id => id !== socket.id);
            if (usersInRoom[roomID].length === 0) delete usersInRoom[roomID];
        }
        delete socketToRoom[socket.id];
        delete socketNames[socket.id];
        socket.broadcast.emit('user left', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`FamilyCall activo en puerto ${PORT}`));
