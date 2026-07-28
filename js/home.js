const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const qs=(selector,context=document)=>context.querySelector(selector);
const qsa=(selector,context=document)=>[...context.querySelectorAll(selector)];

const demoData={
 derivatives:[["user","I understand slope, but derivatives still feel abstract."],["assistant","What does slope tell you about a straight line?"],["user","How quickly it rises or falls."],["assistant","Good. A curve keeps changing. How could we measure its slope at just one point?"],["user","Maybe compare two points that are extremely close?"],["assistant","Exactly. What should happen to that distance as we look for the instantaneous slope?"]],
 recursion:[["user","Recursion makes my head spin."],["assistant","Let us start smaller. What must every repeating process eventually do?"],["user","Stop somewhere."],["assistant","Right. In a recursive function, what could define that stopping point?"],["user","A base case?"],["assistant","Yes. Now what smaller version of the original problem can call move us toward it?"]],
 chemistry:[["user","Teach me stoichiometry."],["assistant","When a recipe says 2 cups of flour for 1 loaf, what relationship is it giving you?"],["user","A ratio."],["assistant","Exactly. What in a balanced chemical equation plays the role of that recipe ratio?"],["user","The coefficients?"],["assistant","Yes. So if one reactant runs out first, what does that tell us about the amount of product?"]],
 macbeth:[["user","Help me analyse Macbeth's ambition."],["assistant","Before calling ambition his flaw, what does Macbeth do when he first imagines becoming king?"],["user","He is disturbed by the thought."],["assistant","Interesting. If the desire frightens him, what changes between imagining the act and choosing it?"],["user","Lady Macbeth challenges him."],["assistant","So is ambition acting alone, or does the play show it needing permission and pressure?"]]
};

function setupBlurText(){
 qsa("[data-blur-text]").forEach(element=>{
  const words=element.textContent.trim().split(/s+/);
  element.setAttribute("aria-label",element.textContent.trim());
  element.innerHTML=words.map((word,index)=>`<span class="blur-word" aria-hidden="true" style="transition-delay:${index*90}ms">${word}</span>`).join(" ");
 });
 const targets=qsa("[data-reveal], [data-blur-text]");
 if(reduced){targets.forEach(target=>{target.classList.add("visible");qsa(".blur-word",target).forEach(word=>word.classList.add("visible"))});return}
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(!entry.isIntersecting)return;
  entry.target.classList.add("visible");
  qsa(".blur-word",entry.target).forEach(word=>word.classList.add("visible"));
  observer.unobserve(entry.target);
 }),{threshold:.1,rootMargin:"0px 0px -5% 0px"});
 targets.forEach(target=>observer.observe(target));
}

function addMessage(host,[role,copy],delay=0){
 const element=document.createElement("div");element.className=`demo-message ${role==="assistant"?"socra":"student"}`;
 element.innerHTML=`<small>${role==="assistant"?"Socra":"You"}</small>${copy}`;host.appendChild(element);
 if(window.gsap&&!reduced)gsap.to(element,{opacity:1,y:0,duration:.45,delay,ease:"power2.out"});
 else{element.style.opacity=1;element.style.transform="none"}
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
 qsa(".prompt-button").forEach(button=>button.addEventListener("click",()=>{
  qsa(".prompt-button").forEach(item=>{item.classList.toggle("active",item===button);item.setAttribute("aria-selected",String(item===button))});
  playDemo(button.dataset.demo);
 }));
 qs(".replay-demo")?.addEventListener("click",()=>playDemo(qs(".prompt-button.active")?.dataset.demo));
 qsa(".faq details").forEach(detail=>detail.addEventListener("toggle",()=>{if(detail.open)qsa(".faq details").forEach(other=>{if(other!==detail)other.open=false})}));
 playDemo();
}

function makeHeroStatic(message){
 const hero=qs(".hero"),loading=qs(".model-loading");hero?.classList.add("hero-static");
 if(loading){loading.classList.add("loaded");if(message)loading.querySelector("span").textContent=message}
}

