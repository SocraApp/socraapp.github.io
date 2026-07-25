const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const qs=(s,c=document)=>c.querySelector(s), qsa=(s,c=document)=>[...c.querySelectorAll(s)];

const demoData={
 derivatives:[
  ["user","I understand slope, but derivatives still feel abstract."],
  ["assistant","What does slope tell you about a straight line?"],
  ["user","How quickly it rises or falls."],
  ["assistant","Good. A curve keeps changing. How could we measure its slope at just one point?"],
  ["user","Maybe compare two points that are extremely close?"],
  ["assistant","Exactly. What should happen to that distance as we look for the instantaneous slope?"]
 ],
 recursion:[
  ["user","Recursion makes my head spin."],
  ["assistant","Let us start smaller. What must every repeating process eventually do?"],
  ["user","Stop somewhere."],
  ["assistant","Right. In a recursive function, what could define that stopping point?"],
  ["user","A base case?"],
  ["assistant","Yes. Now what smaller version of the original problem can call move us toward it?"]
 ],
 chemistry:[
  ["user","Teach me stoichiometry."],
  ["assistant","When a recipe says 2 cups of flour for 1 loaf, what relationship is it giving you?"],
  ["user","A ratio."],
  ["assistant","Exactly. What in a balanced chemical equation plays the role of that recipe ratio?"],
  ["user","The coefficients?"],
  ["assistant","Yes. So if one reactant runs out first, what does that tell us about the amount of product?"]
 ],
 macbeth:[
  ["user","Help me analyse Macbeth's ambition."],
  ["assistant","Before calling ambition his flaw, what does Macbeth do when he first imagines becoming king?"],
  ["user","He is disturbed by the thought."],
  ["assistant","Interesting. If the desire frightens him, what changes between imagining the act and choosing it?"],
  ["user","Lady Macbeth challenges him."],
  ["assistant","So is ambition acting alone, or does the play show it needing permission and pressure?"]
 ],
 economics:[
  ["user","I confuse supply and demand shifts."],
  ["assistant","Start with demand. If the price of the same product changes, do buyers move to a new curve or along the existing one?"],
  ["user","Along the existing curve."],
  ["assistant","Good. What kind of change would alter how much people want at every possible price?"],
  ["user","Maybe their income or preferences?"],
  ["assistant","Exactly. How would higher income affect demand for a normal good?"]
 ]
};

function addMessage(host,[role,text],delay=0){
 const el=document.createElement("div"); el.className=(host.classList.contains("hero-messages")?"chat-message ":"demo-message ")+(role==="assistant"?"assistant socra":"user student");
 el.innerHTML=`<small>${role==="assistant"?"Socra":"You"}</small>${text}`; host.appendChild(el);
 if(window.gsap&&!reduced) gsap.to(el,{opacity:1,y:0,duration:.5,delay,ease:"power2.out"});
 else {el.style.opacity=1;el.style.transform="none"}
}
let demoTimers=[];
function playDemo(key="derivatives"){
 demoTimers.forEach(clearTimeout); demoTimers=[]; const host=qs(".demo-messages"); if(!host)return; host.innerHTML="";
 demoData[key].forEach((m,i)=>demoTimers.push(setTimeout(()=>addMessage(host,m),reduced?0:i*620)));
}
function playHero(){
 const host=qs(".hero-messages"); if(!host)return;
 const items=[["user","I do not understand derivatives."],["assistant","Before we begin: what does slope tell us?"],["user","How steep something is."],["assistant","Exactly. So what happens if we make the distance smaller and smaller?"]];
 items.forEach((m,i)=>setTimeout(()=>addMessage(host,m),reduced?0:500+i*780));
}

