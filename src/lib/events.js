// Window events shared by components that shouldn't import each other
// (the 3D hero is lazy-loaded, so nothing else may pull in its module).
export const EXCITE = 'pdfwise:excite' // detail: true while files are being dragged or analyzed
export const OPEN_PALETTE = 'pdfwise:palette'

export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE))
