type Draw ={
    ctx: CanvasRenderingContext2D,
    currentPoint: Point,
    prevPoint: Point | null,
}

type Point = {
    x: number,
    y: number,
}

type User = {
    id: string,
    name: string,
    color: string,
    isActive: boolean
}

type DrawingTool = 'brush' | 'rectangle' | 'circle' | 'line' | 'eraser'

type DrawAction = {
    type: DrawingTool
    points: Point[]
    color: string
    brushSize: number
    userId: string
    userName: string
    timestamp: number
}

type DrawLine = {
    prevPoint: Point | null
    currentPoint: Point
    color: string
    userId: string
    userName: string
    brushSize: number
    tool: DrawingTool
}

type UserJoined = {
    user: User
    users: User[]
}

type UserLeft = {
    userId: string
    users: User[]
}

type DrawingHistory = {
    actions: DrawAction[]
    currentIndex: number
}

type Room = {
    id: string
    name: string
    createdBy: string
    createdAt: number
    userCount: number
    isPrivate: boolean
}

type RoomJoined = {
    room: Room
    users: User[]
}

type RoomLeft = {
    roomId: string
    users: User[]
}

type RoomList = {
    rooms: Room[]
}

type SavedDrawing = {
    id: string
    name: string
    roomId: string
    createdBy: string
    createdAt: number
    updatedAt: number
    actions: DrawAction[]
    thumbnail?: string
}

type DrawingList = {
    drawings: SavedDrawing[]
}

type SaveDrawingRequest = {
    name: string
    roomId: string
    actions: DrawAction[]
    thumbnail?: string
}

type LoadDrawingRequest = {
    drawingId: string
}