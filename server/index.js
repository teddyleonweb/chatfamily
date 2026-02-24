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
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on("join room", roomID => {
        console.log(`Socket ${socket.id} intentando entrar a sala: ${roomID}`);

        // Si el usuario ya estaba en una sala, lo sacamos primero
        if (socketToRoom[socket.id]) {
            const oldRoomID = socketToRoom[socket.id];
            usersInRoom[oldRoomID] = (usersInRoom[oldRoomID] || []).filter(id => id !== socket.id);
        }

        if (usersInRoom[roomID]) {
            // Evitar duplicados
            if (!usersInRoom[roomID].includes(socket.id)) {
                usersInRoom[roomID].push(socket.id);
            }
        } else {
            usersInRoom[roomID] = [socket.id];
        }

        socketToRoom[socket.id] = roomID;
        const usersInThisRoom = usersInRoom[roomID].filter(id => id !== socket.id);

        console.log(`Usuarios actuales en sala ${roomID}:`, usersInRoom[roomID]);
        socket.emit("all users", usersInThisRoom);
    });

    socket.on("sending signal", payload => {
        console.log(`Enviando señal de ${socket.id} hacia ${payload.userToSignal}`);
        io.to(payload.userToSignal).emit('user joined', { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on("returning signal", payload => {
        console.log(`Devolviendo señal de ${socket.id} hacia ${payload.callerID}`);
        io.to(payload.callerID).emit('receiving returned signal', { signal: payload.signal, id: socket.id });
    });

    socket.on('disconnect', () => {
        const roomID = socketToRoom[socket.id];
        console.log(`Usuario desconectado: ${socket.id} (Estaba en sala: ${roomID})`);

        let room = usersInRoom[roomID];
        if (room) {
            room = room.filter(id => id !== socket.id);
            usersInRoom[roomID] = room;
            if (room.length === 0) {
                delete usersInRoom[roomID];
            }
        }
        delete socketToRoom[socket.id];
        socket.broadcast.emit('user left', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Servidor de FamilyCall activo en puerto ${PORT}`);
});
