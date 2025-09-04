import { useState, useCallback } from 'react'

export const useRoom = () => {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [availableRooms, setAvailableRooms] = useState<Room[]>([])
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [showRoomList, setShowRoomList] = useState(false)

  const createRoom = useCallback((roomName: string, isPrivate: boolean = false) => {
    const room: Room = {
      id: `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: roomName,
      createdBy: 'current_user', // This will be set by the socket
      createdAt: Date.now(),
      userCount: 1,
      isPrivate
    }
    return room
  }, [])

  const joinRoom = useCallback((roomId: string) => {
    // This will be handled by the socket
    return roomId
  }, [])

  const leaveRoom = useCallback(() => {
    setCurrentRoom(null)
  }, [])

  const updateRoomList = useCallback((rooms: Room[]) => {
    setAvailableRooms(rooms)
  }, [])

  const updateCurrentRoom = useCallback((room: Room) => {
    setCurrentRoom(room)
  }, [])

  const toggleRoomList = useCallback(() => {
    setShowRoomList(prev => !prev)
  }, [])

  const toggleCreateRoom = useCallback(() => {
    setIsCreatingRoom(prev => !prev)
  }, [])

  return {
    currentRoom,
    availableRooms,
    isCreatingRoom,
    showRoomList,
    createRoom,
    joinRoom,
    leaveRoom,
    updateRoomList,
    updateCurrentRoom,
    toggleRoomList,
    toggleCreateRoom
  }
}

