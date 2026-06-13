(function(){
'use strict';
let currentUser=null,currentProfile=null,currentChat=null,chats=[],editor=null,aiClient=null,metricsManager=null,isSending=false,workspaceDoc=null;
let openDropdown=null; // Track currently open chat dropdown
const $=id=>document.getElementById(id);
const sidebar=$('sidebar'),sidebarToggle=$('sidebar-toggle'),searchToggle=$('search-toggle');
const sidebarSearch=$('sidebar-search'),chatSearchInput=$('chat-search-input'),newChatBtn=$('new-chat-btn');
const chatHistory=$('chat-history'),chatHistoryEmpty=$('chat-history-empty'),chatMessages=$('chat-messages');
const welcomeScreen=$('welcome-screen'),welcomeHeading=$('welcome-heading'),welcomeText=$('welcome-text');
const welcomePresets=$('welcome-presets'),composerInput=$('composer-input'),sendBtn=$('send-btn');
const workspaceBtn=$('workspace-btn'),workspacePanel=$('workspace-panel'),closeWorkspace=$('close-workspace');
const workspaceTitle=$('workspace-title'),profileAvatar=$('profile-avatar'),profileName=$('profile-name');
const profilePlan=$('profile-plan'),upgradeBtn=$('upgrade-btn'),formatHeading=$('format-heading');
const toastContainer=$('toast-container'),mobileMenuBtn=$('mobile-menu-btn');
const reopenWorkspaceBtn=$('reopen-workspace-btn'),sidebarLogoFull=$('sidebar-logo-full'),sidebarLogoSmall=$('sidebar-logo-small');

// Configure marked to treat single newlines as <br>
if(typeof marked!=='undefined'){
  marked.setOptions({breaks:true,gfm:true});
}

async function init(){
  if(!sb){window.location.href='auth.html';return;}
  const{data:{session}}=await sb.auth.getSession();
  if(!session){window.location.href='auth.html';return;}
  currentUser=session.user;
  await loadProfile();
  aiClient=new AIClient(sb);
  metricsManager=new MetricsManager(sb);
  editor=new MarkdownEditor(null,null,{autoSave:c=>saveWorkspaceDocument(c)});
  setupEvents();
  sb.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT')window.location.href='auth.html';});
  await loadChats();
  setWelcomeMessage();
  setupFormatBar();
  checkMobile();
  window.addEventListener('resize',checkMobile);
  // Close dropdown when clicking outside
  document.addEventListener('click',e=>{
    if(openDropdown&&!openDropdown.contains(e.target)&&!e.target.closest('.chat-item-menu-btn')){
      closeChatDropdown();
    }
  });
}

async function loadProfile(){
  const{data,error}=await sb.from('profiles').select('*').eq('id',currentUser.id).single();
  if(error||!data){
    const{data:up}=await sb.from('profiles').upsert({id:currentUser.id,name:currentUser.user_metadata?.name||currentUser.email.split('@')[0],plan:'doxa'},{onConflict:'id'}).select().single();
    currentProfile=up||{name:currentUser.email.split('@')[0],plan:'doxa'};
  }else{currentProfile=data;}
  const n=currentProfile.name||currentUser.email.split('@')[0];
  profileAvatar.textContent=n.charAt(0).toUpperCase();
  profileName.textContent=n;
  profilePlan.textContent=currentProfile.plan.charAt(0).toUpperCase()+currentProfile.plan.slice(1);
  upgradeBtn.classList.toggle('hidden',currentProfile.plan==='nous');
}

async function loadChats(){
  const{data,error}=await sb.from('chats').select('*').eq('user_id',currentUser.id).order('updated_at',{ascending:false});
  if(error)return;chats=data||[];renderChatHistory();
}

function renderChatHistory(filter=''){
  chatHistory.querySelectorAll('.chat-item,.chat-history-label').forEach(el=>el.remove());
  const filtered=filter?chats.filter(c=>c.title.toLowerCase().includes(filter.toLowerCase())):chats;
  if(!filtered.length){chatHistoryEmpty.classList.remove('hidden');chatHistoryEmpty.textContent=filter?'No chats match your search.':'Start a new chat to begin your Socratic journey.';return;}
  chatHistoryEmpty.classList.add('hidden');
  const label=document.createElement('div');label.className='chat-history-label';label.textContent='Recent';
  chatHistory.insertBefore(label,chatHistoryEmpty);
  filtered.forEach(chat=>{
    const item=document.createElement('div');
    item.className='chat-item'+(currentChat?.id===chat.id?' active':'');
    item.dataset.chatId=chat.id;
    // Three-dot menu button
    item.innerHTML=`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted)"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span class="chat-item-title">${escapeHtml(chat.title)}</span><div class="chat-item-actions"><button class="chat-item-menu-btn" title="More options"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button></div>`;
    // Click on the item (not on the menu button) opens the chat
    item.addEventListener('click',e=>{
      if(e.target.closest('.chat-item-menu-btn')||e.target.closest('.chat-item-dropdown'))return;
      openChat(chat.id);
    });
    // Three-dot menu button opens dropdown
    const menuBtn=item.querySelector('.chat-item-menu-btn');
    menuBtn.addEventListener('click',e=>{
      e.stopPropagation();
      toggleChatDropdown(item,chat.id);
    });
    chatHistory.insertBefore(item,chatHistoryEmpty);
  });
}

function closeChatDropdown(){
  if(openDropdown){
    openDropdown.remove();
    openDropdown=null;
  }
}

function toggleChatDropdown(chatItem,chatId){
  closeChatDropdown();
  const dropdown=document.createElement('div');
  dropdown.className='chat-item-dropdown open';
  dropdown.innerHTML=`<button class="chat-item-dropdown-item rename-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Rename</button><button class="chat-item-dropdown-item danger delete-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>`;
  chatItem.appendChild(dropdown);
  openDropdown=dropdown;

  // Rename handler
  dropdown.querySelector('.rename-btn').addEventListener('click',e=>{
    e.stopPropagation();
    closeChatDropdown();
    startRename(chatId,chatItem);
  });

  // Delete handler
  dropdown.querySelector('.delete-btn').addEventListener('click',e=>{
    e.stopPropagation();
    closeChatDropdown();
    confirmDeleteChat(chatId);
  });
}

function startRename(chatId,chatItem){
  const chat=chats.find(c=>c.id===chatId);
  if(!chat)return;
  const titleEl=chatItem.querySelector('.chat-item-title');
  const originalTitle=chat.title;
  // Replace title with an input
  const input=document.createElement('input');
  input.type='text';
  input.className='chat-item-rename-input';
  input.value=originalTitle;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const finishRename=async()=>{
    const newTitle=input.value.trim()||originalTitle;
    // Restore title element
    const newTitleEl=document.createElement('span');
    newTitleEl.className='chat-item-title';
    newTitleEl.textContent=newTitle;
    input.replaceWith(newTitleEl);
    if(newTitle!==originalTitle){
      await sb.from('chats').update({title:newTitle}).eq('id',chatId);
      chat.title=newTitle;
      if(currentChat?.id===chatId)currentChat.title=newTitle;
    }
  };

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();input.blur();}
    if(e.key==='Escape'){input.value=originalTitle;input.blur();}
  });
  input.addEventListener('blur',finishRename);
}

