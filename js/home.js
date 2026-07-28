const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const qs=(selector,context=document)=>context.querySelector(selector);
const qsa=(selector,context=document)=>[...context.querySelectorAll(selector)];

const demoData={
 derivatives:[["user","I understand slope, but derivatives still feel abstract."],["assistant","What does slope tell you about a straight line?"],["user","How quickly it rises or falls."],["assistant","Good. A curve keeps changing. How could we measure its slope at just one point?"],["user","Maybe compare two points that are extremely close?"],["assistant","Exactly. What should happen to that distance as we look for the instantaneous slope?"]],
 recursion:[["user","Recursion makes my head spin."],["assistant","Let us start smaller. What must every repeating process eventually do?"],["user","Stop somewhere."],["assistant","Right. In a recursive function, what could define that stopping point?"],["user","A base case?"],["assistant","Yes. Now what smaller version of the original problem can call move us toward it?"]],
 chemistry:[["user","Teach me stoichiometry."],["assistant","When a recipe says 2 cups of flour for 1 loaf, what relationship is it giving you?"],["user","A ratio."],["assistant","Exactly. What in a balanced chemical equation plays the role of that recipe ratio?"],["user","The coefficients?"],["assistant","Yes. So if one reactant runs out first, what does that tell us about the amount of product?"]],
 macbeth:[["user","Help me analyse Macbeth's ambition."],["assistant","Before calling ambition his flaw, what does Macbeth do when he first imagines becoming king?"],["user","He is disturbed by the thought."],["assistant","Interesting. If the desire frightens him, what changes between imagining the act and choosing it?"],["user","Lady Macbeth challenges him."],["assistant","So is ambition acting alone, or does the play show it needing permission and pressure?"]],
 economics:[["user","I confuse supply and demand shifts."],["assistant","Start with demand. If the price of the same product changes, do buyers move to a new curve or along the existing one?"],["user","Along the existing curve."],["assistant","Good. What kind of change would alter how much people want at every possible price?"],["user","Maybe their income or preferences?"],["assistant","Exactly. How would higher income affect demand for a normal good?"]]
};

function addMessage(host,[role,copy],delay=0){
 const element=document.createElement("div");
 element.className=(host.classList.contains("hero-messages")?"chat-message ":"demo-message ")+(role==="assistant"?"assistant socra":"user student");
 element.innerHTML=`<small>${role==="assistant"?"Socra":"You"}</small>${copy}`;
 host.appendChild(element);
 if(window.gsap&&!reduced)gsap.to(element,{opacity:1,y:0,duration:.4,delay,ease:"power2.out"});
 else{element.style.opacity=1;element.style.transform="none"}
}
let demoTimers=[],heroPlayed=false;
function playDemo(key="derivatives"){
 demoTimers.forEach(clearTimeout);demoTimers=[];const host=qs(".demo-messages");if(!host)return;host.innerHTML="";
 demoData[key].forEach((message,index)=>demoTimers.push(setTimeout(()=>addMessage(host,message),reduced?0:index*540)));
}
function playHero(){
 if(heroPlayed)return;heroPlayed=true;const host=qs(".hero-messages");if(!host)return;
 [["user","I do not understand derivatives."],["assistant","Before we begin: what does slope tell us?"],["user","How steep something is."],["assistant","Exactly. So what happens if we make the distance smaller and smaller?"]].forEach((message,index)=>setTimeout(()=>addMessage(host,message),reduced?0:index*520));
}

