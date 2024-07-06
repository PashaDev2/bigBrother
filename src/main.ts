import {
    EffectComposer,
    GLTFLoader,
    ImprovedNoise,
    OrbitControls,
    RenderPass,
    UnrealBloomPass,
} from "three/examples/jsm/Addons.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import "./style.css";
import * as THREE from "three";
import { GUI } from "lil-gui";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";

// const vignetteShader = {
//     uniforms: {
//         tDiffuse: { type: "t", value: null },
//         offset: { type: "f", value: 1.0 },
//         darkness: { type: "f", value: 1.0 },
//     },

//     vertexShader: [
//         "varying vec2 vUv;",

//         "void main() {",

//         "vUv = uv;",
//         "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

//         "}",
//     ].join("\n"),

//     fragmentShader: [
//         "uniform float offset;",
//         "uniform float darkness;",

//         "uniform sampler2D tDiffuse;",

//         "varying vec2 vUv;",

//         "void main() {",

//         // Eskil's vignette

//         "vec4 texel = texture2D( tDiffuse, vUv );",
//         "vec2 uv = ( vUv - vec2( 0.5 ) ) * vec2( offset );",
//         "gl_FragColor = vec4( mix( texel.rgb, vec3( 1.0 - darkness ), dot( uv, uv ) ), texel.a );",

//         /*
//     // alternative version from glfx.js
//     // this one makes more "dusty" look (as opposed to "burned")

//     "vec4 color = texture2D( tDiffuse, vUv );",
//     "float dist = distance( vUv, vec2( 0.5 ) );",
//     "color.rgb *= smoothstep( 0.8, offset * 0.799, dist *( darkness + offset ) );",
//     "gl_FragColor = color;",
//     */

//         "}",
//     ].join("\n"),
// };