async function setupBookJourney(){
 const canvas=qs("#book-canvas");if(!canvas)return;
 if(reduced){makeHeroStatic();return}
 let THREE,GLTFLoader,RoomEnvironment;
 try{
  THREE=await import("three");
  ({GLTFLoader}=await import("https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/loaders/GLTFLoader.js"));
  ({RoomEnvironment}=await import("https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/environments/RoomEnvironment.js"));
 }catch(error){makeHeroStatic("3D unavailable");return}

 let webgl=true;try{webgl=!!(canvas.getContext("webgl2")||canvas.getContext("webgl"))}catch(error){webgl=false}
 if(!webgl){makeHeroStatic("3D unavailable");return}

 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>720,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.25:1.8));
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(32,1,.05,50);camera.position.set(0,0,6.3);
 const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.035).texture;
 const key=new THREE.DirectionalLight(0xf7fbff,5.5);key.position.set(-4,5,6);scene.add(key);
 const rim=new THREE.DirectionalLight(0x74aee9,5);rim.position.set(5,-2,4);scene.add(rim);
 const fill=new THREE.PointLight(0x174a7e,22,12);fill.position.set(1,-1,3);scene.add(fill);

 new GLTFLoader().load("/assets/socra-dialogue-book.glb",gltf=>{
  const root=gltf.scene;scene.add(root);
  const mobile=innerWidth<720;
  root.scale.setScalar(mobile?.88:1.18);root.position.set(mobile?0:1.72,mobile?.72:0,0);root.rotation.set(.03,-.18,mobile?0:.035);
  root.traverse(object=>{if(object.isMesh&&object.material){object.material.envMapIntensity=1.4;object.frustumCulled=true}});
  const attachPivot=(names)=>{
   const pivot=new THREE.Group();pivot.position.set(-1.08,0,0);root.add(pivot);
   names.map(name=>root.getObjectByName(name)).filter(Boolean).forEach(object=>pivot.attach(object));
   return pivot;
  };
  const frontNames=["FrontCover","FrontPanel","FrontMark01","FrontMark02","FrontMark03"];
  const frontPivot=attachPivot(frontNames);
  const pagePivots=[];
  for(let index=1;index<=9;index++){
   const names=[`Page${String(index).padStart(2,"0")}`];
   if(index===1)for(let ink=1;ink<=6;ink++)names.push(`PageInk${String(ink).padStart(2,"0")}`);
   pagePivots.push(attachPivot(names));
  }
  const ideaCards=qsa([],document);
  const modelCards=[];root.traverse(object=>{if(object.name.startsWith("IdeaCard"))modelCards.push(object)});
  document.body.classList.add("model-ready");qs(".model-loading")?.classList.add("loaded");

  if(!window.gsap||!window.ScrollTrigger){makeHeroStatic();return}
  gsap.registerPlugin(ScrollTrigger);
  const timeline=gsap.timeline({defaults:{ease:"none"},scrollTrigger:{
   trigger:".hero",start:"top top",end:"bottom bottom",scrub:.25,invalidateOnRefresh:true,
   onUpdate:self=>{
    const progress=self.progress;document.documentElement.style.setProperty("--hero-progress",`${progress*100}%`);
    document.documentElement.style.setProperty("--vignette",String(.9-progress*.28));
   }
  }});
  timeline
   .to(root.rotation,{y:.08,z:0,duration:.12},0)
   .to(".hero-content",{opacity:0,filter:"blur(12px)",y:-35,duration:.075},.075)
   .to(".hero-trust",{opacity:0,duration:.05},.08)
   .to(root.position,{x:0,y:0,duration:.12},.09)
   .to(root.scale,{x:1.42,y:1.42,z:1.42,duration:.12},.09)
   .to(camera.position,{z:5.35,duration:.1},.10)
   .to(".chapter-close",{opacity:1,duration:.055},.15)
   .to(".chapter-close",{opacity:0,filter:"blur(12px)",duration:.05},.245)
   .to(frontPivot.rotation,{y:2.72,duration:.18,ease:"power2.inOut"},.22);

  pagePivots.forEach((pivot,index)=>{
   timeline.to(pivot.rotation,{y:2.42-index*.24,duration:.17,ease:"power2.inOut"},.25+index*.012);
  });
  timeline
   .to(root.rotation,{x:-.08,y:.02,duration:.16},.24)
   .to(camera.position,{z:4.35,duration:.14},.25)
   .to(".chapter-open",{opacity:1,duration:.055},.32)
   .to(".chapter-open",{opacity:0,filter:"blur(12px)",duration:.055},.46)
   .to(camera.position,{z:1.1,duration:.15,ease:"power1.in"},.42)
   .to(root.scale,{x:1.65,y:1.65,z:1.65,duration:.14},.42)
   .to(".hero-vignette",{backgroundColor:"#020711",duration:.13},.48)
   .to(camera.position,{z:-1.6,duration:.15},.55)
   .to(".chapter-inside",{opacity:1,duration:.065},.58)
   .to(root.rotation,{y:.2,duration:.20},.58)
   .to(camera.position,{z:-4.9,duration:.22},.68)
   .to(".chapter-inside",{opacity:0,filter:"blur(14px)",duration:.07},.84)
   .to(modelCards.map(card=>card.rotation),{y:1.1,z:.35,stagger:.012,duration:.20},.66)
   .to(".hero-vignette",{opacity:1,duration:.10},.88);
  ScrollTrigger.refresh();

  let visible=true,raf=0;
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible&&!raf)render()},{rootMargin:"100px"});observer.observe(canvas);
  function render(){raf=0;if(!visible||document.hidden)return;renderer.render(scene,camera);raf=requestAnimationFrame(render)}
  function resize(){const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.25:1.8))}
  resize();addEventListener("resize",resize);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);observer.disconnect();root.traverse(object=>{if(object.isMesh){object.geometry?.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material?.dispose())}});pmrem.dispose();renderer.dispose()},{once:true});
 },undefined,()=>makeHeroStatic("3D unavailable"));
}

document.addEventListener("DOMContentLoaded",()=>{setupBlurText();setupUI();setupBookJourney()});