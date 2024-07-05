import { ImprovedNoise, OrbitControls } from "three/examples/jsm/Addons.js";
import "./style.css";
import * as THREE from "three";

document.addEventListener("DOMContentLoaded", () => {
    const scene = new THREE.Scene();
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(-2 * aspect, 2 * aspect, 2.4, -2.4, 1, 1000);
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);

    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#002222"),
        roughness: 0.9,
        metalness: 0.1,
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    camera.position.z = 5;
    camera.position.x = 2;
    camera.position.y = 0;
    camera.lookAt(cube.position);
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color("black"),
        side: THREE.DoubleSide,
    });
    const wall1 = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 12, 12), wallMaterial);
    wall1.position.z = -10;
    wall1.position.y = 0;
    wall1.position.x = 10;
    wall1.rotation.x = -0.2;
    wall1.receiveShadow = true;
    scene.add(wall1);

    const wall2 = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 12, 12), wallMaterial);
    wall2.rotation.x = Math.PI / 2;
    wall2.position.x = 0;
    wall2.position.y = -2.5;
    wall2.receiveShadow = true;
    scene.add(wall2);

    // light
    const dL = new THREE.DirectionalLight(0xffffff, 10);
    dL.position.set(0, 2, 0);
    dL.castShadow = true;
    // shadow settings
    dL.shadow.mapSize.width = 1512;
    dL.shadow.mapSize.height = 1512;
    dL.shadow.camera.near = 0.5;
    dL.shadow.camera.far = 500;

    scene.add(dL);

    const aL = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(aL);

    //fog
    // Texture

    const size = 128;
    const data = new Uint8Array(size * size * size);

    let i = 0;
    const scale = 0.05;
    const perlin = new ImprovedNoise();
    const vector = new THREE.Vector3();

    for (let z = 0; z < size; z++) {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const d =
                    1.0 -
                    vector
                        .set(x, y, z)
                        .subScalar(size / 2)
                        .divideScalar(size)
                        .length();
                data[i] =
                    (128 + 128 * perlin.noise((x * scale) / 1.5, y * scale, (z * scale) / 1.5)) *
                    d *
                    d;
                i++;
            }
        }
    }

    const texture = new THREE.Data3DTexture(data, size, size, size);
    texture.format = THREE.RedFormat;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    // Material

    const vertexShader = /* glsl */ `
      in vec3 position;

      uniform mat4 modelMatrix;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform vec3 cameraPos;

      out vec3 vOrigin;
      out vec3 vDirection;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

        vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
        vDirection = position - vOrigin;

        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = /* glsl */ `
      precision highp float;
      precision highp sampler3D;

      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;

      in vec3 vOrigin;
      in vec3 vDirection;

      out vec4 color;

      uniform vec3 base;
      uniform sampler3D map;

      uniform float threshold;
      uniform float range;
      uniform float opacity;
      uniform float steps;
      uniform float frame;

      uint wang_hash(uint seed)
      {
          seed = (seed ^ 61u) ^ (seed >> 16u);
          seed *= 9u;
          seed = seed ^ (seed >> 4u);
          seed *= 0x27d4eb2du;
          seed = seed ^ (seed >> 15u);
          return seed;
      }

      float randomFloat(inout uint seed)
      {
          return float(wang_hash(seed)) / 4294967296.;
      }

      vec2 hitBox( vec3 orig, vec3 dir ) {
        const vec3 box_min = vec3( - 0.5 );
        const vec3 box_max = vec3( 0.5 );
        vec3 inv_dir = 1.0 / dir;
        vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
        vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
        vec3 tmin = min( tmin_tmp, tmax_tmp );
        vec3 tmax = max( tmin_tmp, tmax_tmp );
        float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
        float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
        return vec2( t0, t1 );
      }

      float sample1( vec3 p ) {
        return texture( map, p ).r;
      }

      float shading( vec3 coord ) {
        float step = 0.01;
        return sample1( coord + vec3( - step ) ) - sample1( coord + vec3( step ) );
      }

      vec4 linearToSRGB( in vec4 value ) {
        return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
      }

      void main(){
        vec3 rayDir = normalize( vDirection );
        vec2 bounds = hitBox( vOrigin, rayDir );

        if ( bounds.x > bounds.y ) discard;

        bounds.x = max( bounds.x, 0.0 );

        vec3 p = vOrigin + bounds.x * rayDir;
        vec3 inc = 1.0 / abs( rayDir );
        float delta = min( inc.x, min( inc.y, inc.z ) );
        delta /= steps;

        // Jitter

        // Nice little seed from
        // https://blog.demofox.org/2020/05/25/casual-shadertoy-path-tracing-1-basic-camera-diffuse-emissive/
        uint seed = uint( gl_FragCoord.x ) * uint( 1973 ) + uint( gl_FragCoord.y ) * uint( 9277 ) + uint( frame ) * uint( 26699 );
        vec3 size = vec3( textureSize( map, 0 ) );
        float randNum = randomFloat( seed ) * 2.0 - 1.0;
        p += rayDir * randNum * ( 1.0 / size );

        //

        vec4 ac = vec4( base, 0.0 );

        for ( float t = bounds.x; t < bounds.y; t += delta ) {

          float d = sample1( p + 0.5 );

          d = smoothstep( threshold - range, threshold + range, d ) * opacity;

          float col = shading( p + 0.5 ) * 3.0 + ( ( p.x + p.y ) * 0.25 ) + 0.2;

          ac.rgb += ( 1.0 - ac.a ) * d * col;

          ac.a += ( 1.0 - ac.a ) * d;

          if ( ac.a >= 0.95 ) break;

          p += rayDir * delta;

        }

        color = linearToSRGB( ac );

        if ( color.a == 0.0 ) discard;

      }
    `;

    const fogGeometry = new THREE.BoxGeometry(10, 10, 10);
    const fogMaterial = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            base: { value: new THREE.Color("black") },
            map: { value: texture },
            cameraPos: { value: new THREE.Vector3() },
            threshold: { value: 0.15 },
            opacity: { value: 0.01 },
            range: { value: 0.1 },
            steps: { value: 100 },
            frame: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
    });

    const fogMesh = new THREE.Mesh(fogGeometry, fogMaterial);
    scene.add(fogMesh);

    // sun
    const sun = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 32, 32),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
        })
    );
    sun.position.set(0, 2, 0);
    scene.add(sun);
    const sunLight = new THREE.PointLight(0xffffff, 1, 100);
    sunLight.position.set(0, 2, 0);
    scene.add(sunLight);
    // dL.target = sun;

    window.addEventListener("resize", () => {
        // orthographic camera
        const aspect = window.innerWidth / window.innerHeight;
        camera.left = -2 * aspect;
        camera.right = 2 * aspect;
        camera.top = 2.4;
        camera.bottom = -2.4;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const animate = () => {
        requestAnimationFrame(animate);
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;
        renderer.render(scene, camera);

        // rotate sun and sun light
        sun.rotation.y += 0.01;
        sunLight.rotation.y += 0.01;
        sunLight.position.set(
            2 * Math.sin(Date.now() * 0.001),
            2 * Math.sin(Date.now() * 0.001),
            2 * Math.cos(Date.now() * 0.001)
        );
        sun.position.set(
            2 * Math.sin(Date.now() * 0.001),
            2 * Math.sin(Date.now() * 0.001),
            2 * Math.cos(Date.now() * 0.001)
        );
        // fogMaterial.uniforms.cameraPos.value = camera.position;
        // fogMaterial.uniforms.frame.value += 0.1;
    };
    animate();
});