document.addEventListener("DOMContentLoaded", async () => {
    const gui = new GUI();
    const scene = new THREE.Scene();
    const stats = new Stats();
    document.body.appendChild(stats.dom);
    // const aspect = window.innerWidth / window.innerHeight;
    // const camera = new THREE.OrthographicCamera(-2 * aspect, 2 * aspect, 2.4, -2.4, 1, 1000);
    // const camera = new THREE.PerspectiveCamera(25, aspect, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
    });
    // renderer.shadowMap.enabled = true;
    // renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const loader = new GLTFLoader();

    const model = await loader.loadAsync("/three.js/Helmet.glb");

    //update camera
    const camera = model.cameras[0] as THREE.PerspectiveCamera;
    gui.add(camera, "fov", 0, 180)
        .name("camera fov")
        .onChange(() => {
            camera.updateProjectionMatrix();
        });
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const helm = model.scene.children[0] as THREE.Mesh;
    const helmMaterial = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#000"),
        roughness: 0.973,
        metalness: 0.254,
        ior: 0.87,
        reflectivity: 1,
        clearcoat: 0,
        transmission: 1,
    });
    helm.material = helmMaterial;
    scene.add(model.scene);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false;

    gui.add(controls, "enabled").name("orbit controls");

    // custom shader with emissive
    const eyesMaterial = new CustomShaderMaterial({
        baseMaterial: new THREE.MeshStandardMaterial({
            depthTest: true,
            depthWrite: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            emissive: new THREE.Color("red"),
            emissiveIntensity: 1,
        }),
        silent: true,
        uniforms: {
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2() },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uColor: { value: new THREE.Color("red") },
            uFolloff: { value: 3.49 },
            uFresnelPower: { value: 0.51 },
        },
        vertexShader: /* glsl */ `
        varying vec2 vUv;
        // varying vec3 vNormal;
        varying vec3 vPosition;

          void main() {
            vUv = uv;
            vNormal = normal;
            // vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }
    `,
        fragmentShader: /* glsl */ `
        uniform vec2 uMouse;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uFolloff;
        uniform float uFresnelPower;

        varying vec3 vPosition;
        // varying vec3 vNormal;
        varying vec2 vUv;

        void main()
        {
            float time = uTime * 0.1;
            vec2 uv = gl_FragCoord.xy / uResolution.xy;
            vec3 color = uColor;
            vec3 normal1 = normalize(vNormal);
            if(!gl_FrontFacing) normal1 *= -1.0;

            // Fresnel
            vec3 viewDirection = normalize(vPosition - cameraPosition);
            float fresnel = dot(viewDirection, normal1) + 1.0;
            fresnel *= pow(fresnel, uFresnelPower);

            // Folloff
            float falloff = smoothstep(uFolloff, 0.0, fresnel);
            fresnel *= falloff; 

            // Final color
            csm_FragColor = vec4(color, fresnel);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        } 
    `,
    });

    const eyeObj = model.scene.getObjectByName("EYES") as THREE.Mesh;
    eyeObj.material = eyesMaterial;

    // debug material
    const materialFolder = gui.addFolder("material");
    materialFolder.add(helmMaterial, "roughness", 0, 1);
    materialFolder.add(helmMaterial, "metalness", 0, 1);
    materialFolder.add(helmMaterial, "ior", 0, 2);
    helmMaterial.ior = 1.98;
    materialFolder.add(helmMaterial, "reflectivity", 0, 1);
    materialFolder.add(helmMaterial, "clearcoat", 0, 1);
    materialFolder.add(helmMaterial, "transmission", 0, 1);

    // debug eyes material
    const eyesFolder = gui.addFolder("eyes");
    eyesFolder.add(eyesMaterial.uniforms.uFolloff, "value", 0, 10).name("eyes folloff");
    eyesFolder.add(eyesMaterial.uniforms.uFresnelPower, "value", 0, 10).name("eyes fresnel power");
    eyesFolder.addColor({ color: "#000" }, "color").onChange((value: string) => {
        eyesMaterial.uniforms.uColor.value = new THREE.Color(value);
    });
    materialFolder.close();

    const aL = new THREE.AmbientLight(new THREE.Color("#000"), 1.5);
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

    const fogGeometry = new THREE.BoxGeometry(2, 1, 1);
    const fogMaterial = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            base: { value: new THREE.Color("red") },
            map: { value: texture },
            cameraPos: { value: new THREE.Vector3() },
            threshold: { value: 0.01 },
            opacity: { value: 0.001 },
            range: { value: 0.1 },
            steps: { value: 10 },
            frame: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
        // opacity: 1,
        // depthTest: false,
        // depthWrite: true,
    });

    const fogMesh = new THREE.Mesh(fogGeometry, fogMaterial);
    scene.add(fogMesh);
    fogMesh.position.z = -4.85;
    fogMesh.scale.set(10, 10, 10);
    fogMaterial.uniforms.cameraPos.value = camera.position;

    // debug fog
    const fogFolder = gui.addFolder("fog");
    fogFolder.add(fogMaterial.uniforms.threshold, "value", 0, 1).name("fog threshold");
    fogFolder.add(fogMaterial.uniforms.opacity, "value", 0, 1).name("fog opacity");
    fogFolder.add(fogMaterial.uniforms.range, "value", 0, 1).name("fog range");
    fogFolder.add(fogMaterial.uniforms.steps, "value", 0, 100).name("fog steps");
    fogFolder.addColor({ color: "#ff0000" }, "color").onChange((value: string) => {
        fogMaterial.uniforms.base.value = new THREE.Color(value);
        sunLight.color = new THREE.Color(value);
    });
    fogFolder.add(fogMesh.position, "z", -100, 10).name("fog z");

    const fOpts = {
        scale: 10,
    };
    fogFolder.add(fOpts, "scale", 0, 10).onChange((value: number) => {
        fogMesh.scale.set(value, value, value);
    });
    fogFolder.close();

    // sun
    // scene.add(sun);
    const sunLight = new THREE.PointLight(new THREE.Color("red"), 10, 100);
    sunLight.position.set(1, 1.5, -1);
    //shadow settings
    // sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 512;
    sunLight.shadow.mapSize.height = 512;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    scene.add(sunLight);

    // debug sun
    const sunFolder = gui.addFolder("sun");
    sunFolder.add(sunLight, "intensity", 0, 100);
    sunFolder.add(sunLight.shadow.camera, "near", 0, 10);
    sunFolder.add(sunLight.shadow.camera, "far", 0, 1000);
    sunFolder.add(sunLight.shadow.mapSize, "width", 0, 2048);
    sunFolder.add(sunLight.shadow.mapSize, "height", 0, 2048);
    sunFolder.close();

    // post processing
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    //blur pass
    // const blurPass = new ShaderPass(bloomShader);
    // composer.addPass(blurPass);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        9,
        0.448,
        0.041
    );
    bloomPass.renderToScreen = true;
    composer.addPass(bloomPass);

    // debug bloom
    const bloomFolder = gui.addFolder("bloom");
    bloomFolder.add(bloomPass, "strength", 0, 10);
    bloomFolder.add(bloomPass, "radius", 0, 1);
    bloomFolder.add(bloomPass, "threshold", 0, 1);

    // const vignettePass = new ShaderPass(vignetteShader);
    // vignettePass.uniforms.offset.value = 1.1;
    // vignettePass.uniforms.darkness.value = 1.2;
    // composer.addPass(vignettePass);

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const animate = () => {
        requestAnimationFrame(animate);

        stats.update();

        // renderer.render(scene, camera);
        composer.render();

        // rotate sun and sun light
        // sun.rotation.y += 0.01;
        // sunLight.rotation.y += 0.01;
        // const x = 2 * Math.sin(Date.now() * 0.001);
        // const y = 2 * Math.sin(Date.now() * 0.001);
        // const z = 2 * Math.cos(Date.now() * 0.001);
        // sunLight.position.set(x, y, z);
        // sun.position.set(x, y, z);

        // update fog material
        fogMaterial.uniforms.threshold.value = THREE.MathUtils.lerp(
            fogMaterial.uniforms.threshold.value,
            0.2 + 0.1 * Math.sin(Date.now() * 0.001),
            0.01
        );

        // controls.update();
    };
    const clock = new THREE.Clock();

    const handleMouseMove = (event: MouseEvent) => {
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = -(event.clientY / window.innerHeight) * 2 + 1;
        const d = clock.getDelta() * 0.1;
        eyesMaterial.uniforms.uMouse.value.x = x;
        eyesMaterial.uniforms.uMouse.value.y = y;
        eyesMaterial.uniforms.uTime.value += d;

        // rotate helm
        helm.rotation.z = THREE.MathUtils.lerp(helm.rotation.z, x, 0.1);
        helm.rotation.x = THREE.MathUtils.lerp(helm.rotation.x, -y - Math.PI / 2, 0.1);

        // eyeObj.rotation.z = x;
    };

    window.addEventListener("mousemove", handleMouseMove);

    animate();
});
