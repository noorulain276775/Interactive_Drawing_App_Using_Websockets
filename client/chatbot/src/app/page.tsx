'use client'

import { FC, useState, useEffect } from 'react'
import { useDraw } from '../../hooks/useDraw'
import { ChromePicker } from 'react-color'

interface pageProps {}

const page: FC<pageProps> = ({}) => {
  const [color, setColor] = useState<string>('#000')
  const { canvasRef, onMouseDown, clear } = useDraw(drawLine)

  // State to handle client-side rendering
  const [isClient, setIsClient] = useState(false)

  // Check if the component is being rendered on the client side
  useEffect(() => {
    setIsClient(true)
  }, [])

  function drawLine({ prevPoint, currentPoint, ctx }: Draw) {
    const { x: currX, y: currY } = currentPoint
    const lineColor = color
    const lineWidth = 5

    let startPoint = prevPoint ?? currentPoint
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
    ctx.moveTo(startPoint.x, startPoint.y)
    ctx.lineTo(currX, currY)
    ctx.stroke()

    ctx.fillStyle = lineColor
    ctx.beginPath()
    ctx.arc(startPoint.x, startPoint.y, 2, 0, 2 * Math.PI)
    ctx.fill()
  }

  return (
    <div className='w-screen h-screen bg-white flex justify-center items-center'>
      <div className='flex flex-col gap-10 pr-10'>
        {/* Only render ChromePicker on the client */}
        {isClient && (
          <ChromePicker color={color} onChange={(e) => setColor(e.hex)} />
        )}
        <button type='button' className='p-2 rounded-md border border-black' onClick={clear}>
          Clear canvas
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        width={600}
        height={600}
        className='border border-black rounded-md'
      />
    </div>
  )
}

export default page
