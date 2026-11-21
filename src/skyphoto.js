import * as THREE from 'three'

// Local photographic assets derived from the CC0 HDR panoramas:
// Greg Zaal, Kloofendal 48d Partly Cloudy
// https://polyhaven.com/a/kloofendal_48d_partly_cloudy
// Greg Zaal and Jarod Guest, Kloofendal 48d Partly Cloudy (Pure Sky)
// https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
// The 2K sky is tone-mapped and its original solar disc is removed. The 1K
// environment includes the photographed hills and vegetation below the horizon.
async function loadPanorama(name) {
  try {
    const loader = new THREE.TextureLoader(THREE.DefaultLoadingManager)
    const texture = await loader.loadAsync('assets/sky/' + name + '.webp')
    texture.name = name
    texture.colorSpace = THREE.SRGBColorSpace
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    return texture
  } catch {
    return null
  }
}

export const loadSkyPhoto = () => loadPanorama('daylight')
export const loadEnvironmentPhoto = () => loadPanorama('surroundings')

// Insert into a fragment shader above main(). Call before adding the dynamic
// sun/moon and stars. strength is zero until the loader returns a texture.
export const skyPhotoGLSL = `
uniform sampler2D skyPhoto;
uniform float photoStrength;
vec3 applySkyPhoto(vec3 atmosphere,vec3 d,float day,float clouds,vec3 sunTint,float elevation,float windTime){
  vec2 uv=vec2(atan(d.z,d.x)*0.159154943+0.5,asin(clamp(d.y,-1.0,1.0))*0.318309886+0.5);
  uv.x+=windTime*0.000007;
  vec3 picture=texture2D(skyPhoto,uv).rgb;
  float solar=smoothstep(-.01,.43,elevation);
  float amount=photoStrength*day*(.34+.66*solar)*smoothstep(-.035,.085,d.y);
  float weather=smoothstep(.12,.49,clouds)*(1.-smoothstep(.66,.99,clouds));
  picture*=mix(sunTint,vec3(1.),solar*.88);
  return mix(atmosphere,picture*(1.02+.24*solar),amount*(.18+.75*weather));
}
`
