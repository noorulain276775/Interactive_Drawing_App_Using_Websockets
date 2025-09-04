import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [connectedUsers, setConnectedUsers] = useState<User[]>([])

  // Generate a random user name and color
  const generateUserInfo = (): { name: string, color: string } => {
    const names = ['Artist', 'Creator', 'Designer', 'Painter', 'Sketch', 'Drawer', 'Maker', 'Builder']
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
    
    const randomName = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 100)
    const randomColor = colors[Math.floor(Math.random() * colors.length)]
    
    return { name: randomName, color: randomColor }
  }

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })

    // Connection event handlers
    socketRef.current.on('connect', () => {
      console.log('✅ Connected to server:', socketRef.current?.id)
      setIsConnected(true)
      
      // Generate user info and join
      const userInfo = generateUserInfo()
      const user: User = {
        id: socketRef.current.id!,
        name: userInfo.name,
        color: userInfo.color,
        isActive: true
      }
      setCurrentUser(user)
      
      // Emit user join event
      socketRef.current.emit('user-join', user)
    })

    socketRef.current.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server:', reason)
      setIsConnected(false)
      setCurrentUser(null)
      setConnectedUsers([])
    })

    socketRef.current.on('connect_error', (error) => {
      console.error('🚨 Connection error:', error.message)
      setIsConnected(false)
    })

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempts')
      setIsConnected(true)
    })

    // User management events
    socketRef.current.on('user-joined', ({ user, users }: UserJoined) => {
      console.log('👤 User joined:', user.name)
      setConnectedUsers(users)
    })

    socketRef.current.on('user-left', ({ userId, users }: UserLeft) => {
      console.log('👋 User left:', userId)
      setConnectedUsers(users)
    })

    socketRef.current.on('users-list', (users: User[]) => {
      setConnectedUsers(users)
    })

    // Room management events
    socketRef.current.on('room-created', ({ room, users }: { room: Room, users: User[] }) => {
      console.log('🏠 Room created:', room.name)
      setConnectedUsers(users)
      // Update current room in the room hook
      if (window.updateCurrentRoom) {
        window.updateCurrentRoom(room)
      }
    })

    socketRef.current.on('room-joined', ({ room, users }: { room: Room, users: User[] }) => {
      console.log('👤 Joined room:', room.name)
      setConnectedUsers(users)
      // Update current room in the room hook
      if (window.updateCurrentRoom) {
        window.updateCurrentRoom(room)
      }
    })

    socketRef.current.on('user-joined-room', ({ user, users }: { user: User, users: User[] }) => {
      console.log('👤 User joined room:', user.name)
      setConnectedUsers(users)
    })

    socketRef.current.on('user-left-room', ({ userId, users }: { userId: string, users: User[] }) => {
      console.log('👋 User left room:', userId)
      setConnectedUsers(users)
    })

    socketRef.current.on('rooms-list', ({ rooms }: { rooms: Room[] }) => {
      console.log('📋 Rooms list updated:', rooms.length, 'rooms')
      // Update room list in the room hook
      if (window.updateRoomList) {
        window.updateRoomList(rooms)
      }
    })

    // Password-related error handlers
    socketRef.current.on('room-creation-error', ({ message }: { message: string }) => {
      console.error('❌ Room creation error:', message)
      // Update error message in the room hook
      if (window.updateErrorMessage) {
        window.updateErrorMessage(message)
      }
    })

    socketRef.current.on('room-join-error', ({ message }: { message: string }) => {
      console.error('❌ Room join error:', message)
      // Update error message in the room hook
      if (window.updateErrorMessage) {
        window.updateErrorMessage(message)
      }
    })

    // Undo/Redo events from other users
    socketRef.current.on('undo-action', ({ roomId }: { roomId: string }) => {
      console.log('↶ Undo action received from other user')
      // Handle undo action from other users
      if (window.handleUndoFromOther) {
        window.handleUndoFromOther()
      }
    })

    socketRef.current.on('redo-action', ({ roomId }: { roomId: string }) => {
      console.log('↷ Redo action received from other user')
      // Handle redo action from other users
      if (window.handleRedoFromOther) {
        window.handleRedoFromOther()
      }
    })

    // Drawing persistence events
    socketRef.current.on('drawing-saved', ({ drawing }: { drawing: SavedDrawing }) => {
      console.log('💾 Drawing saved:', drawing.name)
      // Update saved drawings in the persistence hook
      if (window.updateSavedDrawings) {
        window.updateSavedDrawings([drawing])
      }
    })

    socketRef.current.on('drawing-loaded', ({ drawing }: { drawing: SavedDrawing }) => {
      console.log('📂 Drawing loaded:', drawing.name)
      // Handle loaded drawing in the persistence hook
      if (window.handleDrawingLoaded) {
        window.handleDrawingLoaded(drawing)
      }
    })

    socketRef.current.on('drawing-deleted', ({ drawingId }: { drawingId: string }) => {
      console.log('🗑️ Drawing deleted:', drawingId)
      // Update saved drawings in the persistence hook
      if (window.handleDrawingDeleted) {
        window.handleDrawingDeleted(drawingId)
      }
    })

    socketRef.current.on('drawings-list', ({ drawings }: { drawings: SavedDrawing[] }) => {
      console.log('📋 Drawings list updated:', drawings.length, 'drawings')
      // Update saved drawings in the persistence hook
      if (window.updateSavedDrawings) {
        window.updateSavedDrawings(drawings)
      }
    })

    socketRef.current.on('drawings-updated', ({ drawings }: { drawings: SavedDrawing[] }) => {
      console.log('🔄 Drawings updated:', drawings.length, 'drawings')
      // Update saved drawings in the persistence hook
      if (window.updateSavedDrawings) {
        window.updateSavedDrawings(drawings)
      }
    })

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        setIsConnected(false)
        setCurrentUser(null)
        setConnectedUsers([])
      }
    }
  }, [])

  return { 
    socket: socketRef.current, 
    isConnected, 
    currentUser, 
    connectedUsers 
  }
}
