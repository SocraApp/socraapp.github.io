const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const qs=(s,c=document)=>c.querySelector(s), qsa=(s,c=document)=>[...c.querySelectorAll(s)];

const demoData={
 derivatives:[["user","I understand slope, but derivatives still feel abstract."],["assistant","What does slope tell you about a straight line?"],["user","How quickly it rises or falls."],["assistant","Good. A curve keeps changing. How could we measure its slope at just one point?"],["user","Maybe compare two points that are extremely close?"],["assistant","Exactly. What should happen to that distance as we look for the instantaneous slope?"]],
 recursion:[["user","Recursion makes my head spin."],["assistant","Let us start smaller. What must every repeating process eventually do?"],["user","Stop somewhere."],["assistant","Right. In a recursive function, what could define that stopping point?"],["user","A base case?"],["assistant","Yes. Now what smaller version of the original problem can call move us toward it?"]],
 chemistry:[["user","Teach me stoichiometry."],["assistant","When a recipe says 2 cups of flour for 1 loaf, what relationship is it giving you?"],["user","A ratio."],["assistant","Exactly. What in a balanced chemical equation plays the role of that recipe ratio?"],["user","The coefficients?"],["assistant","Yes. So if one reactant runs out first, what does that tell us about the amount of product?"]],
 macbeth:[["user","Help me analyse Macbeth's ambition."],["assistant","Before calling ambition his flaw, what does Macbeth do when he first imagines becoming king?"],["user","He is disturbed by the thought."],["assistant","Interesting. If the desire frightens him, what changes between imagining the act and choosing it?"],["user","Lady Macbeth challenges him."],["assistant","So is ambition acting alone, or does the play show it needing permission and pressure?"]],
 economics:[["user","I confuse supply and demand shifts."],["assistant","Start with demand. If the price of the same product changes, do buyers move to a new curve or along the existing one?"],["user","Along the existing curve."],["assistant","Good. What kind of change would alter how much people want at every possible price?"],["user","Maybe their income or preferences?"],["assistant","Exactly. How would higher income affect demand for a normal good?"]]
};

function addMessage(host,[role,copy],delay=0){
 const el=document.createElement("div");
 el.className=(host.classList.contains("hero-messages")?"chat-message ":"demo-message ")+(role==="assistant"?"assistant socra":"user student");
 el.innerHTML=`<small>${role==="assistant"?"Socra":"You"}</small>${copy}`;
 host.appendChild(el);
 if(window.gsap&&!reduced) gsap.to(el,{opacity:1,y:0,duration:.45,delay,ease:"power2.out"});
 else {el.style.opacity=1;el.style.transform="none"}
}
let demoTimers=[],heroPlayed=false;
function playDemo(key="derivatives"){
 demoTimers.forEach(clearTimeout);demoTimers=[];const host=qs(".demo-messages");if(!host)return;host.innerHTML="";
 demoData[key].forEach((message,index)=>demoTimers.push(setTimeout(()=>addMessage(host,message),reduced?0:index*560)));
}
function playHero(){
 if(heroPlayed)return;heroPlayed=true;const host=qs(".hero-messages");if(!host)return;
 [["user","I do not understand derivatives."],["assistant","Before we begin: what does slope tell us?"],["user","How steep something is."],["assistant","Exactly. So what happens if we make the distance smaller and smaller?"]].forEach((message,index)=>setTimeout(()=>addMessage(host,message),reduced?0:index*560));
}

