// LocalCache - Local cache manager
class LocalCache {
    constructor(ttlMinutes = 5) {
        this.ttl = ttlMinutes * 60 * 1000; // Convert to milliseconds
        this.prefix = 'studyforge_cache_';
    }

    // Generate cache key
    _makeKey(key) {
        return `${this.prefix}${key}`;
    }

    // Get cache
    get(key) {
        try {
            const fullKey = this._makeKey(key);
            const item = localStorage.getItem(fullKey);
            if (!item) return null;

            const data = JSON.parse(item);

            // Check if expired
            if (Date.now() > data.expiresAt) {
                localStorage.removeItem(fullKey);
                return null;
            }

            return data.value;
        } catch (e) {
            console.warn('Cache get error:', e);
            return null;
        }
    }

    // Set cache
    set(key, value, customTTL = null) {
        try {
            const fullKey = this._makeKey(key);
            const ttl = customTTL || this.ttl;
            const data = {
                value,
                expiresAt: Date.now() + ttl
            };
            localStorage.setItem(fullKey, JSON.stringify(data));
        } catch (e) {
            console.warn('Cache set error:', e);
        }
    }

    // Delete cache
    delete(key) {
        try {
            const fullKey = this._makeKey(key);
            localStorage.removeItem(fullKey);
        } catch (e) {
            console.warn('Cache delete error:', e);
        }
    }

    // Delete cache by prefix
    deletePattern(pattern) {
        try {
            const prefix = this._makeKey(pattern);
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Cache deletePattern error:', e);
        }
    }

