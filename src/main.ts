import { cameraPosition } from "three/examples/jsm/nodes/Nodes.js";
import {
    EffectComposer,
    GLTFLoader,
    ImprovedNoise,
    OrbitControls,
    RenderPass,
    ShaderPass,
    UnrealBloomPass,
} from "three/examples/jsm/Addons.js";
import { VignetteShader } from "./VignetteShader";
import Stats from "three/examples/jsm/libs/stats.module.js";
import "./style.css";
import * as THREE from "three";
import { GUI } from "lil-gui";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import gsap from "gsap";

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
        powerPreference: "high-performance",
        alpha: true,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    const helmMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#000"),
        roughness: 1,
        metalness: 0.484,
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
        }),
        silent: true,
        uniforms: {
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2() },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uColor: { value: new THREE.Color("#bf7a63") },
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
            fresnel *= falloff * 2.2; 

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

    // debug eyes material
    const eyesFolder = gui.addFolder("eyes");
    eyesFolder.add(eyesMaterial.uniforms.uFolloff, "value", 0, 10).name("eyes folloff");
    eyesFolder.add(eyesMaterial.uniforms.uFresnelPower, "value", 0, 10).name("eyes fresnel power");
    eyesFolder.addColor({ color: "#000" }, "color").onChange((value: string) => {
        eyesMaterial.uniforms.uColor.value = new THREE.Color(value);
    });
    materialFolder.close();

    const aL = new THREE.AmbientLight(new THREE.Color("#fff"), 1.5);
    scene.add(aL);

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
     // Created by Darko (omegasbk) 
