import { LOGO_BASE64 } from './logoBase64'

let cachedMonochromeLogo: string | null = null
let conversionPromise: Promise<string> | null = null

/**
 * Converts the color logo into a high-contrast 1-bit monochrome version for thermal printing.
 * The original logo has a dark green background (lum ~28) and bright gold 'VS' artwork (lum ~240).
 * Thermal printers print black dots on white paper.
 * - Artwork (lum > 95) is converted to solid black (#000000).
 * - Background (lum <= 95) is converted to clean white (#ffffff).
 * Cached in memory so subsequent prints are instantaneous with zero overhead.
 */
export function getMonochromeThermalLogo(): Promise<string> {
  if (cachedMonochromeLogo) {
    return Promise.resolve(cachedMonochromeLogo)
  }
  if (conversionPromise) {
    return conversionPromise
  }

  conversionPromise = new Promise<string>((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve('')
      return
    }

    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const w = img.naturalWidth || 512
          const h = img.naturalHeight || 512
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) {
            resolve('')
            return
          }

          ctx.drawImage(img, 0, 0, w, h)
          const imgData = ctx.getImageData(0, 0, w, h)
          const data = imgData.data

          // 1-bit thresholding with inversion so 'VS' artwork is pure black and background is pure white
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const a = data[i + 3]

            // Transparent pixel becomes white paper
            if (a < 15) {
              data[i] = 255
              data[i + 1] = 255
              data[i + 2] = 255
              data[i + 3] = 255
              continue
            }

            // Luminance formula
            const lum = 0.299 * r + 0.587 * g + 0.114 * b

            // Gold/cream VS letters and saree detail -> pure black (burned on paper)
            // Dark green/black square background -> pure white (unburned paper)
            if (lum > 95) {
              data[i] = 0
              data[i + 1] = 0
              data[i + 2] = 0
              data[i + 3] = 255
            } else {
              data[i] = 255
              data[i + 1] = 255
              data[i + 2] = 255
              data[i + 3] = 255
            }
          }

          ctx.putImageData(imgData, 0, 0)
          cachedMonochromeLogo = canvas.toDataURL('image/png')
          resolve(cachedMonochromeLogo)
        } catch (err) {
          console.warn('[thermalLogo] Canvas conversion error:', err)
          resolve('')
        }
      }

      img.onerror = (err) => {
        console.warn('[thermalLogo] Image load error:', err)
        resolve('')
      }

      img.src = LOGO_BASE64
    } catch (err) {
      console.warn('[thermalLogo] Unexpected error:', err)
      resolve('')
    }
  })

  return conversionPromise
}

export function getMonochromeThermalLogoSync(): string {
  return cachedMonochromeLogo || ''
}

// Preload immediately in browser context so it's ready before the user clicks print
if (typeof window !== 'undefined') {
  void getMonochromeThermalLogo()
}
