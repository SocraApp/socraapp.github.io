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
const welcomeComposerInput=$('welcome-composer-input'),welcomeSendBtn=$('welcome-send-btn');
const chatPanel=$('chat-panel');
const workspaceBtn=$('workspace-btn'),workspacePanel=$('workspace-panel'),closeWorkspace=$('close-workspace');
const workspaceTitle=$('workspace-title'),profileAvatar=$('profile-avatar'),profileName=$('profile-name');
const profilePlan=$('profile-plan'),upgradeBtn=$('upgrade-btn'),formatHeading=$('format-heading');
const toastContainer=$('toast-container'),mobileMenuBtn=$('mobile-menu-btn');
const reopenWorkspaceBtn=$('reopen-workspace-btn'),sidebarLogoFull=$('sidebar-logo-full'),sidebarLogoSmall=$('sidebar-logo-small');
const settingsBtn=null,settingsPanel=$('settings-panel'),settingsOverlay=$('settings-overlay');
const settingsClose=$('settings-close'),darkModeToggle=$('dark-mode-toggle');

// Configure marked to treat single newlines as <br>
if(typeof marked!=='undefined'){
  marked.setOptions({breaks:true,gfm:true});
}

// Post-process rendered HTML to enable code-block syntax highlighting + language label.
// We do this on the rendered DOM (rather than via marked's highlight option) so that
// we can also inject the language label and reuse the same logic for streamed messages.
function enhanceCodeBlocks(container){
  if(!container)return;
  // marked outputs <pre><code class="language-python">...</code></pre>
  container.querySelectorAll('pre code').forEach(code=>{
    if(code.dataset.hljsEnhanced)return;
    code.dataset.hljsEnhanced='1';
    // Detect language from the class attribute (marked adds language-XXX)
    let lang='';
    code.classList.forEach(c=>{
      const m=c.match(/^language-(.+)$/);
      if(m)lang=m[1];
    });
    // If no class hint, ask hljs to auto-detect
    try{
      if(window.hljs){
        if(lang&&hljs.getLanguage(lang)){
          const r=hljs.highlight(code.textContent,{language:lang,ignoreIllegals:true});
          code.innerHTML=r.value;
          code.classList.add('hljs');
          if(r.language)lang=r.language;
        }else{
          const r=hljs.highlightAuto(code.textContent);
          code.innerHTML=r.value;
          code.classList.add('hljs');
          if(r.language)lang=r.language;
        }
      }
    }catch(e){/* leave code as-is on error */}
    // Add a faint language label to the right of the code block
    if(lang){
      const pre=code.parentElement;
      if(pre&&!pre.querySelector('.code-lang-label')){
        const label=document.createElement('span');
        label.className='code-lang-label';
        label.textContent=lang;
        pre.appendChild(label);
        pre.classList.add('has-lang-label');
      }
    }
  });
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
  setupSettingsEvents();
  sb.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT')window.location.href='auth.html';});
  await loadChats();
  setWelcomeMessage();
  setWelcomeMode(true);
  setupFormatBar();
  // Ensure textareas have correct initial height (prevents the empty-state scrollbar glitch)
  autoResizeComposer();
  checkMobile();
  window.addEventListener('resize',()=>{checkMobile();autoResizeComposer();});
  // Close dropdown when clicking outside
  document.addEventListener('click',e=>{
    if(openDropdown&&!openDropdown.contains(e.target)&&!e.target.closest('.chat-item-menu-btn')){
      closeChatDropdown();
    }
  });
  // Handle browser back/forward for chat URLs
  window.addEventListener('popstate',()=>{
    const chatId=getChatIdFromUrl();
    if(chatId)openChat(chatId,true);
    else{currentChat=null;workspaceDoc=null;chatMessages.innerHTML='';chatMessages.appendChild(welcomeScreen);welcomeScreen.style.display='flex';setWelcomeMessage();setWelcomeMode(true);closeWorkspacePanel();document.querySelectorAll('.chat-item').forEach(i=>i.classList.remove('active'));newChatBtn.classList.add('active');}
  });
  // Auto-open chat if URL has a chat ID (either from direct /chat/UUID or 404 redirect)
  let urlChatId=getChatIdFromUrl();
  // Check for redirect from 404.html (GitHub Pages SPA routing)
  const redirectPath=sessionStorage.getItem('socra_redirect');
  if(redirectPath){
    sessionStorage.removeItem('socra_redirect');
    const redirectMatch=redirectPath.match(/\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if(redirectMatch){
      urlChatId=redirectMatch[1];
      // Restore the clean URL
      history.replaceState({chatId:urlChatId},'',redirectPath);
    }
  }
  if(urlChatId){
    // Ensure chat is in our list (might need refresh), then open
    const exists=chats.find(c=>c.id===urlChatId);
    if(exists)await openChat(urlChatId,true);
    else{await loadChats();const c2=chats.find(c=>c.id===urlChatId);if(c2)await openChat(urlChatId,true);}
  }
}

// Extract chat UUID from URL: /chat/UUID or ?chat=UUID
function getChatIdFromUrl(){
  const path=window.location.pathname;
  const pathMatch=path.match(/\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  if(pathMatch)return pathMatch[1];
  const params=new URLSearchParams(window.location.search);
  return params.get('chat')||null;
}

// Update URL to reflect current chat (or clear it)
function updateUrl(chatId){
  if(chatId){
    const base=window.location.pathname.replace(/\/chat\/.*$/,'').replace(/\/app\.html.*$/,'');
    const newPath='/chat/'+chatId;
    history.pushState({chatId},'',newPath);
  }else{
    history.pushState({},'',window.location.pathname.replace(/\/chat\/.*$/,'')+'/app.html');
  }
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
  // Load and apply dark mode preference
  if(currentProfile.dark_mode){
    applyDarkMode(currentProfile.dark_mode);
    if(darkModeToggle)darkModeToggle.checked=currentProfile.dark_mode;
  }
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
    // Delete cognitive metrics for this chat
    await sb.from('cognitive_metrics').delete().eq('chat_id',chatId);
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
      setWelcomeMessage();setWelcomeMode(true);
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
  newChatBtn.classList.add('active');setWelcomeMessage();setWelcomeMode(true);
  // Only update URL if currently on a /chat/UUID path
  if(window.location.pathname.match(/\/chat\//)){
    history.pushState({},'','/app.html');
  }
}

async function openChat(chatId,skipPush){
  const chat=chats.find(c=>c.id===chatId);if(!chat)return;
  currentChat=chat;newChatBtn.classList.remove('active');
  document.querySelectorAll('.chat-item').forEach(i=>i.classList.toggle('active',i.dataset.chatId===chatId));
  if(!skipPush)history.pushState({chatId},'',window.location.pathname.replace(/\/chat\/.*$/,'').replace(/\/app\.html.*$/,'')+'/chat/'+chatId);
  const{data:messages}=await sb.from('messages').select('*').eq('chat_id',chatId).order('created_at',{ascending:true});
  chatMessages.innerHTML='';
  if(messages?.length){messages.forEach(msg=>renderMessage(msg.role,msg.content));chatMessages.scrollTop=chatMessages.scrollHeight;setWelcomeMode(false);}
  else{chatMessages.appendChild(welcomeScreen);welcomeScreen.style.display='flex';setWelcomeMessage();setWelcomeMode(true);}
  await loadWorkspaceDocument(chatId);
}

async function sendMessage(content){
  if(!content.trim()||isSending)return;
  isSending=true;sendBtn.disabled=true;composerInput.value='';
  if(welcomeComposerInput)welcomeComposerInput.value='';
  if(welcomeSendBtn)welcomeSendBtn.disabled=true;
  autoResizeComposer();
  if(!currentChat){
    const{data:newChat,error}=await sb.from('chats').insert({user_id:currentUser.id,title:'New Conversation'}).select().single();
    if(error){showToast('Failed to create chat.',true);isSending=false;sendBtn.disabled=false;return;}
    currentChat=newChat;chats.unshift(currentChat);renderChatHistory();
    history.pushState({chatId:currentChat.id},'',window.location.pathname.replace(/\/chat\/.*$/,'').replace(/\/app\.html.*$/,'')+'/chat/'+currentChat.id);
  }
  if(welcomeScreen.parentNode===chatMessages)chatMessages.removeChild(welcomeScreen);
  setWelcomeMode(false); // Switch to full-width bottom composer now that the conversation has started
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
    if(response.metrics)await metricsManager.saveMetrics(response.metrics,currentChat.id);
    // Update title from AI response
    const newTitle=response.title||null;
    if(newTitle&&currentChat.title==='New Conversation'){
      await sb.from('chats').update({title:newTitle}).eq('id',currentChat.id);
      currentChat.title=newTitle;renderChatHistory();
    }
  }catch(err){hideLoadingIndicator();renderMessage('assistant','I encountered an issue. Please try again.');showToast('Failed to get AI response.',true);}
  isSending=false;sendBtn.disabled=false;chatMessages.scrollTop=chatMessages.scrollHeight;
}
window.sendMessage=sendMessage;

function renderMessage(role,content){
  const msg=document.createElement('div');msg.className=`message ${role}`;
  const roleLabel=role==='user'?'You':'Socra';
  const rawMarkdown=content.replace(/<!--METRICS{[\s\S]*?}-->/g,'').replace(/<!--TITLE:.+?-->/g,'').trim();
  let rendered;
  try{
    let processed=rawMarkdown;
    // Strip intervention-type labels from raw markdown BEFORE rendering.
    const interventionTypes='Clarifying Question|Recall Prompt|Assumption Challenge|Counterexample|Hint|Reflection Prompt|Step Verification|Analogy|Error Identification';
    // Line-level: matches labels on their own line (## Heading, **Bold Label**, plain text)
    const intvLineRe=new RegExp('^[ \\t]*(#{1,6}[ \\t]*)?(\\*{1,2}|_{1,2})?[ \\t]*('+interventionTypes+')[ \\t]*(\\2)?[ \\t]*$','gim');
    processed=processed.replace(intvLineRe,'');
    // Inline: matches labels embedded in text like ...text.**Reflection Prompt**
    const intvInlineRe=new RegExp('[ \\t]*(\\*{1,2}|_{1,2})('+interventionTypes+')\\1[ \\t]*','gi');
    processed=processed.replace(intvInlineRe,' ');
    // Step 1: Convert \[...\] display math to $$...$$ for consistent handling
    processed=processed.replace(/\\\[([\s\S]+?)\\\]/g,(m,f)=>'$$'+f+'$$');
    // Step 2: Convert \(...\) inline math to $...$ for consistent handling
    processed=processed.replace(/\\\(([\s\S]+?)\\\)/g,(m,f)=>'$'+f+'$');
    // Step 3: Render display math $$...$$ (including multiline)
    processed=processed.replace(/\$\$([\s\S]+?)\$\$/g,(m,f)=>{try{return '<div class="katex-display">'+katex.renderToString(f.trim(),{displayMode:true,throwOnError:false})+'</div>';}catch(e){return '<code>'+escapeHtml(m)+'</code>';}});
    // Step 4: Render inline math $...$ — opening $ must NOT be followed by space,
    // closing $ must NOT be preceded by space. This prevents matching currency like $2 or $1.50.
    processed=processed.replace(/(?<!\$)\$(?!\s)(?!\$)([\s\S]+?)(?<!\s)(?<!\$)\$(?!\$)/g,(m,f)=>{try{return katex.renderToString(f.trim(),{displayMode:false,throwOnError:false});}catch(e){return '<code>'+escapeHtml(m)+'</code>';}});
    // Step 5: Markdown via marked.parse()
    rendered=marked.parse(processed);
  }catch(e){rendered=escapeHtml(rawMarkdown);}
  const copyIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  const copyCls=role==='user'?'msg-copy-btn hover-reveal':'msg-copy-btn always-show';
  msg.innerHTML=`<div class="message-role">${roleLabel}</div><div class="message-bubble">${rendered}</div><button class="${copyCls}" title="Copy">${copyIcon}</button>`;
  // DOM-level safety net: remove any element whose text content is solely an intervention label
  const bubble=msg.querySelector('.message-bubble');
  if(bubble){
    const intvLabels=/^(Clarifying Question|Recall Prompt|Assumption Challenge|Counterexample|Hint|Reflection Prompt|Step Verification|Analogy|Error Identification)$/i;
    bubble.querySelectorAll('h1,h2,h3,h4,h5,h6,p').forEach(el=>{
      if(intvLabels.test(el.textContent.trim()))el.remove();
    });
    // Apply syntax highlighting + language label to code blocks
    enhanceCodeBlocks(bubble);
  }
  const copyBtn=msg.querySelector('.msg-copy-btn');
  if(copyBtn){
    const checkIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    copyBtn.addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(rawMarkdown);}catch(e){const ta=document.createElement('textarea');ta.value=rawMarkdown;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
      copyBtn.innerHTML=checkIcon;copyBtn.classList.add('copied');
      setTimeout(()=>{copyBtn.innerHTML=copyIcon;copyBtn.classList.remove('copied');},2000);
    });
  }
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

function openWorkspacePanel(){workspacePanel.classList.remove('hidden');reopenWorkspaceBtn.classList.add('hidden');// Reflow composer height since the chat panel just got narrower
  requestAnimationFrame(autoResizeComposer);}
function closeWorkspacePanel(){workspacePanel.classList.add('hidden');if(workspaceDoc)reopenWorkspaceBtn.classList.remove('hidden');// Reflow composer height since the chat panel just got wider
  requestAnimationFrame(autoResizeComposer);}

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
  searchToggle.addEventListener('click',()=>{
    const willOpen=!sidebarSearch.classList.contains('active');
    sidebarSearch.classList.toggle('active');
    if(willOpen){
      chatSearchInput.focus();
    }else{
      // Closing the search bar: clear the query and show all chats again
      chatSearchInput.value='';
      renderChatHistory('');
    }
  });
  chatSearchInput.addEventListener('input',()=>renderChatHistory(chatSearchInput.value));
  newChatBtn.addEventListener('click',createNewChat);
  sendBtn.addEventListener('click',()=>sendMessage(composerInput.value));
  composerInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(composerInput.value);}});
  composerInput.addEventListener('input',()=>{autoResizeComposer();sendBtn.disabled=!composerInput.value.trim()||isSending;});
  // Welcome composer — same behavior, sends first message and switches to chat layout
  if(welcomeSendBtn)welcomeSendBtn.addEventListener('click',()=>sendMessage(welcomeComposerInput.value));
  if(welcomeComposerInput){
    welcomeComposerInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(welcomeComposerInput.value);}});
    welcomeComposerInput.addEventListener('input',()=>{autoResizeComposer();if(welcomeSendBtn)welcomeSendBtn.disabled=!welcomeComposerInput.value.trim()||isSending;});
  }
  workspaceBtn.addEventListener('click',createWorkspaceDocument);
  closeWorkspace.addEventListener('click',closeWorkspacePanel);
  reopenWorkspaceBtn.addEventListener('click',openWorkspacePanel);
  workspaceTitle.addEventListener('change',async()=>{if(workspaceDoc)await sb.from('workspace_documents').update({title:workspaceTitle.value,updated_at:new Date().toISOString()}).eq('id',workspaceDoc.id);});
  // Welcome presets have been removed from the UI; keep this listener defensive in case the element reappears.
  if(welcomePresets)welcomePresets.addEventListener('click',e=>{const p=e.target.closest('.welcome-preset');if(p){
    const target=welcomeComposerInput&&chatPanel.classList.contains('welcome-active')?welcomeComposerInput:composerInput;
    target.value=p.dataset.prompt;autoResizeComposer();
    if(target===welcomeComposerInput){if(welcomeSendBtn)welcomeSendBtn.disabled=false;}else{sendBtn.disabled=false;}
    target.focus();
  }});
  $('profile-info').addEventListener('click',()=>{openSettings();});
  upgradeBtn.addEventListener('click',()=>window.location.href='/pricing.html');
  $('logout-btn').addEventListener('click',async()=>{await sb.auth.signOut();window.location.href='/auth.html';});
  if(mobileMenuBtn)mobileMenuBtn.addEventListener('click',()=>sidebar.classList.toggle('mobile-open'));
  // Model selectors — main composer + welcome composer. Both share state via setSelectedModel().
  const selectors=[
    {btn:$('model-selector-btn'),dropdown:$('model-selector-dropdown'),label:$('model-selector-label')},
    {btn:$('welcome-model-selector-btn'),dropdown:$('welcome-model-selector-dropdown'),label:$('welcome-model-selector-label')}
  ].filter(s=>s.btn&&s.dropdown);
  // Track the currently selected model + dot class so both selectors stay in sync.
  let currentModel='doxa';
  let currentDotClass='low';
  function setSelectedModel(model,dotClass,label){
    currentModel=model;currentDotClass=dotClass;
    selectors.forEach(({btn,dropdown,label:labelEl})=>{
      if(labelEl)labelEl.textContent=label;
      const dot=btn.querySelector('.model-selector-dot');
      if(dot){dot.className='model-selector-dot '+dotClass;}
      dropdown.querySelectorAll('.model-option').forEach(o=>{
        const isActive=o.dataset.model===model;
        o.classList.toggle('active',isActive);
      });
      dropdown.classList.remove('open');
    });
  }
  selectors.forEach(({btn,dropdown})=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      // Close any other open dropdowns first
      selectors.forEach(s=>{if(s.dropdown!==dropdown)s.dropdown.classList.remove('open');});
      dropdown.classList.toggle('open');
    });
    dropdown.querySelectorAll('.model-option').forEach(opt=>{
      opt.addEventListener('click',()=>{
        const model=opt.dataset.model;
        if(opt.classList.contains('locked')){
          dropdown.classList.remove('open');
          window.location.href='pricing.html';
          return;
        }
        const dotClass=[...opt.querySelector('.model-option-dot').classList].find(c=>['low','med','high'].includes(c))||'low';
        const label=opt.querySelector('strong').textContent;
        setSelectedModel(model,dotClass,label);
      });
    });
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.model-selector'))selectors.forEach(s=>s.dropdown.classList.remove('open'));
  });
  // Initialize both selectors with the default model
  setSelectedModel(currentModel,currentDotClass,'Doxa');
}

