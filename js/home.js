const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const qs=(selector,context=document)=>context.querySelector(selector);
const qsa=(selector,context=document)=>[...context.querySelectorAll(selector)];
let heroTimeline=null;

const demoData={
 derivatives:[["user","I understand slope, but derivatives still feel abstract."],["assistant","What does slope tell you about a straight line?"],["user","How quickly it rises or falls."],["assistant","Good. A curve keeps changing. How could we measure its slope at just one point?"],["user","Maybe compare two points that are extremely close?"],["assistant","Exactly. What should happen to that distance as we look for the instantaneous slope?"]],
 recursion:[["user","Recursion makes my head spin."],["assistant","Let us start smaller. What must every repeating process eventually do?"],["user","Stop somewhere."],["assistant","Right. In a recursive function, what could define that stopping point?"],["user","A base case?"],["assistant","Yes. Now what smaller version of the original problem can call move us toward it?"]],
 chemistry:[["user","Teach me stoichiometry."],["assistant","When a recipe says 2 cups of flour for 1 loaf, what relationship is it giving you?"],["user","A ratio."],["assistant","Exactly. What in a balanced chemical equation plays the role of that recipe ratio?"],["user","The coefficients?"],["assistant","Yes. So if one reactant runs out first, what does that tell us about the amount of product?"]],
 macbeth:[["user","Help me analyse Macbeth's ambition."],["assistant","Before calling ambition his flaw, what does Macbeth do when he first imagines becoming king?"],["user","He is disturbed by the thought."],["assistant","Interesting. If the desire frightens him, what changes between imagining the act and choosing it?"],["user","Lady Macbeth challenges him."],["assistant","So is ambition acting alone, or does the play show it needing permission and pressure?"]]
};

function setupBlurText(){
 qsa("[data-blur-text]").forEach(element=>{
  const label=element.textContent.trim(),words=label.split(/\s+/);element.setAttribute("aria-label",label);
  element.innerHTML=words.map((word,index)=>`<span class="blur-word" aria-hidden="true" style="transition-delay:${index*90}ms">${word}</span>`).join(" ");
 });
 const targets=qsa("[data-reveal], [data-blur-text]");
 if(reduced){targets.forEach(target=>{target.classList.add("visible");qsa(".blur-word",target).forEach(word=>word.classList.add("visible"))});return}
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(!entry.isIntersecting)return;entry.target.classList.add("visible");qsa(".blur-word",entry.target).forEach(word=>word.classList.add("visible"));observer.unobserve(entry.target);
 }),{threshold:.1,rootMargin:"0px 0px -5% 0px"});
 targets.forEach(target=>observer.observe(target));
}

function addMessage(host,[role,copy],delay=0){
 const element=document.createElement("div");element.className=`demo-message ${role==="assistant"?"socra":"student"}`;element.innerHTML=`<small>${role==="assistant"?"Socra":"You"}</small>${copy}`;host.appendChild(element);
 if(window.gsap&&!reduced)gsap.to(element,{opacity:1,y:0,duration:.72,delay,ease:"power2.out"});else{element.style.opacity=1;element.style.transform="none"}
}
let demoTimers=[];
function playDemo(key="derivatives"){
 demoTimers.forEach(clearTimeout);demoTimers=[];const host=qs(".demo-messages");if(!host)return;host.innerHTML="";
 demoData[key].forEach((message,index)=>demoTimers.push(setTimeout(()=>addMessage(host,message),reduced?0:index*1100)));
}

function setupUI(){
 const nav=qs(".glass-nav"),menu=qs(".mobile-menu");
 menu?.addEventListener("click",()=>{const open=nav.classList.toggle("menu-open");menu.setAttribute("aria-expanded",String(open));menu.innerHTML=`<i class="fa-solid fa-${open?"xmark":"bars"}"></i>`});
 qsa(".nav-pill a").forEach(link=>link.addEventListener("click",()=>{nav.classList.remove("menu-open");menu?.setAttribute("aria-expanded","false");if(menu)menu.innerHTML='<i class="fa-solid fa-bars"></i>'}));
 qsa(".prompt-button").forEach(button=>button.addEventListener("click",()=>{qsa(".prompt-button").forEach(item=>{item.classList.toggle("active",item===button);item.setAttribute("aria-selected",String(item===button))});playDemo(button.dataset.demo)}));
 qs(".replay-demo")?.addEventListener("click",()=>playDemo(qs(".prompt-button.active")?.dataset.demo));
 playDemo();
}

