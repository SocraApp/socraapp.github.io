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
 if(window.gsap&&!reduced)gsap.to(element,{opacity:1,y:0,duration:.45,delay,ease:"power2.out"});else{element.style.opacity=1;element.style.transform="none"}
}
let demoTimers=[];
function playDemo(key="derivatives"){
 demoTimers.forEach(clearTimeout);demoTimers=[];const host=qs(".demo-messages");if(!host)return;host.innerHTML="";
 demoData[key].forEach((message,index)=>demoTimers.push(setTimeout(()=>addMessage(host,message),reduced?0:index*520)));
}

function setupUI(){
 const nav=qs(".glass-nav"),menu=qs(".mobile-menu");
 menu?.addEventListener("click",()=>{const open=nav.classList.toggle("menu-open");menu.setAttribute("aria-expanded",String(open));menu.innerHTML=`<i class="fa-solid fa-${open?"xmark":"bars"}"></i>`});
 qsa(".nav-pill a").forEach(link=>link.addEventListener("click",()=>{nav.classList.remove("menu-open");menu?.setAttribute("aria-expanded","false");if(menu)menu.innerHTML='<i class="fa-solid fa-bars"></i>'}));
 qsa(".prompt-button").forEach(button=>button.addEventListener("click",()=>{qsa(".prompt-button").forEach(item=>{item.classList.toggle("active",item===button);item.setAttribute("aria-selected",String(item===button))});playDemo(button.dataset.demo)}));
 qs(".replay-demo")?.addEventListener("click",()=>playDemo(qs(".prompt-button.active")?.dataset.demo));
 qsa(".faq details").forEach(detail=>detail.addEventListener("toggle",()=>{if(detail.open)qsa(".faq details").forEach(other=>{if(other!==detail)other.open=false})}));
 playDemo();
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
  .to(".fallback-inkwell",{scale:6.3,opacity:.1,duration:.19,ease:"power1.in"},.48)
  .to(".hero-pin",{backgroundColor:"#071B33",duration:.13},.50)
  .to(".hero-vignette",{opacity:.05,duration:.12},.52)
  .to(".chapter-inside",{opacity:1,duration:.07},.59)
  .to(".fallback-inkwell",{opacity:0,duration:.07},.67)
  .to(".chapter-inside",{opacity:0,filter:"blur(14px)",duration:.075},.85)
  .to({}, {duration:.08},.92);
}

function setupInkwellModel(){
 const canvas=qs("#inkwell-canvas"),loading=qs(".model-loading");if(!canvas||reduced)return;
 const THREE=window.THREE;
 if(!THREE||!THREE.GLTFLoader){loading?.classList.add("loaded");document.body.classList.add("model-failed");return}
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:innerWidth>720,powerPreference:"high-performance"})}
 catch(error){loading?.classList.add("loaded");document.body.classList.add("model-failed");return}
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.2:1.65));
 renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.04,40);camera.position.set(0,0,6.5);
 scene.add(new THREE.HemisphereLight(0xd8e5ee,0x061426,1.05));
 const key=new THREE.DirectionalLight(0xf5ead7,1.75);key.position.set(-4,5,6);scene.add(key);
 const rim=new THREE.DirectionalLight(0x5f94c7,1.4);rim.position.set(5,1,3);scene.add(rim);
 const fill=new THREE.PointLight(0x1f5b91,1.9,10);fill.position.set(1,-1,3);scene.add(fill);

 new THREE.GLTFLoader().load("/assets/socra-inkwell.glb",gltf=>{
  const root=gltf.scene,mobile=innerWidth<720;scene.add(root);
  const startScale=mobile?.48:.66;
  root.scale.setScalar(startScale);root.position.set(mobile?0:1.72,mobile?.82:-.08,0);root.rotation.set(.035,-.22,mobile?0:.025);
  root.traverse(object=>{
   if(!object.isMesh)return;
   object.frustumCulled=true;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   materials.forEach(material=>{
    if(!material)return;
    const name=(material.name||"").toLowerCase();
    if(name.includes("glass")){material.transparent=true;material.opacity=.58;material.roughness=.2;material.metalness=.05;material.depthWrite=false;material.side=THREE.DoubleSide}
    if(name.includes("ink")){material.color?.setHex(0x03152f);material.roughness=.36}
    if(name.includes("cap")){material.roughness=.3;material.metalness=.68}
   });
  });

  const capGroup=new THREE.Group();capGroup.position.set(0,1.37,0);root.add(capGroup);
  ["Cap","Cork","CapBand01","CapBand02","CapBand03","CapBand04"].map(name=>root.getObjectByName(name)).filter(Boolean).forEach(object=>capGroup.attach(object));
  document.body.classList.add("model-ready");loading?.classList.add("loaded");

  if(heroTimeline){
   heroTimeline
    .to(root.rotation,{y:.04,z:0,duration:.14},.08)
    .to(root.position,{x:0,duration:.13},.10)
    .to(root.scale,{x:1.03,y:1.03,z:1.03,duration:.13},.10)
    .to(capGroup.position,{y:2.42,duration:.18,ease:"power2.inOut"},.245)
    .to(capGroup.rotation,{y:Math.PI*1.65,z:.14,duration:.18,ease:"power2.inOut"},.245)
    .to(root.scale,{x:1.28,y:1.28,z:1.28,duration:.14},.38)
    .to(camera.position,{y:1.08,z:4.0,duration:.14},.39)
    .to(camera.position,{z:1.35,duration:.15,ease:"power1.in"},.48)
    .to(root.scale,{x:1.55,y:1.55,z:1.55,duration:.15},.48)
    .to(camera.position,{z:.04,duration:.12},.56)
    .to(".hero-pin",{backgroundColor:"#071B33",duration:.13},.50)
    .to(canvas,{opacity:.12,duration:.10},.62)
    .to(camera.position,{z:-2.2,duration:.16},.62)
    .to(canvas,{opacity:0,duration:.08},.70);
   heroTimeline.scrollTrigger?.refresh();
  }

  let raf=0;
  function render(){raf=requestAnimationFrame(render);if(!document.hidden)renderer.render(scene,camera)}
  function resize(){
   const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
   renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
   renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.2:1.65));
  }
  resize();addEventListener("resize",resize);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);root.traverse(object=>{if(object.isMesh){object.geometry?.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material?.dispose())}});renderer.dispose()},{once:true});
 },undefined,()=>{loading?.classList.add("loaded");document.body.classList.add("model-failed")});
}

document.addEventListener("DOMContentLoaded",()=>{setupBlurText();setupUI();setupHeroScroll();setupInkwellModel()});