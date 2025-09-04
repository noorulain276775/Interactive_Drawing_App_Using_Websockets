// Drawing utility functions for different shapes and tools

export const drawBrush = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  brushSize: number
) => {
  if (points.length < 2) return

  ctx.beginPath()
  ctx.lineWidth = brushSize
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.moveTo(points[0].x, points[0].y)
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  
  ctx.stroke()
}

export const drawRectangle = (
  ctx: CanvasRenderingContext2D,
  startPoint: Point,
  endPoint: Point,
  color: string,
  brushSize: number
) => {
  ctx.beginPath()
  ctx.lineWidth = brushSize
  ctx.strokeStyle = color
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'

  const width = endPoint.x - startPoint.x
  const height = endPoint.y - startPoint.y

  ctx.rect(startPoint.x, startPoint.y, width, height)
  ctx.stroke()
}

export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  startPoint: Point,
  endPoint: Point,
  color: string,
  brushSize: number
) => {
  ctx.beginPath()
  ctx.lineWidth = brushSize
  ctx.strokeStyle = color
  ctx.lineCap = 'round'

  const radius = Math.sqrt(
    Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2)
  )

  ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI)
  ctx.stroke()
}

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  startPoint: Point,
  endPoint: Point,
  color: string,
  brushSize: number
) => {
  ctx.beginPath()
  ctx.lineWidth = brushSize
  ctx.strokeStyle = color
  ctx.lineCap = 'round'

  ctx.moveTo(startPoint.x, startPoint.y)
  ctx.lineTo(endPoint.x, endPoint.y)
  ctx.stroke()
}

export const erase = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  brushSize: number
) => {
  if (points.length < 2) return

  ctx.beginPath()
  ctx.lineWidth = brushSize
  ctx.strokeStyle = 'white' // Assuming white background
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'destination-out'

  ctx.moveTo(points[0].x, points[0].y)
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-over' // Reset composite operation
}

export const drawShape = (
  ctx: CanvasRenderingContext2D,
  tool: DrawingTool,
  points: Point[],
  color: string,
  brushSize: number
) => {
  switch (tool) {
    case 'brush':
      drawBrush(ctx, points, color, brushSize)
      break
    case 'rectangle':
      if (points.length >= 2) {
        drawRectangle(ctx, points[0], points[points.length - 1], color, brushSize)
      }
      break
    case 'circle':
      if (points.length >= 2) {
        drawCircle(ctx, points[0], points[points.length - 1], color, brushSize)
      }
      break
    case 'line':
      if (points.length >= 2) {
        drawLine(ctx, points[0], points[points.length - 1], color, brushSize)
      }
      break
    case 'eraser':
      erase(ctx, points, brushSize)
      break
  }
}

export const redrawCanvas = (
  ctx: CanvasRenderingContext2D,
  actions: DrawAction[]
) => {
  // Clear canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  
  // Redraw all actions
  actions.forEach(action => {
    drawShape(ctx, action.type, action.points, action.color, action.brushSize)
  })
}