function setupFAQ(){
 const details=qsa(".faq details");
 if(reduced||!window.gsap)return;
 const closeDetail=detail=>{
  const panel=qs("p",detail);if(!detail.open||!panel)return;
  gsap.to(panel,{height:0,opacity:0,paddingBottom:0,duration:.28,ease:"power2.inOut",onComplete:()=>{detail.open=false;gsap.set(panel,{clearProps:"height,opacity,paddingBottom"})}});
 };
 details.forEach(detail=>{
  const summary=qs("summary",detail),panel=qs("p",detail);if(!summary||!panel)return;
  summary.addEventListener("click",event=>{
   event.preventDefault();
   if(detail.open){closeDetail(detail);return}
   details.forEach(other=>{if(other!==detail)closeDetail(other)});
   detail.open=true;
   gsap.fromTo(panel,{height:0,opacity:0,paddingBottom:0},{height:"auto",opacity:1,paddingBottom:25,duration:.38,ease:"power2.out",clearProps:"height,opacity,paddingBottom"});
  });
 });
}

function setupMetricComparisons(){
 qsa(".metric-comparison").forEach(chart=>{
  const fills=qsa("b[data-value]",chart),values=fills.map(fill=>Number(fill.dataset.value)||0),max=Math.max(...values,1);
  fills.forEach(fill=>fill.style.setProperty("--bar-width",(Number(fill.dataset.value)/max*100)+"%"));
  if(window.gsap&&!reduced)ScrollTrigger.create({trigger:chart,start:"top 86%",once:true,onEnter:()=>gsap.fromTo(fills,{scaleX:0},{scaleX:1,duration:.9,stagger:.14,ease:"power3.out"})});
 });
}

function setupInkField(){
 const canvas=qs(".ink-field");if(!canvas||reduced)return;
 const context=canvas.getContext("2d");let width=0,height=0,dpr=1,raf=0,visible=false,start=performance.now();
 const resize=()=>{const rect=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,1.5);width=rect.width;height=rect.height;canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));context.setTransform(dpr,0,0,dpr,0,0)};
 const draw=now=>{
  raf=0;if(!visible)return;context.clearRect(0,0,width,height);const t=(now-start)*.00022,cx=width*.5,cy=height*.47;
  for(let i=0;i<11;i++){const r=60+i*44+Math.sin(t*3+i)*8;context.beginPath();context.ellipse(cx,cy,r*1.65,r*.48,0,0,Math.PI*2);context.strokeStyle="rgba(116,157,190,"+(0.10-i*.006)+")";context.lineWidth=1+Math.sin(t+i)*.35;context.stroke()}
  for(let i=0;i<75;i++){const x=(i*83.7%width),y=(i*47.3%height),a=.035+.025*Math.sin(t*5+i);context.fillStyle="rgba(190,215,232,"+a+")";context.fillRect(x,y,1,1)}
  raf=requestAnimationFrame(draw)
 };
 resize();addEventListener("resize",resize);
 const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible&&!raf)raf=requestAnimationFrame(draw)},{rootMargin:"100px"});observer.observe(canvas);
}
function setupHeroScroll(){
 const hero=qs(".hero"),pin=qs(".hero-pin");if(!hero||!pin)return;
 if(reduced||!window.gsap||!window.ScrollTrigger){hero.classList.add("hero-static");return}
 gsap.registerPlugin(ScrollTrigger);
 heroTimeline=gsap.timeline({defaults:{ease:"none"},scrollTrigger:{
  trigger:hero,start:"top top",end:()=>"+="+Math.round(innerHeight*4.2),pin:pin,pinSpacing:true,scrub:.35,anticipatePin:1,invalidateOnRefresh:true,
  onUpdate:self=>{document.documentElement.style.setProperty("--hero-progress",(self.progress*100)+"%");document.documentElement.style.setProperty("--vignette",String(.88-self.progress*.58))}
 }});
 heroTimeline
  .to(".hero-content",{opacity:0,filter:"blur(11px)",duration:.075},.065)
  .to(".hero-trust",{opacity:0,duration:.045},.065)
  .to(".fallback-inkwell",{left:"50%",scale:1.15,duration:.12},.10)
  .to(".chapter-close",{opacity:1,duration:.06},.16)
  .to(".chapter-close",{opacity:0,filter:"blur(12px)",duration:.055},.255)
  .to(".fi-cap",{y:"-145%",rotation:135,duration:.18,ease:"power2.inOut"},.245)
  .to(".chapter-open",{opacity:1,duration:.06},.34)
  .to(".fallback-inkwell",{scale:1.45,duration:.14},.38)
  .to(".chapter-open",{opacity:0,filter:"blur(12px)",duration:.055},.46)
  .to(".fallback-inkwell",{scale:2.35,opacity:.32,duration:.19,ease:"power1.in"},.48)
  .to(".hero-pin",{backgroundColor:"#02070D",duration:.13},.50)
  .to(".hero-vignette",{opacity:.05,duration:.12},.52)
  .to(".chapter-inside",{opacity:1,duration:.07},.86)
  .to(".fallback-inkwell",{opacity:0,duration:.07},.67)
  .to({}, {duration:.08},.92);
}