// youtube.com/c/darkosupe

        precision highp float;
        precision highp int;

        uniform vec2 iResolution;
        uniform float iTime;
        uniform vec2 iMouse;
        uniform float iFogDensity;
        uniform vec3 iFogColor;
        uniform int iFogShadowSteps;
        uniform int iFogSteps;
        uniform vec3 cameraPos;

        out vec4 fragColor;



        struct Camera
        {
            vec3 position;
            float focalDistance;
        };    

        struct Plane 
        {
            vec3 position;
            vec3 normal;
            vec3 color;
        };
        struct PointLight
        {
            vec3 position;
            float intensity;
        };

        Plane plane = Plane(
            vec3(0., 0., 1.5), 
            vec3(0., 0., -1.5), 
            vec3(0.5, 0.5, 0.5));
            
        PointLight light = PointLight(
            vec3(0., 0.19, -0.2), // position
            35.);                 // intensity
            
        Camera camera = Camera(
            vec3(0.5),
            0.4);
            
        //////////////////////////////////////////////////////////////
        // 	                        UTILS                           // 
        //////////////////////////////////////////////////////////////
        bool solveQuadratic(float a, float b, float c, out float t0, out float t1)
        {
            float disc = b * b - 4. * a * c;
            
            if (disc < 0.)
            {
                return false;
            } 
            
            if (disc == 0.)
            {
                t0 = t1 = -b / (2. * a);
                return true;
            }
            
            t0 = (-b + sqrt(disc)) / (2. * a);
            t1 = (-b - sqrt(disc)) / (2. * a);
            return true;    
        }


        //////////////////////////////////////////////////////////////
        // Taken from https://www.shadertoy.com/view/XsX3zB
        /* discontinuous pseudorandom uniformly distributed in [-0.5, +0.5]^3 */
        vec3 random3(vec3 c) 
        {
            float j = 4096.0*sin(dot(c,vec3(17.0, 59.4, 15.0)));
            vec3 r;
            r.z = fract(512.0*j);
            j *= .125;
            r.x = fract(512.0*j);
            j *= .125;
            r.y = fract(512.0*j);
            return r-0.5;
        }

        /* skew constants for 3d simplex functions */
        const float F3 =  0.3333333;
        const float G3 =  0.1666667;

        /* 3d simplex noise */
        float simplex3d(vec3 p) 
        {
            /* 1. find current tetrahedron T and it's four vertices */
            /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
            /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/
            
            /* calculate s and x */
            vec3 s = floor(p + dot(p, vec3(F3)));
            vec3 x = p - s + dot(s, vec3(G3));
            
            /* calculate i1 and i2 */
            vec3 e = step(vec3(0.0), x - x.yzx);
            vec3 i1 = e*(1.0 - e.zxy);
            vec3 i2 = 1.0 - e.zxy*(1.0 - e);
                
            /* x1, x2, x3 */
            vec3 x1 = x - i1 + G3;
            vec3 x2 = x - i2 + 2.0*G3;
            vec3 x3 = x - 1.0 + 3.0*G3;
            
            /* 2. find four surflets and store them in d */
            vec4 w, d;
            
            /* calculate surflet weights */
            w.x = dot(x, x);
            w.y = dot(x1, x1);
            w.z = dot(x2, x2);
            w.w = dot(x3, x3);
            
            /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
            w = max(0.6 - w, 0.0);
            
            /* calculate surflet components */
            d.x = dot(random3(s), x);
            d.y = dot(random3(s + i1), x1);
            d.z = dot(random3(s + i2), x2);
            d.w = dot(random3(s + 1.0), x3);
            
            /* multiply d by w^4 */
            w *= w;
            w *= w;
            d *= w;
            
            /* 3. return the sum of the four surflets */
            return dot(d, vec4(52.0));
        }

        /* const matrices for 3d rotation */
        const mat3 rot1 = mat3(-0.37, 0.36, 0.85,-0.14,-0.93, 0.34,0.92, 0.01,0.4);
        const mat3 rot2 = mat3(-0.55,-0.39, 0.74, 0.33,-0.91,-0.24,0.77, 0.12,0.63);
        const mat3 rot3 = mat3(-0.71, 0.52,-0.47,-0.08,-0.72,-0.68,-0.7,-0.45,0.56);

        /* directional artifacts can be reduced by rotating each octave */
        float simplex3d_fractal(vec3 m) 
        {
            return   0.5333333*simplex3d(m*rot1)
                    +0.2666667*simplex3d(2.0*m*rot2)
                    +0.1333333*simplex3d(4.0*m*rot3)
                    +0.0666667*simplex3d(8.0*m);
        }
        //
        //////////////////////////////////////////////////////////////

        //////////////////////////////////////////////////////////////
        // 	                   INTERSECTION CODE                    // 
        //////////////////////////////////////////////////////////////
        bool intersectPlane(in Plane plane, in vec3 origin, in vec3 rayDirection, out float t, out vec3 pHit) 
        {    
            // Assuming vectors are all normalized
            float denom = dot(plane.normal, rayDirection); 
            if (denom < 1e-6) 
            { 
                vec3 p0l0 = plane.position - origin; 
                t = dot(p0l0, plane.normal) / denom; 
                
                if (t >= 0.)
                {
                    pHit = origin + rayDirection * t;
                    return true;
                }             
            } 
        
            return false; 
        } 

        //////////////////////////////////////////////////////////////
        // 	                       MAIN CODE                        // 
        //////////////////////////////////////////////////////////////
        float rayTrace(in vec3 rayDirection, in vec3 rayOrigin)
        {
            float objectHitDistance;
            vec3 pHit;

            int LAYERS = iFogSteps;
            int SHADOW_LAYERS = iFogShadowSteps;
            float FOG_DENSITY = iFogDensity;

            float accAlpha = 0.1;
            
            Plane diffusePlane = plane;
            Plane lightPlane = plane;
            vec3 lightDirection;
            
            for (int i = 0; i < LAYERS; i++)
            {
                if (intersectPlane(diffusePlane, rayOrigin, rayDirection, objectHitDistance, pHit))
                {
                    float thickness = simplex3d_fractal(pHit);
                    accAlpha += thickness * FOG_DENSITY;            

                    //lightDirection = normalize(light.position - pHit);

                    vec3 shadowPhit = pHit;
                    for (int j = 0; j < i; j++)
                    {
                        shadowPhit += FOG_DENSITY * lightDirection;
                        accAlpha -= simplex3d_fractal(shadowPhit) * 0.008;
                    }
                }
                
                diffusePlane.position.z += FOG_DENSITY;
            }        
        
            return accAlpha;
        }

        void main() {
            float time = iTime / 4.;
            light.position.x = iMouse.x / iResolution.x;
            vec2 fragCoord = gl_FragCoord.xy;
            //light.position.z = time - 1.2;
            
            plane.position.z = time;
            // camera.position.z = time - 1.2;
                
            // Normalized pixel coordinates (from -0.5 to 0.5)
            vec2 uv = fragCoord/iResolution.xy - 1.5;
            uv.x *= (iResolution.x / iResolution.y); 
            
            vec3 clipPlanePosition = vec3(uv.x, uv.y, camera.position.z + camera.focalDistance);
            vec3 rayDirection = normalize(clipPlanePosition - camera.position);
            
            vec4 ambientColor = vec4(iFogColor, 1.) * (-uv.y - 0.2);  
            vec4 finalColor = ambientColor + rayTrace(rayDirection, camera.position);

            fragColor = finalColor;
        }
    `;

    const fogGeometry = new THREE.BoxGeometry(2, 1, 1);
    const fogMaterial = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            cameraPos: { value: camera.position },
            iMouse: { value: new THREE.Vector2() },
            iFogDensity: { value: 0.152 },
            iFogColor: { value: new THREE.Color("#000") },
            iFogSteps: { value: 5 },
            iFogShadowSteps: { value: 5 },
        },
        vertexShader,
        fragmentShader,
        side: THREE.DoubleSide,
        transparent: true,
    });

    const fogMesh = new THREE.Mesh(fogGeometry, fogMaterial);
    scene.add(fogMesh);
    fogMesh.position.z = -4.92;
    fogMesh.scale.set(10, 10, 10);

    // debug fog
    const fogFolder = gui.addFolder("fog");
    fogFolder.add(fogMesh.position, "z", -10, 10).step(0.01).name("fog z");
    fogFolder.add(fogMaterial.uniforms.iFogDensity, "value", 0, 1).name("fog density");
    fogFolder.addColor({ color: "#fff" }, "color").onChange((value: string) => {
        fogMaterial.uniforms.iFogColor.value = new THREE.Color(value);
    });
    fogFolder.add(fogMaterial.uniforms.iFogSteps, "value", 0, 100).name("fog steps");
    fogFolder.add(fogMaterial.uniforms.iFogShadowSteps, "value", 0, 100).name("fog shadow steps");

    const fOpts = {
        scale: 10,
    };
    fogFolder.add(fOpts, "scale", 0, 10).onChange((value: number) => {
        fogMesh.scale.set(value, value, value);
    });
    fogFolder.close();

    // sun
    const sunLight = new THREE.PointLight(new THREE.Color("#8f8f8f"), 30, 100);
    sunLight.position.set(1, 1.5, 1);
    scene.add(sunLight);

    // debug sun
    const sunFolder = gui.addFolder("sun");
    sunFolder.add(sunLight, "intensity", 0, 100);
    sunFolder.addColor({ color: "#8f8f8f" }, "color").onChange((value: string) => {
        sunLight.color = new THREE.Color(value);
    });
    sunFolder.close();

    // post processing
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms["resolution"].value = new THREE.Vector2(
        window.innerWidth,
        window.innerHeight
    );
    vignette.uniforms["horizontal"].value = false; // default is false
    vignette.uniforms["radius"].value = 0.556; // default is 0.75
    vignette.uniforms["softness"].value = 0.217; // default is 0.3
    vignette.uniforms["gain"].value = 0.217; // default is 0.9
    composer.addPass(vignette);

    const vignetteFolder = gui.addFolder("vignette");

    vignetteFolder.add(vignette.uniforms["radius"], "value", 0, 1).name("vignette radius");
    vignetteFolder.add(vignette.uniforms["softness"], "value", 0, 1).name("vignette softness");
    vignetteFolder.add(vignette.uniforms["gain"], "value", 0, 1).name("vignette gain");
    vignetteFolder.add(vignette.uniforms["horizontal"], "value").name("vignette horizontal");

    vignetteFolder.close();

    //blur pass
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        12,
        0,
        0.25
    );
    bloomPass.renderToScreen = true;
    composer.addPass(bloomPass);

    // debug bloom
    const bloomFolder = gui.addFolder("bloom");
    bloomFolder.add(bloomPass, "strength", 0, 10);
    bloomFolder.add(bloomPass, "radius", 0, 1);
    bloomFolder.add(bloomPass, "threshold", 0, 1);

    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    let bloomMultiplier = 1;

    const animate = () => {
        requestAnimationFrame(animate);

        stats.update();

        // renderer.render(scene, camera);
        composer.render();

        if (fogMaterial) {
            fogMaterial.uniforms.iTime.value += 0.001;
            fogMaterial.uniforms.cameraPos.value = camera.position;
        }

        // update bloom
        bloomPass.threshold *= bloomMultiplier;

        // controls.update();
    };
    const clock = new THREE.Clock();
    let initA1Done = false;
    gui.add({ initA1: () => initA1() }, "initA1").name("init A1");

    const handleMouseMove = (event: MouseEvent) => {
        if (!initA1Done) {
            return;
        }

        const d = clock.getDelta() * 0.1;
        const x = (event.clientX / window.innerWidth) * 2 - 1;
        const y = -(event.clientY / window.innerHeight) * 2 + 1;
        eyesMaterial.uniforms.uMouse.value.x = x;
        eyesMaterial.uniforms.uMouse.value.y = y;
        eyesMaterial.uniforms.uTime.value += d;

        // rotate helm
        helm.rotation.z = THREE.MathUtils.lerp(helm.rotation.z, x, 0.1);
        helm.rotation.x = THREE.MathUtils.lerp(helm.rotation.x, -y - Math.PI / 2, 0.1);

        // eyeObj.rotation.z = x;
    };

    window.addEventListener("mousemove", handleMouseMove);
    helm.position.y = -0.9;
    const initA1 = () => {
        initA1Done = false;
        const tl = gsap.timeline();

        tl.fromTo(
            helm.position,
            {
                y: -2.9,
            },
            {
                y: 0,
                duration: 2,
                ease: "power4.inOut",
            }
        );

        const dObj = {
            mouseX: helm.rotation.z,
            mouseY: -helm.rotation.x - Math.PI / 2,
        };

        tl.to(dObj, {
            mouseX: 0.5,
            mouseY: 0.5,
            duration: 1,
            ease: "power4.inOut",
            onUpdate: () => {
                // rotate helm
                helm.rotation.z = THREE.MathUtils.lerp(helm.rotation.z, dObj.mouseX, 0.1);
                helm.rotation.x = THREE.MathUtils.lerp(
                    helm.rotation.x,
                    -dObj.mouseY - Math.PI / 2,
                    0.1
                );
            },
        });

        tl.fromTo(
            fogMesh.position,
            {
                z: -4.4,
            },
            {
                z: -5,
                ease: "power2.inOut",
                duration: 1.5,
            }
        );

        tl.to(dObj, {
            mouseX: 0,
            mouseY: 0,
            duration: 2,
            ease: "power4.inOut",
            onUpdate: () => {
                // rotate helm
                helm.rotation.z = THREE.MathUtils.lerp(helm.rotation.z, dObj.mouseX, 0.1);
                helm.rotation.x = THREE.MathUtils.lerp(
                    helm.rotation.x,
                    -dObj.mouseY - Math.PI / 2,
                    0.1
                );
            },
            onComplete: () => {
                initA1Done = true;
            },
        });
    };

    initA1();

    animate();
});