    // Clear all caches
    clear() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Cache clear error:', e);
        }
    }

    // Cleanup expired caches
    cleanup() {
        try {
            const now = Date.now();
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => {
                try {
                    const item = localStorage.getItem(key);
                    if (item) {
                        const data = JSON.parse(item);
                        if (now > data.expiresAt) {
                            localStorage.removeItem(key);
                        }
                    }
                } catch (e) {
                    // Ignore parse errors, delete invalid entries
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Cache cleanup error:', e);
        }
    }
}

class OpenNotebook {
    constructor() {
        this.notebooks = [];
        this.currentNotebook = null;
        this.apiBase = '/api';
        this.currentChatSession = null;
        this.chatSessions = []; // Store sessions list
        this.currentPublicToken = null;

        // Auth state
        this.token = localStorage.getItem('token');
        this.currentUser = null;

        // Sync token from localStorage to cookie for image loading
        if (this.token) {
            document.cookie = `token=${this.token}; path=/; SameSite=Lax`;
        }

        // Initialize local cache (5 min TTL)
        this.cache = new LocalCache(5);

        // Resource Tab Manager
        this.resourceTabManager = new ResourceTabManager(this);

        // Textbook support
        this.currentTextbook = null;
        this.textbookCheckInterval = null;

        // Infograph styles
        this.infographStyles = [];
        this.selectedInfographStyle = null; // null means default
        this.infographStylesLoaded = false;

        // Note type name mapping
        this.noteTypeNameMap = {
            summary: 'Summary',
            faq: 'FAQ',
            study_guide: 'Study Guide',
            outline: 'Outline',
            podcast: 'Podcast',
            timeline: 'Timeline',
            glossary: 'Glossary',
            quiz: 'Quiz',
            mindmap: 'Mindmap',
            infograph: 'Infographic',
            ppt: 'Slides',
            insight: 'Insight Report',
            data_table: 'Data Table',
            data_chart: 'Data Chart',
            exam_notes: 'Exam Notes'
        };

        // Prompt scenarios data - predefined prompt scenarios
        this.promptScenarios = [
            { icon: 'search', display_text: 'Summarize key points', prompt: 'Summarize the core points of this article' },
            { icon: 'question', display_text: 'List 3 key questions', prompt: 'List 3 key questions about this article' },
            { icon: 'lightbulb', display_text: 'Explain concepts', prompt: 'Explain the important concepts in this text' },
            { icon: 'compare', display_text: 'Compare viewpoints', prompt: 'Compare the different viewpoints in this text' },
            { icon: 'action', display_text: 'Actionable advice', prompt: 'Give specific actionable advice' },
            { icon: 'detail', display_text: 'Deep analysis', prompt: 'Deeply analyze a specific part' },
            { icon: 'example', display_text: 'More examples', prompt: 'Provide more related examples' },
            { icon: 'simplify', display_text: 'Simplify concepts', prompt: 'Explain complex concepts in simple terms' },
            { icon: 'extend', display_text: 'Extend topic', prompt: 'Extend this topic further' },
            { icon: 'creative', display_text: 'Different perspectives', prompt: 'Think about this from different perspectives' },
            { icon: 'expert', display_text: 'Expert Synthesizer', prompt: 'You are a [field] expert with 15 years of experience. Analyze these materials and identify 3 core insights that practitioners would immediately recognize as breakthroughs. For each insight, explain why it matters and what conventional wisdom it challenges.' },
            { icon: 'conflict', display_text: 'Contradiction Hunter', prompt: 'Compare these sources and identify all points where they contradict each other. For each contradiction, explain which source has stronger evidence and why. If both are credible, explain factors that might account for the disagreement.' },
            { icon: 'blueprint', display_text: 'Implementation Blueprint', prompt: 'Extract all actionable steps, tools, frameworks, and techniques mentioned across all sources. Organize them into a step-by-step implementation plan with prerequisites, expected outcomes, and potential pitfalls for each step.' },
            { icon: 'generate', display_text: 'Question Generator', prompt: 'Based on these sources, generate 15 questions an expert would ask but the sources don\'t answer. Prioritize questions that would advance the field or reveal critical gaps in current understanding.' },
            { icon: 'assumption', display_text: 'Assumption Digger', prompt: 'Identify every unstated assumption in each of these sources. For each assumption, rate its importance (1-10) and the probability it could be wrong. Explain how things would change if the assumption were false.' },
            { icon: 'framework', display_text: 'Framework Builder', prompt: 'Create a comprehensive framework integrating all concepts from these sources. Include: key components, relationships between components, a decision tree for application, and edge cases where the framework breaks down.' },
            { icon: 'evidence', display_text: 'Evidence Mapper', prompt: 'For each major claim in these sources, extract the supporting evidence and rate its strength (anecdotal, correlational, experimental, meta-analytic). Flag claims stated with high confidence but backed by weak evidence.' },
            { icon: 'users', display_text: 'Stakeholder Translator', prompt: 'Translate the insights from these sources for three different audiences: [executives, engineers, end users]. For each audience, focus on what they specifically care about and use language they\'d immediately understand.' },
            { icon: 'timeline', display_text: 'Timeline Builder', prompt: 'Extract all dates, events, milestones, and time references from these sources. Build a comprehensive timeline showing how this field/topic has evolved. Identify acceleration points where progress noticeably sped up.' },
            { icon: 'weakness', display_text: 'Weakness Detector', prompt: 'Play the role of a harsh peer reviewer. Identify every methodological flaw, logical gap, overclaim, and unsupported leap in these sources. For each weakness, suggest what additional evidence would be needed to strengthen the argument.' }
        ];

        this.init();
    }

    async init() {
        await this.initAuth();
        await this.loadConfig();
        await this.loadInfographStyles();
        this.bindEvents();
        this.initResizers();
        this.initNotebookNameEditor();
        this.initPromptScenariosPanel();
        this.initTextbookEvents();

        // Cleanup expired cache
        this.cache.cleanup();

        // Check if URL contains /notes/:id or /public/:token for direct access
        // Also check for /notebooks/:id/textbook
        if (!this.checkURLForTextbook() && !this.checkURLForNotebook() && !this.checkURLForPublicNotebook()) {
            await this.loadNotebooks();
            this.applyConfig();
            this.switchView('landing');
        } else {
            this.applyConfig();
        }
    }

    // Check if URL contains /public/:token and load the public notebook
    checkURLForPublicNotebook() {
        const path = window.location.pathname;
        const match = path.match(/^\/public\/([a-f0-9-]+)$/);
        if (match) {
            this.loadPublicNotebook(match[1]);
            return true;
        }
        return false;
    }

    // Load public notebook by token
    async loadPublicNotebook(token) {
        try {
            this.setStatus('Loading public notebook...');

            const [notebook, sources, notes] = await Promise.all([
                fetch(`/public/notebooks/${token}`).then(r => {
                    if (!r.ok) throw new Error('Failed to load notebook');
                    return r.json();
                }),
                fetch(`/public/notebooks/${token}/sources`).then(r => {
                    if (!r.ok) throw new Error('Failed to load sources');
                    return r.json();
                }),
                fetch(`/public/notebooks/${token}/notes`).then(r => {
                    if (!r.ok) throw new Error('Failed to load notes');
                    return r.json();
                })
            ]);

            this.currentNotebook = notebook;
            this.currentPublicToken = token;

            // Show notes list tab first (create container)
            this.showNotesListTab();

            // Render sources
            await this.renderSourcesList(sources);

            // Render notes to compact grid view (container created)
            await this.renderNotesCompactGridPublic(notes);

            // Set to read-only mode
            this.setReadOnlyMode(true);

            this.switchView('workspace');
            this.setStatus('Make Public: ' + notebook.name);
        } catch (error) {
            console.error('Failed to load public notebook:', error);
            this.showError('Failed to load notebook');
            this.switchView('landing');
        }
    }

    // Handle back to list button click
    async handleBackToList() {
        // Clear public notebook state
        this.currentPublicToken = null;
        this.currentNotebook = null;

        // Reset public notebooks cache to ensure fresh load
        this._publicNotebooksLoaded = false;

        // Reload user's notebooks
        await this.loadNotebooks();

        // Clear status
        this.setStatus('Ready');

        // Switch to landing view
        this.switchView('landing');
    }

    // Set read-only mode
    setReadOnlyMode(readOnly) {
        const workspace = document.getElementById('workspaceContainer');
        if (readOnly) {
            workspace.classList.add('readonly-mode');
            // Disable editing features
            const addSourceBtn = document.getElementById('btnAddSource');
            if (addSourceBtn) addSourceBtn.style.display = 'none';

            // Hide edit buttons
            document.querySelectorAll('.transform-card').forEach(btn => {
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.5';
            });

            // Hide chat features
            const chatWrapper = document.querySelector('.chat-messages-wrapper');
            if (chatWrapper) chatWrapper.style.display = 'none';
            const chatInput = document.querySelector('.chat-input-wrapper');
            if (chatInput) chatInput.style.display = 'none';

            // Show public badge
            this.showPublicBadge();
        } else {
            workspace.classList.remove('readonly-mode');
            const addSourceBtn = document.getElementById('btnAddSource');
            if (addSourceBtn) addSourceBtn.style.display = '';

            document.querySelectorAll('.transform-card').forEach(btn => {
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
            });

            const chatWrapper = document.querySelector('.chat-messages-wrapper');
            if (chatWrapper) chatWrapper.style.display = '';

            const chatInput = document.querySelector('.chat-input-wrapper');
            if (chatInput) chatInput.style.display = '';

            const badge = document.querySelector('.public-badge');
            if (badge) badge.remove();
        }
    }

    // Show public badge
    showPublicBadge() {
        // Remove existing badge
        const existingBadge = document.querySelector('.public-badge');
        if (existingBadge) existingBadge.remove();

        const nameDisplay = document.getElementById('currentNotebookName');
        if (nameDisplay && !document.querySelector('.public-badge')) {
            const badge = document.createElement('div');
            badge.className = 'public-badge';
            badge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 9l2-2 2 2m-4 0l2-2 2-2"/>
                </svg>
                <span>Public</span>
            `;
            nameDisplay.parentNode.appendChild(badge);
        }
    }

    // Check if URL contains /notes/:id and auto-load the notebook
    // Returns true if a notebook was found and loaded, false otherwise
    checkURLForNotebook() {
        const path = window.location.pathname;
        const match = path.match(/^\/notes\/([a-f0-9-]+)$/);
        if (match) {
            const notebookId = match[1];
            // Check if notebook exists in loaded notebooks
            const notebook = this.notebooks.find(nb => nb.id === notebookId);
            if (notebook) {
                this.selectNotebook(notebookId);
                return true;  // Notebook found and loaded
            } else {
                // Notebook not found or user doesn't have access
                this.setStatus('Notebook does not exist or access denied', true);
                return false;  // Notebook not found
            }
        }
        return false;  // No notebook ID in URL
    }

    // Update URL when notebook is selected
    updateURL(notebookId) {
        const newURL = `/notes/${notebookId}`;
        window.history.pushState({ notebookId }, '', newURL);
    }

    async loadConfig() {
        // Config loading - no longer needed, all features enabled
    }

    applyConfig() {
        // All features enabled by default, no config to apply
    }

    // Load infograph styles from API
    async loadInfographStyles() {
        if (this.infographStylesLoaded) return;

        try {
            const response = await this.api('/v2/infograph/styles');
            this.infographStyles = response.styles || [];
            this.infographStylesLoaded = true;
            console.log(`[InfographStyles] Loaded ${this.infographStyles.length} styles`);
        } catch (error) {
            console.warn('[InfographStyles] Failed to load styles:', error);
            // Use fallback styles
            this.infographStyles = [
                { id: 'craft-handmade', name: 'Paper Craft Style', description: 'Hand-drawn and paper craft aesthetic, warm organic feel' },
                { id: 'cyberpunk-neon', name: 'Cyberpunk Neon', description: 'Neon glow effects on dark backgrounds, futuristic aesthetic' },
                { id: 'kawaii', name: 'Kawaii Cute Style', description: 'Japanese kawaii style with large eyes and soft tones' },
                { id: 'technical-schematic', name: 'Technical Blueprint Style', description: 'Engineering schematics with precise geometric lines' },
            ];
            this.infographStylesLoaded = true;
        }
    }

    // Toggle infograph style dropdown
    toggleInfographStyleDropdown() {
        const dropdown = document.getElementById('infographStyleDropdown');
        if (!dropdown) return;

        const isVisible = dropdown.style.display !== 'none';
        if (isVisible) {
            this.hideInfographStyleDropdown();
        } else {
            this.showInfographStyleDropdown();
        }
    }

    // Show infograph style dropdown
    async showInfographStyleDropdown() {
        const dropdown = document.getElementById('infographStyleDropdown');
        const list = document.getElementById('infographStyleList');

        if (!dropdown || !list) return;

        // Load styles if not loaded
        await this.loadInfographStyles();

        // Render styles
        list.innerHTML = this.infographStyles.map(style => `
            <div class="style-item ${this.selectedInfographStyle === style.id ? 'selected' : ''}" data-style-id="${style.id}">
                <div class="style-item-name">
                    ${this.selectedInfographStyle === style.id ? '<span class="check-icon">✓</span>' : ''}
                    ${style.name}
                </div>
                <div class="style-item-desc">${style.description}</div>
            </div>
        `).join('');

        // Add "Default" option at top
        const defaultItem = document.createElement('div');
        defaultItem.className = `style-item ${this.selectedInfographStyle === null ? 'selected' : ''}`;
        defaultItem.dataset.styleId = '';
        defaultItem.innerHTML = `
            <div class="style-item-name">
                ${this.selectedInfographStyle === null ? '<span class="check-icon">✓</span>' : ''}
                Default Style
            </div>
            <div class="style-item-desc">Use the default infographic display style</div>
        `;
        list.prepend(defaultItem);

        // Bind click events
        list.querySelectorAll('.style-item').forEach(item => {
            item.addEventListener('click', () => {
                const styleId = item.dataset.styleId || null;
                this.selectInfographStyle(styleId);
            });
        });

        dropdown.style.display = 'block';
    }

    // Hide infograph style dropdown
    hideInfographStyleDropdown() {
        const dropdown = document.getElementById('infographStyleDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }

    // Select an infograph style and trigger generation
    selectInfographStyle(styleId) {
        this.selectedInfographStyle = styleId || null;
        this.hideInfographStyleDropdown();

        // Update the style picker button to show selected style
        const stylePickerBtn = document.querySelector('.style-picker-btn');
        if (stylePickerBtn) {
            if (styleId) {
                const style = this.infographStyles.find(s => s.id === styleId);
                stylePickerBtn.title = `Style: ${style ? style.name : styleId}`;
            } else {
                stylePickerBtn.title = 'Select style';
            }
        }

        // Auto-trigger infograph generation
        if (this.currentNotebook) {
            const infographCard = document.querySelector('.transform-card[data-type="infograph"]');
            if (infographCard) {
                this.handleTransform('infograph', infographCard);
            }
        }
    }

    initResizers() {
        const resizerLeft = document.getElementById('resizerLeft');
        const resizerRight = document.getElementById('resizerRight');
        const grid = document.querySelector('.main-grid');

        if (!resizerLeft || !resizerRight) return;

        let isDragging = false;
        let currentResizer = null;

        const startDragging = (e, resizer) => {
            isDragging = true;
            currentResizer = resizer;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        };

        const stopDragging = () => {
            if (!isDragging) return;
            isDragging = false;
            currentResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            currentResizer = null;
        };

        const drag = (e) => {
            if (!isDragging) return;

            const gridRect = grid.getBoundingClientRect();
            if (currentResizer === resizerLeft) {
                const width = e.clientX - gridRect.left;
                if (width > 150 && width < 600) {
                    grid.style.setProperty('--left-width', `${width}px`);
                }
            } else if (currentResizer === resizerRight) {
                const width = gridRect.right - e.clientX;
                if (width > 200 && width < 600) {
                    grid.style.setProperty('--right-width', `${width}px`);
                }
            }
        };

        resizerLeft.addEventListener('mousedown', (e) => startDragging(e, resizerLeft));
        resizerRight.addEventListener('mousedown', (e) => startDragging(e, resizerRight));
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
    }

    bindEvents() {
        const safeAddEventListener = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };

        safeAddEventListener('btnNewNotebook', 'click', () => this.showNewNotebookModal());
        safeAddEventListener('btnNewNotebookLanding', 'click', () => this.showNewNotebookModal());
        safeAddEventListener('btnShareNotebook', 'click', () => {
            if (this.currentNotebook) {
                this.showShareDialog(this.currentNotebook);
            }
        });

        // Share modal events
        safeAddEventListener('btnCloseShareModal', 'click', () => this.closeShareModal());
        safeAddEventListener('btnCancelShare', 'click', () => this.closeShareModal());
        safeAddEventListener('btnCopyLink', 'click', () => this.copyShareLink());
        safeAddEventListener('btnToggleShare', 'click', () => this.toggleShareFromModal());

        // Auth events
        safeAddEventListener('btnLogin', 'click', () => this.handleLogin());
        safeAddEventListener('btnLogout', 'click', () => this.handleLogout());
        safeAddEventListener('btnLoginWorkspace', 'click', () => this.handleLogin());
        safeAddEventListener('btnLogoutWorkspace', 'click', () => this.handleLogout());

        safeAddEventListener('btnBackToList', 'click', () => this.handleBackToList());
        safeAddEventListener('btnToggleRight', 'click', () => this.toggleRightPanel());
        safeAddEventListener('btnToggleLeft', 'click', () => this.toggleLeftPanel());
        safeAddEventListener('btnShowNotesDetails', 'click', () => this.showNotesListTab());
        safeAddEventListener('btnCloseNotesList', 'click', (e) => {
            e.stopPropagation();
            this.closeNotesListTab();
        });
        safeAddEventListener('btnCloseNote', 'click', (e) => {
            e.stopPropagation();
            this.closeNoteTab();
        });

        // Panel tabs
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchPanelTab(tab.dataset.tab);
            });
        });
        
        safeAddEventListener('newNotebookForm', 'submit', (e) => this.handleCreateNotebook(e));
        safeAddEventListener('btnCloseNotebookModal', 'click', () => this.closeModals());
        safeAddEventListener('btnCancelNotebook', 'click', () => this.closeModals());

        safeAddEventListener('btnAddSource', 'click', () => this.showAddSourceModal());
        safeAddEventListener('btnCloseSourceModal', 'click', () => this.closeModals());
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        }
        
        safeAddEventListener('fileInput', 'change', (e) => this.handleFileUpload(e));
        safeAddEventListener('textSourceForm', 'submit', (e) => this.handleTextSource(e));
        safeAddEventListener('urlSourceForm', 'submit', (e) => this.handleURLSource(e));
        safeAddEventListener('btnCancelText', 'click', () => this.closeModals());
        safeAddEventListener('btnCancelURL', 'click', () => this.closeModals());

        document.querySelectorAll('.source-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.source-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const targetId = `source${tab.dataset.source.charAt(0).toUpperCase() + tab.dataset.source.slice(1)}`;
                const target = document.getElementById(targetId);
                if (target) target.classList.add('active');
            });
        });

        document.querySelectorAll('.transform-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Check if the click is on the style picker button
                if (e.target.closest('.style-picker-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleInfographStyleDropdown();
                    return;
                }
                e.preventDefault();
                this.handleTransform(card.dataset.type, card);
            });
        });

        // Style dropdown close button
        const styleDropdownClose = document.querySelector('.style-dropdown-close');
        if (styleDropdownClose) {
            styleDropdownClose.addEventListener('click', () => {
                this.hideInfographStyleDropdown();
            });
        }

        // Close style dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('infographStyleDropdown');
            const stylePickerBtn = document.querySelector('.style-picker-btn');
            if (dropdown && dropdown.style.display !== 'none') {
                if (!dropdown.contains(e.target) && !stylePickerBtn?.contains(e.target)) {
                    this.hideInfographStyleDropdown();
                }
            }
        });

        safeAddEventListener('btnCustomTransform', 'click', (e) => {
            this.handleTransform('custom', e.currentTarget);
        });

        safeAddEventListener('chatForm', 'submit', (e) => this.handleChat(e));

        // Chat sessions management
        safeAddEventListener('btnSaveChatSession', 'click', () => this.saveCurrentSession());
        safeAddEventListener('btnNewChatSession', 'click', () => this.handleNewChatSession());
        safeAddEventListener('btnClearSessions', 'click', () => this.handleClearSessions());

        safeAddEventListener('modalOverlay', 'click', (e) => {
            if (e.target.id === 'modalOverlay') {
                this.closeModals();
            }
        });

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (event) => {
            const path = window.location.pathname;
            const match = path.match(/^\/notes\/([a-f0-9-]+)$/);
            if (match) {
                const notebookId = match[1];
                const notebook = this.notebooks.find(nb => nb.id === notebookId);
                if (notebook && !this.currentNotebook) {
                    this.selectNotebook(notebookId);
                }
            } else if (path === '/' && this.currentNotebook) {
                this.switchView('landing');
            }
        });
    }

    // API methods
    async api(endpoint, options = {}) {
        const timeout = options.timeout || 300000; // Default 300 seconds
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const defaults = {
            cache: 'no-store',
            signal: controller.signal
        };

        // Set Content-Type header (but not for FormData - let browser set it)
        if (!(options.body instanceof FormData)) {
            defaults.headers = {
                'Content-Type': 'application/json',
            };
        } else {
            defaults.headers = {};
        }

        if (this.token) {
            defaults.headers['Authorization'] = `Bearer ${this.token}`;
        }

        let url = `${this.apiBase}${endpoint}`;
        if (!options.method || options.method === 'GET') {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}_t=${Date.now()}`;
        }

        try {
            const response = await fetch(url, { ...defaults, ...options });
            clearTimeout(id);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || 'Request failed');
            }

            if (response.status === 204) {
                return null;
            }

            return response.json();
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out, please try again');
            }
            throw error;
        }
    }

    // Auth Methods
    async initAuth() {
        if (!this.token) {
            this.updateAuthUI();
            return;
        }

        try {
            const user = await this.api('/auth/me');
            this.currentUser = user;
            this.updateAuthUI();
        } catch (error) {
            console.warn('Auth check failed:', error);
            this.handleLogout();
        }
    }

    updateAuthUI() {
        // Landing page auth UI
        const authContainer = document.getElementById('authContainer');
        const btnLogin = document.getElementById('btnLogin');
        const userProfile = document.getElementById('userProfile');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');

        // Workspace auth UI
        const btnLoginWorkspace = document.getElementById('btnLoginWorkspace');
        const userProfileWorkspace = document.getElementById('userProfileWorkspace');
        const userAvatarWorkspace = document.getElementById('userAvatarWorkspace');
        const userNameWorkspace = document.getElementById('userNameWorkspace');

        if (this.currentUser) {
            // Get provider display name
            const providerNames = {
                'github': 'GitHub',
                'google': 'Google'
            };
            const providerName = providerNames[this.currentUser.provider] || this.currentUser.provider;
            const hashIdDisplay = this.currentUser.hash_id ? `User ID: ${this.currentUser.hash_id}\n` : '';
            const tooltipText = `Login via: ${providerName}\n${hashIdDisplay}Account: ${this.currentUser.email}`;

            // Handle fallback avatar
            const fallbackInitial = this.currentUser.name ? this.currentUser.name.charAt(0) : this.currentUser.email.charAt(0);
            const avatarUrl = this.currentUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackInitial)}&background=random`;

            // Update landing page
            if (btnLogin) btnLogin.classList.add('hidden');
            if (userProfile) userProfile.classList.remove('hidden');
            if (userAvatar) {
                userAvatar.src = avatarUrl;
                userAvatar.title = tooltipText;
            }
            if (userName) userName.textContent = this.currentUser.name || this.currentUser.email.split('@')[0];

            // Update workspace
            if (btnLoginWorkspace) btnLoginWorkspace.classList.add('hidden');
            if (userProfileWorkspace) userProfileWorkspace.classList.remove('hidden');
            if (userAvatarWorkspace) {
                userAvatarWorkspace.src = avatarUrl;
                userAvatarWorkspace.title = tooltipText;
            }
            if (userNameWorkspace) userNameWorkspace.textContent = this.currentUser.name || this.currentUser.email.split('@')[0];
        } else {
            // Update landing page
            if (btnLogin) btnLogin.classList.remove('hidden');
            if (userProfile) userProfile.classList.add('hidden');

            // Update workspace
            if (btnLoginWorkspace) btnLoginWorkspace.classList.remove('hidden');
            if (userProfileWorkspace) userProfileWorkspace.classList.add('hidden');
        }
    }

    handleLogin() {
        // Show login modal
        this.showLoginModal();
    }

    showLoginModal() {
        // Create or get existing modal
        let modal = document.getElementById('loginModal');
        if (!modal) {
            // Create modal dynamically
            modal = document.createElement('div');
            modal.id = 'loginModal';
            modal.className = 'login-modal';
            modal.innerHTML = `
                <div class="login-modal-content">
                    <div class="login-modal-header">
                        <h3>Choose Login Method</h3>
                        <button class="btn-close-login" id="btnCloseLoginModal">×</button>
                    </div>
                    <div class="login-modal-body">
                        <button class="btn-login-provider" id="btnLoginGithub">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                            </svg>
                            Sign in with GitHub
                        </button>
                        <button class="btn-login-provider" id="btnLoginGoogle">
                            <svg width="20" height="20" viewBox="0 0 16 16">
                                <path fill="#4285F4" d="M14.9 8.16c0-.95-.08-1.65-.21-2.37H8v4.4h3.83c-.17.96-.69 2.05-1.55 2.68v2.19h2.48c1.46-1.34 2.3-3.31 2.3-5.64z"/>
                                <path fill="#34A853" d="M8 16c2.07 0 3.83-.69 5.11-1.87l-2.48-2.19c-.69.46-1.57.73-2.63.73-2.02 0-3.74-1.37-4.35-3.19H1.11v2.26C2.38 13.89 4.99 16 8 16z"/>
                                <path fill="#FBBC05" d="M3.65 9.52c-.16-.46-.25-.95-.25-1.47s.09-1.01.25-1.47V4.48H1.11C.4 5.87 0 7.39 0 8s.4 2.13 1.11 3.52l2.54-2z"/>
                                <path fill="#EA4335" d="M8 3.24c1.14 0 2.17.39 2.98 1.15l2.2-2.2C11.83.87 10.07 0 8 0 4.99 0 2.38 2.11 1.11 4.48l2.54 2.26c.61-1.82 2.33-3.5 4.35-3.5z"/>
                            </svg>
                            Sign in with Google
                        </button>
                        <button class="btn-login-provider btn-test-login" id="btnLoginTest" style="display: none;">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 12H7V7h2v5zm0-6H7V4h2v2z"/>
                            </svg>
                            Sign in with test account
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add event listeners
            document.getElementById('btnCloseLoginModal').addEventListener('click', () => {
                this.closeLoginModal();
            });
            document.getElementById('btnLoginGithub').addEventListener('click', () => {
                this.loginWithProvider('github');
            });
            document.getElementById('btnLoginGoogle').addEventListener('click', () => {
                this.loginWithProvider('google');
            });
            document.getElementById('btnLoginTest').addEventListener('click', () => {
                this.loginWithTestAccount();
            });
        }

        // Check if test mode is enabled and show test login button
        this.checkTestMode().then(enabled => {
            const testBtn = document.getElementById('btnLoginTest');
            if (testBtn && enabled) {
                testBtn.style.display = 'flex';
            }
        });

        modal.classList.add('active');
    }

    async checkTestMode() {
        try {
            const response = await fetch('/auth/test-mode');
            if (response.ok) {
                const data = await response.json();
                return data.enabled || false;
            }
        } catch (error) {
            console.warn('Failed to check test mode:', error);
        }
        return false;
    }

    async loginWithTestAccount() {
        this.closeLoginModal();

        try {
            const response = await fetch('/auth/test-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Test login failed');
            }

            const data = await response.json();
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('token', this.token);
            document.cookie = `token=${this.token}; path=/; SameSite=Lax`;

            await this.initAuth();
            this.setStatus('Test account login successful');
        } catch (error) {
            console.error('Test login failed:', error);
            this.showError('Test login failed: ' + error.message);
        }
    }

    closeLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    loginWithProvider(provider) {
        this.closeLoginModal();

        // Open popup
        const width = 600;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;

        window.open(
            `/auth/login/${provider}`,
            'StudyForgeLogin',
            `width=${width},height=${height},top=${top},left=${left}`
        );

        // Listen for message with origin validation
        const messageHandler = (event) => {
            // Validate origin for security
            if (event.origin !== window.location.origin) {
                console.warn('Received message from untrusted origin:', event.origin);
                return;
            }

            if (event.data.token && event.data.user) {
                this.token = event.data.token;
                this.currentUser = event.data.user;
                localStorage.setItem('token', this.token);

                // Also set token as cookie for image loading
                document.cookie = `token=${this.token}; path=/; SameSite=Lax`;

                this.updateAuthUI();

                // Reload data
                this.loadNotebooks();
            }
        };

        window.addEventListener('message', messageHandler, { once: true });
    }

    handleLogout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('token');

        // Also remove token cookie
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Clear cache
        this.cache.delete('notebooks');

        this.updateAuthUI();

        // Clear data
        this.notebooks = [];
        this.renderNotebooks();
        this.switchView('landing');
    }

    // Notebook methods
    async loadNotebooks() {
        // Always load public notebooks showcase (regardless of private notebooks)
        await this.loadPublicNotebooksShowcase();

        try {
            // Try to get from cache first
            const cached = this.cache.get('notebooks');
            if (cached) {
                this.notebooks = cached;
                this.renderNotebooks();
                this.updateFooter();
            }

            // Get latest data from server (with stats)
            const notebooks = await this.api('/notebooks/stats');
            this.notebooks = notebooks;

            // Update cache
            this.cache.set('notebooks', notebooks);

            this.renderNotebooks();
            this.updateFooter();
        } catch (error) {
            // 401 Unauthorized is expected for non-logged-in users, don't show error
            if (error.message && !error.message.includes('401')) {
                console.warn('User not logged in, skipping private notebook loading');
            } else {
                this.showError('Failed to load notebook');
            }
        }
    }

    renderNotebooks() {
        this.renderNotebookCards();
        this.loadPublicNotebooksShowcase();
    }

    renderNotebookCards() {
        const container = document.getElementById('notebookGridLanding');
        const template = document.getElementById('notebookCardTemplate');

        container.innerHTML = '';

        if (this.notebooks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="12" y="12" width="40" height="40" rx="4"/>
                        <line x1="20" y1="24" x2="44" y2="24"/>
                        <line x1="20" y1="32" x2="40" y2="32"/>
                    </svg>
                    <p>Start your knowledge journey</p>
                    <button class="btn-primary" onclick="app.showNewNotebookModal()">Create Your First Notebook</button>
                </div>
            `;
            return;
        }

        this.notebooks.forEach(nb => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.notebook-card');

            card.dataset.id = nb.id;
            card.querySelector('.notebook-card-name').textContent = nb.name;
            card.querySelector('.notebook-card-desc').textContent = nb.description || 'No description';

            // Use stats directly from API
            card.querySelector('.stat-sources').textContent = `${nb.source_count || 0} sources`;
            card.querySelector('.stat-notes').textContent = `${nb.note_count || 0} notes`;
            card.querySelector('.stat-date').textContent = this.formatDate(nb.created_at);

            // Update share button status
            const shareCardBtn = clone.querySelector('.btn-share-card');
            if (shareCardBtn) {
                if (nb.is_public) {
                    shareCardBtn.classList.add('active');
                    shareCardBtn.setAttribute('title', 'Shared');
                } else {
                    shareCardBtn.classList.remove('active');
                    shareCardBtn.setAttribute('title', 'Share');
                }

                // Share button event
                shareCardBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showShareDialog(nb);
                });
            }

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-card') && !e.target.closest('.btn-share-card')) {
                    this.selectNotebook(nb.id);
                }
            });

            const deleteCardBtn = card.querySelector('.btn-delete-card');
            deleteCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this notebook?')) {
                    this.deleteNotebook(nb.id);
                }
            });

            container.appendChild(clone);
        });
    }

    // Load and render public notebooks showcase
    async loadPublicNotebooksShowcase() {
        // Prevent duplicate calls
        if (this._publicNotebooksLoaded) return;
        this._publicNotebooksLoaded = true;

        try {
            const response = await fetch('/public/notebooks');
            if (!response.ok) return;

            const notebooks = await response.json();
            this.renderPublicNotebooksShowcase(notebooks);
        } catch (error) {
            console.error('Failed to load public notebooks showcase:', error);
        }
    }

    // Cache to avoid duplicate calls
    _publicNotebooksLoaded = false;

    renderPublicNotebooksShowcase(notebooks) {
        const container = document.getElementById('publicShowcase');
        const grid = document.getElementById('publicShowcaseGrid');

        if (!container || !grid) return;

        grid.innerHTML = '';

        if (notebooks.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        notebooks.forEach(nb => {
            const card = document.createElement('a');
            card.className = 'public-showcase-card';
            card.href = `/public/${nb.public_token}`;

            // Generate background style if cover image exists
            if (nb.cover_image_url) {
                card.style.backgroundImage = `url('${nb.cover_image_url}')`;
                card.style.backgroundSize = 'cover';
                card.style.backgroundPosition = 'center';
                card.classList.add('has-cover-image');
            }

            card.innerHTML = `
                <div class="public-showcase-card-content">
                    <h3 class="public-showcase-card-title">${this.escapeHtml(nb.name)}</h3>
                    <div class="public-showcase-card-footer">
                        <div class="public-showcase-card-stats">
                            <span>${nb.source_count || 0} sources</span>
                            <span>${nb.note_count || 0} notes</span>
                        </div>
                        <span class="public-showcase-card-date">${this.formatDate(nb.created_at)}</span>
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });
    }

    switchView(view) {
        const landing = document.getElementById('landingPage');
        const workspace = document.getElementById('workspaceContainer');
        const textbook = document.getElementById('textbookContainer');
        const header = document.querySelector('.app-header');

        // Hide all views first
        landing.classList.add('hidden');
        workspace.classList.add('hidden');
        if (textbook) textbook.classList.add('hidden');
        header.classList.add('hidden');

        if (view === 'workspace') {
            workspace.classList.remove('hidden');
            this.loadTextbookStatus(); // Check textbook status on workspace show
        } else if (view === 'textbook') {
            if (textbook) textbook.classList.remove('hidden');
        } else {
            landing.classList.remove('hidden');
            header.classList.remove('hidden');
            this.currentNotebook = null;
            this.renderNotebookCards();
            // Update URL to root when returning to landing page
            window.history.pushState({}, '', '/');
        }
    }

    toggleRightPanel() {
        const grid = document.querySelector('.main-grid');
        grid.classList.toggle('right-collapsed');
    }

    toggleLeftPanel() {
        const grid = document.querySelector('.main-grid');
        grid.classList.toggle('left-collapsed');
    }

    switchPanelTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        // Hide all resource preview containers
        document.querySelectorAll('.resource-preview-container').forEach(el => {
            el.style.display = 'none';
        });

        // Update content visibility
        const chatMessages = document.getElementById('chatMessages');
        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        const noteViewContainer = document.querySelector('.note-view-container');
        const notesDetailsView = document.querySelector('.notes-details-view');
        const sessionsPanel = document.getElementById('chatSessionsPanel');

        // Reset chatMessages to use CSS default (remove inline style)
        if (chatMessages) {
            chatMessages.style.display = '';
        }

        if (tab === 'note') {
            chatWrapper.style.display = 'none';
            if (sessionsPanel) sessionsPanel.classList.add('hidden');
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) {
                noteViewContainer.style.display = 'flex';
            }
        } else if (tab === 'chat') {
            chatWrapper.style.display = 'flex';
            if (sessionsPanel) sessionsPanel.classList.add('hidden');
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) {
                noteViewContainer.style.display = 'none';
            }
        } else if (tab === 'sessions') {
            // Show sessions panel, hide chat messages
            chatWrapper.style.display = 'flex';
            if (chatMessages) chatMessages.style.display = 'none';
            if (sessionsPanel) {
                sessionsPanel.classList.remove('hidden');
                // Load sessions when tab is shown
                this.loadChatSessions();
            }
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) noteViewContainer.style.display = 'none';
        } else if (tab === 'notes_list') {
            chatWrapper.style.display = 'none';
            if (sessionsPanel) sessionsPanel.classList.add('hidden');
            if (noteViewContainer) noteViewContainer.style.display = 'none';
            if (notesDetailsView) {
                notesDetailsView.style.display = 'flex';
                // Only render if not in public mode (public mode already has data loaded)
                if (!this.currentPublicToken) {
                    this.renderNotesCompactGrid();
                }
            }
        } else if (tab.toString().startsWith('resource_')) {
            // Handle resource preview tabs
            chatWrapper.style.display = 'none';
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) noteViewContainer.style.display = 'none';

            const resourceContainer = document.querySelector(`.resource-preview-container[data-tab-id="${tab}"]`);
            if (resourceContainer) {
                resourceContainer.style.display = 'flex';
            }
        }
    }

    async showNotesListTab() {
        const tabBtn = document.getElementById('tabBtnNotesList');
        tabBtn.classList.remove('hidden');

        // Ensure notesDetailsView container exists
        let notesDetailsView = document.querySelector('.notes-details-view');
        if (!notesDetailsView) {
            const chatWrapper = document.querySelector('.chat-messages-wrapper');
            notesDetailsView = document.createElement('div');
            notesDetailsView.className = 'notes-details-view';
            notesDetailsView.innerHTML = '<div class="notes-compact-grid"></div>';
            chatWrapper.insertAdjacentElement('afterend', notesDetailsView);
        }

        this.switchPanelTab('notes_list');
    }

    closeNotesListTab() {
        const tabBtn = document.getElementById('tabBtnNotesList');
        tabBtn.classList.add('hidden');
        
        const notesDetailsView = document.querySelector('.notes-details-view');
        if (notesDetailsView) notesDetailsView.style.display = 'none';
        
        if (tabBtn.classList.contains('active')) {
            this.switchPanelTab('chat');
        }
    }

    closeNoteTab() {
        const noteViewContainer = document.querySelector('.note-view-container');
        if (noteViewContainer) noteViewContainer.remove();
        
        const tabBtnNote = document.getElementById('tabBtnNote');
        if (tabBtnNote) tabBtnNote.style.display = 'none';

        this.switchPanelTab('chat');
    }

    async renderNotesCompactGrid() {
        if (!this.currentNotebook) return;

        const container = document.querySelector('.notes-compact-grid');
        if (!container) return;

        try {
            const notes = await this.api(`/notebooks/${this.currentNotebook.id}/notes`);
            container.innerHTML = '';

            notes.forEach(note => {
                const card = document.createElement('div');
                card.className = 'compact-note-card';
                card.dataset.noteId = note.id;

                const plainText = note.content
                    .replace(/^#+\s+/gm, '')
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .replace(/`/g, '')
                    .replace(/\n+/g, ' ')
                    .trim();

                card.innerHTML = `
                    <button class="btn-delete-compact-note" title="Delete note">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M4.5 4.5L9.5 9.5M9.5 4.5L4.5 9.5"/>
                        </svg>
                    </button>
                    <div class="note-type">${note.type}</div>
                    <h4 class="note-title">${note.title}</h4>
                    <p class="note-preview">${plainText}</p>
                    <div class="note-footer">
                        <span>${this.formatDate(note.created_at)}</span>
                        <span>${note.source_ids?.length || 0} sources</span>
                    </div>
                `;

                // Delete button event
                const deleteBtn = card.querySelector('.btn-delete-compact-note');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this note?')) {
                        this.deleteNote(note.id);
                    }
                });

                card.addEventListener('click', () => this.viewNote(note));
                container.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load notes for grid:', error);
        }
    }

    // Render notes compact grid for public notebooks (without API call)
    async renderNotesCompactGridPublic(notes) {
        const container = document.querySelector('.notes-compact-grid');
        if (!container) return;

        container.innerHTML = '';

        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'compact-note-card';

            const plainText = note.content
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/`/g, '')
                .replace(/\n+/g, ' ')
                .trim();

            card.innerHTML = `
                <div class="note-type">${note.type}</div>
                <h4 class="note-title">${note.title}</h4>
                <p class="note-preview">${plainText}</p>
                <div class="note-footer">
                    <span>${this.formatDate(note.created_at)}</span>
                    <span>${note.source_ids?.length || 0} sources</span>
                </div>
            `;

            card.addEventListener('click', () => this.viewNote(note));
            container.appendChild(card);
        });
    }

    async selectNotebook(id) {
        this.currentNotebook = this.notebooks.find(nb => nb.id === id);
        this.currentPublicToken = null;  // Clear public token when selecting regular notebook

        const nameDisplay = document.getElementById('currentNotebookName');
        nameDisplay.textContent = this.currentNotebook.name;
        nameDisplay.classList.add('editable');

        // Update URL to /notes/:id for shareable links
        this.updateURL(id);

        // Update share button status
        this.updateShareButtonState();

        // Exit readonly mode when switching to private notebook
        this.setReadOnlyMode(false);

        this.switchView('workspace');

        // Reset tab to notes list and remove any existing note view
        this.showNotesListTab();
        const noteView = document.querySelector('.note-view-container');
        if (noteView) noteView.remove();

        await Promise.all([
            this.loadSources(),
            this.loadNotes(),
            this.loadChatSessions()
        ]);

        this.setStatus(`Current selection: ${this.currentNotebook.name}`);
    }

    // Update share button status
    updateShareButtonState() {
        const shareBtn = document.getElementById('btnShareNotebook');
        const shareText = document.getElementById('shareButtonText');
        if (!shareBtn || !this.currentNotebook) return;

        if (this.currentNotebook.is_public) {
            shareText.textContent = 'Shared';
            shareBtn.classList.add('active');
        } else {
            shareText.textContent = 'Share';
            shareBtn.classList.remove('active');
        }
    }

    // Show share dialog
    showShareDialog(notebook) {
        this.currentShareNotebook = notebook;
        const modal = document.getElementById('shareModal');
        const overlay = document.getElementById('modalOverlay');

        // Set notebook name
        document.getElementById('shareNotebookName').textContent = notebook.name;

        // Update status display
        this.updateShareModalState(notebook);

        // Show modal
        modal.classList.add('active');
        overlay.classList.add('active');
    }

    // Update share dialog status
    updateShareModalState(notebook) {
        const statusIcon = document.getElementById('shareStatusIcon');
        const statusText = document.getElementById('shareStatusText');
        const linkSection = document.getElementById('shareLinkSection');
        const linkInput = document.getElementById('shareLinkInput');
        const toggleBtn = document.getElementById('btnToggleShare');

        if (notebook.is_public) {
            statusIcon.className = 'status-icon public';
            statusIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l2-2 2 2m-4 0l2-2 2-2"/></svg>';
            statusText.textContent = 'Notebook shared';
            linkSection.style.display = 'flex';
            linkInput.value = `${window.location.origin}/public/${notebook.public_token}`;
            toggleBtn.textContent = 'Make Private';
            toggleBtn.className = 'btn-secondary';
        } else {
            statusIcon.className = 'status-icon private';
            statusIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="8" height="4" rx="1"/></svg>';
            statusText.textContent = 'Notebook is not shared';
            linkSection.style.display = 'none';
            toggleBtn.textContent = 'Make Public';
            toggleBtn.className = 'btn-primary';
        }
    }

    // Close share dialog
    closeShareModal() {
        const modal = document.getElementById('shareModal');
        const overlay = document.getElementById('modalOverlay');
        modal.classList.remove('active');
        overlay.classList.remove('active');
        this.currentShareNotebook = null;
    }

    // Copy share link
    copyShareLink() {
        const linkInput = document.getElementById('shareLinkInput');
        linkInput.select();
        linkInput.setSelectionRange(0, 99999); // For mobile devices

        navigator.clipboard.writeText(linkInput.value).then(() => {
            this.showToast('Link copied to clipboard', 'success');
        }).catch(() => {
            // Fallback
            try {
                document.execCommand('copy');
                this.showToast('Link copied to clipboard', 'success');
            } catch (err) {
                this.showError('Failed to copy, please copy manually');
            }
        });
    }

    // Toggle notebook public state (from dialog)
    async toggleShareFromModal() {
        if (!this.currentShareNotebook) return;

        const newPublicState = !this.currentShareNotebook.is_public;
        try {
            const result = await this.api(`/notebooks/${this.currentShareNotebook.id}/public`, {
                method: 'PUT',
                body: JSON.stringify({ is_public: newPublicState })
            });

            // Update current notebook
            if (this.currentNotebook && this.currentNotebook.id === this.currentShareNotebook.id) {
                this.currentNotebook = result;
                this.updateShareButtonState();
            }

            // Update data in notebook list
            const nb = this.notebooks.find(n => n.id === this.currentShareNotebook.id);
            if (nb) {
                nb.is_public = result.is_public;
                nb.public_token = result.public_token;
            }

            // Update dialog status
            this.currentShareNotebook = result;
            this.updateShareModalState(result);

            // Refresh notebook list
            this.renderNotebooks();

            this.showToast(newPublicState ? 'Notebook shared' : 'Notebook made private', 'success');
        } catch (error) {
            this.showError(`Operation failed: ${error.message}`);
        }
    }

    initNotebookNameEditor() {
        const nameDisplay = document.getElementById('currentNotebookName');
        const nameEditor = document.getElementById('notebookNameEditor');
        const nameInput = document.getElementById('notebookNameInput');
        const saveBtn = document.getElementById('btnSaveNotebookName');
        const cancelBtn = document.getElementById('btnCancelNotebookName');

        // Double-click to enter edit mode
        nameDisplay.addEventListener('dblclick', () => {
            this.startEditingNotebookName();
        });

        // Click save button
        saveBtn.addEventListener('click', () => {
            this.saveNotebookName();
        });

        // Click cancel button
        cancelBtn.addEventListener('click', () => {
            this.cancelEditNotebookName();
        });

        // Press Enter to save
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveNotebookName();
            } else if (e.key === 'Escape') {
                this.cancelEditNotebookName();
            }
        });
    }

    startEditingNotebookName() {
        const nameDisplay = document.getElementById('currentNotebookName');
        const nameEditor = document.getElementById('notebookNameEditor');
        const nameInput = document.getElementById('notebookNameInput');

        nameInput.value = this.currentNotebook.name;
        nameDisplay.classList.add('hidden');
        nameEditor.classList.remove('hidden');
        nameInput.focus();
        nameInput.select();
    }

    async saveNotebookName() {
        const nameInput = document.getElementById('notebookNameInput');
        const newName = nameInput.value.trim();

        if (!newName) {
            this.showError('Notebook name cannot be empty');
            return;
        }

        if (newName === this.currentNotebook.name) {
            this.cancelEditNotebookName();
            return;
        }

        try {
            this.showLoading('Saving...');

            const updated = await this.api(`/notebooks/${this.currentNotebook.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: newName,
                    description: this.currentNotebook.description
                })
            });

            // Update local data
            this.currentNotebook.name = newName;
            this.currentNotebook.updated_at = updated.updated_at;

            // Update data in notebooks list
            const nb = this.notebooks.find(n => n.id === this.currentNotebook.id);
            if (nb) {
                nb.name = newName;
                nb.updated_at = updated.updated_at;
            }

            // Invalidate cache
            this.cache.delete('notebooks');

            // Update display
            document.getElementById('currentNotebookName').textContent = newName;
            this.cancelEditNotebookName();
            this.hideLoading();
            this.setStatus('Notebook name updated');

        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    cancelEditNotebookName() {
        const nameDisplay = document.getElementById('currentNotebookName');
        const nameEditor = document.getElementById('notebookNameEditor');

        nameDisplay.classList.remove('hidden');
        nameEditor.classList.add('hidden');
    }

    // Initialize prompt scenarios panel
    initPromptScenariosPanel() {
        const header = document.querySelector('.prompt-scenarios-header');
        if (header) {
            header.addEventListener('click', () => this.togglePromptScenariosPanel());
        }
        this.renderPromptScenarios();
    }

    // Render prompt scenarios buttons
    renderPromptScenarios() {
        const container = document.querySelector('.prompt-scenarios-container');
        if (!container) return;

        container.innerHTML = '';
        this.promptScenarios.forEach(scenario => {
            const btn = document.createElement('button');
            btn.className = 'prompt-scenario-btn';
            btn.dataset.prompt = scenario.prompt;
            btn.title = scenario.display_text;
            btn.innerHTML = `
                <span class="prompt-scenario-icon">${this.getIcon(scenario.icon)}</span>
                <span class="prompt-scenario-text">${scenario.display_text}</span>
            `;
            btn.addEventListener('click', () => this.handlePromptScenarioClick(scenario.prompt));
            container.appendChild(btn);
        });
    }

    // Handle prompt scenario button click
    handlePromptScenarioClick(prompt) {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = prompt;
            chatInput.focus();
            // Trigger input event to start typing
            chatInput.dispatchEvent(new Event('input'));
        }
    }

    // Toggle prompt scenarios panel collapse/expand
    togglePromptScenariosPanel() {
        const panel = document.querySelector('.prompt-scenarios-panel');
        const header = document.querySelector('.prompt-scenarios-header');
        const icon = header.querySelector('.chevron-icon');

        if (panel.classList.contains('collapsed')) {
            panel.classList.remove('collapsed');
            icon.classList.remove('rotated');
        } else {
            panel.classList.add('collapsed');
            icon.classList.add('rotated');
        }
    }

    // Get SVG icon by name
    getIcon(name) {
        const icons = {
            search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`,
            question: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>`,
            lightbulb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 12 3.5a4.65 4.65 0 0 0-4.5 4.5v1.29c0 .75-.15 1.48-.5 2.11"></path></svg>`,
            compare: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18"></rect><rect x="14" y="3" width="7" height="18"></rect><path d="M10 9h4"></path><path d="M10 15h4"></path></svg>`,
            action: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`,
            detail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path><path d="M11 8v6"></path><path d="M8 11h6"></path></svg>`,
            example: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M8 7h6"></path><path d="M8 11h8"></path><path d="M8 15h6"></path></svg>`,
            simplify: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><path d="M9 9h.01"></path><path d="M15 9h.01"></path></svg>`,
            extend: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
            creative: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"></path></svg>`,
            expert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
            conflict: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z"></path><path d="M12 12v6"></path><path d="M12 6v2"></path></svg>`,
            blueprint: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`,
            generate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M3 15h6"></path><path d="M6 12v6"></path></svg>`,
            assumption: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
            framework: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
            evidence: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
            users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
            timeline: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path><path d="M21 18h.01"></path><path d="M21 12h.01"></path><path d="M21 6h.01"></path></svg>`,
            weakness: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`
        };
        return icons[name] || icons.search;
    }

    showNewNotebookModal() {
        document.getElementById('newNotebookModal').classList.add('active');
        document.getElementById('modalOverlay').classList.add('active');
        document.querySelector('#newNotebookForm input[name="name"]').focus();
    }

    async handleCreateNotebook(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        this.showLoading('Processing...');

        try {
            const notebook = await this.api('/notebooks', {
                method: 'POST',
                body: JSON.stringify({
                    name: data.get('name'),
                    description: data.get('description') || undefined,
                    icon: data.get('icon') || '📓',
                    color: data.get('color') || '#8B5CF6',
                }),
            });

            // Invalidate cache
            this.cache.delete('notebooks');

            this.notebooks.push(notebook);
            this.renderNotebooks();
            this.selectNotebook(notebook.id);
            this.closeModals();
            form.reset();
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    async deleteNotebook(id) {
        try {
            await this.api(`/notebooks/${id}`, { method: 'DELETE' });

            // Invalidate cache
            this.cache.delete('notebooks');
            this.cache.deletePattern(`sources_${id}`);
            this.cache.deletePattern(`notes_${id}`);
            this.cache.deletePattern(`chat_${id}`);

            this.notebooks = this.notebooks.filter(nb => nb.id !== id);

            if (this.currentNotebook?.id === id) {
                this.currentNotebook = null;
                this.clearContentAreas();
                this.switchView('landing');
            }

            this.renderNotebooks();
            this.updateFooter();
        } catch (error) {
            this.showError('Failed to delete notebook: ' + error.message);
        }
    }

    clearContentAreas() {
        const sourcesContainer = document.getElementById('sourcesGrid');
        sourcesContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M20 8 L44 8 L48 12 L48 56 L20 56 Z"/>
                    <polyline points="44,8 44,12 48,12"/>
                    <line x1="28" y1="24" x2="40" y2="24"/>
                    <line x1="28" y1="32" x2="40" y2="32"/>
                    <line x1="28" y1="40" x2="36" y2="40"/>
                </svg>
                <p>Add sources to get started</p>
                <p class="empty-hint">Supports PDF, TXT, MD, DOCX, HTML</p>
            </div>
        `;

        const notesContainer = document.getElementById('notesList');
        notesContainer.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 4 L36 4 L40 8 L40 44 L12 44 Z"/>
                    <polyline points="36,4 36,8 40,8"/>
                </svg>
                <p>No notes yet</p>
                <p class="empty-hint">Use transforms to generate notes from sources</p>
            </div>
        `;

        const chatContainer = document.getElementById('chatMessages');
        chatContainer.innerHTML = `
            <div class="chat-welcome">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="20" cy="12" r="6"/>
                    <path d="M8 38 C8 28 14 22 20 22 C26 22 32 28 32 38"/>
                </svg>
                <h3>Chat with sources</h3>
                <p>Ask questions about notebook contents</p>
            </div>
        `;

        this.currentChatSession = null;
    }

    // Sources methods
    async loadSources() {
        if (!this.currentNotebook) return;

        const container = document.getElementById('sourcesGrid');
        const template = document.getElementById('sourceTemplate');

        try {
            // Try to get from cache first
            const cacheKey = `sources_${this.currentNotebook.id}`;
            const cached = this.cache.get(cacheKey);

            // Get latest data from server
            const sources = await this.api(`/notebooks/${this.currentNotebook.id}/sources`);

            // Update cache
            this.cache.set(cacheKey, sources);

            if (sources.length === 0) {
                this.clearContentAreas();
                return;
            }

            container.innerHTML = '';

            sources.forEach(source => {
                const clone = template.content.cloneNode(true);
                const card = clone.querySelector('.source-card');

                card.dataset.id = source.id;
                card.dataset.status = source.status || 'completed';
                card.querySelector('.source-type-badge').textContent = source.type;
                card.querySelector('.source-name').textContent = source.name;
                card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size) || 'Text source';
                card.querySelector('.chunk-count').textContent = source.chunk_count || 0;

                // Add progress indicator for processing sources
                if (source.status === 'processing' || source.status === 'pending') {
                    const progressIndicator = document.createElement('div');
                    progressIndicator.className = 'source-progress';
                    progressIndicator.innerHTML = `
                        <div class="progress-bar-small">
                            <div class="progress-fill-small" style="width: ${this.getProgressValue(source.status, source.progress || 0)}%"></div>
                        </div>
                        <div class="progress-text-small">${this.getStatusText(source.status, source.progress || 0)}</div>
                    `;
                    card.appendChild(progressIndicator);
                }

                // Add error indicator
                if (source.status === 'error') {
                    const errorIndicator = document.createElement('div');
                    errorIndicator.className = 'source-error';
                    errorIndicator.textContent = source.error_msg || 'Processing failed';
                    card.appendChild(errorIndicator);
                }

                const icon = this.getSourceIcon(source.type);
                card.querySelector('.source-icon').innerHTML = icon;

                const removeBtn = card.querySelector('.btn-remove-source');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeSource(source.id);
                });

                // Add click event to open resource preview
                card.addEventListener('click', () => {
                    this.resourceTabManager.openTab(source);
                });

                container.appendChild(clone);
            });

            // Start polling for processing sources
            this.startPollingForProcessingSources(sources);

            this.updateFooter();
        } catch (error) {
            console.error('Failed to load sources:', error);
        }
    }

    // Start polling for any processing sources
    startPollingForProcessingSources(sources) {
        if (!this.processingSources) {
            this.processingSources = new Map();
        }

        // Clear existing polling intervals
        this.clearPollingIntervals();

        sources.forEach(source => {
            if (source.status === 'processing' || source.status === 'pending') {
                // Add to processing list
                this.processingSources.set(source.id, source);
                // Start polling for this source
                this.pollSourceStatus(source.id);
            }
        });
    }

    // Clear all polling intervals
    clearPollingIntervals() {
        if (this.pollingIntervals) {
            this.pollingIntervals.forEach(clearInterval);
            this.pollingIntervals = [];
        } else {
            this.pollingIntervals = [];
        }
    }

    getSourceIcon(type) {
        const icons = {
            file: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4 L24 4 L30 10 L30 36 L10 36 Z"/><polyline points="24,4 24,10 30,10"/></svg>',
            text: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 6 L32 6"/><path d="M8 12 L32 12"/><path d="M8 18 L28 18"/><path d="M8 24 L32 24"/><path d="M8 30 L24 30"/></svg>',
            url: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20 C12 14 16 10 22 10 C28 10 32 14 32 20 C32 26 28 30 22 30"/><path d="M28 20 C28 26 24 30 18 30 C12 30 8 26 8 20 C8 14 12 10 18 10"/></svg>',
            insight: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="20" cy="20" r="14"/><path d="M20 12 L20 22"/><path d="M20 26 L20 28"/><circle cx="20" cy="20" r="8" stroke-dasharray="2 2"/></svg>',
        };
        return icons[type] || icons.file;
    }

    formatFileSize(bytes) {
        if (!bytes) return null;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Render sources from data (for public notebooks)
    async renderSourcesList(sources) {
        const container = document.getElementById('sourcesGrid');
        const template = document.getElementById('sourceTemplate');

        if (!container || !template) return;

        container.innerHTML = '';

        if (sources.length === 0) {
            this.clearContentAreas();
            return;
        }

        sources.forEach(source => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.source-card');

            card.dataset.id = source.id;
            card.querySelector('.source-type-badge').textContent = source.type;
            card.querySelector('.source-name').textContent = source.name;
            card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size) || 'Text source';
            card.querySelector('.chunk-count').textContent = source.chunk_count || 0;

            const icon = this.getSourceIcon(source.type);
            card.querySelector('.source-icon').innerHTML = icon;

            // Remove delete button for public notebooks
            const removeBtn = card.querySelector('.btn-remove-source');
            if (removeBtn) {
                removeBtn.style.display = 'none';
            }

            // Add click event to open resource preview
            card.addEventListener('click', () => {
                this.resourceTabManager.openTab(source);
            });

            container.appendChild(clone);
        });

        this.updateFooter();
    }

    // Render notes from data (for public notebooks)
    async renderNotesList(notes) {
        const container = document.getElementById('notesList');
        const template = document.getElementById('noteTemplate');

        if (!container || !template) return;

        container.innerHTML = '';

        if (notes.length === 0) {
            return;
        }

        notes.forEach(note => {
            const clone = template.content.cloneNode(true);
            const item = clone.querySelector('.note-item');

            item.dataset.id = note.id;
            item.querySelector('.note-type-badge').textContent = this.noteTypeNameMap[note.type] || note.type.toUpperCase();
            item.querySelector('.note-title').textContent = note.title;

            const plainText = note.content
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/`/g, '')
                .replace(/\ \[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\n+/g, ' ')
                .trim();

            item.querySelector('.note-preview').textContent = plainText;
            item.querySelector('.note-date').textContent = this.formatDate(note.created_at);
            item.querySelector('.note-sources').textContent = `${note.source_ids?.length || 0} sources`;

            // Remove delete button for public notebooks
            const deleteBtn = item.querySelector('.btn-delete-note');
            if (deleteBtn) {
                deleteBtn.style.display = 'none';
            }

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-note')) {
                    this.viewNote(note);
                }
            });

            container.appendChild(clone);
        });

        this.updateFooter();
    }

    showAddSourceModal() {
        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }
        document.getElementById('addSourceModal').classList.add('active');
        document.getElementById('modalOverlay').classList.add('active');
    }

    async handleFileUpload(e) {
        const files = e.target.files;
        if (!files.length) return;

        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        // Close modal immediately
        this.closeModals();

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('notebook_id', this.currentNotebook.id);

            try {
                const response = await this.api('/upload', {
                    method: 'POST',
                    body: formData,
                });
                
                // Add to processing list and show card immediately
                this.addProcessingSource(response);
                
                // Add card to UI immediately with progress
                this.addSourceCardToGrid(response);
                
                // Start polling for status
                this.pollSourceStatus(response.id);
            } catch (error) {
                this.showError(`Upload failed: ${file.name} - ${error.message}`);
            }
        }

        await this.updateCurrentNotebookCounts();
        document.getElementById('fileInput').value = '';
    }

    addProcessingSource(source) {
        // Add to the sources list with processing status
        if (!this.processingSources) {
            this.processingSources = new Map();
        }
        this.processingSources.set(source.id, source);
    }
    
    addSourceCardToGrid(source) {
        const sourcesGrid = document.getElementById('sourcesGrid');
        if (!sourcesGrid) return;
        
        const template = document.getElementById('sourceTemplate');
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.source-card');
        
        card.dataset.id = source.id;
        card.dataset.status = source.status || 'pending';
        card.querySelector('.source-type-badge').textContent = source.type;
        card.querySelector('.source-name').textContent = source.name;
        card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size) || 'Waiting...';
        card.querySelector('.chunk-count').textContent = '0';
        
        const icon = this.getSourceIcon(source.type);
        card.querySelector('.source-icon').innerHTML = icon;
        
        // Add progress indicator for processing sources
        if (source.status === 'processing' || source.status === 'pending') {
            const progressIndicator = document.createElement('div');
            progressIndicator.className = 'source-progress';
            progressIndicator.innerHTML = `
                <div class="progress-bar-small">
                    <div class="progress-fill-small" style="width: ${source.progress || 0}%"></div>
                </div>
                <div class="progress-text-small">${this.getStatusText(source.status, source.progress || 0)}</div>
            `;
            card.appendChild(progressIndicator);
        }
        
        // Add remove button handler
        const removeBtn = card.querySelector('.btn-remove-source');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeSource(source.id);
        });
        
        // Add click event to open resource preview
        card.addEventListener('click', () => {
            this.resourceTabManager.openTab(source);
        });
        
        // Insert at the beginning of the grid
        sourcesGrid.insertBefore(clone, sourcesGrid.firstChild);
    }

    async pollSourceStatus(sourceId) {
        console.log(`[Poll] Starting poll for source: ${sourceId}`);
        const pollInterval = setInterval(async () => {
            try {
                const response = await this.api(`/sources/${sourceId}`);
                const source = response;

                console.log(`[Poll] Source ${sourceId}: status=${source.status}, progress=${source.progress}`);

                // Update processing status
                if (this.processingSources) {
                    this.processingSources.set(sourceId, source);
                    this.updateProcessingUI();
                }

                // Check if processing is complete or failed
                if (source.status === 'completed' || source.status === 'error') {
                    console.log(`[Poll] Source ${sourceId} finished: ${source.status}`);
                    clearInterval(pollInterval);

                    // Show 100% completion message
                    if (this.processingSources) {
                        // Keep status as 'processing' to show progress bar, but set progress to 100
                        this.processingSources.set(sourceId, { ...source, status: 'processing', progress: 100 });
                        this.updateProcessingUI();
                    }

                    // Wait 2 seconds before removing progress bar
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Update card with final data (removes progress bar)
                    await this.updateSourceCard(sourceId);

                    // Remove from processing list
                    if (this.processingSources && this.processingSources.has(sourceId)) {
                        this.processingSources.delete(sourceId);
                    }
                }
            } catch (error) {
                console.error('Failed to poll source status:', error);
                clearInterval(pollInterval);
            }
        }, 1000); // Poll every 1 second for smoother progress

        // Track the interval for cleanup
        if (!this.pollingIntervals) {
            this.pollingIntervals = [];
        }
        this.pollingIntervals.push(pollInterval);
    }

    updateProcessingUI() {
        if (!this.processingSources || this.processingSources.size === 0) {
            return;
        }
        
        // Update each processing source card
        for (const [id, source] of this.processingSources) {
            const card = document.querySelector(`.source-card[data-id="${id}"]`);
            if (!card) {
                // Card doesn't exist, reload sources
                this.loadSources();
                return;
            }
            
            // Remove existing progress indicator if any
            const existingProgress = card.querySelector('.source-progress');
            if (existingProgress) {
                existingProgress.remove();
            }
            
            // Remove existing error if any
            const existingError = card.querySelector('.source-error');
            if (existingError) {
                existingError.remove();
            }
            
            // If processing or error, add progress indicator
            if (source.status === 'processing' || source.status === 'pending' || source.status === 'error') {
                const progressIndicator = document.createElement('div');
                progressIndicator.className = 'source-progress';

                const statusText = this.getStatusText(source.status, source.progress);
                const isError = source.status === 'error';
                const progressValue = this.getProgressValue(source.status, source.progress || 0);

                progressIndicator.innerHTML = `
                    <div class="progress-bar-small ${isError ? 'error' : ''}">
                        <div class="progress-fill-small" style="width: ${progressValue}%"></div>
                    </div>
                    <div class="progress-text-small">${statusText}</div>
                `;

                card.appendChild(progressIndicator);
                card.dataset.status = source.status;
            } else if (source.status === 'completed') {
                // Show 100% progress before removing
                const progressIndicator = document.createElement('div');
                progressIndicator.className = 'source-progress';

                const statusText = this.getStatusText('processing', 100);

                progressIndicator.innerHTML = `
                    <div class="progress-bar-small">
                        <div class="progress-fill-small" style="width: 100%"></div>
                    </div>
                    <div class="progress-text-small">${statusText}</div>
                `;

                card.appendChild(progressIndicator);
            }
        }
    }

    getStatusText(status, progress) {
        switch (status) {
            case 'pending':
                return 'Waiting to process...';
            case 'processing':
                return `Processing... ${progress}%`;
            case 'completed':
                return 'Done ✓';
            case 'error':
                return 'Processing failed';
            default:
                return `${progress}%`;
        }
    }

    getProgressValue(status, progress) {
        switch (status) {
            case 'pending':
                return 1; // Show at least 1% for pending state
            case 'processing':
            case 'completed':
            case 'error':
                return progress;
            default:
                return progress || 1;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async updateSourceCard(sourceId) {
        try {
            const source = await this.api(`/sources/${sourceId}`);
            const card = document.querySelector(`.source-card[data-id="${sourceId}"]`);
            if (!card) {
                // Card not found, reload all sources
                await this.loadSources();
                return;
            }
            
            // Update card content
            card.dataset.status = source.status || '';
            
            // Remove progress indicator
            const progress = card.querySelector('.source-progress');
            if (progress) {
                progress.remove();
            }
            
            // Remove error indicator
            const error = card.querySelector('.source-error');
            if (error) {
                error.remove();
            }
            
            // Update file size display
            if (source.file_size) {
                card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size);
            }
            
            // Update chunk count
            card.querySelector('.chunk-count').textContent = source.chunk_count || 0;
            
            // Add click handler if not already added
            if (!card.hasAttribute('data-handled')) {
                card.setAttribute('data-handled', 'true');
                const removeBtn = card.querySelector('.btn-remove-source');
                if (removeBtn) {
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeSource(source.id);
                    });
                }
                
                card.addEventListener('click', () => {
                    this.resourceTabManager.openTab(source);
                });
            }
        } catch (error) {
            console.error('Failed to update source card:', error);
            // Fallback to reload all sources
            await this.loadSources();
        }
    }

    async handleTextSource(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        this.showLoading('Processing...');

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/sources`, {
                method: 'POST',
                body: JSON.stringify({
                    name: data.get('name'),
                    type: 'text',
                    content: data.get('content'),
                }),
            });

            this.hideLoading();
            this.closeModals();
            form.reset();
            await this.loadSources();
            await this.updateCurrentNotebookCounts();
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    async handleURLSource(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        this.showLoading('Fetching URL content...');

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/sources`, {
                method: 'POST',
                body: JSON.stringify({
                    name: data.get('name') || data.get('url'),
                    type: 'url',
                    url: data.get('url'),
                }),
            });

            this.hideLoading();
            this.closeModals();
            form.reset();
            await this.loadSources();
            await this.updateCurrentNotebookCounts();
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('dropZone').classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (!files.length) return;

        document.getElementById('fileInput').files = files;
        this.handleFileUpload({ target: { files } });
    }

    async removeSource(id) {
        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/sources/${id}`, {
                method: 'DELETE',
            });
            await this.loadSources();
            await this.updateCurrentNotebookCounts();
        } catch (error) {
            this.showError('Failed to remove source');
        }
    }

    // Notes methods
    async loadNotes() {
        if (!this.currentNotebook) return;

        const container = document.getElementById('notesList');
        const template = document.getElementById('noteTemplate');
        const countHeader = document.querySelector('.section-notes .panel-title');

        try {
            // Try to get from cache first
            const cacheKey = `notes_${this.currentNotebook.id}`;
            const cached = this.cache.get(cacheKey);

            // Get latest data from server
            const notes = await this.api(`/notebooks/${this.currentNotebook.id}/notes`);

            // Update cache
            this.cache.set(cacheKey, notes);
            
            if (countHeader) {
                countHeader.textContent = `Notes (${notes.length})`;
            }

            if (notes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 4 L36 4 L40 8 L40 44 L12 44 Z"/>
                            <polyline points="36,4 36,8 40,8"/>
                        </svg>
                        <p>No notes yet</p>
                        <p class="empty-hint">Use transforms to generate notes from sources</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';

            notes.forEach(note => {
                const clone = template.content.cloneNode(true);
                const item = clone.querySelector('.note-item');

                item.dataset.id = note.id;
                item.querySelector('.note-type-badge').textContent = this.noteTypeNameMap[note.type] || note.type.toUpperCase();
                item.querySelector('.note-title').textContent = note.title;

                const plainText = note.content
                    .replace(/^#+\s+/gm, '')
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .replace(/`/g, '')
                    .replace(/\ \[([^\]]+)\]\([^)]+\)/g, '$1')
                    .replace(/\n+/g, ' ')
                    .trim();

                item.querySelector('.note-preview').textContent = plainText;
                item.querySelector('.note-date').textContent = this.formatDate(note.created_at);
                item.querySelector('.note-sources').textContent = `${note.source_ids?.length || 0} sources`;

                const deleteBtn = item.querySelector('.btn-delete-note');
                deleteBtn.addEventListener('click', () => {
                    this.deleteNote(note.id);
                });

                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.btn-delete-note')) {
                        this.viewNote(note);
                    }
                });

                container.appendChild(clone);
            });

            this.updateFooter();
        } catch (error) {
            console.error('Failed to load notes:', error);
        }
    }

    async viewNote(note) {
        // Debug: log note metadata
        console.log('viewNote - metadata:', note.metadata);
        console.log('viewNote - image_url:', note.metadata?.image_url);
        console.log('viewNote - currentPublicToken:', this.currentPublicToken);

        // Rewrite image URLs for public notebooks
        const content = this.rewriteImageUrlsForPublic(note.content);
        const renderedContent = marked.parse(content);

        // Infographic error message HTML
        let infographicErrorHTML = '';
        if (note.type === 'infograph' && note.metadata?.image_error) {
            const fullPrompt = note.content + '';
            const escapedPrompt = this.escapeHtml(fullPrompt);
            const escapedError = this.escapeHtml(note.metadata.image_error);

            infographicErrorHTML = `
                <div class="infographic-error-banner">
                    <div class="error-banner-content">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="10" cy="10" r="8"/>
                            <line x1="10" y1="7" x2="10" y2="13"/>
                            <line x1="10" y1="16" x2="10" y2="16"/>
                        </svg>
                        <div>
                            <strong>Image generation failed</strong>
                            <p>${escapedError}</p>
                        </div>
                    </div>
                    <div class="error-banner-prompt">
                        <strong>Generated Prompt (can be used for manual generation):</strong>
                        <pre>${escapedPrompt}</pre>
                    </div>
                </div>
            `;
        }

        // Rewrite image URL for infographics if present
        const originalImageUrl = note.metadata?.image_url || null;
        const infographicImageUrl = originalImageUrl
            ? this.rewriteImageUrlsForPublic(originalImageUrl)
            : null;

        console.log('viewNote - originalImageUrl:', originalImageUrl);
        console.log('viewNote - infographicImageUrl:', infographicImageUrl);

        const infographicHTML = infographicImageUrl
            ? `<div class="infographic-container">
                 <img src="${infographicImageUrl}" alt="Infographic" class="infographic-image" onerror="console.error('Failed to load image:', this.src)">
                 <div class="infographic-actions">
                    <a href="${infographicImageUrl}" target="_blank" class="btn-text">View full size</a>
                 </div>
               </div>`
            : '';

        // PPT Slider HTML
        let pptSliderHTML = '';
        if (note.metadata?.slides && note.metadata.slides.length > 0) {
            const slides = note.metadata.slides.map(src => {
                const rewritten = this.rewriteImageUrlsForPublic(src);
                console.log('viewNote - slide original:', src, 'rewritten:', rewritten);
                return rewritten;
            });
            pptSliderHTML = `
                <div class="ppt-viewer-container" id="pptViewer">
                    <div class="ppt-slides-wrapper">
                        ${slides.map((src, index) => `
                            <div class="ppt-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                                <img src="${src}" alt="Slide ${index + 1}" onerror="console.error('Failed to load slide:', this.src)">
                                <div class="ppt-slide-counter">${index + 1} / ${slides.length}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="ppt-controls">
                        <button class="btn-ppt-nav prev" id="btnPptPrev">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <button class="btn-ppt-nav next" id="btnPptNext">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>
                </div>
            `;
        }

        // Determine if we should show the text content
        const showMarkdownContent = (note.type !== 'infograph' && note.type !== 'ppt') || (!note.metadata?.image_url && !note.metadata?.slides);

        // Show the Note tab button
        const tabBtnNote = document.getElementById('tabBtnNote');
        if (tabBtnNote) {
            tabBtnNote.style.display = 'flex';
        }

        // Remove existing note view if any
        const existingNoteView = document.querySelector('.note-view-container');
        if (existingNoteView) {
            existingNoteView.remove();
        }

        // Create note view container and insert it after chat-messages-wrapper
        const noteViewHTML = `
            <div class="note-view-container">
                <div class="note-view-header">
                    <div class="note-view-info">
                        <span class="note-view-type">${note.type}</span>
                        <span class="note-view-title-text">${note.title}</span>
                    </div>
                    <div class="note-view-actions">
                        <button class="btn-copy-note" id="btnCopyNote" title="Copy Markdown">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="10" height="10" rx="1"/>
                                <path d="M7 3 L7 1 C7 1 13 1 13 1 L13 13 L11 13"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="note-view-content">
                    ${infographicErrorHTML}
                    ${infographicHTML}
                    ${pptSliderHTML}
                    <div class="markdown-content" style="${showMarkdownContent ? '' : 'display:none'}">${renderedContent}</div>
                </div>
            </div>
        `;

        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        chatWrapper.insertAdjacentHTML('afterend', noteViewHTML);

        // PPT Navigation Logic
        if (note.metadata?.slides) {
            let currentSlide = 0;
            const slidesCount = note.metadata.slides.length;
            const slideElements = document.querySelectorAll('.ppt-slide');
            
            const showSlide = (n) => {
                slideElements[currentSlide].classList.remove('active');
                currentSlide = (n + slidesCount) % slidesCount;
                slideElements[currentSlide].classList.add('active');
            };

            document.getElementById('btnPptPrev').addEventListener('click', () => showSlide(currentSlide - 1));
            document.getElementById('btnPptNext').addEventListener('click', () => showSlide(currentSlide + 1));
            
            // Key navigation
            const keyHandler = (e) => {
                if (e.key === 'ArrowLeft') showSlide(currentSlide - 1);
                if (e.key === 'ArrowRight') showSlide(currentSlide + 1);
            };
            document.addEventListener('keydown', keyHandler);
            // Cleanup handler on container remove? We'll leave it for now or add observer
        }

        // Render Mermaid diagrams if any
        if (window.mermaid) {
            try {
                mermaid.initialize({ 
                    startOnLoad: false, 
                    theme: 'base',
                    securityLevel: 'loose',
                    fontFamily: 'var(--font-sans)',
                    themeVariables: {
                        // Vibrant WeChat Green Theme
                        primaryColor: '#ecfdf5', // Lighter, more vibrant green background
                        primaryTextColor: '#065f46', // Deep emerald for text
                        primaryBorderColor: '#10b981', // Bright emerald border
                        lineColor: '#10b981', // Bright line color
                        secondaryColor: '#f0fdf4',
                        tertiaryColor: '#ffffff',
                        fontSize: '14px',
                        mainBkg: '#ecfdf5',
                        nodeBorder: '#10b981',
                        clusterBkg: '#f0fdf4',
                        // Mindmap specific vibrancy
                        nodeTextColor: '#065f46',
                        edgeColor: '#34d399' // Slightly lighter green for edges
                    },
                    mindmap: {
                        useMaxWidth: true,
                        padding: 20
                    }
                });
                
                const contentArea = document.querySelector('.note-view-content');
                const mermaidBlocks = contentArea.querySelectorAll('pre code.language-mermaid');
                
                // Helper to fix common mermaid errors
                const sanitizeMermaid = (code) => {
                    let sanitized = code.trim();

                    // 1. If it's a graph and has unquoted brackets, try to wrap them
                    if (sanitized.startsWith('graph')) {
                        // Fix things like: A --> socket() --> B
                        sanitized = sanitized.replace(/(\s+)-->(\s+)([^"\s][^-\n>]*\([^)]*\)[^-\n>]*)/g, '$1-->$2"$3"');
                        sanitized = sanitized.replace(/([^"\s][^-\n>]*\([^)]*\)[^-\n>]*)\s+-->/g, '"$1" -->');
                    }

                    // 2. Fix mindmap - handle special characters in node labels
                    if (sanitized.startsWith('mindmap')) {
                        const lines = sanitized.split('\n');
                        const processedLines = [];

                        for (let i = 0; i < lines.length; i++) {
                            let line = lines[i];
                            const trimmed = line.trim();

                            // Skip empty lines and the mindmap declaration
                            if (!trimmed || trimmed === 'mindmap') {
                                processedLines.push(line);
                                continue;
                            }

                            // Fix root - handle various formats
                            // Formats to handle:
                            // - root((content)) - already correct
                            // - root(content) - need double parens
                            // - root content - need double parens
                            // - root "content" - need double parens
                            if (trimmed.startsWith('root')) {
                                // Extract content from root
                                let rootContent = '';
                                // Match root followed by content in various formats
                                const rootMatch = trimmed.match(/^root\s*(?:\(?\(?["']?(.+?)["']?\)?\)?\))?$/);
                                if (rootMatch && rootMatch[1]) {
                                    rootContent = rootMatch[1].replace(/&quot;/g, '').replace(/["']/g, '').trim();
                                    const indentMatch = line.match(/^(\s*)/);
                                    const indent = indentMatch ? indentMatch[1] : '';
                                    processedLines.push(indent + 'root((' + rootContent + '))');
                                    continue;
                                }
                                // Fallback: just wrap everything after "root" in double parens
                                line = line.replace(/root\s*(.+)/, 'root(($1))');
                                processedLines.push(line);
                                continue;
                            }

                            // For other nodes, check if they contain special characters that need quoting
                            // Special chars: parentheses, brackets, braces, quotes, colons, semicolons
                            const hasSpecialChars = /[\(\)\[\]\{\}"':;,\s]{2,}/.test(trimmed);
                            const alreadyQuoted = /^["'].*["']$/.test(trimmed) || /^\(.*\)$/.test(trimmed) || /^\[.*\]$/.test(trimmed);

                            if (hasSpecialChars && !alreadyQuoted && trimmed.length > 0) {
                                // Extract indentation and node content
                                const indentMatch = line.match(/^(\s*)/);
                                const indent = indentMatch ? indentMatch[1] : '';
                                const content = trimmed;

                                // Wrap in quotes and preserve the original brackets for styling
                                // Replace inner parentheses that are part of the content with quoted version
                                processedLines.push(indent + '"' + content.replace(/"/g, '\\"') + '"');
                            } else {
                                processedLines.push(line);
                            }
                        }

                        sanitized = processedLines.join('\n');
                    }

                    return sanitized;
                };

                for (let i = 0; i < mermaidBlocks.length; i++) {
                    const block = mermaidBlocks[i];
                    const pre = block.parentElement;
                    const rawCode = block.textContent;
                    const cleanCode = sanitizeMermaid(rawCode);
                    
                    const id = `mermaid-diag-${Date.now()}-${i}`;
                    
                    try {
                        const { svg } = await mermaid.render(id, cleanCode);
                        const container = document.createElement('div');
                        container.className = 'mermaid-diagram';
                        container.innerHTML = svg;
                        pre.parentNode.replaceChild(container, pre);
                    } catch (renderErr) {
                        console.error('Mermaid Render Error:', renderErr);
                        // Final fallback: If rendering failed, try one more time by stripping ALL parentheses from labels
                        try {
                            const lastResort = cleanCode.replace(/\(|\)/g, '');
                            const { svg } = await mermaid.render(`${id}-retry`, lastResort);
                            const container = document.createElement('div');
                            container.className = 'mermaid-diagram';
                            container.innerHTML = svg;
                            pre.parentNode.replaceChild(container, pre);
                        } catch (e) {
                            pre.innerHTML = `<div style="color:red; font-size:12px; padding:10px;">Render failed: ${renderErr.message}</div>`;
                        }
                    }
                }
            } catch (err) {
                console.error('Mermaid general error:', err);
            }
        }

        // Render MathJax if available
        if (window.MathJax && window.MathJax.typesetPromise) {
            try {
                await MathJax.typesetPromise([document.querySelector('.note-view-content')]);
            } catch (e) {
                console.warn('MathJax rendering error:', e);
            }
        }

        // Render ECharts if note type is data_chart
        if (note.type === 'data_chart') {
            try {
                const contentArea = document.querySelector('.note-view-content');
                const markdownContent = document.querySelector('.markdown-content');

                // Try to parse the note content as JSON for chart options
                let charts = [];
                try {
                    // Check if content contains JSON array or object
                    const jsonMatch = note.content.match(/(\[[\s\S]*\])|(\{[\s\S]*\})/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (Array.isArray(parsed)) {
                            // New format: array of {title, option}
                            charts = parsed.map(item => ({
                                title: item.title || '',
                                option: item.option
                            }));
                        } else if (parsed.charts) {
                            // Old format: {charts: [{title, option}]}
                            charts = parsed.charts.map(item => ({
                                title: item.title || '',
                                option: item.option
                            }));
                        } else if (parsed.option) {
                            // Single chart format: {option: {...}}
                            charts = [{ title: '', option: parsed.option }];
                        }
                    }
                } catch (e) {
                    console.log('Failed to parse chart JSON:', e);
                }

                if (charts.length > 0) {
                    // Create chart containers
                    const chartContainer = document.createElement('div');
                    chartContainer.className = 'charts-container';

                    charts.forEach((chart, index) => {
                        const chartWrapper = document.createElement('div');
                        chartWrapper.className = 'chart-wrapper';

                        const chartDiv = document.createElement('div');
                        chartDiv.className = 'chart-div';
                        chartDiv.id = `chart-${note.id}-${index}`;

                        chartWrapper.appendChild(chartDiv);
                        chartContainer.appendChild(chartWrapper);

                        // Initialize ECharts
                        const echartsInstance = echarts.init(chartDiv, {
                            renderer: 'canvas',
                            useDirtyRect: true
                        });

                        echartsInstance.setOption(chart.option);

                        // Resize after 2 seconds to ensure proper display
                        setTimeout(() => {
                            echartsInstance.resize();
                        }, 2000);

                        // Responsive resize
                        window.addEventListener('resize', () => {
                            echartsInstance.resize();
                        });
                    });

                    // Insert charts before markdown content
                    contentArea.insertBefore(chartContainer, markdownContent);
                    markdownContent.style.display = 'none';
                }
            } catch (error) {
                console.error('Failed to render charts:', error);
            }
        }

        // Switch to note tab
        this.switchPanelTab('note');

        // Copy button
        const copyBtn = document.getElementById('btnCopyNote');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(note.content);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="4,8 6,10 12,4"/>
                    </svg>
                `;
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.classList.remove('copied');
                }, 2000);
                this.setStatus('Copied!');
            } catch (err) {
                this.showError('Failed to copy');
            }
        });

        // Highlight the selected note in the sidebar
        document.querySelectorAll('.note-item').forEach(el => {
            el.classList.remove('selected');
        });
        const noteItem = document.querySelector(`.note-item[data-id="${note.id}"]`);
        if (noteItem) {
            noteItem.classList.add('selected');
        }
    }

    async deleteNote(id) {
        // Immediately remove from UI
        const noteCard = document.querySelector(`.compact-note-card[data-note-id="${id}"]`);
        if (noteCard) {
            noteCard.remove();
        }

        // Also remove from notes list sidebar
        const noteItem = document.querySelector(`.note-item[data-id="${id}"]`);
        if (noteItem) {
            noteItem.remove();
        }

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/notes/${id}`, {
                method: 'DELETE',
            });
            await this.loadNotes();
            await this.updateCurrentNotebookCounts();

            // If notes_list tab is active or visible, refresh it
            const tabBtnNotesList = document.getElementById('tabBtnNotesList');
            if (tabBtnNotesList && !tabBtnNotesList.classList.contains('hidden')) {
                this.renderNotesCompactGrid();
            }
        } catch (error) {
            this.showError('Failed to delete note');
            // Reload to restore if deletion failed
            await this.loadNotes();
            this.renderNotesCompactGrid();
        }
    }

    // Transform methods
    async handleTransform(type, element) {
        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        // Insight button: open insight.rpcx.io in new window
        if (type === 'insight') {
            window.open('https://insight.rpcx.io', '_blank');
            return;
        }

        const sources = await this.api(`/notebooks/${this.currentNotebook.id}/sources`);
        if (sources.length === 0) {
            this.showError('Please add sources first');
            return;
        }

        const customPrompt = document.getElementById('customPrompt').value;
        const typeName = this.noteTypeNameMap[type] || 'Content';

        // 1. Start animation
        if (element) {
            element.classList.add('loading');
        }

        // 2. Add placeholder note
        const notesContainer = document.getElementById('notesList');
        const template = document.getElementById('noteTemplate');
        const placeholder = template.content.cloneNode(true).querySelector('.note-item');
        
        placeholder.classList.add('placeholder');
        placeholder.querySelector('.note-title').textContent = `Generating${typeName}...`;
        placeholder.querySelector('.note-preview').textContent = 'AI is analyzing your sources and writing notes, please wait...';
        placeholder.querySelector('.note-date').textContent = 'Just now';
        placeholder.querySelector('.note-type-badge').textContent = type.toUpperCase();
        
        // Placeholder: hide delete button for now
        const delBtn = placeholder.querySelector('.btn-delete-note');
        if (delBtn) delBtn.style.display = 'none';
        
        // If“No notes yet”state exists, clear it first
        const emptyState = notesContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        
        notesContainer.prepend(placeholder);
        placeholder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        try {
            const sourceIds = sources.map(s => s.id);
            const requestBody = {
                type: type,
                prompt: customPrompt || undefined,
                source_ids: sourceIds,
                length: 'medium',
                format: 'markdown',
            };

            // Add style parameter for infograph type
            if (type === 'infograph' && this.selectedInfographStyle) {
                requestBody.style = this.selectedInfographStyle;
            }

            const note = await this.api(`/notebooks/${this.currentNotebook.id}/transform`, {
                method: 'POST',
                body: JSON.stringify(requestBody),
            });

            // 3. Stop animation and update placeholder
            if (element) element.classList.remove('loading');

            // Replace placeholder content
            placeholder.classList.remove('placeholder');
            placeholder.dataset.id = note.id;
            placeholder.querySelector('.note-title').textContent = note.title;
            
            const plainText = note.content
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/`/g, '')
                .replace(/\ \[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\n+/g, ' ')
                .trim();
            
            placeholder.querySelector('.note-preview').textContent = plainText;
            placeholder.querySelector('.note-sources').textContent = `${note.source_ids?.length || 0} sources`;

            // Restore delete button and bind events
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteNote(note.id);
                });
            }

            // Bind view event
            placeholder.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-note')) {
                    this.viewNote(note);
                }
            });

            await this.updateCurrentNotebookCounts();
            this.updateFooter();
            document.getElementById('customPrompt').value = '';

            // Check if infographic generation failed
            if (type === 'infograph' && note.metadata?.image_error) {
                this.showWarn(`Infographic image generation failed: ${note.metadata.image_error}\n\nGenerated prompt can be viewed in notes`);
            } else {
                this.setStatus(`Successfully generated ${typeName}`);
            }

            // If type is insight, refresh sources list to show the injected insight report
            if (type === 'insight') {
                await this.loadSources();
            }

            // If notes_list tab is active or visible, refresh it
            const tabBtnNotesList = document.getElementById('tabBtnNotesList');
            if (tabBtnNotesList && !tabBtnNotesList.classList.contains('hidden')) {
                this.renderNotesCompactGrid();
            }
        } catch (error) {
            if (element) element.classList.remove('loading');
            placeholder.remove(); // Remove placeholder on failure
            this.showError(error.message);
        }
    }

    // Chat methods
    async loadChatSessions() {
        if (!this.currentNotebook) return;

        try {
            const sessions = await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions`);
            this.chatSessions = sessions || [];

            // Update session list UI if exists
            const sessionList = document.getElementById('chatSessionList');

            if (sessionList) {
                if (this.chatSessions.length === 0) {
                    sessionList.innerHTML = '<p class="text-muted">No chat history</p>';
                } else {
                    sessionList.innerHTML = sessions.map(session => `
                        <div class="chat-session-item ${session.id === this.currentChatSession ? 'active' : ''}"
                             data-session-id="${session.id}">
                            <div class="session-content">
                                <div class="session-title">${session.title || 'New Chat'}</div>
                                <div class="session-time">${this.formatTime(session.updated_at)}</div>
                            </div>
                            <button class="btn-delete-session" data-session-id="${session.id}" title="Delete chat">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M2 4h10M5 4v8M9 4v8M3 4l1 9M11 4l-1 9"/>
                                </svg>
                            </button>
                        </div>
                    `).join('');

                    // Add click handlers for session switching
                    sessionList.querySelectorAll('.chat-session-item').forEach(item => {
                        const sessionId = item.dataset.sessionId;
                        item.addEventListener('click', (e) => {
                            // Don't switch session if delete button was clicked
                            if (e.target.closest('.btn-delete-session')) return;
                            this.switchChatSession(sessionId);
                        });

                        // Add delete handler
                        const deleteBtn = item.querySelector('.btn-delete-session');
                        if (deleteBtn) {
                            deleteBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this.handleDeleteSession(sessionId);
                            });
                        }
                    });
                }
            }

            // Only reset chat messages view if no current session
            if (!this.currentChatSession) {
                await this.loadNotebookOverview();
            }
        } catch (error) {
            console.error('Failed to load chat:', error);
        }
    }

    // Handle new chat session
    async handleNewChatSession() {
        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        // Check if there's a current session with messages to save
        if (this.currentChatSession) {
            const chatMessages = document.getElementById('chatMessages');
            const messages = chatMessages.querySelectorAll('.chat-message');
            if (messages.length > 0) {
                // Session has messages, it's already saved
                this.currentChatSession = null;
                this.switchPanelTab('chat');
                this.showWelcomeMessage();
                this.setStatus('Started new chat');
                return;
            }
        }

        // If there's no current session, just clear and show welcome
        this.currentChatSession = null;
        this.switchPanelTab('chat');
        this.showWelcomeMessage();
        this.setStatus('Started new chat');
    }

    // Show welcome message
    showWelcomeMessage() {
        const container = document.getElementById('chatMessages');
        container.innerHTML = `
            <div class="chat-welcome">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="20" cy="12" r="6"/>
                    <path d="M8 38 C8 28 14 22 20 22 C26 22 32 28 32 38"/>
                </svg>
                <h3>Chat with sources</h3>
                <p>Ask questions about notebook contents</p>
            </div>
        `;
    }

    // Save current session
    async saveCurrentSession() {
        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        try {
            // If there's a current session, check if it has messages
            if (this.currentChatSession) {
                const chatMessages = document.getElementById('chatMessages');
                const messages = chatMessages.querySelectorAll('.chat-message');
                if (messages.length === 0) {
                    this.setStatus('Current session is empty, no need to save');
                    return;
                }
                await this.loadChatSessions();
                this.setStatus('Session saved');
                return;
            }

            // No current session - show message that empty session doesn't need saving
            this.setStatus('Current session is empty, no need to save');
        } catch (error) {
            console.error('Failed to save session:', error);
            this.showError(`Save failed: ${error.message}`);
        }
    }

    // Switch to a chat session
    switchChatSession(sessionId) {
        this.currentChatSession = sessionId;
        // Switch to chat tab
        this.switchPanelTab('chat');
        // Reload messages for this session
        this.loadChatMessages(sessionId);
        // Update active state in UI
        document.querySelectorAll('.chat-session-item').forEach(item => {
            item.classList.toggle('active', item.dataset.sessionId === sessionId);
        });
    }

    // Load chat messages for a session
    async loadChatMessages(sessionId) {
        if (!this.currentNotebook || !sessionId) return;

        try {
            const session = await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions/${sessionId}`);
            const container = document.getElementById('chatMessages');
            container.innerHTML = ''; // Clear welcome/overview

            // Display all messages
            if (session.messages && session.messages.length > 0) {
                session.messages.forEach(msg => {
                    const sources = msg.sources || [];
                    this.addMessage(msg.role, msg.content, sources, false);
                });
            }

            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error('Failed to load chat messages:', error);
            this.showError('Failed to load chat messages');
        }
    }

    // Handle delete session
    async handleDeleteSession(sessionId) {
        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        if (!confirm('Are you sure you want to delete this chat?')) {
            return;
        }

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions/${sessionId}`, {
                method: 'DELETE'
            });

            // If deleting current session, clear it
            if (this.currentChatSession === sessionId) {
                this.currentChatSession = null;
                await this.loadNotebookOverview();
            }

            // Refresh session list
            this.loadChatSessions();
            this.setStatus('Chat deleted');
        } catch (error) {
            console.error('Failed to delete session:', error);
            this.showError(`Delete failed: ${error.message}`);
        }
    }

    // Handle clear all sessions
    async handleClearSessions() {
        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        const sessions = this.chatSessions || [];
        if (sessions.length === 0) {
            this.showError('No chat history');
            return;
        }

        if (!confirm(`Are you sure you want to clear all chat history? This will delete ${sessions.length} chats.`)) {
            return;
        }

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions`, {
                method: 'DELETE'
            });

            // Clear current session
            this.currentChatSession = null;
            await this.loadNotebookOverview();

            // Refresh session list
            this.loadChatSessions();
            this.setStatus('Chat history cleared');
        } catch (error) {
            console.error('Failed to clear sessions:', error);
            this.showError(`Clear failed: ${error.message}`);
        }
    }

    // Format time for display
    formatTime(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        // Less than 1 minute
        if (diff < 60000) {
            return 'Just now';
        }

        // Less than 1 hour
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)} min ago`;
        }

        // Less than 1 day
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)} hours ago`;
        }

        // Less than 7 days
        if (diff < 604800000) {
            return `${Math.floor(diff / 86400000)} days ago`;
        }

        // Otherwise show date
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${month}-${day}`;
    }

    async loadNotebookOverview() {
        if (!this.currentNotebook) return;

        // Only show welcome message when there's no current session
        // Overview should only be shown when there's an active session with summary
        if (!this.currentChatSession) {
            this.showWelcomeMessage();
            return;
        }

        // If there's a current session, try to load the session's summary from metadata
        try {
            const session = await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions/${this.currentChatSession}`);
            if (session.metadata && session.metadata.summary) {
                // Show session summary if available
                this.displayOverview({
                    summary: session.metadata.summary,
                    questions: []
                });
            } else {
                this.showWelcomeMessage();
            }
        } catch (error) {
            console.error('Failed to load session summary:', error);
            this.showWelcomeMessage();
        }
    }

    displayOverview(overview) {
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';

        // Create overview card
        const overviewCard = document.createElement('div');
        overviewCard.className = 'chat-overview';

        // Summary section
        if (overview.summary && overview.summary.trim()) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'overview-summary';
            summaryDiv.innerHTML = `
                <div class="overview-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>Notebook Overview</span>
                </div>
                <div class="overview-content">${overview.summary}</div>
            `;
            overviewCard.appendChild(summaryDiv);
        }

        // Questions section
        if (overview.questions && overview.questions.length > 0) {
            const questionsDiv = document.createElement('div');
            questionsDiv.className = 'overview-questions';
            questionsDiv.innerHTML = `
                <div class="overview-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <path d="M12 17h.01"></path>
                    </svg>
                    <span>Explore Questions</span>
                </div>
            `;

            const questionsList = document.createElement('ul');
            overview.questions.forEach((question, index) => {
                const li = document.createElement('li');
                li.className = 'overview-question';
                li.textContent = `${index + 1}. ${question}`;
                li.addEventListener('click', () => {
                    const input = document.getElementById('chatInput');
                    input.value = question;
                    input.focus();
                });
                questionsList.appendChild(li);
            });

            questionsDiv.appendChild(questionsList);
            overviewCard.appendChild(questionsDiv);
        }

        container.appendChild(overviewCard);
        this.currentChatSession = null;
    }

    async handleChat(e) {
        e.preventDefault();

        if (!this.currentNotebook) {
            this.showError('Please select a notebook first');
            return;
        }

        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message) return;

        this.addMessage('user', message);
        input.value = '';

        const sources = await this.api(`/notebooks/${this.currentNotebook.id}/sources`);
        if (sources.length === 0) {
            this.addMessage('assistant', 'Please add some sources to this notebook first.');
            return;
        }

        this.setStatus('Thinking...');

        try {
            const response = await this.api(`/notebooks/${this.currentNotebook.id}/chat`, {
                method: 'POST',
                body: JSON.stringify({
                    message: message,
                    session_id: this.currentChatSession || undefined,
                }),
            });

            this.addMessage('assistant', response.message, response.sources, response.metadata);
            this.currentChatSession = response.session_id;
            this.setStatus('Ready');
        } catch (error) {
            this.addMessage('assistant', `Error: ${error.message}`);
            this.setStatus('Error');
        }
    }

    addMessage(role, content, sources = [], metadata = null) {
        const container = document.getElementById('chatMessages');
        const template = document.getElementById('messageTemplate');

        const welcome = container.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const clone = template.content.cloneNode(true);
        const message = clone.querySelector('.chat-message');

        message.dataset.role = role;

        const avatar = message.querySelector('.message-avatar');
        avatar.textContent = role === 'assistant' ? 'AI' : 'You';

        const messageText = message.querySelector('.message-text');
        if (role === 'assistant') {
            messageText.innerHTML = marked.parse(content);
        } else {
            messageText.textContent = content;
        }

        // Display conversation summary if available
        if (metadata && metadata.conversation_summary && metadata.conversation_summary.trim()) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'conversation-summary';
            summaryDiv.innerHTML = `
                <div class="summary-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>Chat Summary</span>
                </div>
                <div class="summary-content">${metadata.conversation_summary}</div>
            `;
            container.appendChild(summaryDiv);
        }

        if (sources.length > 0) {
            const sourcesContainer = message.querySelector('.message-sources');
            sources.forEach(source => {
                const tag = document.createElement('span');
                tag.className = 'source-tag';
                tag.textContent = source.name || source.id;
                sourcesContainer.appendChild(tag);
            });
        }

        container.appendChild(clone);

        // Render MathJax for the new message if available
        if (window.MathJax && window.MathJax.typesetPromise && role === 'assistant') {
            MathJax.typesetPromise([messageText]).catch(err => {
                console.warn('MathJax rendering error:', err);
            });
        }

        container.scrollTop = container.scrollHeight;
    }

    // UI methods
    closeModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('modalOverlay').classList.remove('active');
        this.hideLoading();
    }

    showLoading(text) {
        document.getElementById('loadingText').textContent = text || 'Processing...';
        document.getElementById('loadingOverlay').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    setStatus(text) {
        document.getElementById('footerStatus').textContent = text;
    }

    // Utility: escape HTML special characters
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Rewrite image URLs for public notebooks
    // No longer needed - backend handles access control based on notebook public status
    rewriteImageUrlsForPublic(content) {
        // Keep original URLs - backend will handle access control
        return content;
    }

    // General toast notification method
    showToast(message, type = 'error') {
        const colors = {
            error: 'var(--accent-red)',
            warn: 'var(--accent-orange)',
            success: 'var(--accent-green)'
        };

        const toast = document.createElement('div');
        toast.className = `${type}-toast`;
        toast.style.cssText = `
            position: fixed; bottom: 60px; right: 20px; padding: 12px 20px;
            background: ${colors[type]}; color: white; font-family: var(--font-mono);
            font-size: 0.75rem; border-radius: 4px; box-shadow: var(--shadow-medium);
            animation: slideIn 0.3s ease; z-index: 3000; white-space: pre-wrap; max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    showError(message) {
        this.setStatus(`Error: ${message}`);
        this.showToast(message, 'error');
    }

    showWarn(message) {
        this.showToast(message, 'warn');
    }

    updateFooter() {
        const sourceCount = document.querySelectorAll('.source-card').length;
        const noteCount = document.querySelectorAll('.note-item').length;
        document.getElementById('footerStats').textContent = `${sourceCount} sources · ${noteCount} notes`;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;

        return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    async updateCurrentNotebookCounts() {
        if (!this.currentNotebook) return;

        const [sources, notes] = await Promise.all([
            this.api(`/notebooks/${this.currentNotebook.id}/sources`),
            this.api(`/notebooks/${this.currentNotebook.id}/notes`)
        ]);

        const notebookCard = document.querySelector(`.notebook-card[data-id="${this.currentNotebook.id}"]`);
        if (notebookCard) {
            notebookCard.querySelector('.stat-sources').textContent = `${sources.length} sources`;
            notebookCard.querySelector('.stat-notes').textContent = `${notes.length} notes`;
        }
    }

    // ============================================
    // Textbook Features
    // ============================================
    
    initTextbookEvents() {
        const btnViewTextbook = document.getElementById('btnViewTextbook');
        if (btnViewTextbook) {
            btnViewTextbook.addEventListener('click', () => {
                if (btnViewTextbook.classList.contains('active-stale')) {
                    this.openTextbookView(true); // Open in viewing mode even if stale
                } else if (btnViewTextbook.querySelector('#viewTextbookLabel').textContent === 'Generate Textbook') {
                    this.regenerateTextbook();
                } else {
                    this.openTextbookView();
                }
            });
        }

        const btnBackToWorkspace = document.getElementById('btnBackToWorkspace');
        if (btnBackToWorkspace) {
            btnBackToWorkspace.addEventListener('click', () => {
                this.switchView('workspace');
                if (this.currentNotebook) {
                    this.updateURL(this.currentNotebook.id);
                }
            });
        }

        const btnDownloadTextbook = document.getElementById('btnDownloadTextbook');
        if (btnDownloadTextbook) {
            btnDownloadTextbook.addEventListener('click', () => this.downloadTextbook());
        }

        const btnRegenerateTextbook = document.getElementById('btnRegenerateTextbook');
        if (btnRegenerateTextbook) {
            btnRegenerateTextbook.addEventListener('click', () => {
                if (confirm('Are you sure you want to regenerate the entire textbook? This will replace the current version.')) {
                    this.regenerateTextbook();
                }
            });
        }

        const btnBannerRegenerate = document.getElementById('btnBannerRegenerate');
        if (btnBannerRegenerate) {
            btnBannerRegenerate.addEventListener('click', () => this.regenerateTextbook());
        }

        const btnBannerDismiss = document.getElementById('btnBannerDismiss');
        if (btnBannerDismiss) {
            btnBannerDismiss.addEventListener('click', () => {
                document.getElementById('staleTextbookBanner')?.classList.add('hidden');
            });
        }
    }

    checkURLForTextbook() {
        const path = window.location.pathname;
        const match = path.match(/^\/notebooks\/([a-f0-9-]+)\/textbook$/);
        if (match) {
            const notebookId = match[1];
            // Setup an interval to try to load notebooks if they aren't loaded yet
            if (this.notebooks.length === 0) {
                this.loadNotebooks().then(() => {
                    const notebook = this.notebooks.find(nb => nb.id === notebookId);
                    if (notebook) {
                        this.currentNotebook = notebook;
                        this.openTextbookView();
                    } else {
                        this.switchView('landing');
                    }
                });
            } else {
                const notebook = this.notebooks.find(nb => nb.id === notebookId);
                if (notebook) {
                    this.currentNotebook = notebook;
                    this.openTextbookView();
                } else {
                    this.switchView('landing');
                }
            }
            return true;
        }
        return false;
    }

    updateTextbookURL(notebookId) {
        const newURL = `/notebooks/${notebookId}/textbook`;
        window.history.pushState({ notebookId, view: 'textbook' }, '', newURL);
    }

    async loadTextbookStatus() {
        if (!this.currentNotebook) return;
        
        try {
            const textbook = await this.api(`/notebooks/${this.currentNotebook.id}/textbook`);
            const btn = document.getElementById('btnViewTextbook');
            const label = document.getElementById('viewTextbookLabel');
            
            if (!btn) return;
            btn.style.display = 'flex';
            
            if (textbook.status === 'regenerating') {
                label.textContent = 'Generating...';
                btn.disabled = true;
                btn.className = 'btn-secondary';
                // Wait and poll
                if (!this.textbookCheckInterval) {
                   this.textbookCheckInterval = setInterval(() => this.loadTextbookStatus(), 5000);
                }
            } else if (textbook.status === 'stale') {
                label.textContent = 'View Textbook (outdated)';
                btn.disabled = false;
                btn.className = 'btn-state-stale';
                btn.classList.add('active-stale');
                clearInterval(this.textbookCheckInterval);
                this.textbookCheckInterval = null;
            } else if (textbook.status === 'current') {
                label.textContent = 'View Textbook';
                btn.disabled = false;
                btn.className = 'btn-secondary';
                btn.classList.remove('active-stale');
                clearInterval(this.textbookCheckInterval);
                this.textbookCheckInterval = null;
            }
        } catch (error) {
            // Not found (404)
            const btn = document.getElementById('btnViewTextbook');
            const label = document.getElementById('viewTextbookLabel');
            if (btn) {
                btn.style.display = 'flex';
                label.textContent = 'Generate Textbook';
                btn.disabled = false;
                btn.className = 'btn-primary';
                btn.classList.remove('active-stale');
            }
            clearInterval(this.textbookCheckInterval);
            this.textbookCheckInterval = null;
        }
    }

    async openTextbookView(ignoreStaleWarning = false) {
        if (!this.currentNotebook) return;
        
        this.switchView('textbook');
        this.updateTextbookURL(this.currentNotebook.id);
        
        const titleEl = document.getElementById('textbookNotebookName');
        if (titleEl) titleEl.textContent = `${this.currentNotebook.name} — Textbook`;
        
        const contentEl = document.getElementById('textbookRendered');
        const tocEl = document.getElementById('textbookTOC');
        const indicatorEl = document.getElementById('regeneratingIndicator');
        const bannerEl = document.getElementById('staleTextbookBanner');
        
        contentEl.innerHTML = '<p>Loading textbook...</p>';
        tocEl.innerHTML = '';
        indicatorEl.classList.add('hidden');
        bannerEl.classList.add('hidden');
        
        try {
            const textbook = await this.api(`/notebooks/${this.currentNotebook.id}/textbook`);
            this.currentTextbook = textbook;
            
            if (textbook.status === 'regenerating') {
                indicatorEl.classList.remove('hidden');
                // Don't show content
            } else {
                if (textbook.status === 'stale' && !ignoreStaleWarning) {
                    bannerEl.classList.remove('hidden');
                }
                this.renderTextbook(textbook.content_markdown);
            }
            
            if (textbook.status === 'regenerating' && !this.textbookCheckInterval) {
                this.textbookCheckInterval = setInterval(async () => {
                    const latest = await this.api(`/notebooks/${this.currentNotebook.id}/textbook`);
                    if (latest.status !== 'regenerating') {
                        clearInterval(this.textbookCheckInterval);
                        this.textbookCheckInterval = null;
                        this.openTextbookView(); // Reload view
                    }
                }, 5000);
            }
        } catch (error) {
            contentEl.innerHTML = '<p>No textbook found. Use the Generate button to create one.</p>';
        }
    }

    async regenerateTextbook() {
        if (!this.currentNotebook) return;
        
        try {
            this.setStatus('Starting textbook generation...');
            // Immediately switch to regenerating UI if on textbook view
            if (document.getElementById('textbookContainer').classList.contains('hidden') === false) {
                document.getElementById('regeneratingIndicator')?.classList.remove('hidden');
                document.getElementById('staleTextbookBanner')?.classList.add('hidden');
            }
            
            const btn = document.getElementById('btnViewTextbook');
            if (btn) {
                btn.disabled = true;
                btn.className = 'btn-secondary';
                document.getElementById('viewTextbookLabel').textContent = 'Generating...';
            }
            
            // This starts the asynchronous generation
            await this.api(`/notebooks/${this.currentNotebook.id}/textbook/generate`, {
                method: 'POST'
            });
            
            this.setStatus('Textbook generation in progress...');
            
            // Start polling
            if (!this.textbookCheckInterval) {
               this.textbookCheckInterval = setInterval(async () => {
                   if (document.getElementById('textbookContainer').classList.contains('hidden') === false) {
                       const latest = await this.api(`/notebooks/${this.currentNotebook.id}/textbook`);
                       if (latest.status !== 'regenerating') {
                           clearInterval(this.textbookCheckInterval);
                           this.textbookCheckInterval = null;
                           this.openTextbookView(); // Reload view
                       }
                   } else {
                       this.loadTextbookStatus();
                   }
               }, 5000);
            }
        } catch (error) {
            console.error('Failed to trigger generation', error);
            this.showError('Failed to start textbook generation: ' + error.message);
            document.getElementById('regeneratingIndicator')?.classList.add('hidden');
        }
    }

    renderTextbook(markdown) {
        const contentEl = document.getElementById('textbookRendered');
        const tocEl = document.getElementById('textbookTOC');
        
        // Parse markdown using marked
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            const html = marked.parse(markdown || '');
            contentEl.innerHTML = html;
        } else {
            contentEl.textContent = markdown;
        }
        
        // Render MathJax if present
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([contentEl]).catch(err => {
                console.error('MathJax error:', err);
            });
        }
        
        // Extract headers for TOC
        tocEl.innerHTML = '';
        const headers = contentEl.querySelectorAll('h1, h2, h3');
        headers.forEach((h, index) => {
            const id = `heading-${index}`;
            h.id = id;
            
            const li = document.createElement('li');
            li.style.marginLeft = h.tagName === 'H3' ? '16px' : (h.tagName === 'H2' ? '8px' : '0');
            
            const a = document.createElement('a');
            a.href = `#${id}`;
            a.textContent = h.textContent;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                h.scrollIntoView({ behavior: 'smooth' });
                // Update active state
                tocEl.querySelectorAll('a').forEach(link => link.classList.remove('active'));
                a.classList.add('active');
            });
            
            li.appendChild(a);
            tocEl.appendChild(li);
        });
    }

    downloadTextbook() {
        if (!this.currentTextbook || !this.currentTextbook.content_markdown) return;
        
        const blob = new Blob([this.currentTextbook.content_markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // Clean filename safely
        const safeName = (this.currentNotebook?.name || 'Textbook').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        a.href = url;
        a.download = `${safeName}.md`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
}

// ============================================
// Resource Tab Manager
// ============================================
class ResourceTabManager {
    constructor(app) {
        this.app = app;
        this.openTabs = new Map();  // tabId -> { sourceId, sourceName, sourceType, element }
        this.activeTabId = null;
        this.nextTabId = 1;
        this.previewers = new Map();  // tabId -> Previewer instance
    }

    openTab(source) {
        // Check if tab already exists
        for (const [tabId, tab] of this.openTabs) {
            if (tab.sourceId === source.id) {
                this.switchTab(tabId);
                return;
            }
        }

        const tabId = `resource_${this.nextTabId++}`;
        const tabData = {
            tabId,
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            source: source
        };
        this.openTabs.set(tabId, tabData);

        // Create tab button
        this.createTabButton(tabData);

        // Create tab content
        this.createTabContent(tabData);

        // Switch to new tab
        this.switchTab(tabId);
    }

    closeTab(tabId) {
        const tab = this.openTabs.get(tabId);
        if (!tab) return;

        // Remove tab button
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (tabBtn) tabBtn.remove();

        // Remove tab content
        const tabContent = document.querySelector(`.resource-preview-container[data-tab-id="${tabId}"]`);
        if (tabContent) tabContent.remove();

        // Destroy previewer
        const previewer = this.previewers.get(tabId);
        if (previewer && previewer.destroy) {
            previewer.destroy();
        }
        this.previewers.delete(tabId);

        this.openTabs.delete(tabId);

        // Switch to another tab if active was closed
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.openTabs.keys());
            if (remainingTabs.length > 0) {
                this.switchTab(remainingTabs[0]);
            } else {
                this.activeTabId = null;
                this.app.switchPanelTab('chat');
            }
        }
    }

    switchTab(tabId) {
        this.activeTabId = tabId;

        // Update tab button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update content visibility
        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        const noteViewContainer = document.querySelector('.note-view-container');
        const notesDetailsView = document.querySelector('.notes-details-view');

        // Hide all resource preview containers
        document.querySelectorAll('.resource-preview-container').forEach(el => {
            el.style.display = 'none';
        });

        // Show selected tab content
        const tabContent = document.querySelector(`.resource-preview-container[data-tab-id="${tabId}"]`);
        if (tabContent) {
            chatWrapper.style.display = 'none';
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) noteViewContainer.style.display = 'none';
            tabContent.style.display = 'flex';
        }
    }

    closeAllResourceTabs() {
        const tabIds = Array.from(this.openTabs.keys());
        tabIds.forEach(tabId => this.closeTab(tabId));
    }

    createTabButton(tabData) {
        const tabsContainer = document.getElementById('centerPanelTabs');
        if (!tabsContainer) return;

        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-btn';
        tabBtn.dataset.tab = tabData.tabId;
        tabBtn.innerHTML = `
            <span class="tab-title">${this.truncateText(tabData.sourceName, 20)}</span>
        `;

        // Tab click event
        tabBtn.addEventListener('click', () => {
            this.switchTab(tabData.tabId);
        });

        // Insert after notes_list tab, or at the end if not found
        const notesListTab = tabsContainer.querySelector('.tab-btn[data-tab="notes_list"]');
        if (notesListTab && !notesListTab.classList.contains('hidden')) {
            notesListTab.insertAdjacentElement('afterend', tabBtn);
        } else {
            tabsContainer.appendChild(tabBtn);
        }
    }

    createTabContent(tabData) {
        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        if (!chatWrapper) return;

        const template = document.getElementById('resourcePreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        const container = clone.querySelector('.resource-preview-container');
        container.dataset.tabId = tabData.tabId;

        // Set title
        container.querySelector('.resource-title').textContent = tabData.sourceName;

        // Close button event
        container.querySelector('[data-action="close"]').addEventListener('click', () => {
            this.closeTab(tabData.tabId);
        });

        // Create previewer based on source type
        const body = container.querySelector('.resource-body');
        const previewer = this.createPreviewer(tabData, body);
        this.previewers.set(tabData.tabId, previewer);

        // Insert after chat wrapper
        chatWrapper.insertAdjacentElement('afterend', container);

        // Load preview
        previewer.load();
    }

    createPreviewer(tabData, body) {
        const sourceType = this.determineSourceType(tabData.source);

        switch (sourceType) {
            case 'text':
                return new TextPreviewer(this.app, tabData, body);
            case 'image':
                return new ImagePreviewer(this.app, tabData, body);
            case 'audio':
                return new AudioPreviewer(this.app, tabData, body);
            case 'pdf':
                return new PdfPreviewer(this.app, tabData, body);
            case 'url':
                return new UrlPreviewer(this.app, tabData, body);
            default:
                return new TextPreviewer(this.app, tabData, body);
        }
    }

    determineSourceType(source) {
        if (source.type === 'url') return 'url';

        if (source.type === 'text') return 'text';

        if (source.file_name) {
            const ext = source.file_name.toLowerCase().split('.').pop();
            const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
            const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
            const pdfExtensions = ['pdf'];

            if (pdfExtensions.includes(ext)) return 'pdf';
            if (imageExtensions.includes(ext)) return 'image';
            if (audioExtensions.includes(ext)) return 'audio';
        }

        // Default to text
        return 'text';
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}

// ============================================
// Base Previewer Class
// ============================================
class BasePreviewer {
    constructor(app, tabData, container) {
        this.app = app;
        this.tabData = tabData;
        this.container = container;
        this.loadingEl = null;
        this.errorEl = null;
        this.contentEl = null;
    }

    load() {
        throw new Error('load() must be implemented');
    }

    destroy() {
        // Override if needed
    }

    showLoading() {
        this.contentEl?.classList.add('hidden');
        this.errorEl?.classList.add('hidden');
        this.loadingEl?.classList.remove('hidden');
        // Clear the inline display style on the resource-body container
        this.container.style.display = '';
    }

    hideLoading() {
        this.loadingEl?.classList.add('hidden');
    }

    showError(message) {
        this.loadingEl?.classList.add('hidden');
        this.contentEl?.classList.add('hidden');
        this.errorEl?.classList.remove('hidden');
        // Clear the inline display style on the resource-body container
        this.container.style.display = '';
        const errorMsgEl = this.errorEl?.querySelector('.error-message');
        if (errorMsgEl) {
            errorMsgEl.textContent = message;
        } else if (this.errorEl) {
            // Fallback if error-message element doesn't exist
            this.errorEl.textContent = message;
        }
    }

    showContent() {
        this.loadingEl?.classList.add('hidden');
        this.errorEl?.classList.add('hidden');
        this.contentEl?.classList.remove('hidden');
        // Clear the inline display style on the resource-body container
        this.container.style.display = '';
        // Also show the resource-body by removing inline style
        const resourceBody = this.container.closest('.resource-preview-content')?.querySelector('.resource-body');
        if (resourceBody) {
            resourceBody.style.display = '';
        }
    }

    async fetchSource() {
        try {
            const endpoint = this.app.currentPublicToken
                ? `/public/notebooks/${this.app.currentPublicToken}/sources/${this.tabData.sourceId}`
                : `/api/notebooks/${this.app.currentNotebook.id}/sources/${this.tabData.sourceId}`;

            const headers = {};
            if (this.app.token && !this.app.currentPublicToken) {
                headers['Authorization'] = `Bearer ${this.app.token}`;
            }

            const response = await fetch(endpoint, { headers });
            if (!response.ok) throw new Error('Failed to fetch source');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch source:', error);
            throw error;
        }
    }
}

// ============================================
// Text Previewer
// ============================================
class TextPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.searchQuery = '';
        this.matches = [];
        this.currentMatchIndex = -1;
        this.rawText = ''; // Store original markdown text for search
    }

    load() {
        // Create text preview UI
        const template = document.getElementById('textPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        // Now setup elements after template is appended
        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from the preview template content (this.container is the resource-body div)
        // The text/content was added from textPreviewTemplate, so query this.container directly
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body again - this.container IS the resource-body div
        // The text-content element should be a child of this.container
        this.contentEl = this.container.querySelector('.text-content');
        this.searchInput = this.container.querySelector('.text-search-input');
        this.searchPrevBtn = this.container.querySelector('.btn-search-prev');
        this.searchNextBtn = this.container.querySelector('.btn-search-next');
        this.searchClearBtn = this.container.querySelector('.btn-search-clear');
        this.searchCountEl = this.container.querySelector('.search-count');
    }

    bindEvents() {
        this.searchInput.addEventListener('input', (e) => {
            this.search(e.target.value);
        });

        this.searchPrevBtn.addEventListener('click', () => {
            this.navigateMatch(-1);
        });

        this.searchNextBtn.addEventListener('click', () => {
            this.navigateMatch(1);
        });

        this.searchClearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.search('');
            this.searchInput.focus();
        });
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            const text = source.content || '';

            if (text) {
                // Store raw text for search
                this.rawText = text;
                // Render markdown to HTML
                this.contentEl.innerHTML = marked.parse(text);
                this.showContent();
            } else {
                this.showError('This resource has no displayable text content');
            }
        } catch (error) {
            this.showError('Failed to load text: ' + error.message);
        }
    }

    search(query) {
        this.searchQuery = query;
        // Reset to original rendered markdown when clearing search
        this.contentEl.innerHTML = marked.parse(this.rawText);

        if (!query) {
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateSearchUI();
            return;
        }

        // Find matches in raw text
        const text = this.rawText;
        this.matches = [];
        let match;
        const regex = new RegExp(query.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'gi');

        while ((match = regex.exec(text)) !== null) {
            this.matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0]
            });
        }

        if (this.matches.length > 0) {
            this.currentMatchIndex = 0;
            this.highlightMatches();
            this.scrollToMatch(this.currentMatchIndex);
        } else {
            this.currentMatchIndex = -1;
        }

        this.updateSearchUI();
    }

    highlightMatches() {
        // Highlight matches in the raw text, then re-render
        const text = this.rawText;
        let html = '';
        let lastIndex = 0;

        this.matches.forEach((match, index) => {
            // Escape text before the match
            html += this.escapeHtml(text.substring(lastIndex, match.start));
            const isActive = index === this.currentMatchIndex;
            html += `<span class="search-highlight ${isActive ? 'active' : ''}">${this.escapeHtml(match.text)}</span>`;
            lastIndex = match.end;
        });

        // Add remaining text after last match
        html += this.escapeHtml(text.substring(lastIndex));

        // Set as raw markdown with highlight spans, then render
        this.contentEl.innerHTML = marked.parse(html);
    }

    scrollToMatch(index) {
        if (index < 0 || index >= this.matches.length) return;

        const match = this.matches[index];
        const textNodes = this.contentEl.querySelectorAll('.search-highlight');
        const targetNode = textNodes[index];

        if (targetNode) {
            targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    navigateMatch(direction) {
        if (this.matches.length === 0) return;

        this.currentMatchIndex += direction;

        if (this.currentMatchIndex < 0) {
            this.currentMatchIndex = this.matches.length - 1;
        } else if (this.currentMatchIndex >= this.matches.length) {
            this.currentMatchIndex = 0;
        }

        this.highlightMatches();
        this.scrollToMatch(this.currentMatchIndex);
        this.updateSearchUI();
    }

    updateSearchUI() {
        if (this.matches.length > 0) {
            this.searchCountEl.textContent = `${this.currentMatchIndex + 1} / ${this.matches.length}`;
            this.searchPrevBtn.disabled = false;
            this.searchNextBtn.disabled = false;
        } else {
            this.searchCountEl.textContent = this.searchQuery ? 'No matches' : '';
            this.searchPrevBtn.disabled = true;
            this.searchNextBtn.disabled = true;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// Image Previewer
// ============================================
class ImagePreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.scale = 1.0;
        this.rotation = 0;
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.translateX = 0;
        this.translateY = 0;
    }

    load() {
        const template = document.getElementById('imagePreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body - this.container IS the resource-body div
        // Image preview elements are direct children of this.container
        this.zoomInBtn = this.container.querySelector('.btn-image-zoom-in');
        this.zoomOutBtn = this.container.querySelector('.btn-image-zoom-out');
        this.resetBtn = this.container.querySelector('.btn-image-reset');
        this.rotateLeftBtn = this.container.querySelector('.btn-image-rotate-left');
        this.rotateRightBtn = this.container.querySelector('.btn-image-rotate-right');
        this.zoomLevelEl = this.container.querySelector('.zoom-level');
        this.viewport = this.container.querySelector('.image-viewport');
        this.img = this.container.querySelector('.image-preview-img');
    }

    bindEvents() {
        this.zoomInBtn.addEventListener('click', () => this.zoom(0.2));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(-0.2));
        this.resetBtn.addEventListener('click', () => this.reset());
        this.rotateLeftBtn.addEventListener('click', () => this.rotate(-90));
        this.rotateRightBtn.addEventListener('click', () => this.rotate(90));

        // Mouse wheel zoom
        this.viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });

        // Drag to pan - save handler references for cleanup
        this.mouseMoveHandler = (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.translateX += dx;
            this.translateY += dy;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.updateTransform();
        };

        this.mouseUpHandler = () => {
            this.isDragging = false;
            this.viewport.style.cursor = 'grab';
        };

        this.viewport.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.viewport.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', this.mouseMoveHandler);
        document.addEventListener('mouseup', this.mouseUpHandler);
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            const fileUrl = source.file_name ? `/api/files/${source.file_name}` : null;

            if (fileUrl) {
                // Fetch image with authentication first
                const headers = {};
                if (this.app.token && !this.app.currentPublicToken) {
                    headers['Authorization'] = `Bearer ${this.app.token}`;
                }

                const response = await fetch(fileUrl, { headers });
                if (!response.ok) {
                    throw new Error(`Failed to load image: ${response.status}`);
                }

                const blob = await response.blob();
                this.img.src = URL.createObjectURL(blob);

                this.img.addEventListener('load', () => {
                    this.showContent();
                    this.reset();
                }, { once: true });

                this.img.addEventListener('error', () => {
                    this.showError('Failed to load image');
                }, { once: true });
            } else {
                this.showError('This resource has no displayable images');
            }
        } catch (error) {
            console.error('Image loading error:', error);
            this.showError('Failed to load image: ' + error.message);
        }
    }

    zoom(delta) {
        this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
        this.updateTransform();
        this.updateZoomLevel();
    }

    rotate(angle) {
        this.rotation = (this.rotation + angle) % 360;
        this.updateTransform();
    }

    reset() {
        this.scale = 1.0;
        this.rotation = 0;
        this.translateX = 0;
        this.translateY = 0;
        this.updateTransform();
        this.updateZoomLevel();
    }

    updateTransform() {
        this.img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
    }

    updateZoomLevel() {
        this.zoomLevelEl.textContent = Math.round(this.scale * 100) + '%';
    }

    destroy() {
        // Clean up event listeners to prevent memory leaks
        if (this.mouseMoveHandler) {
            document.removeEventListener('mousemove', this.mouseMoveHandler);
        }
        if (this.mouseUpHandler) {
            document.removeEventListener('mouseup', this.mouseUpHandler);
        }
    }
}

// ============================================
// Audio Previewer
// ============================================
class AudioPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.audio = null;
    }

    load() {
        const template = document.getElementById('audioPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body - this.container IS the resource-body div
        // Audio preview elements are direct children of this.container
        this.audio = this.container.querySelector('.audio-player');
        this.playBtn = this.container.querySelector('.btn-audio-play');
        this.iconPlay = this.container.querySelector('.icon-play');
        this.iconPause = this.container.querySelector('.icon-pause');
        this.progressBar = this.container.querySelector('.audio-progress-bar');
        this.progressFill = this.container.querySelector('.audio-progress-fill');
        this.currentTimeEl = this.container.querySelector('.current-time');
        this.durationEl = this.container.querySelector('.duration');
        this.muteBtn = this.container.querySelector('.btn-audio-mute');
        this.iconVolumeHigh = this.container.querySelector('.icon-volume-high');
        this.iconVolumeLow = this.container.querySelector('.icon-volume-low');
        this.iconMute = this.container.querySelector('.icon-mute');
        this.volumeSlider = this.container.querySelector('.audio-volume-slider');
        this.transcriptToggle = this.container.querySelector('.btn-transcript-toggle');
        this.transcriptContent = this.container.querySelector('.transcript-content');
        this.transcriptText = this.container.querySelector('.transcript-text');
    }

    bindEvents() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.onEnded());

        this.progressBar.addEventListener('click', (e) => {
            const rect = this.progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.audio.currentTime = percent * this.audio.duration;
        });

        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value;
            this.updateVolumeIcons();
        });

        this.transcriptToggle.addEventListener('click', () => {
            this.transcriptContent.classList.toggle('collapsed');
            this.transcriptToggle.textContent = this.transcriptContent.classList.contains('collapsed') ? 'Expand' : 'Collapse';
        });

        // Keyboard shortcut - save handler reference for cleanup
        this.keydownHandler = (e) => {
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePlay();
            }
        };

        this.container.addEventListener('keydown', this.keydownHandler);
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();

            const fileUrl = source.file_name ? `/api/files/${source.file_name}` : null;

            if (fileUrl) {
                // Fetch audio with authentication first
                const headers = {};
                if (this.app.token && !this.app.currentPublicToken) {
                    headers['Authorization'] = `Bearer ${this.app.token}`;
                }

                const response = await fetch(fileUrl, { headers });
                if (!response.ok) {
                    throw new Error(`Failed to load audio: ${response.status}`);
                }

                const blob = await response.blob();
                this.audio.src = URL.createObjectURL(blob);

                this.audio.addEventListener('loadeddata', () => {
                    this.showContent();
                }, { once: true });

                this.audio.addEventListener('error', () => {
                    this.showError('Failed to load audio');
                }, { once: true });
            } else {
                this.showError('This resource has no playable audio');
            }

            // Load transcript
            if (source.content) {
                if (this.transcriptText) {
                    this.transcriptText.textContent = source.content;
                }
                // Don't add collapsed class - keep transcript visible by default
                // User can click the toggle button to collapse/expand
                this.transcriptContent.classList.remove('collapsed');
                this.transcriptToggle.textContent = 'Collapse';
            } else {
                this.transcriptContent.style.display = 'none';
                this.transcriptToggle.parentElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Audio loading error:', error);
            this.showError('Failed to load audio: ' + error.message);
        }
    }

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
            this.iconPlay.style.display = 'none';
            this.iconPause.style.display = 'block';
        } else {
            this.audio.pause();
            this.iconPlay.style.display = 'block';
            this.iconPause.style.display = 'none';
        }
    }

    onEnded() {
        this.iconPlay.style.display = 'block';
        this.iconPause.style.display = 'none';
    }

    updateProgress() {
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressFill.style.width = percent + '%';
        this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }

    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audio.duration);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.updateVolumeIcons();
    }

    updateVolumeIcons() {
        if (this.audio.muted || this.audio.volume === 0) {
            this.iconVolumeHigh.style.display = 'none';
            this.iconVolumeLow.style.display = 'none';
            this.iconMute.style.display = 'block';
        } else if (this.audio.volume < 0.5) {
            this.iconVolumeHigh.style.display = 'none';
            this.iconVolumeLow.style.display = 'block';
            this.iconMute.style.display = 'none';
        } else {
            this.iconVolumeHigh.style.display = 'block';
            this.iconVolumeLow.style.display = 'none';
            this.iconMute.style.display = 'none';
        }
    }

    destroy() {
        // Clean up keyboard event listener
        if (this.keydownHandler) {
            this.container.removeEventListener('keydown', this.keydownHandler);
        }
    }
}

