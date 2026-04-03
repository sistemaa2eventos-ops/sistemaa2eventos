export const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => resolve(image))
        image.addEventListener('error', (error) => reject(error))
        image.setAttribute('crossOrigin', 'anonymous') // needed to avoid cross-origin issues on CodeSandbox
        image.src = url
    })

export async function getCroppedImg(
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number },
    rotation = 0
): Promise<string | null> {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
        return null
    }

    // set canvas size to match the original image
    canvas.width = image.width
    canvas.height = image.height

    // translate canvas context to a central point and rotate before drawing
    ctx.translate(image.width / 2, image.height / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.translate(-image.width / 2, -image.height / 2)

    // draw rotated image
    ctx.drawImage(image, 0, 0)

    // croppedAreaPixels values are bounding box relative
    // extract the cropped image using these values
    const data = ctx.getImageData(
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height
    )

    // set canvas width to final desired crop size - usually a square for face id
    canvas.width = pixelCrop.width
    canvas.height = pixelCrop.height

    // paste generated rotate image with correct offsets for x1,y1
    ctx.putImageData(data, 0, 0)

    // As Base64 string
    return canvas.toDataURL('image/jpeg');
}
