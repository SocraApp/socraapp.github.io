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
  const label=element.textContent.trim(),words=label.split(/s+/);element.setAttribute("aria-label",label);
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
 const hero=qs(".hero");if(!hero)return;
 if(reduced||!window.gsap||!window.ScrollTrigger){hero.classList.add("hero-static");return}
 gsap.registerPlugin(ScrollTrigger);
 heroTimeline=gsap.timeline({defaults:{ease:"none"},scrollTrigger:{
  trigger:hero,start:"top top",end:"bottom bottom",scrub:.2,invalidateOnRefresh:true,
  onUpdate:self=>{document.documentElement.style.setProperty("--hero-progress",`${self.progress*100}%`);document.documentElement.style.setProperty("--vignette",String(.88-self.progress*.34))}
 }});
 heroTimeline
  .to(".hero-content",{opacity:0,filter:"blur(11px)",y:-30,duration:.075},.075)
  .to(".hero-trust",{opacity:0,duration:.045},.08)
  .to(".fallback-book",{left:"50%",top:"50%",scale:1.3,rotationY:0,rotationZ:0,duration:.12},.09)
  .to(".chapter-close",{opacity:1,duration:.055},.15)
  .to(".chapter-close",{opacity:0,filter:"blur(12px)",duration:.05},.245)
  .to(".fallback-cover",{rotationY:-155,duration:.18,ease:"power2.inOut"},.22)
  .to(".fallback-page.fp1",{rotationY:-130,duration:.17,ease:"power2.inOut"},.25)
  .to(".fallback-page.fp2",{rotationY:-88,duration:.17,ease:"power2.inOut"},.275)
  .to(".fallback-page.fp3",{rotationY:-46,duration:.17,ease:"power2.inOut"},.30)
  .to(".chapter-open",{opacity:1,duration:.055},.32)
  .to(".fallback-book",{scale:1.75,duration:.14},.39)
  .to(".chapter-open",{opacity:0,filter:"blur(12px)",duration:.055},.46)
  .to(".fallback-book",{scale:4.8,opacity:.18,duration:.19,ease:"power1.in"},.48)
  .to(".hero-pin",{backgroundColor:"#071B33",duration:.12},.52)
  .to(".hero-vignette",{opacity:.08,duration:.12},.52)
  .to(".chapter-inside",{opacity:1,duration:.065},.59)
  .to(".fallback-book",{opacity:0,duration:.08},.68)
  .to(".chapter-inside",{opacity:0,filter:"blur(14px)",duration:.07},.85);
}

function setupBookModel(){
 const canvas=qs("#book-canvas"),loading=qs(".model-loading");if(!canvas||reduced)return;
 const THREE=window.THREE;
 if(!THREE||!THREE.GLTFLoader){loading?.classList.add("loaded");document.body.classList.add("model-failed");return}
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>720,powerPreference:"high-performance"})}
 catch(error){loading?.classList.add("loaded");document.body.classList.add("model-failed");return}
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.25:1.8));renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.05,50);camera.position.set(0,0,6.3);
 scene.add(new THREE.HemisphereLight(0xf7f2e8,0x17385b,2.7));
 const key=new THREE.DirectionalLight(0xffffff,3.8);key.position.set(-4,5,6);scene.add(key);
 const rim=new THREE.DirectionalLight(0x78abe0,3.4);rim.position.set(5,-2,4);scene.add(rim);
 const fill=new THREE.PointLight(0x1c558b,7,12);fill.position.set(1,-1,3);scene.add(fill);

 new THREE.GLTFLoader().load("/assets/socra-dialogue-book.glb",gltf=>{
  const root=gltf.scene;scene.add(root);const mobile=innerWidth<720;
  root.scale.setScalar(mobile?.88:1.18);root.position.set(mobile?0:1.72,mobile?.72:0,0);root.rotation.set(.03,-.18,mobile?0:.035);
  root.traverse(object=>{if(object.isMesh){object.frustumCulled=true;if(object.material){object.material.envMapIntensity=1.1}}});
  const attachPivot=names=>{const pivot=new THREE.Group();pivot.position.set(-1.08,0,0);root.add(pivot);names.map(name=>root.getObjectByName(name)).filter(Boolean).forEach(object=>pivot.attach(object));return pivot};
  const frontPivot=attachPivot(["FrontCover","FrontPanel","FrontMark01","FrontMark02","FrontMark03"]);
  const pagePivots=[];
  for(let index=1;index<=9;index++){const names=[`Page${String(index).padStart(2,"0")}`];if(index===1)for(let ink=1;ink<=6;ink++)names.push(`PageInk${String(ink).padStart(2,"0")}`);pagePivots.push(attachPivot(names))}
  const modelCards=[];root.traverse(object=>{if(object.name.startsWith("IdeaCard"))modelCards.push(object)});
  document.body.classList.add("model-ready");loading?.classList.add("loaded");

  if(heroTimeline){
   heroTimeline
    .to(root.rotation,{y:.08,z:0,duration:.12},0)
    .to(root.position,{x:0,y:0,duration:.12},.09)
    .to(root.scale,{x:1.42,y:1.42,z:1.42,duration:.12},.09)
    .to(camera.position,{z:5.35,duration:.1},.10)
    .to(frontPivot.rotation,{y:2.72,duration:.18,ease:"power2.inOut"},.22);
   pagePivots.forEach((pivot,index)=>heroTimeline.to(pivot.rotation,{y:2.42-index*.24,duration:.17,ease:"power2.inOut"},.25+index*.012));
   heroTimeline
    .to(root.rotation,{x:-.08,y:.02,duration:.16},.24)
    .to(camera.position,{z:4.35,duration:.14},.25)
    .to(camera.position,{z:1.1,duration:.15,ease:"power1.in"},.42)
    .to(root.scale,{x:1.65,y:1.65,z:1.65,duration:.14},.42)
    .to(camera.position,{z:-1.6,duration:.15},.55)
    .to(root.rotation,{y:.2,duration:.20},.58)
    .to(camera.position,{z:-4.9,duration:.22},.68)
    .to(modelCards.map(card=>card.rotation),{y:1.1,z:.35,stagger:.012,duration:.20},.66);
   heroTimeline.scrollTrigger?.refresh();
  }

  let visible=true,raf=0;const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible&&!raf)render()},{rootMargin:"100px"});observer.observe(canvas);
  function render(){raf=0;if(!visible||document.hidden)return;renderer.render(scene,camera);raf=requestAnimationFrame(render)}
  function resize(){const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<720?1.25:1.8))}
  resize();addEventListener("resize",resize);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);observer.disconnect();root.traverse(object=>{if(object.isMesh){object.geometry?.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material?.dispose())}});renderer.dispose()},{once:true});
 },undefined,()=>{loading?.classList.add("loaded");document.body.classList.add("model-failed")});
}

document.addEventListener("DOMContentLoaded",()=>{setupBlurText();setupUI();setupHeroScroll();setupBookModel()});