// ============================================
// PDF Previewer
// ============================================
class PdfPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.canvas = null;
        this.ctx = null;
    }

    load() {
        const template = document.getElementById('pdfPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');
        this.contentEl = this.container.querySelector('.pdf-viewport');

        // Don't query .resource-body - this.container IS the resource-body div
        // PDF preview elements are direct children of this.container
        this.prevPageBtn = this.container.querySelector('.btn-pdf-prev');
        this.nextPageBtn = this.container.querySelector('.btn-pdf-next');
        this.zoomInBtn = this.container.querySelector('.btn-pdf-zoom-in');
        this.zoomOutBtn = this.container.querySelector('.btn-pdf-zoom-out');
        this.fitWidthBtn = this.container.querySelector('.btn-pdf-fit-width');
        this.currentPageEl = this.container.querySelector('.current-page');
        this.totalPagesEl = this.container.querySelector('.total-pages');
        this.zoomLevelEl = this.container.querySelector('.pdf-zoom-level');
        this.canvas = this.container.querySelector('.pdf-canvas');
        this.ctx = this.canvas?.getContext('2d');
    }

    bindEvents() {
        this.prevPageBtn.addEventListener('click', () => this.changePage(-1));
        this.nextPageBtn.addEventListener('click', () => this.changePage(1));
        this.zoomInBtn.addEventListener('click', () => this.zoom(0.2));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(-0.2));
        this.fitWidthBtn.addEventListener('click', () => this.fitWidth());
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            const fileUrl = source.file_name ? `/api/files/${source.file_name}` : null;

            if (!fileUrl) {
                this.showError('This resource has no displayable PDF');
                return;
            }

            // Fetch PDF with authentication first
            const headers = {};
            if (this.app.token && !this.app.currentPublicToken) {
                headers['Authorization'] = `Bearer ${this.app.token}`;
            }

            const response = await fetch(fileUrl, { headers });
            if (!response.ok) {
                throw new Error(`Failed to load PDF: ${response.status} ${response.statusText}`);
            }

            const pdfData = await response.arrayBuffer();

            // Check if pdfjsLib is available
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library is not loaded');
            }

            // Load PDF using PDF.js with the fetched data
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;

            this.totalPagesEl.textContent = this.totalPages;
            this.updatePageButtons();

            this.showContent();
            this.renderPage(this.currentPage);
        } catch (error) {
            console.error('PDF loading error:', error);
            this.showError('Failed to load PDF: ' + error.message);
        }
    }

    async renderPage(pageNum) {
        if (!this.pdfDoc) return;

        this.currentPage = pageNum;
        this.currentPageEl.textContent = pageNum;
        this.updatePageButtons();

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;

            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;
        } catch (error) {
            console.error('PDF render error:', error);
        }
    }

    changePage(delta) {
        const newPage = this.currentPage + delta;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.renderPage(newPage);
        }
    }

    zoom(delta) {
        this.scale = Math.max(0.25, Math.min(3, this.scale + delta));
        this.updateZoomLevel();
        this.renderPage(this.currentPage);
    }

    fitWidth() {
        const containerWidth = this.container.querySelector('.pdf-viewport')?.clientWidth || 800;
        if (!this.pdfDoc || this.currentPage < 1) return;

        this.pdfDoc.getPage(this.currentPage).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            this.scale = (containerWidth - 40) / viewport.width;
            this.updateZoomLevel();
            this.renderPage(this.currentPage);
        });
    }

    updatePageButtons() {
        this.prevPageBtn.disabled = this.currentPage <= 1;
        this.nextPageBtn.disabled = this.currentPage >= this.totalPages;
    }

    updateZoomLevel() {
        this.zoomLevelEl.textContent = Math.round(this.scale * 100) + '%';
    }

    destroy() {
        if (this.pdfDoc) {
            this.pdfDoc.destroy();
            this.pdfDoc = null;
        }
    }
}

