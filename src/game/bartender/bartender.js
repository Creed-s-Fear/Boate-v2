// Lotus Lounge: loads the female bartender and wires everything she needs to look right in three.js.
//   - the idle clip "Idle_Bartender_Limpando" (10 s loop, wiping the counter)
//   - eyes.js: blinks and small gaze shifts (morph targets + LeftEye/RightEye bones); also fixes the cornea material
//   - springs.js: hair physics (7 spring-bone chains with colliders on the body; settings travel inside the GLB)
//   - hair and lashes cut out by alpha: alpha-to-coverage (needs a renderer created with antialias: true)
//
// Usage:
//   import { loadBartender } from './bartender.js';
//   const bt = await loadBartender('Bartender_Mulher_v6.glb');
//   scene.add(bt.root);                 // place bt.root, see the README for where she stands at the counter
//   // every frame:
//   bt.update(dt);                      // dt in seconds
//   // after moving her in one jump (teleport, camera cut, respawn):
//   bt.resetHair();
//
// Keep the model at scale 1 (it is in metres): the hair colliders' radii are in metres too.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachEyes } from './eyes.js';
import { attachSprings } from './springs.js';

export async function loadBartender(url, { loader = new GLTFLoader(), shadows = true, clip = 'Idle_Bartender_Limpando' } = {}) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = shadows; o.receiveShadow = shadows;
      if (o.material.alphaTest > 0) o.material.alphaToCoverage = true;   // hair cards: smooth strand edges with MSAA
    }
    if (o.isSkinnedMesh) o.frustumCulled = false;   // the bounding box is the rest pose; the animation leans out of it
  });
  // both attach while the skeleton is still in its rest pose (before the first mixer update)
  const eyes = attachEyes(root);        // also turns off shadows on the cornea and the soft lid shadow
  const springs = attachSprings(root);  // null if the GLB had no spring settings
  const mixer = new THREE.AnimationMixer(root);
  const anim = gltf.animations.find(c => c.name === clip) || gltf.animations[0];
  const action = anim ? mixer.clipAction(anim).play() : null;
  return {
    root, mixer, action, eyes, springs, gltf,
    update(dt) {
      mixer.update(dt);                 // order matters: animation first, then eyes and hair react to the new pose
      eyes.update(dt);
      if (springs) springs.update(dt);
    },
    resetHair() { if (springs) springs.reset(); },
  };
}