function setupUI(){
 playDemo();
 qsa(".prompt-button").forEach(button=>button.addEventListener("click",()=>{
  qsa(".prompt-button").forEach(item=>{item.classList.toggle("active",item===button);item.setAttribute("aria-selected",String(item===button))});
  playDemo(button.dataset.demo);
 }));
 qs(".replay-demo")?.addEventListener("click",()=>playDemo(qs(".prompt-button.active")?.dataset.demo));
 const slider=qs(".compare-control input"),shell=qs(".compare-shell");
 slider?.addEventListener("input",()=>shell.style.setProperty("--split",slider.value+"%"));
 const nav=qs(".home-nav"),menu=qs(".menu-toggle");
 menu?.addEventListener("click",()=>{const open=nav.classList.toggle("menu-open");menu.setAttribute("aria-expanded",String(open))});
 qsa(".home-nav-links a").forEach(link=>link.addEventListener("click",()=>{nav.classList.remove("menu-open");menu?.setAttribute("aria-expanded","false")}));
 const themeButton=qs(".theme-toggle");
 const syncTheme=()=>{const dark=document.documentElement.dataset.theme==="dark";themeButton?.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");qs('meta[name="theme-color"]')?.setAttribute("content",dark?"#111722":"#FAF8F5");window.dispatchEvent(new CustomEvent("socra-theme-change",{detail:{dark}}))};
 themeButton?.addEventListener("click",()=>{window.SocraTheme?.applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");syncTheme()});
 syncTheme();
 qsa(".faq details").forEach(detail=>detail.addEventListener("toggle",()=>{if(detail.open)qsa(".faq details").forEach(other=>{if(other!==detail)other.open=false})}));
}

function setupSectionReveals(){
 const targets=qsa(".problem>*,.section-heading,.subjects-heading,.features-lead,.method-intro,.method-card,.research-top,.metrics-grid article,.research-note,.journey-heading,.journey-step,.subject-grid article,.feature-list article,.testimonial-heading,.testimonial-grid figure,.faq-intro,.faq details");
 targets.forEach(target=>target.classList.add("reveal-on-scroll"));
 if(reduced){targets.forEach(target=>target.classList.add("is-visible"));return}
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target)}
 }),{threshold:.12,rootMargin:"0px 0px -7% 0px"});
 targets.forEach(target=>observer.observe(target));
}

