import * as THREE from 'three'

export function createRendering(renderer, scene, camera) {
  const hdr = renderer.extensions.has('EXT_color_buffer_float')
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  })
  const gl = renderer.getContext()
  const supportedSamples = Array.from(
    gl.getInternalformatParameter(gl.RENDERBUFFER, hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES) || [],
  )
  target.depthTexture = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType)
  const uni = (v) => ({ value: v })
  const u = {
    sceneColor: uni(target.texture),
    depthMap: uni(target.depthTexture),
    pixel: uni(new THREE.Vector2()),
    clip: uni(new THREE.Vector2()),
    drift: uni(new THREE.Vector2()),
    flags: uni(new THREE.Vector4()),
    effects: uni(new THREE.Vector4()),
    glass: uni(0),
    clock: uni(0),
    aa: uni(1),
    wet: uni(0),
    ip: uni(new THREE.Matrix4()),
    projection: uni(camera.projectionMatrix),
  }
  const frag = [
    'varying vec2 uv0;uniform sampler2D sceneColor,depthMap;uniform vec2 pixel,clip,drift;uniform vec4 flags,effects;uniform float aa,wet,glass,clock;uniform mat4 ip,projection;',
    'float zAt(vec2 p){float d=texture2D(depthMap,p).x;return clip.x*clip.y/(clip.y-(clip.y-clip.x)*d);}',
    'vec3 viewPos(vec2 uv){vec4 p=ip*vec4(uv*2.-1.,texture2D(depthMap,uv).r*2.-1.,1.);return p.xyz/p.w;}',
    'float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}',
    'void main(){vec2 uv=uv0;vec3 base=texture2D(sceneColor,uv).rgb,l=texture2D(sceneColor,uv-vec2(pixel.x,0)).rgb,r=texture2D(sceneColor,uv+vec2(pixel.x,0)).rgb,t=texture2D(sceneColor,uv+vec2(0,pixel.y)).rgb,b=texture2D(sceneColor,uv-vec2(0,pixel.y)).rgb;vec3 avg=(l+r+t+b)*.25;float d=zAt(uv);float lo=min(min(lum(l),lum(r)),min(lum(t),lum(b))),hi=max(max(lum(l),lum(r)),max(lum(t),lum(b)));vec3 c=mix(base,avg,aa*smoothstep(.10,.42,(hi-lo)/(hi+.13))*.42);',
    'if(flags.x>.5&&d<115.){float occ=0.;float scale=clamp(95./(d+2.),1.5,7.);float count=flags.x>1.5?12.:8.;for(int i=0;i<12;i++){if(float(i)>=count)break;float a=float(i)*6.283185/count;float dz=d-zAt(uv+pixel*scale*vec2(cos(a),sin(a)));occ+=smoothstep(.03,.35,dz)*(1.-smoothstep(.6,2.8,dz));}c*=1.-occ*(.256/count);}',
    'if(effects.w>.5&&wet>.1&&d<65.){vec3 pos=viewPos(uv);vec3 n=normalize(cross(dFdx(pos),dFdy(pos)));vec3 rd=reflect(normalize(pos),n);float mask=smoothstep(.6,.91,n.y)*smoothstep(.8,.24,lum(base));if(mask>.02){for(int i=1;i<=14;i++){if(i>8&&effects.w<1.5)break;float f=float(i)*(effects.w>1.5?.75:1.);vec3 q=pos+rd*(.16*f*f);vec4 screen=projection*vec4(q,1.);vec2 s=screen.xy/screen.w*.5+.5;if(s.y<.02||s.y>.98||s.x<.02||s.x>.98)break;float gap=-q.z-zAt(s);if(gap>0.&&gap<1.8){c=mix(c,texture2D(sceneColor,s).rgb,mask*wet*.22);break;}}}}',
    'if(flags.y>.5){vec3 bright=vec3(0.);for(int i=0;i<4;i++){float a=float(i)*1.5708;bright+=max(texture2D(sceneColor,uv+pixel*4.*vec2(cos(a),sin(a))).rgb-vec3(1.25),0.);}c+=min(bright,vec3(4.))*.019;}',
    'if(flags.z>.5){c=mix(c,(texture2D(sceneColor,uv+drift*.5).rgb+texture2D(sceneColor,uv+drift).rgb)*.5,.26);}',
    'if(effects.y>.5){float s=smoothstep(9.,65.,abs(d-effects.z));vec2 dx=pixel*3.*s;c=mix(c,(texture2D(sceneColor,uv+dx).rgb+texture2D(sceneColor,uv-dx).rgb+texture2D(sceneColor,uv+vec2(dx.x,-dx.y)).rgb)*.3333,s*.46);}',
    'if(glass>.5&&wet>.08&&uv.y>.31){vec2 grid=uv*vec2(90.,45.);grid.x+=sin(floor(grid.y)*56.1);grid.y+=clock*.52;vec2 id=floor(grid),q=fract(grid)-.5;float h=fract(sin(dot(id,vec2(45.3,73.1)))*9631.31);q.x+=(h-.5)*.3;q.y*=.62;float drop=(1.-smoothstep(.10,.25,length(q)))*step(.62,h)*wet*smoothstep(.31,.45,uv.y);c=mix(c,texture2D(sceneColor,uv+q*.014).rgb+vec3(.04)*smoothstep(.03,.13,q.y),drop*.84);}',
    'if(effects.x>.5)c+=clamp(base-avg,-.16,.16)*.15;if(flags.w>.5){c=mix(vec3(lum(c)),c,.97);c*=vec3(1.017,1.,.981);}gl_FragColor=vec4(max(c,0.),1.);',
    '#include <tonemapping_fragment>',
    '#include <colorspace_fragment>',
    '}',
  ]
    .join('\n')
    .replace('smoothstep(.8,.24,lum(base))', '(1.-smoothstep(.24,.8,lum(base)))')
  const post = new THREE.Scene(),
    ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader:
      'varying vec2 uv0;void main(){uv0=position.xy*.5+.5;gl_Position=vec4(position,1.);}',
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new THREE.Mesh(geo, mat)
  quad.frustumCulled = false
  post.add(quad)
  const size = new THREE.Vector2(),
    maxDims = { Low: 256, Medium: 512, High: 1024, Ultra: 4096 },
    original = new WeakMap()
  let actualScale = 1,
    quality = 'Medium'
  function textures(level) {
    quality = level
    const visited = new Set()
    scene.traverse((obj) => {
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) {
          const tex = m?.[key]
          if (!tex || visited.has(tex) || !tex.image?.width || tex.image.data) continue
          visited.add(tex)
          if (tex.isCompressedTexture) {
            if (!original.has(tex)) original.set(tex, tex.mipmaps.slice())
            const all = original.get(tex),
              limited = all.filter((mip) => mip.width <= (maxDims[level] || 512))
            tex.anisotropy = Math.min(
              renderer.capabilities.getMaxAnisotropy(),
              { Low: 1, Medium: 4, High: 8, Ultra: 16 }[level] || 1,
            )
            tex.mipmaps = limited
            tex.image = { width: limited[0].width, height: limited[0].height }
            tex.needsUpdate = true
            continue
          }
          if (!original.has(tex)) original.set(tex, tex.image)
          const src = original.get(tex),
            max = maxDims[level] || 512,
            ratio = Math.min(1, max / Math.max(src.width, src.height))
          if (ratio < 1) {
            const ca = document.createElement('canvas')
            ca.width = Math.max(1, Math.round(src.width * ratio))
            ca.height = Math.max(1, Math.round(src.height * ratio))
            ca.getContext('2d').drawImage(src, 0, 0, ca.width, ca.height)
            tex.image = ca
          } else tex.image = src
          tex.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            { Low: 1, Medium: 4, High: 8, Ultra: 16 }[level] || 1,
          )
          tex.needsUpdate = true
        }
      }
    })
  }
  function resize(settings, scale = settings.resolution) {
    const sampleLimit = settings.quality === 'Ultra' ? 4 : settings.quality === 'High' ? 2 : 0
    const samples = settings.antialias
      ? Math.max(0, ...supportedSamples.filter((n) => n <= sampleLimit))
      : 0
    if (samples !== target.samples) {
      target.samples = samples
      target.dispose()
    }
    actualScale = scale
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * scale)
    renderer.setSize(innerWidth, innerHeight, false)
    renderer.getDrawingBufferSize(size)
    target.setSize(size.x, size.y)
    u.pixel.value.set(1 / size.x, 1 / size.y)
    camera.aspect = innerWidth / innerHeight
    camera.far = settings.renderDistance
    camera.updateProjectionMatrix()
  }
  function render(s, focus, lookX, lookY, wet, cockpit = false, time = 0) {
    const usePost =
      s.ao ||
      s.bloom ||
      s.motionBlur ||
      s.grading ||
      s.sharpening ||
      s.antialias ||
      s.depthOfField ||
      ((s.reflections || cockpit) && wet > 0.08)
    if (!usePost) {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      return
    }
    u.clip.value.set(camera.near, camera.far)
    u.ip.value.copy(camera.projectionMatrixInverse)
    u.flags.value.set(
      s.ao ? (s.quality === 'Ultra' ? 2 : 1) : 0,
      +s.bloom,
      +s.motionBlur,
      +s.grading,
    )
    u.effects.value.set(
      +s.sharpening,
      +(s.depthOfField && focus),
      15,
      s.reflections ? (s.quality === 'Ultra' ? 2 : 1) : 0,
    )
    u.drift.value.set(
      Math.max(-0.02, Math.min(0.02, lookX * 0.00025)),
      Math.max(-0.02, Math.min(0.02, -lookY * 0.00025)),
    )
    u.aa.value = +s.antialias
    u.wet.value = wet
    u.glass.value = +cockpit
    u.clock.value = time
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(post, ortho)
  }
  return {
    render,
    resize,
    textures,
    get scale() {
      return actualScale
    },
    get textureQuality() {
      return quality
    },
  }
}
