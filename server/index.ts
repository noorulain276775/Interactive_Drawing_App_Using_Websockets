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

type DrawLine = {
    prevPoint: Point | null
    currentPoint: Point
    color: string

}

io.on('connection', (socket) => {
    socket.on('draw-line', ({currentPoint, prevPoint, color}: DrawLine) => {
        socket.broadcast.emit('draw-line', {currentPoint, prevPoint, color})
    })
})

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
