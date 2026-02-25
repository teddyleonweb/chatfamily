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

// Room state
const socketToRoom = {};
const usersInRoom = {};     // roomID → [socketId]
const socketNames = {};     // socketId → display name
const roomPasswords = {};   // roomID → password (string | null)
const roomHosts = {};       // roomID → socketId (first creator)
const bannedIPs = {};       // roomID → Set of IPs
const socketIPs = {};       // socketId → IP

function getIP(socket) {
    // Try x-forwarded-for (reverse proxy), fallback to direct address
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return socket.handshake.address;
}

function cleanRoom(roomID) {
    if (usersInRoom[roomID] && usersInRoom[roomID].length === 0) {
        delete usersInRoom[roomID];
        delete roomPasswords[roomID];
        delete roomHosts[roomID];
        delete bannedIPs[roomID];
    }
}

io.on('connection', socket => {
    console.log(`Conectado: ${socket.id}`);
    const ip = getIP(socket);
    socketIPs[socket.id] = ip;

    // ── Join room ────────────────────────────────────────────────────────────
    // payload: { roomID, name, password? }
    socket.on('join room', ({ roomID, name, password } = {}) => {
        const displayName = (name || '').trim().slice(0, 32) || 'Anónimo';
        socketNames[socket.id] = displayName;

        // 1. Check IP ban
        if (bannedIPs[roomID] && bannedIPs[roomID].has(ip)) {
            socket.emit('join rejected', { reason: 'banned' });
            return;
        }

        // 2. Room already exists → validate password
        if (usersInRoom[roomID] && usersInRoom[roomID].length > 0) {
            const expected = roomPasswords[roomID];
            if (expected !== null && expected !== undefined && expected !== '') {
                if ((password || '') !== expected) {
                    socket.emit('join rejected', { reason: 'wrong_password' });
                    return;
                }
            }
        } else {
            // 3. First user creates the room → store password (may be empty)
            usersInRoom[roomID] = [];
            roomPasswords[roomID] = (password || '').trim();
            roomHosts[roomID] = socket.id;
            bannedIPs[roomID] = new Set();
        }

        // Remove from old room if needed
        if (socketToRoom[socket.id]) {
            const oldRoom = socketToRoom[socket.id];
            usersInRoom[oldRoom] = (usersInRoom[oldRoom] || []).filter(id => id !== socket.id);
            cleanRoom(oldRoom);
        }

        if (!usersInRoom[roomID].includes(socket.id)) usersInRoom[roomID].push(socket.id);
        socketToRoom[socket.id] = roomID;

        console.log(`${displayName} (${socket.id}) → sala: ${roomID}`);

        // Notify if host
        if (roomHosts[roomID] === socket.id) {
            socket.emit('you are host');
        }

        // Send existing users WITH their names: [{id, name}]
        const others = usersInRoom[roomID]
            .filter(id => id !== socket.id)
            .map(id => ({ id, name: socketNames[id] || 'Anónimo' }));

        socket.emit('all users', others);
    });

    // ── WebRTC signaling ─────────────────────────────────────────────────────
    socket.on('sending signal', payload => {
        io.to(payload.userToSignal).emit('user joined', {
            signal: payload.signal,
            callerID: payload.callerID,
            name: socketNames[payload.callerID] || 'Anónimo',
        });
    });

    socket.on('returning signal', payload => {
        io.to(payload.callerID).emit('receiving returned signal', {
            signal: payload.signal,
            id: socket.id,
            name: socketNames[socket.id] || 'Anónimo',
        });
    });

    // ── Host controls ────────────────────────────────────────────────────────
    socket.on('kick user', ({ targetSocketId } = {}) => {
        const roomID = socketToRoom[socket.id];
        if (!roomID || roomHosts[roomID] !== socket.id) return; // not host
        if (!targetSocketId || targetSocketId === socket.id) return;

        const target = io.sockets.sockets.get(targetSocketId);
        if (target) {
            target.emit('you were kicked');
            setTimeout(() => target.disconnect(true), 300);
        }
    });

    socket.on('ban user', ({ targetSocketId } = {}) => {
        const roomID = socketToRoom[socket.id];
        if (!roomID || roomHosts[roomID] !== socket.id) return; // not host
        if (!targetSocketId || targetSocketId === socket.id) return;

        const targetIP = socketIPs[targetSocketId];
        if (targetIP && bannedIPs[roomID]) {
            bannedIPs[roomID].add(targetIP);
            console.log(`IP baneada en sala ${roomID}: ${targetIP}`);
        }

        const target = io.sockets.sockets.get(targetSocketId);
        if (target) {
            target.emit('you were kicked', { banned: true });
            setTimeout(() => target.disconnect(true), 300);
        }
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const roomID = socketToRoom[socket.id];
        console.log(`Desconectado: ${socket.id} (sala: ${roomID})`);

        if (usersInRoom[roomID]) {
            usersInRoom[roomID] = usersInRoom[roomID].filter(id => id !== socket.id);

            // Transfer host if needed
            if (roomHosts[roomID] === socket.id && usersInRoom[roomID].length > 0) {
                const newHost = usersInRoom[roomID][0];
                roomHosts[roomID] = newHost;
                io.to(newHost).emit('you are host');
                console.log(`Nuevo anfitrión: ${newHost} en sala ${roomID}`);
            }

            cleanRoom(roomID);
        }

        delete socketToRoom[socket.id];
        delete socketNames[socket.id];
        delete socketIPs[socket.id];
        socket.broadcast.emit('user left', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`FamilyCall activo en puerto ${PORT}`));
