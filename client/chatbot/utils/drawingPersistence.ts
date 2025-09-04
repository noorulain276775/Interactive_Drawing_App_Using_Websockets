// Drawing persistence utilities

export const generateThumbnail = (canvas: HTMLCanvasElement, size: number = 150): string => {
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')
  
  if (!tempCtx) return ''
  
  tempCanvas.width = size
  tempCanvas.height = size
  
  // Calculate scaling to fit the original canvas into the thumbnail
  const scale = Math.min(size / canvas.width, size / canvas.height)
  const scaledWidth = canvas.width * scale
  const scaledHeight = canvas.height * scale
  
  // Center the scaled canvas
  const offsetX = (size - scaledWidth) / 2
  const offsetY = (size - scaledHeight) / 2
  
  // Fill with white background
  tempCtx.fillStyle = 'white'
  tempCtx.fillRect(0, 0, size, size)
  
  // Draw the scaled canvas
  tempCtx.drawImage(canvas, offsetX, offsetY, scaledWidth, scaledHeight)
  
  return tempCanvas.toDataURL('image/png')
}

export const exportDrawingAsImage = (canvas: HTMLCanvasElement, filename: string = 'drawing.png'): void => {
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportDrawingAsJSON = (actions: DrawAction[], filename: string = 'drawing.json'): void => {
  const dataStr = JSON.stringify(actions, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

export const importDrawingFromJSON = (file: File): Promise<DrawAction[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const actions = JSON.parse(e.target?.result as string)
        if (Array.isArray(actions)) {
          resolve(actions)
        } else {
          reject(new Error('Invalid drawing format'))
        }
      } catch (error) {
        reject(new Error('Failed to parse drawing file'))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }
    
    reader.readAsText(file)
  })
}

export const validateDrawingActions = (actions: any[]): actions is DrawAction[] => {
  return Array.isArray(actions) && actions.every(action => 
    action &&
    typeof action.type === 'string' &&
    Array.isArray(action.points) &&
    typeof action.color === 'string' &&
    typeof action.brushSize === 'number' &&
    typeof action.userId === 'string' &&
    typeof action.userName === 'string' &&
    typeof action.timestamp === 'number'
  )
}