function setupUI(){
 playHero(); playDemo();
 qsa(".prompt-button").forEach(btn=>btn.addEventListener("click",()=>{
  qsa(".prompt-button").forEach(b=>{b.classList.toggle("active",b===btn);b.setAttribute("aria-selected",b===btn)});
  playDemo(btn.dataset.demo);
 }));
 qs(".replay-demo")?.addEventListener("click",()=>playDemo(qs(".prompt-button.active")?.dataset.demo));
 const slider=qs(".compare-control input"), shell=qs(".compare-shell");
 slider?.addEventListener("input",()=>shell.style.setProperty("--split",slider.value+"%"));
 const nav=qs(".home-nav"),menu=qs(".menu-toggle");
 menu?.addEventListener("click",()=>{const open=nav.classList.toggle("menu-open");menu.setAttribute("aria-expanded",open)});
 qsa(".home-nav-links a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("menu-open");menu?.setAttribute("aria-expanded","false")}));
 const themeButton=qs(".theme-toggle");
 const syncThemeLabel=()=>{const dark=document.documentElement.dataset.theme==="dark";themeButton?.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");qs('meta[name="theme-color"]')?.setAttribute("content",dark?"#090d18":"#f5f6fa");window.dispatchEvent(new CustomEvent("socra-theme-change",{detail:{dark}}))};
 themeButton?.addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";window.SocraTheme?.applyTheme(next);syncThemeLabel()});
 syncThemeLabel();
 qsa(".faq details").forEach(item=>item.addEventListener("toggle",()=>{if(item.open)qsa(".faq details").forEach(other=>{if(other!==item)other.open=false})}));
}

function setupMotion(){
 if(!window.gsap||!window.ScrollTrigger||reduced)return;
 gsap.registerPlugin(ScrollTrigger);
 const intro=gsap.timeline({defaults:{ease:"power3.out"}});
 intro.from(".home-nav",{y:-80,opacity:0,duration:.8}).from(".hero-title span",{yPercent:110,opacity:0,duration:1.1,stagger:.12},"-=.35").from(".hero .reveal",{y:22,opacity:0,duration:.65,stagger:.1},"-=.65").from(".conversation-card",{scale:.92,opacity:0,duration:1},"-=.8");
 qsa(".section-heading,.subjects-heading,.features-lead,.method-intro,.research-top,.testimonial-heading,.faq-intro").forEach(el=>gsap.from(el,{y:60,opacity:0,duration:1,scrollTrigger:{trigger:el,start:"top 82%"}}));
 gsap.from(".answer-slip",{x:80,opacity:0,stagger:.16,scrollTrigger:{trigger:".answer-stack",start:"top 75%"}});
 gsap.from(".giant-copy",{y:90,opacity:0,scrollTrigger:{trigger:".problem-grid",start:"top 72%",end:"bottom 55%",scrub:1}});
 gsap.from(".method-card",{opacity:.2,x:50,stagger:.15,scrollTrigger:{trigger:".method-steps",start:"top 75%"}});
 gsap.from(".metrics-grid article",{y:55,opacity:0,stagger:.1,scrollTrigger:{trigger:".metrics-grid",start:"top 80%"}});
 gsap.fromTo(".metrics-grid i",{scaleX:0},{scaleX:1,duration:1,stagger:.08,scrollTrigger:{trigger:".metrics-grid",start:"top 80%"}});
 const path=qs(".journey-path");
 if(path){gsap.to(path,{strokeDashoffset:0,ease:"none",scrollTrigger:{trigger:".journey-map",start:"top 80%",end:"bottom 50%",scrub:1}});gsap.to(".journey-step",{opacity:1,stagger:.14,scrollTrigger:{trigger:".journey-map",start:"top 70%"}})}
 qsa(".subject-grid article,.feature-list article,.testimonial-grid figure").forEach(el=>gsap.from(el,{y:35,opacity:0,duration:.7,scrollTrigger:{trigger:el,start:"top 91%"}}));
 gsap.from(".philosophy-copy p",{y:45,opacity:0,stagger:.12,scrollTrigger:{trigger:".philosophy",start:"top 55%"}});
 gsap.to(".cta-rings i",{scale:1.12,stagger:.06,ease:"none",scrollTrigger:{trigger:".final-cta",start:"top bottom",end:"bottom top",scrub:1}});
}

async function setupKnowledgeScene(){
 if(reduced)return;
 const canvas=qs("#knowledge-canvas"); if(!canvas)return;
 let hasWebGL=false; try{hasWebGL=!!(canvas.getContext("webgl2")||canvas.getContext("webgl"))}catch(e){}
 if(!hasWebGL){canvas.style.display="none";qs(".canvas-fallback")?.style.setProperty("display","block");return}
 let THREE; try{THREE=await import("https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js")}catch(e){canvas.style.display="none";return}
 const mobile=innerWidth<700, count=mobile?18:38;
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:!mobile,powerPreference:"high-performance"});
 renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.8)); renderer.setSize(innerWidth,innerHeight);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,100);camera.position.set(0,0,12);
 const group=new THREE.Group();scene.add(group);
 const nodeGeo=new THREE.SphereGeometry(mobile?.06:.08,10,10),nodes=[],positions=[];
 const linePositions=[],edgePairs=[];
 for(let i=0;i<count;i++){
  const a=i*2.399, r=1.2+Math.sqrt(i)*.63, p=new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r*.7,(i%7-3)*.22);
  positions.push(p);const mat=new THREE.MeshBasicMaterial({color:0x3157d5,transparent:true,opacity:i%5===0?1:.65});const node=new THREE.Mesh(nodeGeo,mat);node.position.copy(p);group.add(node);nodes.push(node);
  if(i>0){const parent=Math.floor((i-1)/1.65);edgePairs.push([parent,i]);linePositions.push(...positions[parent].toArray(),...p.toArray())}
 }
 const lineGeo=new THREE.BufferGeometry();lineGeo.setAttribute("position",new THREE.Float32BufferAttribute(linePositions,3));
 const lineMat=new THREE.LineBasicMaterial({color:0x6e85e6,transparent:true,opacity:.22});const lines=new THREE.LineSegments(lineGeo,lineMat);group.add(lines);
 const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.3,2),new THREE.MeshBasicMaterial({color:0x3157d5,wireframe:true,transparent:true,opacity:.7}));group.add(core);
 const pointer={x:0,y:0}; addEventListener("pointermove",e=>{pointer.x=(e.clientX/innerWidth-.5);pointer.y=(e.clientY/innerHeight-.5)});
 const state={progress:0}; if(window.gsap&&window.ScrollTrigger){gsap.to(state,{progress:1,ease:"none",scrollTrigger:{trigger:"main",start:"top top",end:"bottom bottom",scrub:1}})}
 let active=true,raf;
 const observer=new IntersectionObserver(entries=>{active=entries.some(e=>e.isIntersecting);if(active&&!raf)render()},{rootMargin:"200px"});qsa(".webgl-zone").forEach(z=>observer.observe(z));
 function colors(dark){lineMat.color.set(dark?0x8399f7:0x6e85e6);lineMat.opacity=dark?.3:.18;nodes.forEach(n=>n.material.color.set(dark?0x91a6ff:0x3157d5));core.material.color.set(dark?0xaab9ff:0x3157d5)}
 colors(document.documentElement.dataset.theme==="dark");window.addEventListener("socra-theme-change",e=>colors(e.detail.dark));
 function render(){raf=0;if(!active||document.hidden)return;const t=performance.now()*.00018,p=state.progress;group.rotation.z=t*.25+p*1.8;group.rotation.y=t+p*2.4+pointer.x*.12;group.rotation.x=pointer.y*.08;group.position.x=innerWidth>900?3.7*Math.cos(p*Math.PI*2):0;group.position.y=Math.sin(p*Math.PI*5)*.8;const organization=Math.min(1,Math.max(0,(p-.12)*2.2));nodes.forEach((n,i)=>{const base=positions[i],ring=i/count*Math.PI*5;n.position.x=THREE.MathUtils.lerp(base.x,Math.cos(ring)*(1.2+i*.055),organization);n.position.y=THREE.MathUtils.lerp(base.y,Math.sin(ring)*(1.2+i*.055),organization);n.position.z=base.z+Math.sin(t*4+i)*.06});const a=lineGeo.attributes.position.array;edgePairs.forEach((edge,i)=>{const p1=nodes[edge[0]].position,p2=nodes[edge[1]].position,o=i*6;a[o]=p1.x;a[o+1]=p1.y;a[o+2]=p1.z;a[o+3]=p2.x;a[o+4]=p2.y;a[o+5]=p2.z});lineGeo.attributes.position.needsUpdate=true;core.rotation.x=t*2;core.rotation.y=t*1.4;renderer.render(scene,camera);raf=requestAnimationFrame(render)}
 render();
 const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.25:1.8))};addEventListener("resize",resize);
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!raf)render()});
 addEventListener("pagehide",()=>{cancelAnimationFrame(raf);observer.disconnect();lineGeo.dispose();lineMat.dispose();nodeGeo.dispose();nodes.forEach(n=>n.material.dispose());core.geometry.dispose();core.material.dispose();renderer.dispose()},{once:true});
}

document.addEventListener("DOMContentLoaded",()=>{setupUI();setupMotion();const start=()=>setupKnowledgeScene();if("requestIdleCallback"in window)requestIdleCallback(start,{timeout:1400});else setTimeout(start,300)});