// ============================================
// URL Previewer
// ============================================
class UrlPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.url = '';
    }

    load() {
        const template = document.getElementById('urlPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body - this.container IS the resource-body div
        // URL preview elements are direct children of this.container
        this.urlInput = this.container.querySelector('.url-input');
        this.backBtn = this.container.querySelector('.btn-url-back');
        this.forwardBtn = this.container.querySelector('.btn-url-forward');
        this.refreshBtn = this.container.querySelector('.btn-url-refresh');
        this.externalBtn = this.container.querySelector('.btn-url-external');
        this.iframe = this.container.querySelector('.url-iframe');
        this.blockedEl = this.container.querySelector('.url-blocked');
        this.openExternalBtn = this.container.querySelector('.btn-open-external');
    }

    bindEvents() {
        this.backBtn.addEventListener('click', () => {
            if (this.iframe.contentWindow) {
                this.iframe.contentWindow.history.back();
            }
        });

        this.forwardBtn.addEventListener('click', () => {
            if (this.iframe.contentWindow) {
                this.iframe.contentWindow.history.forward();
            }
        });

        this.refreshBtn.addEventListener('click', () => {
            if (this.iframe.src) {
                this.iframe.src = this.iframe.src;
            }
        });

        this.iframe.addEventListener('load', () => {
            this.loadingEl?.classList.add('hidden');
        });

        this.iframe.addEventListener('error', () => {
            this.showBlocked();
        });

        this.openExternalBtn.addEventListener('click', () => {
            if (this.url) {
                window.open(this.url, '_blank');
            }
        });
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            this.url = source.url;

            if (this.url) {
                this.urlInput.value = this.url;
                this.externalBtn.href = this.url;
                this.openExternalBtn.href = this.url;

                // Set iframe src with a timeout to detect blocking
                this.iframe.src = this.url;

                // Show content after a short delay
                setTimeout(() => {
                    this.showContent();
                }, 500);

                // Check if the iframe was blocked
                setTimeout(() => {
                    if (this.iframe.contentWindow === null) {
                        this.showBlocked();
                    }
                }, 2000);
            } else {
                this.showError('This resource has no URL');
            }
        } catch (error) {
            this.showError('Failed to load URL: ' + error.message);
        }
    }

    showBlocked() {
        this.iframe.style.display = 'none';
        this.blockedEl.style.display = 'flex';
        this.loadingEl?.classList.add('hidden');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OpenNotebook();
});