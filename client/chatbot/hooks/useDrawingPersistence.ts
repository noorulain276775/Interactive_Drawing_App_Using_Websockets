import { useState, useCallback } from 'react'
import { generateThumbnail, exportDrawingAsImage, exportDrawingAsJSON, importDrawingFromJSON, validateDrawingActions } from '../utils/drawingPersistence'

export const useDrawingPersistence = () => {
  const [savedDrawings, setSavedDrawings] = useState<SavedDrawing[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showLoadDialog, setShowLoadDialog] = useState(false)

  const saveDrawing = useCallback(async (
    name: string,
    actions: DrawAction[],
    canvas: HTMLCanvasElement,
    roomId: string,
    createdBy: string,
    socket: any
  ) => {
    if (!socket || !name.trim()) return false

    setIsSaving(true)
    try {
      const thumbnail = generateThumbnail(canvas)
      
      const saveRequest: SaveDrawingRequest = {
        name: name.trim(),
        roomId,
        actions,
        thumbnail
      }

      // Emit save request to server
      socket.emit('save-drawing', saveRequest)
      
      setShowSaveDialog(false)
      return true
    } catch (error) {
      console.error('Failed to save drawing:', error)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [])

  const loadDrawing = useCallback(async (drawingId: string, socket: any) => {
    if (!socket) return null

    setIsLoading(true)
    try {
      // Emit load request to server
      socket.emit('load-drawing', { drawingId })
      setShowLoadDialog(false)
      return true
    } catch (error) {
      console.error('Failed to load drawing:', error)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteDrawing = useCallback(async (drawingId: string, socket: any) => {
    if (!socket) return false

    try {
      socket.emit('delete-drawing', { drawingId })
      return true
    } catch (error) {
      console.error('Failed to delete drawing:', error)
      return false
    }
  }, [])

  const getDrawingsForRoom = useCallback((roomId: string) => {
    return savedDrawings.filter(drawing => drawing.roomId === roomId)
  }, [savedDrawings])

  const exportDrawing = useCallback((canvas: HTMLCanvasElement, filename?: string) => {
    exportDrawingAsImage(canvas, filename)
  }, [])

  const exportDrawingData = useCallback((actions: DrawAction[], filename?: string) => {
    exportDrawingAsJSON(actions, filename)
  }, [])

  const importDrawing = useCallback(async (file: File) => {
    try {
      const actions = await importDrawingFromJSON(file)
      if (validateDrawingActions(actions)) {
        return actions
      } else {
        throw new Error('Invalid drawing format')
      }
    } catch (error) {
      console.error('Failed to import drawing:', error)
      throw error
    }
  }, [])

  const updateSavedDrawings = useCallback((drawings: SavedDrawing[]) => {
    setSavedDrawings(drawings)
  }, [])

  const toggleSaveDialog = useCallback(() => {
    setShowSaveDialog(prev => !prev)
  }, [])

  const toggleLoadDialog = useCallback(() => {
    setShowLoadDialog(prev => !prev)
  }, [])

  return {
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
  }
}

