'use client'

import { FC, useState, useEffect } from 'react'
import { useDraw } from '../../hooks/useDraw'
import { useSocket } from '../../hooks/useSocket'
import { useDrawingTools } from '../../hooks/useDrawingTools'
import { useRoom } from '../../hooks/useRoom'
import { useDrawingPersistence } from '../../hooks/useDrawingPersistence'
import { drawShape, redrawCanvas } from '../../utils/drawingUtils'
import dynamic from 'next/dynamic'

// Dynamically import ChromePicker to prevent SSR issues
const ChromePicker = dynamic(() => import('react-color').then(mod => ({ default: mod.ChromePicker })), {
  ssr: false,
  loading: () => <div className="w-225 h-150 bg-gray-200 rounded animate-pulse"></div>
})

interface pageProps {}

// Client-only wrapper component to prevent hydration issues
const ClientOnlyWrapper: FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (!hasMounted) {
    return (
      <div className='w-screen h-screen bg-white flex justify-center items-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4'></div>
          <p className='text-gray-600'>Loading drawing app...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

const page: FC<pageProps> = ({}) => {
  const [color, setColor] = useState<string>('#000')
  const { socket, isConnected, currentUser, connectedUsers } = useSocket()
  const { 
    selectedTool, 
    setSelectedTool, 
    brushSize, 
    setBrushSize,
    isDrawing,
    setIsDrawing,
    startPoint,
    setStartPoint,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getCurrentHistory
  } = useDrawingTools()
  
  const {
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
  } = useRoom()
  
  const {
    savedDrawings,
    isSaving,
    isLoading,
    showSaveDialog,
    showLoadDialog,
    saveDrawing,
    loadDrawing,
    deleteDrawing,
    getDrawingsForRoom,
    exportDrawing,
    exportDrawingData,
    importDrawing,
    updateSavedDrawings,
    toggleSaveDialog,
    toggleLoadDialog
  } = useDrawingPersistence()
  
  const { canvasRef, onMouseDown, clear } = useDraw(drawLine)

  // State for drawing functionality
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomPassword, setNewRoomPassword] = useState('')
  const [joinRoomPassword, setJoinRoomPassword] = useState('')
  const [selectedRoomToJoin, setSelectedRoomToJoin] = useState<string | null>(null)
  const [roomCanvasHistory, setRoomCanvasHistory] = useState<Map<string, DrawAction[]>>(new Map())
  const [saveDrawingName, setSaveDrawingName] = useState('')
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [canUndoState, setCanUndoState] = useState(false)
  const [canRedoState, setCanRedoState] = useState(false)


  // Update undo/redo state whenever history changes
  useEffect(() => {
    setCanUndoState(canUndo())
    setCanRedoState(canRedo())
  }, [canUndo, canRedo])

  // Connect room hook with socket events
  useEffect(() => {
    if (socket) {
      // Set up global handlers for room management
      ;(window as any).updateCurrentRoom = updateCurrentRoom
      ;(window as any).updateRoomList = updateRoomList
      ;(window as any).updateSavedDrawings = updateSavedDrawings
      ;(window as any).handleDrawingLoaded = handleDrawingLoaded
      ;(window as any).handleDrawingDeleted = handleDrawingDeleted
      ;(window as any).updateErrorMessage = setErrorMessage
      ;(window as any).handleUndoFromOther = handleUndoFromOther
      ;(window as any).handleRedoFromOther = handleRedoFromOther
    }
    
    return () => {
      // Cleanup global handlers
      delete (window as any).updateCurrentRoom
      delete (window as any).updateRoomList
      delete (window as any).updateSavedDrawings
      delete (window as any).handleDrawingLoaded
      delete (window as any).handleDrawingDeleted
      delete (window as any).updateErrorMessage
      delete (window as any).handleUndoFromOther
      delete (window as any).handleRedoFromOther
    }
  }, [socket, updateCurrentRoom, updateRoomList, updateSavedDrawings])

  // Listen for drawing events from other clients
  useEffect(() => {
    if (!socket) return

    const handleDrawLine = ({ currentPoint, prevPoint, color, userId, userName, brushSize, tool, roomId }: DrawLine) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Don't draw if it's from the current user (prevent self-drawing)
      if (currentUser && userId === currentUser.id) return

      // Only draw if it's for the current room
      if (currentRoom && roomId !== currentRoom.id) return

      // Draw the line received from another client (without emitting)
      drawLineFromSocket({ ctx, currentPoint, prevPoint, color, brushSize, tool })
      
      // Show user activity indicator
      setActiveDrawer(userName)
      setTimeout(() => setActiveDrawer(null), 1000) // Clear after 1 second
    }

    const handleClearCanvas = ({ roomId }: { roomId: string }) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Only clear if it's for the current room
      if (currentRoom && roomId !== currentRoom.id) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    socket.on('draw-line', handleDrawLine)
    socket.on('clear-canvas', handleClearCanvas)

    return () => {
      socket.off('draw-line', handleDrawLine)
      socket.off('clear-canvas', handleClearCanvas)
    }
  }, [socket, canvasRef, currentRoom])

  // Function to draw from socket data (without emitting)
  function drawLineFromSocket({ prevPoint, currentPoint, ctx, color, brushSize, tool }: Draw & { color: string, brushSize: number, tool: DrawingTool }) {
    const points = prevPoint ? [prevPoint, currentPoint] : [currentPoint]
    drawShape(ctx, tool, points, color, brushSize)
  }

  // Function to draw from user input (with emitting)
  function drawLine({ prevPoint, currentPoint, ctx }: Draw) {
    if (!currentUser) return

    const points = prevPoint ? [prevPoint, currentPoint] : [currentPoint]
    
    // Add to current path for continuous drawing
    setCurrentPath(prev => [...prev, currentPoint])
    
    // Draw the shape
    drawShape(ctx, selectedTool, points, color, brushSize)

    // Don't add to history here - we'll add the complete path on mouse up

    // Emit drawing data to other clients
    if (socket && isConnected && currentUser && currentRoom) {
      socket.emit('draw-line', {
        currentPoint,
        prevPoint,
        color,
        brushSize,
        tool: selectedTool,
        userId: currentUser.id,
        userName: currentUser.name,
        roomId: currentRoom.id
      })
    }
  }

  // Handle mouse down for all tools
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }

    setIsDrawing(true)
    setStartPoint(point)
    setCurrentPath([point])

    // For brush and eraser, start drawing immediately
    if (selectedTool === 'brush' || selectedTool === 'eraser') {
      onMouseDown()
    }
    // For shape tools, we'll handle them on mouse up
  }

  // Handle mouse move for shape preview
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const currentPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }

    // For brush and eraser, use the existing drawing logic
    if (selectedTool === 'brush' || selectedTool === 'eraser') {
      // The existing onMouseMove from useDraw hook handles this
      return
    }

    // For shape tools, update the current path and redraw
    if (selectedTool === 'rectangle' || selectedTool === 'circle' || selectedTool === 'line') {
      setCurrentPath([startPoint, currentPoint])
      
      // Redraw the canvas with the preview
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) {
          // Clear and redraw everything
          redrawCanvas(ctx, getCurrentHistory())
          
          // Draw the preview shape
          drawShape(ctx, selectedTool, [startPoint, currentPoint], color, brushSize)
        }
      }
    }
  }

  // Handle mouse up for shape completion
  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !currentUser) return

    setIsDrawing(false)
    
    // For shape tools, we need to draw the shape now
    if (selectedTool === 'rectangle' || selectedTool === 'circle' || selectedTool === 'line') {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        if (ctx && currentPath.length >= 2) {
          // Draw the shape
          drawShape(ctx, selectedTool, currentPath, color, brushSize)
          
          // Emit to other clients
          if (socket && isConnected && currentRoom) {
            socket.emit('draw-line', {
              currentPoint: currentPath[currentPath.length - 1],
              prevPoint: currentPath[0],
              color,
              brushSize,
              tool: selectedTool,
              userId: currentUser.id,
              userName: currentUser.name,
              roomId: currentRoom.id
            })
          }
        }
      }
    }
    
    // Complete the drawing action
    if (currentPath.length > 0) {
      const action: DrawAction = {
        type: selectedTool,
        points: currentPath,
        color: selectedTool === 'eraser' ? 'eraser' : color, // Special marker for eraser
        brushSize,
        userId: currentUser.id,
        userName: currentUser.name,
        timestamp: Date.now()
      }
      
      addToHistory(action)
      // Update undo/redo state
      setCanUndoState(canUndo())
      setCanRedoState(canRedo())
    }

    setStartPoint(null)
    setCurrentPath([])
  }

  // Handle undo
  const handleUndo = () => {
    if (undo() && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        redrawCanvas(ctx, getCurrentHistory())
      }
      // Update undo/redo state
      setCanUndoState(canUndo())
      setCanRedoState(canRedo())
      
      // Emit undo action to other users in the room
      if (socket && isConnected && currentRoom) {
        socket.emit('undo-action', { roomId: currentRoom.id })
      }
    }
  }

  // Handle redo
  const handleRedo = () => {
    if (redo() && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        redrawCanvas(ctx, getCurrentHistory())
      }
      // Update undo/redo state
      setCanUndoState(canUndo())
      setCanRedoState(canRedo())
      
      // Emit redo action to other users in the room
      if (socket && isConnected && currentRoom) {
        socket.emit('redo-action', { roomId: currentRoom.id })
      }
    }
  }

  // Handle clear with history
  const handleClear = () => {
    clear()
    clearHistory()
    
    // Update undo/redo state
    setCanUndoState(canUndo())
    setCanRedoState(canRedo())
    
    // Broadcast clear event to other clients
    if (socket && isConnected && currentRoom) {
      socket.emit('clear-canvas', { roomId: currentRoom.id })
    }
  }

  // Handle undo from other users
  const handleUndoFromOther = () => {
    if (undo() && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        redrawCanvas(ctx, getCurrentHistory())
      }
      // Update undo/redo state
      setCanUndoState(canUndo())
      setCanRedoState(canRedo())
    }
  }

  // Handle redo from other users
  const handleRedoFromOther = () => {
    if (redo() && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        redrawCanvas(ctx, getCurrentHistory())
      }
      // Update undo/redo state
      setCanUndoState(canUndo())
      setCanRedoState(canRedo())
    }
  }

  // Room management handlers
  const handleCreateRoom = () => {
    if (newRoomName.trim() && socket && currentUser) {
      // Validate password if provided
      if (newRoomPassword && (newRoomPassword.length !== 6 || !/^\d{6}$/.test(newRoomPassword))) {
        setErrorMessage('Password must be exactly 6 digits')
        setTimeout(() => setErrorMessage(null), 5000)
        return
      }

      socket.emit('create-room', { 
        roomName: newRoomName.trim(), 
        isPrivate: false, 
        password: newRoomPassword || undefined 
      })
      setNewRoomName('')
      setNewRoomPassword('')
      toggleCreateRoom()
    }
  }

  const handleJoinRoom = (roomId: string) => {
    if (socket) {
      // Check if room requires password
      const room = availableRooms.find(r => r.id === roomId)
      if (room && room.password) {
        setSelectedRoomToJoin(roomId)
        setJoinRoomPassword('')
        return
      }
      
      // Join room without password
      socket.emit('join-room', { roomId })
      toggleRoomList()
    }
  }

  const handleJoinRoomWithPassword = () => {
    if (socket && selectedRoomToJoin) {
      socket.emit('join-room', { roomId: selectedRoomToJoin, password: joinRoomPassword })
      setSelectedRoomToJoin(null)
      setJoinRoomPassword('')
      toggleRoomList()
    }
  }

  const handleLeaveRoom = () => {
    if (socket) {
      socket.emit('leave-room')
      leaveRoom()
      clear()
      clearHistory()
    }
  }

  const handleGetRooms = () => {
    if (socket) {
      socket.emit('get-rooms')
    }
  }

  // Drawing persistence handlers
  const handleSaveDrawing = async () => {
    if (!canvasRef.current || !currentRoom || !currentUser || !socket) return
    
    const success = await saveDrawing(
      saveDrawingName,
      getCurrentHistory(),
      canvasRef.current,
      currentRoom.id,
      currentUser.name,
      socket
    )
    
    if (success) {
      setSaveDrawingName('')
    }
  }

  const handleLoadDrawing = async (drawingId: string) => {
    if (!socket) return
    await loadDrawing(drawingId, socket)
  }

  const handleDrawingLoaded = (drawing: SavedDrawing) => {
    if (!canvasRef.current) return
    
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return
    
    // Clear current canvas and history
    clear()
    clearHistory()
    
    // Redraw the loaded drawing
    redrawCanvas(ctx, drawing.actions)
    
    // Update history with loaded actions
    drawing.actions.forEach(action => {
      addToHistory(action)
    })
  }

  const handleDrawingDeleted = (drawingId: string) => {
    // The savedDrawings state will be updated by the socket event
    console.log('Drawing deleted:', drawingId)
  }

  const handleExportDrawing = () => {
    if (!canvasRef.current) return
    const filename = currentRoom ? `${currentRoom.name}_drawing.png` : 'drawing.png'
    exportDrawing(canvasRef.current, filename)
  }

  const handleExportDrawingData = () => {
    const filename = currentRoom ? `${currentRoom.name}_drawing.json` : 'drawing.json'
    exportDrawingData(getCurrentHistory(), filename)
  }

  const handleImportDrawing = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      const actions = await importDrawing(file)
      
      if (!canvasRef.current) return
      const ctx = canvasRef.current.getContext('2d')
      if (!ctx) return
      
      // Clear current canvas and history
      clear()
      clearHistory()
      
      // Redraw the imported drawing
      redrawCanvas(ctx, actions)
      
      // Update history with imported actions
      actions.forEach(action => {
        addToHistory(action)
      })
      
      console.log('Drawing imported successfully')
    } catch (error) {
      console.error('Failed to import drawing:', error)
      alert('Failed to import drawing. Please check the file format.')
    }
    
    // Reset file input
    if (fileInputRef) {
      fileInputRef.value = ''
    }
  }

  const handleGetDrawings = () => {
    if (socket && currentRoom) {
      socket.emit('get-drawings', { roomId: currentRoom.id })
    }
  }

  return (
    <ClientOnlyWrapper>
      <div className='w-screen h-screen bg-white flex flex-col lg:flex-row'>
        {/* Mobile Header */}
        <div className='lg:hidden p-4 bg-gray-50 border-b'>
          <div className='flex items-center justify-between'>
            <h1 className='text-lg font-semibold text-gray-800'>Drawing App</h1>
            <div className={`px-2 py-1 rounded text-xs font-medium ${
              isConnected 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
          </div>
          
          {/* Error Message */}
          {errorMessage && (
            <div className='mt-2 p-2 bg-red-100 border border-red-300 text-red-700 text-sm rounded'>
              {errorMessage}
            </div>
          )}
        </div>

        {/* Sidebar - Hidden on mobile, shown on desktop */}
        <div className='hidden lg:flex lg:flex-col lg:w-80 lg:h-screen lg:overflow-y-auto lg:bg-gray-50 lg:border-r lg:p-4 lg:gap-4'>
        {/* Connection Status */}
        <div className={`p-2 rounded-md text-sm font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800 border border-green-300' 
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className='p-2 bg-red-100 border border-red-300 text-red-700 text-sm rounded'>
            {errorMessage}
          </div>
        )}

        {/* Room Management */}
        <div className='p-3 rounded-md bg-purple-50 border border-purple-200'>
          <div className='text-sm font-medium text-purple-800 mb-2'>Room Management</div>
          
          {currentRoom ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <span className='text-sm text-purple-700'>
                  Current Room: <strong>{currentRoom.name}</strong>
                </span>
                <button
                  type='button'
                  className='px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200'
                  onClick={handleLeaveRoom}
                >
                  Leave Room
                </button>
              </div>
              <div className='text-xs text-purple-600'>
                Users: {connectedUsers.length} | Created by: {currentRoom.createdBy}
              </div>
            </div>
          ) : (
            <div className='space-y-2'>
              <div className='flex gap-2'>
                <button
                  type='button'
                  className='px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200'
                  onClick={toggleCreateRoom}
                >
                  Create Room
                </button>
                <button
                  type='button'
                  className='px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200'
                  onClick={() => {
                    toggleRoomList()
                    handleGetRooms()
                  }}
                >
                  Join Room
                </button>
              </div>
              
              {isCreatingRoom && (
                <div className='space-y-2'>
                  <input
                    type='text'
                    placeholder='Room name'
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className='w-full px-2 py-1 text-sm border border-purple-300 rounded'
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                  />
                  <input
                    type='text'
                    placeholder='Password (6 digits, optional)'
                    value={newRoomPassword}
                    onChange={(e) => setNewRoomPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className='w-full px-2 py-1 text-sm border border-purple-300 rounded'
                    maxLength={6}
                  />
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      className='px-2 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200'
                      onClick={handleCreateRoom}
                    >
                      Create
                    </button>
                    <button
                      type='button'
                      className='px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200'
                      onClick={toggleCreateRoom}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              {showRoomList && (
                <div className='max-h-32 overflow-y-auto space-y-1'>
                  {availableRooms.length > 0 ? (
                    availableRooms.map((room) => (
                      <div key={room.id} className='flex items-center justify-between p-2 bg-white rounded border'>
                        <div className='text-sm'>
                          <div className='font-medium flex items-center gap-1'>
                            {room.name}
                            {room.password && <span className='text-xs text-orange-600'>🔒</span>}
                          </div>
                          <div className='text-xs text-gray-500'>
                            {room.userCount} users | by {room.createdBy}
                          </div>
                        </div>
                        <button
                          type='button'
                          className='px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200'
                          onClick={() => handleJoinRoom(room.id)}
                        >
                          Join
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className='text-sm text-gray-500 text-center py-2'>
                      No rooms available
                    </div>
                  )}
                  
                  {/* Password Input Modal */}
                  {selectedRoomToJoin && (
                    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
                      <div className='bg-white p-4 rounded-lg shadow-lg max-w-sm w-full mx-4'>
                        <h3 className='text-lg font-medium text-gray-900 mb-4'>Enter Room Password</h3>
                        <p className='text-sm text-gray-600 mb-4'>
                          This room is password protected. Please enter the 6-digit password.
                        </p>
                        <input
                          type='text'
                          placeholder='Enter 6-digit password'
                          value={joinRoomPassword}
                          onChange={(e) => setJoinRoomPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                          maxLength={6}
                          autoFocus
                        />
                        <div className='flex gap-2 mt-4'>
                          <button
                            type='button'
                            className='flex-1 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600'
                            onClick={handleJoinRoomWithPassword}
                            disabled={joinRoomPassword.length !== 6}
                          >
                            Join Room
                          </button>
                          <button
                            type='button'
                            className='flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400'
                            onClick={() => {
                              setSelectedRoomToJoin(null)
                              setJoinRoomPassword('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Current User Info */}
        {currentUser && (
          <div className='p-3 rounded-md bg-blue-50 border border-blue-200'>
            <div className='text-sm font-medium text-blue-800'>You are:</div>
            <div className='flex items-center gap-2 mt-1'>
              <div 
                className='w-4 h-4 rounded-full border-2 border-white shadow-sm'
                style={{ backgroundColor: currentUser.color }}
              ></div>
              <span className='text-blue-700 font-medium'>{currentUser.name}</span>
            </div>
          </div>
        )}

        {/* Connected Users List */}
        {connectedUsers.length > 0 && (
          <div className='p-3 rounded-md bg-gray-50 border border-gray-200'>
            <div className='text-sm font-medium text-gray-700 mb-2'>
              Connected Users ({connectedUsers.length})
            </div>
            <div className='space-y-1 max-h-32 overflow-y-auto'>
              {connectedUsers.map((user) => (
                <div key={user.id} className='flex items-center gap-2 text-sm'>
                  <div 
                    className='w-3 h-3 rounded-full border border-white shadow-sm'
                    style={{ backgroundColor: user.color }}
                  ></div>
                  <span className={user.id === currentUser?.id ? 'font-medium text-blue-600' : 'text-gray-600'}>
                    {user.name}
                    {user.id === currentUser?.id && ' (You)'}
                    {activeDrawer === user.name && ' ✏️'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Drawer Indicator */}
        {activeDrawer && (
          <div className='p-2 rounded-md bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm font-medium'>
            🎨 {activeDrawer} is drawing...
          </div>
        )}
        
        {/* Drawing Tools */}
        <div className='p-3 rounded-md bg-gray-50 border border-gray-200'>
          <div className='text-sm font-medium text-gray-700 mb-2'>Drawing Tools</div>
          <div className='flex flex-wrap gap-2 mb-3'>
            {(['brush', 'rectangle', 'circle', 'line', 'eraser'] as DrawingTool[]).map((tool) => (
              <button
                key={tool}
                type='button'
                className={`px-2 py-2 rounded-md border text-sm font-medium transition-colors flex-shrink-0 ${
                  selectedTool === tool
                    ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedTool(tool)}
              >
                {tool === 'brush' && '🖌️ '}
                {tool === 'rectangle' && '⬜ '}
                {tool === 'circle' && '⭕ '}
                {tool === 'line' && '📏 '}
                {tool === 'eraser' && '🧽 '}
                {tool.charAt(0).toUpperCase() + tool.slice(1)}
              </button>
            ))}
          </div>
          
          {/* Brush Size */}
          <div className='mb-3'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              Brush Size: {brushSize}px
            </label>
            <input
              type='range'
              min='1'
              max='20'
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className='w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer'
            />
          </div>
        </div>

        {/* Color Picker */}
        <div className='p-3 rounded-md bg-gray-50 border border-gray-200'>
          <div className='text-sm font-medium text-gray-700 mb-2'>Color</div>
          <div className='flex justify-center'>
            <ChromePicker 
              color={color} 
              onChange={(e) => setColor(e.hex)}
              width="225px"
              disableAlpha={true}
            />
          </div>
        </div>

        {/* Drawing Persistence */}
        {currentRoom && (
          <div className='p-3 rounded-md bg-green-50 border border-green-200'>
            <div className='text-sm font-medium text-green-800 mb-2'>Save & Load</div>
            <div className='space-y-2'>
              <div className='flex gap-2'>
                <button
                  type='button'
                  className='px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200'
                  onClick={toggleSaveDialog}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Drawing'}
                </button>
                <button
                  type='button'
                  className='px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200'
                  onClick={() => {
                    toggleLoadDialog()
                    handleGetDrawings()
                  }}
                >
                  Load Drawing
                </button>
              </div>
              
              <div className='flex gap-2'>
                <button
                  type='button'
                  className='px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200'
                  onClick={handleExportDrawing}
                >
                  Export PNG
                </button>
                <button
                  type='button'
                  className='px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200'
                  onClick={handleExportDrawingData}
                >
                  Export JSON
                </button>
                <label className='px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200 cursor-pointer'>
                  Import JSON
                  <input
                    ref={setFileInputRef}
                    type='file'
                    accept='.json'
                    onChange={handleImportDrawing}
                    className='hidden'
                  />
                </label>
              </div>
              
              {showSaveDialog && (
                <div className='flex gap-2'>
                  <input
                    type='text'
                    placeholder='Drawing name'
                    value={saveDrawingName}
                    onChange={(e) => setSaveDrawingName(e.target.value)}
                    className='flex-1 px-2 py-1 text-sm border border-green-300 rounded'
                    onKeyPress={(e) => e.key === 'Enter' && handleSaveDrawing()}
                  />
                  <button
                    type='button'
                    className='px-2 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200'
                    onClick={handleSaveDrawing}
                    disabled={!saveDrawingName.trim() || isSaving}
                  >
                    Save
                  </button>
                  <button
                    type='button'
                    className='px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200'
                    onClick={toggleSaveDialog}
                  >
                    Cancel
                  </button>
                </div>
              )}
              
              {showLoadDialog && (
                <div className='max-h-32 overflow-y-auto space-y-1'>
                  {getDrawingsForRoom(currentRoom.id).length > 0 ? (
                    getDrawingsForRoom(currentRoom.id).map((drawing) => (
                      <div key={drawing.id} className='flex items-center justify-between p-2 bg-white rounded border'>
                        <div className='text-sm'>
                          <div className='font-medium'>{drawing.name}</div>
                          <div className='text-xs text-gray-500'>
                            by {drawing.createdBy} | {new Date(drawing.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className='flex gap-1'>
                          <button
                            type='button'
                            className='px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200'
                            onClick={() => handleLoadDrawing(drawing.id)}
                            disabled={isLoading}
                          >
                            Load
                          </button>
                          {drawing.createdBy === currentUser?.name && (
                            <button
                              type='button'
                              className='px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200'
                              onClick={() => deleteDrawing(drawing.id, socket)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='text-sm text-gray-500 text-center py-2'>
                      No saved drawings
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className='flex flex-col gap-2'>
          <div className='flex gap-2'>
            <button
              type='button'
              className={`p-2 rounded-md border text-sm font-medium ${
                canUndoState
                  ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              onClick={handleUndo}
              disabled={!canUndoState}
            >
              ↶ Undo
            </button>
            <button
              type='button'
              className={`p-2 rounded-md border text-sm font-medium ${
                canRedoState
                  ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              onClick={handleRedo}
              disabled={!canRedoState}
            >
              ↷ Redo
            </button>
          </div>
          <button
            type='button'
            className='p-2 rounded-md border border-red-300 text-red-700 hover:bg-red-50'
            onClick={handleClear}
          >
            🗑️ Clear Canvas
          </button>
        </div>
        </div>

        {/* Main Canvas Area */}
        <div className='flex-1 flex flex-col items-center justify-center p-4 lg:p-8'>
          {/* Mobile Controls - Shown only on mobile */}
          <div className='lg:hidden w-full mb-4 space-y-2'>
            {/* Mobile Tool Selection */}
            <div className='flex flex-wrap gap-1 pb-2'>
              {(['brush', 'rectangle', 'circle', 'line', 'eraser'] as DrawingTool[]).map((tool) => (
                <button
                  key={tool}
                  type='button'
                  className={`px-2 py-2 rounded-md border text-xs font-medium transition-colors flex-shrink-0 ${
                    selectedTool === tool
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTool(tool)}
                >
                  {tool === 'brush' && '🖌️ '}
                  {tool === 'rectangle' && '⬜ '}
                  {tool === 'circle' && '⭕ '}
                  {tool === 'line' && '📏 '}
                  {tool === 'eraser' && '🧽 '}
                  <span className='hidden sm:inline'>{tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
                </button>
              ))}
            </div>

            {/* Mobile Action Buttons */}
            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                className={`px-2 py-2 rounded-md border text-xs font-medium flex-shrink-0 ${
                  canUndoState
                    ? 'bg-white text-gray-700 border-gray-300'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
                onClick={handleUndo}
                disabled={!canUndoState}
              >
                ↶ <span className='hidden xs:inline'>Undo</span>
              </button>
              <button
                type='button'
                className={`px-2 py-2 rounded-md border text-xs font-medium flex-shrink-0 ${
                  canRedoState
                    ? 'bg-white text-gray-700 border-gray-300'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
                onClick={handleRedo}
                disabled={!canRedoState}
              >
                ↷ <span className='hidden xs:inline'>Redo</span>
              </button>
              <button
                type='button'
                className='px-2 py-2 rounded-md border border-red-300 text-red-700 bg-white text-xs font-medium flex-shrink-0'
                onClick={handleClear}
              >
                🗑️ <span className='hidden xs:inline'>Clear</span>
              </button>
            </div>

            {/* Mobile Brush Size */}
            <div className='flex items-center gap-2'>
              <label className='text-sm font-medium text-gray-700'>
                Size: {brushSize}px
              </label>
              <input
                type='range'
                min='1'
                max='20'
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className='flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer'
              />
            </div>
          </div>

          {/* Responsive Canvas Container */}
          <div className='relative w-full max-w-2xl aspect-square'>
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={(e) => {
                e.preventDefault()
                const touch = e.touches[0]
                const rect = canvasRef.current?.getBoundingClientRect()
                if (rect) {
                  const point = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                  }
                  handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY } as any)
                }
              }}
              onTouchEnd={(e) => {
                e.preventDefault()
                handleMouseUp()
              }}
              onTouchMove={(e) => {
                e.preventDefault()
                const touch = e.touches[0]
                const rect = canvasRef.current?.getBoundingClientRect()
                if (rect && isDrawing) {
                  const point = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                  }
                  
                  // Handle touch drawing based on tool
                  if (selectedTool === 'brush' || selectedTool === 'eraser') {
                    if (canvasRef.current) {
                      const ctx = canvasRef.current.getContext('2d')
                      if (ctx && startPoint) {
                        drawLine({ prevPoint: startPoint, currentPoint: point, ctx })
                        setStartPoint(point)
                      }
                    }
                  } else if (selectedTool === 'rectangle' || selectedTool === 'circle' || selectedTool === 'line') {
                    // Update current path for shape preview
                    setCurrentPath([startPoint!, point])
                    
                    // Redraw the canvas with the preview
                    if (canvasRef.current) {
                      const ctx = canvasRef.current.getContext('2d')
                      if (ctx) {
                        // Clear and redraw everything
                        redrawCanvas(ctx, getCurrentHistory())
                        
                        // Draw the preview shape
                        drawShape(ctx, selectedTool, [startPoint!, point], color, brushSize)
                      }
                    }
                  }
                }
              }}
              width={600}
              height={600}
              className='w-full h-full border border-gray-300 rounded-md cursor-crosshair touch-none'
              style={{ 
                cursor: selectedTool === 'eraser' ? 'grab' : 'crosshair',
                maxWidth: '100%',
                maxHeight: '100%'
              }}
            />
          </div>

          {/* Mobile Color Picker */}
          <div className='lg:hidden mt-4 w-full'>
            <div className='text-sm font-medium text-gray-700 mb-2 text-center'>Color</div>
            <div className='flex justify-center overflow-x-auto'>
              <ChromePicker 
                color={color} 
                onChange={(e) => setColor(e.hex)}
                width="280px"
                disableAlpha={true}
              />
            </div>
          </div>
        </div>

        {/* Mobile Bottom Sheet for Additional Controls */}
        <div className='lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg max-h-96 overflow-y-auto'>
          <div className='p-4 space-y-4'>
            {/* Room Management for Mobile */}
            <div className='p-3 rounded-md bg-purple-50 border border-purple-200'>
              <div className='text-sm font-medium text-purple-800 mb-2'>Room Management</div>
              
              {currentRoom ? (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm text-purple-700'>
                      Room: <strong>{currentRoom.name}</strong>
                    </span>
                    <button
                      type='button'
                      className='px-2 py-1 text-xs bg-red-100 text-red-700 rounded'
                      onClick={handleLeaveRoom}
                    >
                      Leave
                    </button>
                  </div>
                  <div className='text-xs text-purple-600'>
                    Users: {connectedUsers.length} | by {currentRoom.createdBy}
                  </div>
                </div>
              ) : (
                <div className='space-y-2'>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      className='px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded'
                      onClick={toggleCreateRoom}
                    >
                      Create Room
                    </button>
                    <button
                      type='button'
                      className='px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded'
                      onClick={() => {
                        toggleRoomList()
                        handleGetRooms()
                      }}
                    >
                      Join Room
                    </button>
                  </div>
                  
                  {isCreatingRoom && (
                    <div className='space-y-2'>
                      <input
                        type='text'
                        placeholder='Room name'
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        className='w-full px-2 py-1 text-sm border border-purple-300 rounded'
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                      />
                      <input
                        type='text'
                        placeholder='Password (6 digits, optional)'
                        value={newRoomPassword}
                        onChange={(e) => setNewRoomPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className='w-full px-2 py-1 text-sm border border-purple-300 rounded'
                        maxLength={6}
                      />
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          className='px-2 py-1 text-sm bg-green-100 text-green-700 rounded'
                          onClick={handleCreateRoom}
                        >
                          Create
                        </button>
                        <button
                          type='button'
                          className='px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded'
                          onClick={toggleCreateRoom}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {showRoomList && (
                    <div className='max-h-32 overflow-y-auto space-y-1'>
                      {availableRooms.length > 0 ? (
                        availableRooms.map((room) => (
                          <div key={room.id} className='flex items-center justify-between p-2 bg-white rounded border'>
                            <div className='text-sm'>
                              <div className='font-medium flex items-center gap-1'>
                                {room.name}
                                {room.password && <span className='text-xs text-orange-600'>🔒</span>}
                              </div>
                              <div className='text-xs text-gray-500'>
                                {room.userCount} users | by {room.createdBy}
                              </div>
                            </div>
                            <button
                              type='button'
                              className='px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded'
                              onClick={() => handleJoinRoom(room.id)}
                            >
                              Join
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className='text-sm text-gray-500 text-center py-2'>
                          No rooms available
                        </div>
                      )}
                      
                      {/* Password Input Modal for Mobile */}
                      {selectedRoomToJoin && (
                        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'>
                          <div className='bg-white p-4 rounded-lg shadow-lg max-w-sm w-full'>
                            <h3 className='text-lg font-medium text-gray-900 mb-4'>Enter Room Password</h3>
                            <p className='text-sm text-gray-600 mb-4'>
                              This room is password protected. Please enter the 6-digit password.
                            </p>
                            <input
                              type='text'
                              placeholder='Enter 6-digit password'
                              value={joinRoomPassword}
                              onChange={(e) => setJoinRoomPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                              maxLength={6}
                              autoFocus
                            />
                            <div className='flex gap-2 mt-4'>
                              <button
                                type='button'
                                className='flex-1 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600'
                                onClick={handleJoinRoomWithPassword}
                                disabled={joinRoomPassword.length !== 6}
                              >
                                Join Room
                              </button>
                              <button
                                type='button'
                                className='flex-1 px-3 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400'
                                onClick={() => {
                                  setSelectedRoomToJoin(null)
                                  setJoinRoomPassword('')
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawing Persistence for Mobile */}
            {currentRoom && (
              <div className='p-3 rounded-md bg-green-50 border border-green-200'>
                <div className='text-sm font-medium text-green-800 mb-2'>Save & Load</div>
                <div className='space-y-2'>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      className='px-3 py-1 text-sm bg-green-100 text-green-700 rounded'
                      onClick={toggleSaveDialog}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type='button'
                      className='px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded'
                      onClick={() => {
                        toggleLoadDialog()
                        handleGetDrawings()
                      }}
                    >
                      Load
                    </button>
                  </div>
                  
                  {showSaveDialog && (
                    <div className='flex gap-2'>
                      <input
                        type='text'
                        placeholder='Drawing name'
                        value={saveDrawingName}
                        onChange={(e) => setSaveDrawingName(e.target.value)}
                        className='flex-1 px-2 py-1 text-sm border border-green-300 rounded'
                        onKeyPress={(e) => e.key === 'Enter' && handleSaveDrawing()}
                      />
                      <button
                        type='button'
                        className='px-2 py-1 text-sm bg-green-100 text-green-700 rounded'
                        onClick={handleSaveDrawing}
                        disabled={!saveDrawingName.trim() || isSaving}
                      >
                        Save
                      </button>
                      <button
                        type='button'
                        className='px-2 py-1 text-sm bg-gray-100 text-gray-700 rounded'
                        onClick={toggleSaveDialog}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  
                  {showLoadDialog && (
                    <div className='max-h-32 overflow-y-auto space-y-1'>
                      {getDrawingsForRoom(currentRoom.id).length > 0 ? (
                        getDrawingsForRoom(currentRoom.id).map((drawing) => (
                          <div key={drawing.id} className='flex items-center justify-between p-2 bg-white rounded border'>
                            <div className='text-sm'>
                              <div className='font-medium'>{drawing.name}</div>
                              <div className='text-xs text-gray-500'>
                                by {drawing.createdBy}
                              </div>
                            </div>
                            <div className='flex gap-1'>
                              <button
                                type='button'
                                className='px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded'
                                onClick={() => handleLoadDrawing(drawing.id)}
                                disabled={isLoading}
                              >
                                Load
                              </button>
                              {drawing.createdBy === currentUser?.name && (
                                <button
                                  type='button'
                                  className='px-2 py-1 text-xs bg-red-100 text-red-700 rounded'
                                  onClick={() => deleteDrawing(drawing.id, socket)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className='text-sm text-gray-500 text-center py-2'>
                          No saved drawings
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ClientOnlyWrapper>
  )
}

export default page