function setWelcomeMessage(){
  // The wordmark is now a text-logo image (welcome-heading <img>) and the
  // subtitle is hidden, so there's nothing dynamic to set. Kept as a no-op
  // for back-compat with call sites that still invoke it.
}

// Toggle between welcome layout (centered wordmark + compact composer) and chat layout (full-width bottom composer)
function setWelcomeMode(active){
  if(!chatPanel)return;
  if(active){
    chatPanel.classList.add('welcome-active');
    // Auto-focus the welcome composer for quick start
    if(welcomeComposerInput)setTimeout(()=>welcomeComposerInput.focus(),50);
  }else{
    chatPanel.classList.remove('welcome-active');
  }
}

function autoResizeComposer(){
  const resize=el=>{
    if(!el)return;
    // Reset height so scrollHeight reflects the natural content height
    el.style.height='auto';
    // Clamp to [24, 120]. 24px content + 8px padding = 32px, matching the
    // send button height so they sit inline on a single empty line.
    const sh=Math.max(el.scrollHeight,24),max=120;
    if(sh>max){
      el.style.height=max+'px';
      el.style.overflowY='auto';
    }else{
      el.style.height=sh+'px';
      el.style.overflowY='hidden';
    }
  };
  resize(composerInput);
  resize(welcomeComposerInput);
}
function escapeHtml(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function showToast(msg,isErr=false){const t=document.createElement('div');t.className='toast'+(isErr?' error':'');t.textContent=msg;toastContainer.appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(20px)';t.style.transition='all 0.3s';setTimeout(()=>t.remove(),300);},4000);}
function checkMobile(){if(window.innerWidth<=768){mobileMenuBtn.style.display='flex';sidebar.classList.remove('collapsed');sidebar.classList.remove('mobile-open');}else{mobileMenuBtn.style.display='none';sidebar.classList.remove('mobile-open');}}

// Settings Panel Functions
function openSettings(){if(settingsPanel){settingsPanel.classList.add('open');settingsOverlay.classList.add('open');document.body.style.overflow='hidden';}}
function closeSettings(){if(settingsPanel){settingsPanel.classList.remove('open');settingsOverlay.classList.remove('open');document.body.style.overflow='';}}
function applyDarkMode(enabled){
  document.documentElement.setAttribute('data-theme',enabled?'dark':'light');
  // Toggle highlight.js theme stylesheet to match
  const light=document.getElementById('hljs-light'),dark=document.getElementById('hljs-dark');
  if(light&&dark){
    light.disabled=enabled;
    dark.disabled=!enabled;
  }
}
async function toggleDarkMode(enabled){applyDarkMode(enabled);if(currentUser&&sb){try{await sb.from('profiles').update({dark_mode:enabled}).eq('id',currentUser.id);if(currentProfile)currentProfile.dark_mode=enabled;}catch(e){console.error('Failed to save dark mode preference:',e);}}}
function setupSettingsEvents(){
  if(settingsBtn)settingsBtn.addEventListener('click',e=>{e.stopPropagation();openSettings();});
  if(settingsClose)settingsClose.addEventListener('click',closeSettings);
  if(settingsOverlay)settingsOverlay.addEventListener('click',closeSettings);
  if(darkModeToggle)darkModeToggle.addEventListener('change',e=>toggleDarkMode(e.target.checked));
  const viewProfile=$('settings-view-profile');
  if(viewProfile)viewProfile.addEventListener('click',()=>{closeSettings();window.location.href='/metrics.html';});
  const upgrade=$('settings-upgrade');
  if(upgrade)upgrade.addEventListener('click',()=>{closeSettings();window.location.href='/pricing.html';});
  // ESC key to close
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settingsPanel?.classList.contains('open'))closeSettings();});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
