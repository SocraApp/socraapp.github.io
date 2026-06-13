// Socra App - Main Application Controller
(function() {
  'use strict';

  // State
  let currentUser = null;
  let currentProfile = null;
  let currentChat = null;
  let chats = [];
  let editor = null;
  let aiClient = null;
  let metricsManager = null;
  let isSending = false;
  let workspaceDoc = null;

  // DOM References
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const searchToggle = document.getElementById('search-toggle');
  const sidebarSearch = document.getElementById('sidebar-search');
  const chatSearchInput = document.getElementById('chat-search-input');
  const newChatBtn = document.getElementById('new-chat-btn');
  const chatHistory = document.getElementById('chat-history');
  const chatHistoryEmpty = document.getElementById('chat-history-empty');
  const chatMessages = document.getElementById('chat-messages');
  const welcomeScreen = document.getElementById('welcome-screen');
  const welcomeHeading = document.getElementById('welcome-heading');
  const welcomeText = document.getElementById('welcome-text');
  const welcomePresets = document.getElementById('welcome-presets');
  const composerInput = document.getElementById('composer-input');
  const sendBtn = document.getElementById('send-btn');
  const workspaceBtn = document.getElementById('workspace-btn');
  const workspacePanel = document.getElementById('workspace-panel');
  const closeWorkspace = document.getElementById('close-workspace');
  const workspaceTitle = document.getElementById('workspace-title');
  const editorContent = document.getElementById('editor-content');
  const metricsBtn = document.getElementById('metrics-btn');
  const metricsModal = document.getElementById('metrics-modal');
  const metricsClose = document.getElementById('metrics-close');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profilePlan = document.getElementById('profile-plan');
  const upgradeBtn = document.getElementById('upgrade-btn');
  const formatHeading = document.getElementById('format-heading');
  const toastContainer = document.getElementById('toast-container');
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');

  // ===== INITIALIZATION =====
  async function init() {
    if (!sb) {
      console.error('Supabase client not initialized');
      window.location.href = 'auth.html';
      return;
    }

    // Check auth
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      window.location.href = 'auth.html';
      return;
    }

    currentUser = session.user;

    // Load profile
    await loadProfile();

    // Initialize modules
    aiClient = new AIClient(sb);
    metricsManager = new MetricsManager(sb);

    // Initialize markdown editor
    editor = new MarkdownEditor(editorContent, {
      autoSave: (content) => saveWorkspaceDocument(content)
    });

    // Setup event listeners
    setupEventListeners();

    // Setup auth state listener
    sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        window.location.href = 'auth.html';
      }
    });

    // Load chats
    await loadChats();

    // Set welcome message
    setWelcomeMessage();

    // Setup format bar
    setupFormatBar();

    // Check for question block clicks
    setupQuestionBlockClicks();

    // Mobile responsive check
    checkMobile();
    window.addEventListener('resize', checkMobile);
  }

  // ===== PROFILE =====
  async function loadProfile() {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error) {
      console.error('Failed to load profile:', error);
      // Create profile if it doesn't exist
      currentProfile = { name: currentUser.email.split('@')[0], plan: 'doxa' };
    } else {
      currentProfile = data;
    }

    // Update UI
    const name = currentProfile.name || currentUser.email.split('@')[0];
    profileAvatar.textContent = name.charAt(0).toUpperCase();
    profileName.textContent = name;
    profilePlan.textContent = currentProfile.plan.charAt(0).toUpperCase() + currentProfile.plan.slice(1);

    // Upgrade button
    if (currentProfile.plan === 'nous') {
      upgradeBtn.classList.add('hidden');
    } else {
      upgradeBtn.classList.remove('hidden');
    }
  }

  // ===== CHATS =====
  async function loadChats() {
    const { data, error } = await sb
      .from('chats')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to load chats:', error);
      return;
    }

    chats = data || [];
    renderChatHistory();
  }

  function renderChatHistory(filter = '') {
    // Clear existing (except empty message)
    const items = chatHistory.querySelectorAll('.chat-item');
    items.forEach(item => item.remove());

    const label = chatHistory.querySelector('.chat-history-label');
    if (label) label.remove();

    const filtered = filter
      ? chats.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
      : chats;

    if (filtered.length === 0) {
      chatHistoryEmpty.classList.remove('hidden');
      chatHistoryEmpty.textContent = filter
        ? 'No chats match your search.'
        : 'Start a new chat to begin your Socratic journey.';
      return;
    }

    chatHistoryEmpty.classList.add('hidden');

    // Add label
    const labelEl = document.createElement('div');
    labelEl.className = 'chat-history-label';
    labelEl.textContent = 'Recent';
    chatHistory.insertBefore(labelEl, chatHistoryEmpty);

    filtered.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'chat-item' + (currentChat && currentChat.id === chat.id ? ' active' : '');
      item.dataset.chatId = chat.id;

      // Check if chat has workspace document
      const hasDoc = chat.has_workspace;
      item.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--outline-variant)"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span class="chat-item-title">${escapeHtml(chat.title)}</span>
        ${hasDoc ? '<span class="chat-item-doc"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>' : ''}
      `;

      item.addEventListener('click', () => openChat(chat.id));
      chatHistory.insertBefore(item, chatHistoryEmpty);
    });
  }

  async function createNewChat() {
    // Deselect current
    currentChat = null;
    workspaceDoc = null;

    // Reset UI
    chatMessages.innerHTML = '';
    chatMessages.appendChild(welcomeScreen);
    welcomeScreen.style.display = 'flex';
    closeWorkspacePanel();

    // Update sidebar
    document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
    newChatBtn.classList.add('active');

    setWelcomeMessage();
  }

  async function openChat(chatId) {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    currentChat = chat;
    newChatBtn.classList.remove('active');

    // Update sidebar active state
    document.querySelectorAll('.chat-item').forEach(item => {
      item.classList.toggle('active', item.dataset.chatId === chatId);
    });

    // Load messages
    const { data: messages, error } = await sb
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load messages:', error);
      return;
    }

    // Clear and render messages
    chatMessages.innerHTML = '';

    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        renderMessage(msg.role, msg.content, false);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      chatMessages.appendChild(welcomeScreen);
      welcomeScreen.style.display = 'flex';
    }

    // Load workspace document if exists
    await loadWorkspaceDocument(chatId);
  }

  async function sendMessage(content) {
    if (!content.trim() || isSending) return;

    isSending = true;
    sendBtn.disabled = true;
    composerInput.value = '';
    autoResizeComposer();

    // Create chat if needed
    if (!currentChat) {
      const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
      const { data: newChatData, error } = await sb
        .from('chats')
        .insert({
          user_id: currentUser.id,
          title: title
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create chat:', error);
        showToast('Failed to create chat. Please try again.', true);
        isSending = false;
        sendBtn.disabled = false;
        return;
      }

      currentChat = newChatData;
      chats.unshift(currentChat);
      renderChatHistory();
    }

    // Hide welcome screen
    if (welcomeScreen.parentNode === chatMessages) {
      chatMessages.removeChild(welcomeScreen);
    }

    // Render user message
    renderMessage('user', content);

    // Save user message
    await sb.from('messages').insert({
      chat_id: currentChat.id,
      role: 'user',
      content: content
    });

    // Update chat timestamp
    await sb.from('chats')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentChat.id);

    // Show typing indicator
    showTypingIndicator();

    try {
      // Build message history for AI
      const { data: history } = await sb
        .from('messages')
        .select('role, content')
        .eq('chat_id', currentChat.id)
        .order('created_at', { ascending: true })
        .limit(20); // Keep last 20 messages for context

      // Summarize if needed (simple truncation for now)
      const messageHistory = (history || []).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Call AI
      const response = await aiClient.sendMessage(messageHistory);

      hideTypingIndicator();

      // Render AI response
      renderMessage('assistant', response.content);

      // Save AI message with metrics
      await sb.from('messages').insert({
        chat_id: currentChat.id,
        role: 'assistant',
        content: response.content,
        metrics: response.metrics
      });

      // Save metrics
      if (response.metrics) {
        await metricsManager.saveMetrics(response.metrics);
      }

      // Update chat title if first message
      if (chats.find(c => c.id === currentChat.id)?.title === 'New Chat') {
        const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
        await sb.from('chats')
          .update({ title: title })
          .eq('id', currentChat.id);
        currentChat.title = title;
        renderChatHistory();
      }

    } catch (err) {
      hideTypingIndicator();
      renderMessage('assistant', 'I encountered an issue processing your message. Please try again.');
      console.error('AI error:', err);
      showToast('Failed to get AI response. Please check your connection.', true);
    }

    isSending = false;
    sendBtn.disabled = false;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ===== MESSAGE RENDERING =====
  function renderMessage(role, content, animate = true) {
    const msgEl = document.createElement('div');
    msgEl.className = 'message' + (animate ? '' : '');

    const iconClass = role === 'user' ? 'user-icon' : 'ai-icon';
    const iconContent = role === 'user' ? (currentProfile?.name || 'U').charAt(0).toUpperCase() : 'S';
    const roleLabel = role === 'user' ? 'You' : 'Socra';

    // Parse markdown for display
    let renderedContent;
    try {
      // Remove metrics blocks before rendering
      const cleanContent = content.replace(/<!--METRICS{[\s\S]*?}-->/g, '').trim();
      renderedContent = marked.parse(cleanContent);
    } catch (e) {
      renderedContent = escapeHtml(content);
    }

    msgEl.innerHTML = `
      <div class="message-role">
        <span class="role-icon ${iconClass}">${iconContent}</span>
        ${roleLabel}
      </div>
      <div class="message-content">${renderedContent}</div>
    `;

    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Render LaTeX in message
    msgEl.querySelectorAll('.message-content code').forEach(el => {
      // KaTeX is handled by marked output already
    });
  }

  function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  // ===== WORKSPACE =====
  async function createWorkspaceDocument() {
    if (!currentChat) {
      showToast('Start a chat first before creating a workspace document.', true);
      return;
    }

    // Check if document already exists
    if (workspaceDoc) {
      // Just show the panel
      openWorkspacePanel();
      return;
    }

    // Create workspace document
    const { data, error } = await sb
      .from('workspace_documents')
      .insert({
        chat_id: currentChat.id,
        user_id: currentUser.id,
        title: 'Untitled Document',
        content: ''
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create workspace document:', error);
      showToast('Failed to create workspace document.', true);
      return;
    }

    workspaceDoc = data;
    editor.setContent('');
    workspaceTitle.value = data.title;
    openWorkspacePanel();
  }

  async function loadWorkspaceDocument(chatId) {
    const { data, error } = await sb
      .from('workspace_documents')
      .select('*')
      .eq('chat_id', chatId)
      .single();

    if (error || !data) {
      workspaceDoc = null;
      closeWorkspacePanel();
      return;
    }

    workspaceDoc = data;
    editor.setContent(data.content || '');
    workspaceTitle.value = data.title || 'Untitled Document';
    openWorkspacePanel();
  }

  async function saveWorkspaceDocument(content) {
    if (!workspaceDoc) return;

    const { error } = await sb
      .from('workspace_documents')
      .update({
        content: content,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceDoc.id);

    if (error) {
      console.error('Failed to save workspace document:', error);
    }
  }

  function openWorkspacePanel() {
    workspacePanel.classList.remove('hidden');
  }

  function closeWorkspacePanel() {
    workspacePanel.classList.add('hidden');
    workspaceDoc = null;
  }

  // ===== FORMAT BAR =====
  function setupFormatBar() {
    // Format buttons
    document.querySelectorAll('.format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.format;
        if (format) {
          editor.insertFormatting(format);
        }
      });
    });

    // Heading select
    if (formatHeading) {
      formatHeading.addEventListener('change', () => {
        const level = parseInt(formatHeading.value);
        if (level > 0) {
          editor.insertHeading(level);
        }
        formatHeading.value = '';
      });
    }
  }

  // ===== QUESTION BLOCKS =====
  function setupQuestionBlockClicks() {
    document.addEventListener('click', async (e) => {
      const questionBlock = e.target.closest('.question-block');
      if (questionBlock) {
        const text = questionBlock.textContent.trim();
        if (text) {
          await sendMessage(text);
        }
      }
    });
  }

  // ===== SIDEBAR =====
  function setupEventListeners() {
    // Sidebar toggle
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    // Search toggle
    searchToggle.addEventListener('click', () => {
      sidebarSearch.classList.toggle('active');
      if (sidebarSearch.classList.contains('active')) {
        chatSearchInput.focus();
      }
    });

    // Search input
    chatSearchInput.addEventListener('input', () => {
      renderChatHistory(chatSearchInput.value);
    });

    // New chat
    newChatBtn.addEventListener('click', createNewChat);

    // Send message
    sendBtn.addEventListener('click', () => {
      sendMessage(composerInput.value);
    });

    // Enter to send (Shift+Enter for newline)
    composerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(composerInput.value);
      }
    });

    // Auto-resize composer
    composerInput.addEventListener('input', autoResizeComposer);

    // Enable/disable send button
    composerInput.addEventListener('input', () => {
      sendBtn.disabled = !composerInput.value.trim() || isSending;
    });

    // Workspace button
    workspaceBtn.addEventListener('click', createWorkspaceDocument);

    // Close workspace
    closeWorkspace.addEventListener('click', () => {
      closeWorkspacePanel();
    });

    // Workspace title change
    workspaceTitle.addEventListener('change', async () => {
      if (workspaceDoc) {
        await sb.from('workspace_documents')
          .update({ title: workspaceTitle.value, updated_at: new Date().toISOString() })
          .eq('id', workspaceDoc.id);
      }
    });

    // Welcome presets
    welcomePresets.addEventListener('click', (e) => {
      const preset = e.target.closest('.welcome-preset');
      if (preset) {
        composerInput.value = preset.dataset.prompt;
        autoResizeComposer();
        sendBtn.disabled = false;
        composerInput.focus();
      }
    });

    // Metrics modal
    metricsBtn.addEventListener('click', () => {
      metricsModal.classList.add('active');
      metricsManager.renderMetrics();
    });

    metricsClose.addEventListener('click', () => {
      metricsModal.classList.remove('active');
    });

    metricsModal.addEventListener('click', (e) => {
      if (e.target === metricsModal) {
        metricsModal.classList.remove('active');
      }
    });

    // Profile click opens metrics
    document.getElementById('profile-info').addEventListener('click', () => {
      metricsModal.classList.add('active');
      metricsManager.renderMetrics();
    });

    // Upgrade button
    upgradeBtn.addEventListener('click', () => {
      window.location.href = 'pricing.html';
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await sb.auth.signOut();
      window.location.href = 'auth.html';
    });

    // Mobile menu
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }
  }

  // ===== WELCOME MESSAGE =====
  function setWelcomeMessage() {
    const name = currentProfile?.name || '';
    const greetings = [
      {
        heading: name ? `Welcome, ${name}` : 'Welcome to Socra',
        text: 'I am your Socratic reasoning partner. I will not give you answers — I will help you find them yourself. What would you like to explore today?'
      },
      {
        heading: name ? `${name}, let's think together` : 'Let\'s think together',
        text: 'The best way to learn is to reason through problems yourself. I will be your guide, asking questions that lead you to understanding. What\'s on your mind?'
      },
      {
        heading: 'Ready to reason?',
        text: 'True understanding comes from within. Share a problem, a question, or a topic you want to explore — and I will help you think it through, step by step.'
      },
      {
        heading: name ? `Hello, ${name}` : 'Hello',
        text: 'Every great thinker started with a question. What\'s yours? I am here to guide your reasoning, not replace it.'
      }
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    welcomeHeading.textContent = greeting.heading;
    welcomeText.textContent = greeting.text;
  }

  // ===== UTILITIES =====
  function autoResizeComposer() {
    composerInput.style.height = 'auto';
    composerInput.style.height = Math.min(composerInput.scrollHeight, 120) + 'px';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function checkMobile() {
    if (window.innerWidth <= 768) {
      mobileMenuBtn.style.display = 'flex';
      sidebar.classList.remove('collapsed');
      sidebar.classList.remove('mobile-open');
    } else {
      mobileMenuBtn.style.display = 'none';
      sidebar.classList.remove('mobile-open');
    }
  }

  // ===== START =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