function setupUI(){
 playDemo();
 qsa(".prompt-button").forEach(button=>button.addEventListener("click",()=>{
  qsa(".prompt-button").forEach(item=>{item.classList.toggle("active",item===button);item.setAttribute("aria-selected",item===button)});
  playDemo(button.dataset.demo);
 }));
 qs(".replay-demo")?.addEventListener("click",()=>playDemo(qs(".prompt-button.active")?.dataset.demo));
 const slider=qs(".compare-control input"),shell=qs(".compare-shell");
 slider?.addEventListener("input",()=>shell.style.setProperty("--split",slider.value+"%"));
 const nav=qs(".home-nav"),menu=qs(".menu-toggle");
 menu?.addEventListener("click",()=>{const open=nav.classList.toggle("menu-open");menu.setAttribute("aria-expanded",open)});
 qsa(".home-nav-links a").forEach(link=>link.addEventListener("click",()=>{nav.classList.remove("menu-open");menu?.setAttribute("aria-expanded","false")}));
 const themeButton=qs(".theme-toggle");
 const syncTheme=()=>{const dark=document.documentElement.dataset.theme==="dark";themeButton?.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");qs('meta[name="theme-color"]')?.setAttribute("content",dark?"#101713":"#eef0e8");window.dispatchEvent(new CustomEvent("socra-theme-change",{detail:{dark}}))};
 themeButton?.addEventListener("click",()=>{window.SocraTheme?.applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");syncTheme()});
 syncTheme();
 qsa(".faq details").forEach(detail=>detail.addEventListener("toggle",()=>{if(detail.open)qsa(".faq details").forEach(other=>{if(other!==detail)other.open=false})}));
}

function setupPageMotion(){
 if(!window.gsap||!window.ScrollTrigger||reduced){playHero();return}
 gsap.registerPlugin(ScrollTrigger);
 gsap.timeline({defaults:{ease:"power3.out"}})
  .from(".home-nav",{y:-70,opacity:0,duration:.8})
  .from(".hero-title span",{yPercent:105,opacity:0,duration:1.05,stagger:.12},"-=.35")
  .from(".hero .reveal",{y:20,opacity:0,duration:.6,stagger:.09},"-=.7")
  .from(".hero-stage",{scale:.965,opacity:0,duration:1},"-=.9");
 const revealTargets=".section-heading,.subjects-heading,.features-lead,.method-intro,.research-top,.testimonial-heading,.faq-intro";
 qsa(revealTargets).forEach(el=>gsap.from(el,{y:55,opacity:0,duration:.9,scrollTrigger:{trigger:el,start:"top 84%"}}));
 gsap.from(".answer-slip",{x:70,opacity:0,stagger:.12,scrollTrigger:{trigger:".answer-stack",start:"top 78%"}});
 gsap.from(".method-card",{x:45,opacity:.2,stagger:.1,scrollTrigger:{trigger:".method-steps",start:"top 78%"}});
 gsap.from(".metrics-grid article",{y:45,opacity:0,stagger:.08,scrollTrigger:{trigger:".metrics-grid",start:"top 82%"}});
 gsap.fromTo(".metrics-grid i",{scaleX:0},{scaleX:1,duration:1,stagger:.08,scrollTrigger:{trigger:".metrics-grid",start:"top 82%"}});
 const path=qs(".journey-path");
 if(path){gsap.to(path,{strokeDashoffset:0,ease:"none",scrollTrigger:{trigger:".journey-map",start:"top 80%",end:"bottom 48%",scrub:1}});gsap.to(".journey-step",{opacity:1,stagger:.13,scrollTrigger:{trigger:".journey-map",start:"top 70%"}})}
 qsa(".subject-grid article,.feature-list article,.testimonial-grid figure").forEach(el=>gsap.from(el,{y:30,opacity:0,duration:.65,scrollTrigger:{trigger:el,start:"top 92%"}}));
 gsap.from(".philosophy-copy p",{y:42,opacity:0,stagger:.1,scrollTrigger:{trigger:".philosophy",start:"top 58%"}});
 gsap.to(".cta-rings i",{scale:1.13,stagger:.05,ease:"none",scrollTrigger:{trigger:".final-cta",start:"top bottom",end:"bottom top",scrub:1}});
}

async function setupCognitiveCore(){
 const canvas=qs("#cognitive-canvas");if(!canvas)return;
 let THREE,GLTFLoader;
 try{
  THREE=await import("three");
  ({GLTFLoader}=await import("https://cdn.jsdelivr.net/npm/three@0.168.0/examples/jsm/loaders/GLTFLoader.js"));
 }catch(error){qs(".model-loading span").textContent="Thought unavailable";return}

 let webgl=true;try{webgl=!!(canvas.getContext("webgl2")||canvas.getContext("webgl"))}catch(error){webgl=false}
 if(!webgl){qs(".model-loading span").textContent="Thought unavailable";return}

 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>700,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.25:1.8));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(34,1,.1,50);camera.position.set(0,.06,6.4);
 scene.add(new THREE.HemisphereLight(0xf4f0de,0x263b30,3.1));
 const key=new THREE.DirectionalLight(0xffd5b9,4.2);key.position.set(3,4,5);scene.add(key);
 const rim=new THREE.DirectionalLight(0xa5c9b4,3.2);rim.position.set(-4,-1,2);scene.add(rim);

 const loader=new GLTFLoader();
 loader.load("/assets/socra-cognitive-core.glb",gltf=>{
  const root=gltf.scene;scene.add(root);
  root.scale.setScalar(innerWidth<700?1.25:1.48);root.rotation.set(.08,-.62,-.03);root.position.set(0,.15,0);
  const left=root.getObjectByName("BrainLeft"),right=root.getObjectByName("BrainRight"),nucleus=root.getObjectByName("Nucleus");
  const rings=[1,2,3].map(i=>root.getObjectByName(`ThoughtRing0${i}`)).filter(Boolean);
  const signals=[1,2,3].map(i=>root.getObjectByName(`SignalNode0${i}`)).filter(Boolean);
  root.traverse(object=>{if(object.isMesh){object.castShadow=false;object.receiveShadow=false;if(object.material){object.material.envMapIntensity=.8}}});
  qs(".model-loading")?.classList.add("loaded");

  const base={left:left?.position.x||0,right:right?.position.x||0};
  if(window.gsap&&window.ScrollTrigger&&!reduced){
   const timeline=gsap.timeline({defaults:{ease:"none"},scrollTrigger:{
    trigger:".hero",start:"top top",end:"bottom bottom",scrub:.65,
    onUpdate:self=>{
     const p=self.progress;
     document.documentElement.style.setProperty("--hero-progress",`${(p*100).toFixed(2)}%`);
     const seconds=Math.floor(p*18),frames=Math.floor((p*18-seconds)*24);
     const tc=qs(".hero-timecode");if(tc)tc.textContent=`00:00:${String(seconds).padStart(2,"0")}:${String(frames).padStart(2,"0")}`;
     qsa(".stage-orbit span").forEach((label,index)=>label.classList.toggle("active",index===Math.min(2,Math.floor(p*3))));
     if(p>.56)playHero();
    }
   }});
   timeline
    .to(root.rotation,{y:.18,x:-.08,duration:.24},0)
    .to(root.scale,{x:1.62,y:1.62,z:1.62,duration:.24},0)
    .to(left.position,{x:base.left-.34,duration:.22},.18)
    .to(right.position,{x:base.right+.34,duration:.22},.18)
    .to(left.rotation,{y:-.22,z:.08,duration:.22},.18)
    .to(right.rotation,{y:.22,z:-.08,duration:.22},.18)
    .to(nucleus.scale,{x:1.75,y:1.75,z:1.75,duration:.2},.30)
    .to(rings[0]?.rotation||{}, {z:Math.PI*1.4,duration:.36},.28)
    .to(rings[1]?.rotation||{}, {y:-Math.PI*1.2,duration:.36},.28)
    .to(rings[2]?.rotation||{}, {x:Math.PI*1.1,duration:.36},.28)
    .to(signals.map(s=>s.scale),{x:1.45,y:1.45,z:1.45,stagger:.025,duration:.14},.43)
    .to(".conversation-card",{opacity:1,y:0,duration:.16},.52)
    .to(left.position,{x:base.left-.05,duration:.22},.68)
    .to(right.position,{x:base.right+.05,duration:.22},.68)
    .to(left.rotation,{y:0,z:0,duration:.22},.68)
    .to(right.rotation,{y:0,z:0,duration:.22},.68)
    .to(nucleus.scale,{x:1.05,y:1.05,z:1.05,duration:.18},.7)
    .to(root.rotation,{y:Math.PI*1.9,x:.18,z:.08,duration:.3},.68)
    .to(root.position,{y:-.08,duration:.3},.68);
  }else{playHero()}

  let pointerX=0,pointerY=0,visible=true,raf=0;
  const onPointer=e=>{pointerX=(e.clientX/innerWidth-.5)*.09;pointerY=(e.clientY/innerHeight-.5)*.06};
  addEventListener("pointermove",onPointer,{passive:true});
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible&&!raf)render()},{rootMargin:"100px"});observer.observe(canvas);
  function render(){
   raf=0;if(!visible||document.hidden)return;
   camera.position.x+=(pointerX-camera.position.x)*.035;camera.position.y+=(pointerY+.06-camera.position.y)*.035;camera.lookAt(0,0,0);
   renderer.render(scene,camera);raf=requestAnimationFrame(render);
  }
  const resize=()=>{const rect=canvas.getBoundingClientRect();const width=Math.max(1,rect.width),height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.25:1.8))};
  resize();addEventListener("resize",resize);render();
  addEventListener("pagehide",()=>{cancelAnimationFrame(raf);observer.disconnect();removeEventListener("pointermove",onPointer);root.traverse(o=>{if(o.isMesh){o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m?.dispose())}});renderer.dispose()},{once:true});
 },undefined,()=>{qs(".model-loading span").textContent="Thought unavailable"});
}

document.addEventListener("DOMContentLoaded",()=>{setupUI();setupPageMotion();setupCognitiveCore()});