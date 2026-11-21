import * as THREE from 'three'

// BC1 mip chains upload directly to supported desktop GPUs. Other devices use WebP.
export async function loadCompressedSurfaces(renderer, progress) {
  const textures = new Map(),
    names = ['asphalt', 'brick', 'concrete', 'dirt', 'grass', 'rock', 'roof', 'wood']
  if (!renderer.extensions.has('WEBGL_compressed_texture_s3tc_srgb')) return textures
  let done = 0
  await Promise.all(
    names.map(async (name) => {
      try {
        const path = 'assets/world/' + name + '.dds',
          url = globalThis.BRIAR_ASSETS?.[path] || path
        const response = await fetch(url)
        if (!response.ok) return
        const bytes = await response.arrayBuffer(),
          v = new DataView(bytes)
        if (v.getUint32(0, true) !== 0x20534444 || v.getUint32(84, true) !== 0x31545844) return
        const width = v.getUint32(16, true),
          height = v.getUint32(12, true),
          levels = v.getUint32(28, true)
        const mips = []
        let w = width,
          h = height,
          offset = 128
        for (let i = 0; i < levels; i++) {
          const len = Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * 8
          mips.push({ data: new Uint8Array(bytes, offset, len), width: w, height: h })
          offset += len
          w = Math.max(1, w >> 1)
          h = Math.max(1, h >> 1)
        }
        const tex = new THREE.CompressedTexture(mips, width, height, THREE.RGB_S3TC_DXT1_Format)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.needsUpdate = true
        textures.set(name, tex)
      } catch {
        /* The regular surface loader supplies the same texture when needed. */
      } finally {
        progress(++done / names.length)
      }
    }),
  )
  return textures
}