async function setupQuestionCore(){
 const canvas=qs("#cognitive-canvas");if(!canvas)return;
 let THREE,GLTFLoader,RoomEnvironment;
 try{
  THREE=await import("three");
  ({GLTFLoader}=await import("https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/loaders/GLTFLoader.js"));
  ({RoomEnvironment}=await import("https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/environments/RoomEnvironment.js"));
 }catch(error){qs(".model-loading span").textContent="3D unavailable";return}

 let webgl=true;try{webgl=!!(canvas.getContext("webgl2")||canvas.getContext("webgl"))}catch(error){webgl=false}
 if(!webgl){qs(".model-loading span").textContent="3D unavailable";return}

 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>700,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.3:2));
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(31,1,.05,40);camera.position.set(0,0,6.4);
 const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.03).texture;
 const key=new THREE.DirectionalLight(0xffffff,5.2);key.position.set(-3,4,6);scene.add(key);
 const rim=new THREE.DirectionalLight(0x8cbdf2,4.4);rim.position.set(4,-2,3);scene.add(rim);
 const low=new THREE.PointLight(0x244f7c,18,10);low.position.set(0,-1,2);scene.add(low);

 new GLTFLoader().load("/assets/socra-question-core.glb",gltf=>{
  const root=gltf.scene;scene.add(root);
  const mobile=innerWidth<720;
  root.scale.setScalar(mobile?1.18:1.52);root.position.set(mobile?0:1.35,0,0);root.rotation.set(.06,-.08,-.06);
  const petals=[1,2,3,4,5,6].map(index=>root.getObjectByName(`Petal0${index}`)).filter(Boolean);
  const core=root.getObjectByName("CoreLens"),questionArc=root.getObjectByName("QuestionArc"),questionDot=root.getObjectByName("QuestionDot");
  const insights=[];root.traverse(object=>{if(object.name.startsWith("Insight"))insights.push(object);if(object.isMesh){object.frustumCulled=true;if(object.material){object.material.envMapIntensity=1.25}}});
  if(core?.material){core.material.transparent=true;core.material.opacity=.28;core.material.depthWrite=false}
  [questionArc,questionDot].forEach(object=>{if(object?.material){object.material.emissive?.set(0xdce9f7);object.material.emissiveIntensity=.18}});
  insights.forEach(object=>{if(object.material){object.material.emissive?.set(0x9dbddf);object.material.emissiveIntensity=.3}});
  qs(".model-loading")?.classList.add("loaded");

  if(window.gsap&&window.ScrollTrigger&&!reduced){
   gsap.registerPlugin(ScrollTrigger);
   const petalBases=petals.map(petal=>petal.position.clone());
   const timeline=gsap.timeline({defaults:{ease:"none"},scrollTrigger:{
    trigger:".hero",start:"top top",end:"bottom bottom",scrub:.2,invalidateOnRefresh:true,
    onUpdate:self=>{
     const progress=self.progress;
     document.documentElement.style.setProperty("--hero-progress",`${(progress*100).toFixed(2)}%`);
     document.documentElement.style.setProperty("--hero-intro-shade",String(Math.max(0,1-progress*6)));
     document.body.classList.toggle("hero-inside",progress>.39&&progress<.995);
     const seconds=Math.floor(progress*20),frames=Math.floor((progress*20-seconds)*24),timecode=qs(".hero-timecode");
     if(timecode)timecode.textContent=`00:00:${String(seconds).padStart(2,"0")}:${String(frames).padStart(2,"0")}`;
     if(progress>.81)playHero();
    }
   }});
   timeline
    .to(root.rotation,{y:.2,z:.04,duration:.13},0)
    .to(root.position,{x:0,duration:.12},.08)
    .to(".hero-intro-scene",{opacity:0,y:-45,duration:.07},.10)
    .to(".beat-question",{opacity:1,scale:1,duration:.06},.14)
    .to(camera.position,{z:5.15,duration:.10},.14)
    .to(root.scale,{x:1.82,y:1.82,z:1.82,duration:.11},.14)
    .to(".beat-question",{opacity:0,scale:1.12,duration:.055},.24);

   petals.forEach((petal,index)=>{
    const base=petalBases[index],length=Math.hypot(base.x,base.y)||1;
    const directionX=base.x/length,directionY=base.y/length;
    timeline.to(petal.position,{x:base.x+directionX*1.35,y:base.y+directionY*1.35,z:base.z+(index%2?.18:-.12),duration:.16},.22);
    timeline.to(petal.rotation,{z:(index%2?1:-1)*.42,duration:.16},.22);
   });
   timeline
    .to(core.scale,{x:1.3,y:1.3,z:1.3,duration:.14},.23)
    .to([questionArc?.scale,questionDot?.scale].filter(Boolean),{x:1.18,y:1.18,z:1.18,duration:.13},.24)
    .to(".hero-wash",{opacity:.22,duration:.09},.29)
    .to(camera.position,{z:2.15,duration:.14},.30)
    .to(root.rotation,{z:.12,y:.42,duration:.14},.30)
    .to(".hero-wash",{opacity:.72,duration:.12},.39)
    .to(camera.position,{z:.22,duration:.11},.40)
    .to(".beat-reason",{opacity:1,scale:1,duration:.055},.43)
    .to(".beat-reason",{opacity:0,scale:1.1,duration:.055},.51)
    .to(camera.position,{z:-1.55,duration:.13},.48)
    .to(root.rotation,{y:.82,duration:.14},.48)
    .to(".beat-reflect",{opacity:1,scale:1,duration:.055},.56)
    .to(".beat-reflect",{opacity:0,scale:1.1,duration:.055},.65)
    .to(camera.position,{z:-3.55,duration:.15},.59)
    .to(".beat-understand",{opacity:1,scale:1,duration:.06},.69)
    .to(camera.position,{z:-5.8,duration:.18},.70)
    .to(".beat-understand",{opacity:0,scale:1.08,duration:.06},.79)
    .to(".conversation-card",{opacity:1,y:0,duration:.07},.80)
    .to(camera.position,{z:-6.55,duration:.13},.82)
    .to(".hero-wash",{opacity:.86,duration:.14},.82)
    .to(".conversation-card",{opacity:0,y:-24,duration:.07},.92);
   ScrollTrigger.refresh();
  }else{root.position.x=0}

  let visible=true,raf=0;
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible&&!raf)render()},{rootMargin:"100px"});observer.observe(canvas);
  function render(){raf=0;if(!visible||document.hidden)return;renderer.render(scene,camera);raf=requestAnimationFrame(render)}
  function resize(){const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.3:2))}
  resize();addEventListener("resize",resize);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);observer.disconnect();root.traverse(object=>{if(object.isMesh){object.geometry?.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material?.dispose())}});pmrem.dispose();renderer.dispose()},{once:true});
 },undefined,()=>{qs(".model-loading span").textContent="3D unavailable"});
}

document.addEventListener("DOMContentLoaded",()=>{setupUI();setupSectionReveals();setupQuestionCore()});