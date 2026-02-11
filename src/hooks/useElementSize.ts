import { useEffect, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

export function useElementSize<T extends HTMLElement>(ref: React.RefObject<T>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const cr = entry.contentRect
      setSize({ width: cr.width, height: cr.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}

