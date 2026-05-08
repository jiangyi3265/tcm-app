export async function compressImageFile(file, options = {}) {
  const {
    maxBytes = 512 * 1024,
    maxWidth = 1600,
    maxHeight = 1600,
    mimeType = 'image/jpeg',
    initialQuality = 0.82,
    minQuality = 0.52,
  } = options

  if (!file || !String(file.type || '').startsWith('image/') || file.size <= maxBytes) {
    return file
  }

  const image = await loadImage(file)
  let { width, height } = fitWithin(image.width, image.height, maxWidth, maxHeight)
  let quality = initialQuality
  let blob = await renderImage(image, width, height, mimeType, quality)

  while (blob.size > maxBytes && quality > minQuality && mimeType !== 'image/png') {
    quality = Math.max(minQuality, quality - 0.08)
    blob = await renderImage(image, width, height, mimeType, quality)
  }

  while (blob.size > maxBytes && width > 480 && height > 480) {
    width = Math.round(width * 0.85)
    height = Math.round(height * 0.85)
    blob = await renderImage(image, width, height, mimeType, quality)
  }

  const nextName = renameImage(file.name, blob.type)
  return new File([blob], nextName, { type: blob.type, lastModified: Date.now() })
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to read image'))
    }
    image.src = url
  })
}

function fitWithin(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1)
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

function renderImage(image, width, height, mimeType, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to compress image'))
    }, mimeType, quality)
  })
}

function renameImage(name = 'image', mimeType = 'image/jpeg') {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg'
  return String(name || 'image').replace(/\.[^.]+$/, '') + `.${extension}`
}
