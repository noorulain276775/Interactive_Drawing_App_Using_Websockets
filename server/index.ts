import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
    },
});

type Point = { x: number, y: number}

type User = {
    id: string,
    name: string,
    color: string,
    isActive: boolean
}

type DrawLine = {
    prevPoint: Point | null
    currentPoint: Point
    color: string
    userId: string
    userName: string
    brushSize: number
    tool: string
    roomId: string
}

type Room = {
    id: string
    name: string
    createdBy: string
    createdAt: number
    userCount: number
    isPrivate: boolean
    password?: string
}

type SavedDrawing = {
    id: string
    name: string
    roomId: string
    createdBy: string
    createdAt: number
    updatedAt: number
    actions: any[]
    thumbnail?: string
}

type SaveDrawingRequest = {
    name: string
    roomId: string
    actions: any[]
    thumbnail?: string
}

// Store connected users and rooms
const connectedUsers: Map<string, User> = new Map();
const rooms: Map<string, Room> = new Map();
const roomUsers: Map<string, Set<string>> = new Map(); // roomId -> Set of socketIds
const userRooms: Map<string, string> = new Map(); // socketId -> roomId

// Store saved drawings
const savedDrawings: Map<string, SavedDrawing> = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id)
    
    // Handle user joining
    socket.on('user-join', (user: User) => {
        connectedUsers.set(socket.id, user);
        console.log(`👤 ${user.name} joined the drawing session`);
        
        // Send updated users list to all clients
        const usersList = Array.from(connectedUsers.values());
        io.emit('users-list', usersList);
        
        // Notify other users about the new user
        socket.broadcast.emit('user-joined', {
            user,
            users: usersList
        });
    });

    // Room management events
    socket.on('create-room', ({ roomName, isPrivate, password }: { roomName: string, isPrivate: boolean, password?: string }) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        // Validate password if provided
        if (password && (password.length !== 6 || !/^\d{6}$/.test(password))) {
            socket.emit('room-creation-error', { message: 'Password must be exactly 6 digits' });
            return;
        }

        const room: Room = {
            id: `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: roomName,
            createdBy: user.name,
            createdAt: Date.now(),
            userCount: 1,
            isPrivate,
            password: password || undefined
        };

        rooms.set(room.id, room);
        roomUsers.set(room.id, new Set([socket.id]));
        userRooms.set(socket.id, room.id);

        // Join the room
        socket.join(room.id);

        // Send room info to creator
        socket.emit('room-created', { room, users: [user] });

        // Update room list for all users
        const publicRooms = Array.from(rooms.values()).filter(r => !r.isPrivate);
        io.emit('rooms-list', { rooms: publicRooms });

        console.log(`🏠 Room created: ${room.name} by ${user.name}${password ? ' (password protected)' : ''}`);
    });

    socket.on('join-room', ({ roomId, password }: { roomId: string, password?: string }) => {
        const user = connectedUsers.get(socket.id);
        const room = rooms.get(roomId);
        
        if (!user || !room) {
            socket.emit('room-join-error', { message: 'Room not found' });
            return;
        }

        // Check password if room is password protected
        if (room.password && room.password !== password) {
            socket.emit('room-join-error', { message: 'Incorrect password' });
            return;
        }

        // Leave current room if any
        const currentRoomId = userRooms.get(socket.id);
        if (currentRoomId) {
            socket.leave(currentRoomId);
            const currentRoomUsers = roomUsers.get(currentRoomId);
            if (currentRoomUsers) {
                currentRoomUsers.delete(socket.id);
                const currentRoom = rooms.get(currentRoomId);
                if (currentRoom) {
                    currentRoom.userCount = currentRoomUsers.size;
                    if (currentRoomUsers.size === 0) {
                        rooms.delete(currentRoomId);
                        roomUsers.delete(currentRoomId);
                    }
                }
            }
        }

        // Join new room
        socket.join(roomId);
        userRooms.set(socket.id, roomId);
        
        const roomUsersSet = roomUsers.get(roomId) || new Set();
        roomUsersSet.add(socket.id);
        roomUsers.set(roomId, roomUsersSet);
        
        room.userCount = roomUsersSet.size;

        // Get users in the room
        const usersInRoom = Array.from(roomUsersSet).map(id => connectedUsers.get(id)).filter(Boolean) as User[];

        // Notify user about successful join
        socket.emit('room-joined', { room, users: usersInRoom });

        // Notify other users in the room
        socket.to(roomId).emit('user-joined-room', { user, users: usersInRoom });

        console.log(`👤 ${user.name} joined room: ${room.name}`);
    });

    socket.on('leave-room', () => {
        const user = connectedUsers.get(socket.id);
        const roomId = userRooms.get(socket.id);
        
        if (!user || !roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        socket.leave(roomId);
        userRooms.delete(socket.id);

        const roomUsersSet = roomUsers.get(roomId);
        if (roomUsersSet) {
            roomUsersSet.delete(socket.id);
            room.userCount = roomUsersSet.size;

            if (roomUsersSet.size === 0) {
                // Delete empty room
                rooms.delete(roomId);
                roomUsers.delete(roomId);
                console.log(`🗑️ Room deleted: ${room.name}`);
            } else {
                // Notify remaining users
                const remainingUsers = Array.from(roomUsersSet).map(id => connectedUsers.get(id)).filter(Boolean) as User[];
                socket.to(roomId).emit('user-left-room', { userId: socket.id, users: remainingUsers });
            }
        }

        // Update room list
        const publicRooms = Array.from(rooms.values()).filter(r => !r.isPrivate);
        io.emit('rooms-list', { rooms: publicRooms });

        console.log(`👋 ${user.name} left room: ${room.name}`);
    });

    socket.on('get-rooms', () => {
        const publicRooms = Array.from(rooms.values()).filter(r => !r.isPrivate);
        socket.emit('rooms-list', { rooms: publicRooms });
    });

    // Drawing persistence events
    socket.on('save-drawing', ({ name, roomId, actions, thumbnail }: SaveDrawingRequest) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const drawing: SavedDrawing = {
            id: `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            roomId,
            createdBy: user.name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            actions,
            thumbnail
        };

        savedDrawings.set(drawing.id, drawing);

        // Notify user about successful save
        socket.emit('drawing-saved', { drawing });

        // Update drawings list for room users
        const roomDrawings = Array.from(savedDrawings.values()).filter(d => d.roomId === roomId);
        socket.to(roomId).emit('drawings-updated', { drawings: roomDrawings });

        console.log(`💾 Drawing saved: ${name} by ${user.name}`);
    });

    socket.on('load-drawing', ({ drawingId }: { drawingId: string }) => {
        const user = connectedUsers.get(socket.id);
        const drawing = savedDrawings.get(drawingId);
        
        if (!user || !drawing) return;

        // Send drawing data to user
        socket.emit('drawing-loaded', { drawing });

        console.log(`📂 Drawing loaded: ${drawing.name} by ${user.name}`);
    });

    socket.on('delete-drawing', ({ drawingId }: { drawingId: string }) => {
        const user = connectedUsers.get(socket.id);
        const drawing = savedDrawings.get(drawingId);
        
        if (!user || !drawing) return;

        // Only allow creator to delete
        if (drawing.createdBy !== user.name) return;

        savedDrawings.delete(drawingId);

        // Notify user about successful deletion
        socket.emit('drawing-deleted', { drawingId });

        // Update drawings list for room users
        const roomDrawings = Array.from(savedDrawings.values()).filter(d => d.roomId === drawing.roomId);
        socket.to(drawing.roomId).emit('drawings-updated', { drawings: roomDrawings });

        console.log(`🗑️ Drawing deleted: ${drawing.name} by ${user.name}`);
    });

    socket.on('get-drawings', ({ roomId }: { roomId: string }) => {
        const roomDrawings = Array.from(savedDrawings.values()).filter(d => d.roomId === roomId);
        socket.emit('drawings-list', { drawings: roomDrawings });
    });

    socket.on('draw-line', ({currentPoint, prevPoint, color, userId, userName, brushSize, tool, roomId}: DrawLine) => {
        // Only broadcast to users in the same room
        socket.to(roomId).emit('draw-line', {currentPoint, prevPoint, color, userId, userName, brushSize, tool, roomId})
    })

    socket.on('clear-canvas', ({ roomId }: { roomId: string }) => {
        // Only broadcast to users in the same room
        socket.to(roomId).emit('clear-canvas', { roomId })
    })

    // Undo/Redo events
    socket.on('undo-action', ({ roomId }: { roomId: string }) => {
        // Broadcast undo action to all users in the same room
        socket.to(roomId).emit('undo-action', { roomId })
    })

    socket.on('redo-action', ({ roomId }: { roomId: string }) => {
        // Broadcast redo action to all users in the same room
        socket.to(roomId).emit('redo-action', { roomId })
    })

    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        const roomId = userRooms.get(socket.id);
        
        if (user) {
            console.log(`👋 ${user.name} left the drawing session`);
            connectedUsers.delete(socket.id);
            
            // Handle room cleanup
            if (roomId) {
                const room = rooms.get(roomId);
                if (room) {
                    const roomUsersSet = roomUsers.get(roomId);
                    if (roomUsersSet) {
                        roomUsersSet.delete(socket.id);
                        room.userCount = roomUsersSet.size;
                        
                        if (roomUsersSet.size === 0) {
                            // Delete empty room
                            rooms.delete(roomId);
                            roomUsers.delete(roomId);
                            console.log(`🗑️ Room deleted: ${room.name}`);
                        } else {
                            // Notify remaining users in room
                            const remainingUsers = Array.from(roomUsersSet).map(id => connectedUsers.get(id)).filter(Boolean) as User[];
                            socket.to(roomId).emit('user-left-room', { userId: socket.id, users: remainingUsers });
                        }
                    }
                }
                userRooms.delete(socket.id);
                
                // Update room list
                const publicRooms = Array.from(rooms.values()).filter(r => !r.isPrivate);
                io.emit('rooms-list', { rooms: publicRooms });
            }
            
            // Send updated users list to remaining clients
            const usersList = Array.from(connectedUsers.values());
            io.emit('users-list', usersList);
            
            // Notify other users about the user leaving
            socket.broadcast.emit('user-left', {
                userId: socket.id,
                users: usersList
            });
        } else {
            console.log('User disconnected:', socket.id)
        }
    })
})

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