function setupInkwellModel(){
 const canvas=qs("#inkwell-canvas"),loading=qs(".model-loading");if(!canvas||reduced)return;
 const THREE=window.THREE;
 if(!THREE||!THREE.GLTFLoader){loading?.classList.add("loaded");document.body.classList.add("model-failed");return}
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:innerWidth>720,powerPreference:"high-performance"})}
 catch(error){loading?.classList.add("loaded");document.body.classList.add("model-failed");return}
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.2:1.55));renderer.outputEncoding=THREE.sRGBEncoding;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.56;renderer.physicallyCorrectLights=true;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.04,40),lookTarget=new THREE.Vector3(0,.18,0);
 camera.position.set(0,0,6.5);
 scene.add(new THREE.HemisphereLight(0xb9c3c8,0x02060a,.58));
 const key=new THREE.DirectionalLight(0xe3ddd2,.82);key.position.set(-4,5,6);scene.add(key);
 const rim=new THREE.DirectionalLight(0x416f96,.64);rim.position.set(5,2,3);scene.add(rim);
 const fill=new THREE.PointLight(0x244a68,.34,10);fill.position.set(1,-1,3);scene.add(fill);

 // Full-screen ink portal: begins at the centred bottle mouth and expands until ink is the entire frame.
 const inkUniforms={uTime:{value:0},uMix:{value:0},uAspect:{value:1}};
 const inkMaterial=new THREE.ShaderMaterial({
  transparent:true,depthTest:false,depthWrite:false,uniforms:inkUniforms,
  vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
  fragmentShader:[
   "precision highp float;varying vec2 vUv;uniform float uTime;uniform float uMix;uniform float uAspect;",
   "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}",
   "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}",
   "float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(7.1,3.7);a*=.5;}return v;}",
   "void main(){vec2 centred=vUv-.5;centred.x*=uAspect;float radius=mix(0.,2.0,uMix);float mask=(1.-smoothstep(radius-.13,radius,length(centred)))*smoothstep(0.,.08,uMix);",
   "vec2 p=centred*mix(7.0,2.15,uMix);float t=uTime*.055;float flow=fbm(p+vec2(t,-t*.72)+fbm(p*1.8-t));float veins=fbm(p*3.2-vec2(t*.7,t));",
   "vec3 deep=vec3(.002,.012,.028),blue=vec3(.014,.075,.115),glint=vec3(.16,.30,.38);vec3 col=mix(deep,blue,smoothstep(.28,.82,flow));col+=glint*pow(max(0.,veins-.68),2.)*.72;",
   "float grain=(hash(gl_FragCoord.xy+uTime)-.5)*.018;col+=grain;gl_FragColor=vec4(col,mask);}"
  ].join("")
 });
 const inkScene=new THREE.Scene(),inkCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);inkCamera.position.z=1;
 const inkPlane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),inkMaterial);inkScene.add(inkPlane);
 renderer.autoClear=false;

 new THREE.GLTFLoader().load("/assets/socra-inkwell.glb",gltf=>{
  const root=gltf.scene,mobile=innerWidth<720;scene.add(root);
  const startScale=mobile?.46:.62;
  root.scale.setScalar(startScale);root.position.set(mobile?0:1.72,mobile?.82:-.08,0);root.rotation.set(.025,-.2,mobile?0:.02);
  root.traverse(object=>{
   if(!object.isMesh)return;object.frustumCulled=true;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   materials.forEach(material=>{
    if(!material)return;const name=(material.name||"").toLowerCase();material.envMapIntensity=.15;
    if(name.includes("glass")){material.transparent=true;material.opacity=.9;material.roughness=.27;material.metalness=.04;material.depthWrite=true;material.side=THREE.DoubleSide;if("transmission" in material)material.transmission=.045}
    if(name.includes("ink")){material.color?.setHex(0x01050a);material.roughness=.2;material.metalness=.08}
    if(name.includes("cap")){material.color?.setHex(0x151719);material.roughness=.34;material.metalness=.62}
   });
  });

  const inkSurface=root.getObjectByName("InkSurface");let inkTexture=null;
  if(inkSurface&&inkSurface.material){
   const textureCanvas=document.createElement("canvas"),size=128;textureCanvas.width=size;textureCanvas.height=size;
   const context=textureCanvas.getContext("2d"),image=context.createImageData(size,size);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){const index=(y*size+x)*4,radial=Math.sin(Math.hypot(x-size/2,y-size/2)*.42)*24,grain=((x*17+y*31)%29)-14,value=Math.max(0,Math.min(255,126+radial+grain));image.data[index]=image.data[index+1]=image.data[index+2]=value;image.data[index+3]=255}
   context.putImageData(image,0,0);inkTexture=new THREE.CanvasTexture(textureCanvas);inkTexture.wrapS=inkTexture.wrapT=THREE.RepeatWrapping;inkTexture.repeat.set(1.7,1.7);
   inkSurface.material=inkSurface.material.clone();inkSurface.material.bumpMap=inkTexture;inkSurface.material.bumpScale=.018;inkSurface.material.roughness=.17;inkSurface.material.side=THREE.DoubleSide;inkSurface.material.needsUpdate=true;
  }

  const capGroup=new THREE.Group();capGroup.position.set(0,1.365,0);root.add(capGroup);
  ["Cap","Cork","CapBand01","CapBand02","CapBand03","CapBand04"].map(name=>root.getObjectByName(name)).filter(Boolean).forEach(object=>capGroup.attach(object));
  document.body.classList.add("model-ready");loading?.classList.add("loaded");

  if(heroTimeline){
   heroTimeline
    .to(root.rotation,{y:.03,z:0,duration:.14},.08)
    .to(root.position,{x:0,duration:.13},.10)
    .to(root.scale,{x:.96,y:.96,z:.96,duration:.13},.10)
    .to(capGroup.position,{x:-1.05,y:2.48,duration:.2,ease:"power2.inOut"},.24)
    .to(capGroup.rotation,{y:Math.PI*1.4,z:.82,duration:.2,ease:"power2.inOut"},.24)
    .to(camera.position,{y:2.75,z:4.45,duration:.16,ease:"power1.inOut"},.37)
    .to(lookTarget,{y:1.03,duration:.16,ease:"power1.inOut"},.37)
    .to(root.scale,{x:1.14,y:1.14,z:1.14,duration:.14},.40)
    .to(root.rotation,{x:.18,y:.06,z:0,duration:.14,ease:"power1.inOut"},.40)
    .to(camera.position,{y:2.5,z:2.9,duration:.16,ease:"power2.inOut"},.49)
    .to(lookTarget,{y:1.06,z:0,duration:.16,ease:"power2.inOut"},.49)
    .to(root.scale,{x:1.3,y:1.3,z:1.3,duration:.14},.52)
    .to(root.rotation,{x:.4,y:.1,z:0,duration:.15,ease:"power2.inOut"},.51)
    .to(camera.position,{x:.18,y:3.15,z:2.05,duration:.18,ease:"power2.inOut"},.59)
    .to(lookTarget,{y:1.025,duration:.16,ease:"power2.inOut"},.59)
    .to(root.rotation,{x:.58,y:.18,z:-.03,duration:.2,ease:"sine.inOut"},.62)
    .to(root.scale,{x:1.46,y:1.46,z:1.46,duration:.16,ease:"power2.in"},.66)
    .to(inkSurface?inkSurface.rotation:{},{y:.42,duration:.22,ease:"sine.inOut"},.64)
    .to(camera.position,{x:0,y:3.3,z:1.82,duration:.18,ease:"sine.inOut"},.69)
    .to(lookTarget,{x:0,y:1.01,z:0,duration:.18,ease:"sine.inOut"},.69)
    .to(inkUniforms.uMix,{value:1,duration:.2,ease:"power2.in"},.72)
    .to({}, {duration:.15},.82);
   heroTimeline.scrollTrigger?.refresh();
  }

  let raf=0;
  function render(now){raf=requestAnimationFrame(render);if(document.hidden)return;const time=now||0;if(inkTexture)inkTexture.offset.x=time*.000008;inkUniforms.uTime.value=time*.001;camera.lookAt(lookTarget);renderer.clear();renderer.render(scene,camera);if(inkUniforms.uMix.value>.001)renderer.render(inkScene,inkCamera)}
  function resize(){const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();inkUniforms.uAspect.value=width/height;renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.2:1.55))}
  resize();addEventListener("resize",resize);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);inkTexture?.dispose();root.traverse(object=>{if(object.isMesh){object.geometry?.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material?.dispose())}});inkPlane.geometry.dispose();inkMaterial.dispose();renderer.dispose()},{once:true});
 },undefined,()=>{loading?.classList.add("loaded");document.body.classList.add("model-failed")});
}

document.addEventListener("DOMContentLoaded",()=>{setupBlurText();setupUI();setupFAQ();setupHeroScroll();setupMetricComparisons();setupInkField();setupInkwellModel()});