function confirmDeleteChat(chatId){
  const chat=chats.find(c=>c.id===chatId);
  if(!chat)return;
  // Create confirmation overlay
  const overlay=document.createElement('div');
  overlay.className='confirm-overlay';
  overlay.innerHTML=`<div class="confirm-dialog"><h3>Delete Chat</h3><p>This will permanently delete "<strong>${escapeHtml(chat.title)}</strong>" along with all its messages and workspace document. This action cannot be undone.</p><div class="confirm-dialog-btns"><button class="btn btn-cancel">Cancel</button><button class="btn btn-danger">Delete</button></div></div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('.btn-cancel').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('.btn-danger').addEventListener('click',async()=>{
    overlay.remove();
    await deleteChat(chatId);
  });
  // Close on overlay click (not dialog)
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

async function deleteChat(chatId){
  try{
    // Delete workspace document
    await sb.from('workspace_documents').delete().eq('chat_id',chatId);
    // Delete messages
    await sb.from('messages').delete().eq('chat_id',chatId);
    // Delete chat
    await sb.from('chats').delete().eq('id',chatId);
    // Update local state
    chats=chats.filter(c=>c.id!==chatId);
    if(currentChat?.id===chatId){
      currentChat=null;workspaceDoc=null;
      chatMessages.innerHTML='';
      chatMessages.appendChild(welcomeScreen);
      welcomeScreen.style.display='flex';
      closeWorkspacePanel();
    }
    renderChatHistory(chatSearchInput.value);
    showToast('Chat deleted.');
  }catch(err){
    showToast('Failed to delete chat.',true);
  }
}

async function createNewChat(){
  currentChat=null;workspaceDoc=null;
  chatMessages.innerHTML='';chatMessages.appendChild(welcomeScreen);welcomeScreen.style.display='flex';
  closeWorkspacePanel();
  document.querySelectorAll('.chat-item').forEach(i=>i.classList.remove('active'));
  newChatBtn.classList.add('active');setWelcomeMessage();
}

async function openChat(chatId){
  const chat=chats.find(c=>c.id===chatId);if(!chat)return;
  currentChat=chat;newChatBtn.classList.remove('active');
  document.querySelectorAll('.chat-item').forEach(i=>i.classList.toggle('active',i.dataset.chatId===chatId));
  const{data:messages}=await sb.from('messages').select('*').eq('chat_id',chatId).order('created_at',{ascending:true});
  chatMessages.innerHTML='';
  if(messages?.length){messages.forEach(msg=>renderMessage(msg.role,msg.content));chatMessages.scrollTop=chatMessages.scrollHeight;}
  else{chatMessages.appendChild(welcomeScreen);welcomeScreen.style.display='flex';}
  await loadWorkspaceDocument(chatId);
}

async function sendMessage(content){
  if(!content.trim()||isSending)return;
  isSending=true;sendBtn.disabled=true;composerInput.value='';autoResizeComposer();
  if(!currentChat){
    const title=content.length>50?content.substring(0,50)+'...':content;
    const{data:newChat,error}=await sb.from('chats').insert({user_id:currentUser.id,title}).select().single();
    if(error){showToast('Failed to create chat.',true);isSending=false;sendBtn.disabled=false;return;}
    currentChat=newChat;chats.unshift(currentChat);renderChatHistory();
  }
  if(welcomeScreen.parentNode===chatMessages)chatMessages.removeChild(welcomeScreen);
  renderMessage('user',content);
  await sb.from('messages').insert({chat_id:currentChat.id,role:'user',content});
  await sb.from('chats').update({updated_at:new Date().toISOString()}).eq('id',currentChat.id);
  showLoadingIndicator();
  try{
    const{data:history}=await sb.from('messages').select('role,content').eq('chat_id',currentChat.id).order('created_at',{ascending:true}).limit(20);
    const msgHistory=(history||[]).map(m=>({role:m.role,content:m.content}));
    const response=await aiClient.sendMessage(msgHistory);
    hideLoadingIndicator();
    renderMessage('assistant',response.content);
    await sb.from('messages').insert({chat_id:currentChat.id,role:'assistant',content:response.content,metrics:response.metrics});
    if(response.metrics)await metricsManager.saveMetrics(response.metrics);
    if(chats.find(c=>c.id===currentChat.id)?.title==='New Chat'){
      const title=content.length>50?content.substring(0,50)+'...':content;
      await sb.from('chats').update({title}).eq('id',currentChat.id);
      currentChat.title=title;renderChatHistory();
    }
  }catch(err){hideLoadingIndicator();renderMessage('assistant','I encountered an issue. Please try again.');showToast('Failed to get AI response.',true);}
  isSending=false;sendBtn.disabled=false;chatMessages.scrollTop=chatMessages.scrollHeight;
}
window.sendMessage=sendMessage;

function renderMessage(role,content){
  const msg=document.createElement('div');msg.className=`message ${role}`;
  const roleLabel=role==='user'?'You':'Socra';
  let rendered;
  try{
    const clean=content.replace(/<!--METRICS{[\s\S]*?}-->/g,'').trim();
    let processed=clean;
    processed=processed.replace(/\$\$([^$]+)\$\$/g,(m,f)=>{try{return '<div class="katex-display">'+katex.renderToString(f,{displayMode:true,throwOnError:false})+'</div>';}catch(e){return '<code>'+m+'</code>';}});
    processed=processed.replace(/(?<!\$)\$(?!\$)([^$\n]+)(?<!\$)\$(?!\$)/g,(m,f)=>{try{return katex.renderToString(f,{displayMode:false,throwOnError:false});}catch(e){return '<code>'+m+'</code>';}});
    rendered=marked.parse(processed);
  }catch(e){rendered=escapeHtml(content);}
  msg.innerHTML=`<div class="message-role">${roleLabel}</div><div class="message-bubble">${rendered}</div>`;
  chatMessages.appendChild(msg);chatMessages.scrollTop=chatMessages.scrollHeight;
}

function showLoadingIndicator(){
  const el=document.createElement('div');el.className='ai-loading';el.id='ai-loading';
  el.innerHTML=`<div class="ai-loading-bubble"><div class="ai-loading-dots"><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div><div class="ai-loading-dot"></div></div><div class="ai-loading-text"><span>Socra is thinking...</span></div></div>`;
  chatMessages.appendChild(el);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function hideLoadingIndicator(){const el=$('ai-loading');if(el)el.remove();}

async function createWorkspaceDocument(){
  if(!currentChat){showToast('Start a chat first.',true);return;}
  if(workspaceDoc){openWorkspacePanel();return;}
  const{data,error}=await sb.from('workspace_documents').insert({chat_id:currentChat.id,user_id:currentUser.id,title:'Untitled Document',content:''}).select().single();
  if(error){showToast('Failed to create document.',true);return;}
  workspaceDoc=data;editor.setContent('');workspaceTitle.value=data.title;openWorkspacePanel();
}

async function loadWorkspaceDocument(chatId){
  const{data,error}=await sb.from('workspace_documents').select('*').eq('chat_id',chatId).single();
  if(error||!data){workspaceDoc=null;closeWorkspacePanel();return;}
  workspaceDoc=data;editor.setContent(data.content||'');workspaceTitle.value=data.title||'Untitled Document';openWorkspacePanel();
}

async function saveWorkspaceDocument(content){
  if(!workspaceDoc)return;
  await sb.from('workspace_documents').update({content,updated_at:new Date().toISOString()}).eq('id',workspaceDoc.id);
}

function openWorkspacePanel(){workspacePanel.classList.remove('hidden');reopenWorkspaceBtn.classList.add('hidden');}
function closeWorkspacePanel(){workspacePanel.classList.add('hidden');if(workspaceDoc)reopenWorkspaceBtn.classList.remove('hidden');}

function setupFormatBar(){
  document.querySelectorAll('.format-btn').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.format;if(f)editor.insertFormatting(f);}));
  if(formatHeading)formatHeading.addEventListener('change',()=>{const l=parseInt(formatHeading.value);if(l>0)editor.insertHeading(l);formatHeading.value='';});
}

function setupEvents(){
  sidebarToggle.addEventListener('click',()=>sidebar.classList.toggle('collapsed'));
  // Expanded sidebar: logo creates new chat
  sidebarLogoFull.addEventListener('click',e=>{e.preventDefault();createNewChat();});
  // Collapsed sidebar: small logo expands the sidebar
  sidebarLogoSmall.addEventListener('click',e=>{e.preventDefault();sidebar.classList.remove('collapsed');});
  searchToggle.addEventListener('click',()=>{sidebarSearch.classList.toggle('active');if(sidebarSearch.classList.contains('active'))chatSearchInput.focus();});
  chatSearchInput.addEventListener('input',()=>renderChatHistory(chatSearchInput.value));
  newChatBtn.addEventListener('click',createNewChat);
  sendBtn.addEventListener('click',()=>sendMessage(composerInput.value));
  composerInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(composerInput.value);}});
  composerInput.addEventListener('input',()=>{autoResizeComposer();sendBtn.disabled=!composerInput.value.trim()||isSending;});
  workspaceBtn.addEventListener('click',createWorkspaceDocument);
  closeWorkspace.addEventListener('click',closeWorkspacePanel);
  reopenWorkspaceBtn.addEventListener('click',openWorkspacePanel);
  workspaceTitle.addEventListener('change',async()=>{if(workspaceDoc)await sb.from('workspace_documents').update({title:workspaceTitle.value,updated_at:new Date().toISOString()}).eq('id',workspaceDoc.id);});
  welcomePresets.addEventListener('click',e=>{const p=e.target.closest('.welcome-preset');if(p){composerInput.value=p.dataset.prompt;autoResizeComposer();sendBtn.disabled=false;composerInput.focus();}});
  $('profile-info').addEventListener('click',()=>window.location.href='metrics.html');
  upgradeBtn.addEventListener('click',()=>window.location.href='pricing.html');
  $('logout-btn').addEventListener('click',async()=>{await sb.auth.signOut();window.location.href='auth.html';});
  if(mobileMenuBtn)mobileMenuBtn.addEventListener('click',()=>sidebar.classList.toggle('mobile-open'));
}

function setWelcomeMessage(){
  const n=currentProfile?.name||'';
  const g=[{h:n?`Welcome, ${n}`:'Welcome to Socra',t:'I am your Socratic reasoning partner. I will not give you answers — I will help you find them yourself.'},{h:n?`${n}, let's think together`:"Let's think together",t:'The best way to learn is to reason through problems yourself. I will be your guide.'},{h:'Ready to reason?',t:'True understanding comes from within. Share a problem, a question, or a topic you want to explore.'},{h:n?`Hello, ${n}`:'Hello',t:"Every great thinker started with a question. What's yours?"}];
  const pick=g[Math.floor(Math.random()*g.length)];
  welcomeHeading.textContent=pick.h;welcomeText.textContent=pick.t;
}

function autoResizeComposer(){composerInput.style.height='auto';composerInput.style.height=Math.min(composerInput.scrollHeight,120)+'px';}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function showToast(msg,isErr=false){const t=document.createElement('div');t.className='toast'+(isErr?' error':'');t.textContent=msg;toastContainer.appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(20px)';t.style.transition='all 0.3s';setTimeout(()=>t.remove(),300);},4000);}
function checkMobile(){if(window.innerWidth<=768){mobileMenuBtn.style.display='flex';sidebar.classList.remove('collapsed');sidebar.classList.remove('mobile-open');}else{mobileMenuBtn.style.display='none';sidebar.classList.remove('mobile-open');}}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
