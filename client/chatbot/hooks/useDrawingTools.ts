import { useState, useRef, useCallback } from 'react'

export const useDrawingTools = () => {
  const [selectedTool, setSelectedTool] = useState<DrawingTool>('brush')
  const [brushSize, setBrushSize] = useState<number>(5)
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  
  const historyRef = useRef<DrawingHistory>({
    actions: [],
    currentIndex: -1
  })

  const addToHistory = useCallback((action: DrawAction) => {
    const history = historyRef.current
    // Remove any actions after current index (for redo functionality)
    history.actions = history.actions.slice(0, history.currentIndex + 1)
    history.actions.push(action)
    history.currentIndex = history.actions.length - 1
  }, [])

  const undo = useCallback(() => {
    const history = historyRef.current
    if (history.currentIndex >= 0) {
      history.currentIndex--
      return true
    }
    return false
  }, [])

  const redo = useCallback(() => {
    const history = historyRef.current
    if (history.currentIndex < history.actions.length - 1) {
      history.currentIndex++
      return true
    }
    return false
  }, [])

  const canUndo = useCallback(() => {
    return historyRef.current.currentIndex >= 0
  }, [])

  const canRedo = useCallback(() => {
    return historyRef.current.currentIndex < historyRef.current.actions.length - 1
  }, [])

  const clearHistory = useCallback(() => {
    historyRef.current = {
      actions: [],
      currentIndex: -1
    }
  }, [])

  const getCurrentHistory = useCallback(() => {
    return historyRef.current.actions.slice(0, historyRef.current.currentIndex + 1)
  }, [])

  return {
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
  }
}
