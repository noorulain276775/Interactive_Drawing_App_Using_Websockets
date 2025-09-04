'use client'

import { FC, useState, useEffect } from 'react'
import { useDraw } from '../../hooks/useDraw'
import { useSocket } from '../../hooks/useSocket'
import { useDrawingTools } from '../../hooks/useDrawingTools'
import { useRoom } from '../../hooks/useRoom'
import { useDrawingPersistence } from '../../hooks/useDrawingPersistence'
import { ChromePicker } from 'react-color'
import { drawShape, redrawCanvas } from '../../utils/drawingUtils'

interface pageProps {}

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

  // State to handle client-side rendering
  const [isClient, setIsClient] = useState(false)
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [newRoomName, setNewRoomName] = useState('')
  const [roomCanvasHistory, setRoomCanvasHistory] = useState<Map<string, DrawAction[]>>(new Map())
  const [saveDrawingName, setSaveDrawingName] = useState('')
  const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null)

  // Check if the component is being rendered on the client side
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Connect room hook with socket events
  useEffect(() => {
    if (socket) {
      // Set up global handlers for room management
      ;(window as any).updateCurrentRoom = updateCurrentRoom
      ;(window as any).updateRoomList = updateRoomList
      ;(window as any).updateSavedDrawings = updateSavedDrawings
      ;(window as any).handleDrawingLoaded = handleDrawingLoaded
      ;(window as any).handleDrawingDeleted = handleDrawingDeleted
    }
    
    return () => {
      // Cleanup global handlers
      delete (window as any).updateCurrentRoom
      delete (window as any).updateRoomList
      delete (window as any).updateSavedDrawings
      delete (window as any).handleDrawingLoaded
      delete (window as any).handleDrawingDeleted
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

  // Handle mouse down for shape tools
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

    // For shape tools, we need to handle them differently
    if (selectedTool !== 'brush' && selectedTool !== 'eraser') {
      // Shape tools will be completed on mouse up
      return
    }

    // For brush and eraser, start drawing immediately
    onMouseDown()
  }

  // Handle mouse up for shape completion
  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !currentUser) return

    setIsDrawing(false)
    
    // Complete the drawing action
    if (currentPath.length > 0) {
      const action: DrawAction = {
        type: selectedTool,
        points: currentPath,
        color,
        brushSize,
        userId: currentUser.id,
        userName: currentUser.name,
        timestamp: Date.now()
      }
      
      addToHistory(action)
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
    }
  }

  // Handle redo
  const handleRedo = () => {
    if (redo() && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        redrawCanvas(ctx, getCurrentHistory())
      }
    }
  }

  // Handle clear with history
  const handleClear = () => {
    clear()
    clearHistory()
    
    // Broadcast clear event to other clients
    if (socket && isConnected && currentRoom) {
      socket.emit('clear-canvas', { roomId: currentRoom.id })
    }
  }

  // Room management handlers
  const handleCreateRoom = () => {
    if (newRoomName.trim() && socket && currentUser) {
      socket.emit('create-room', { roomName: newRoomName.trim(), isPrivate: false })
      setNewRoomName('')
      toggleCreateRoom()
    }
  }

  const handleJoinRoom = (roomId: string) => {
    if (socket) {
      socket.emit('join-room', { roomId })
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
    <div className='w-screen h-screen bg-white flex justify-center items-center'>
      <div className='flex flex-col gap-10 pr-10'>
        {/* Connection Status */}
        <div className={`p-2 rounded-md text-sm font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800 border border-green-300' 
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>

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
                <div className='flex gap-2'>
                  <input
                    type='text'
                    placeholder='Room name'
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className='flex-1 px-2 py-1 text-sm border border-purple-300 rounded'
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                  />
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
              )}
              
              {showRoomList && (
                <div className='max-h-32 overflow-y-auto space-y-1'>
                  {availableRooms.length > 0 ? (
                    availableRooms.map((room) => (
                      <div key={room.id} className='flex items-center justify-between p-2 bg-white rounded border'>
                        <div className='text-sm'>
                          <div className='font-medium'>{room.name}</div>
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
          <div className='flex gap-2 mb-3'>
            {(['brush', 'rectangle', 'circle', 'line', 'eraser'] as DrawingTool[]).map((tool) => (
              <button
                key={tool}
                type='button'
                className={`p-2 rounded-md border text-sm font-medium ${
                  selectedTool === tool
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedTool(tool)}
              >
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
        {isClient && (
          <div className='p-3 rounded-md bg-gray-50 border border-gray-200'>
            <div className='text-sm font-medium text-gray-700 mb-2'>Color</div>
            <ChromePicker color={color} onChange={(e) => setColor(e.hex)} />
          </div>
        )}

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
                canUndo()
                  ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              onClick={handleUndo}
              disabled={!canUndo()}
            >
              ↶ Undo
            </button>
            <button
              type='button'
              className={`p-2 rounded-md border text-sm font-medium ${
                canRedo()
                  ? 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
              onClick={handleRedo}
              disabled={!canRedo()}
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
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        width={600}
        height={600}
        className='border border-black rounded-md cursor-crosshair'
        style={{ cursor: selectedTool === 'eraser' ? 'grab' : 'crosshair' }}
      />
    </div>
  )
}

export default page
