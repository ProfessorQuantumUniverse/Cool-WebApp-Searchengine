// ############ HTTPS REDIRECT ############
// Redirect HTTP to HTTPS
if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    window.location.href = 'https://' + window.location.host + window.location.pathname + window.location.search;
}

document.addEventListener('DOMContentLoaded', () => {
    // ############ CONFIGURATION ############
    const CONFIG = {
        API_ENDPOINT: 'https://script.google.com/macros/s/AKfycbxuW9-iRsTqfI1joojJ7RVYnwYPZjFRj-nRs-r13BwBwT5wHamOPe2B230JRwURSxIuyg/exec',
        CACHE_KEY: 'webapp_database',
        CACHE_DURATION: 30 * 60 * 1000, // 30 minutes in milliseconds
        FAVORITES_KEY: 'favorites',
        DEBOUNCE_DELAY: 300
    };

    // ############ VARIABLEN & ELEMENTE ############
    let database = [];
    let lastResults = [];
    let fuse = null; // Fuse.js instance for fuzzy search
    let favorites = JSON.parse(localStorage.getItem(CONFIG.FAVORITES_KEY)) || [];

    // ... (alle anderen Element-Variablen bleiben gleich) ...
    const loadingScreen = document.getElementById('loading-screen');
    const searchView = document.getElementById('search-view');
    const resultsView = document.getElementById('results-view');
    const detailView = document.getElementById('detail-view');
    const contactView = document.getElementById('contact-view');
    const allViews = [loadingScreen, searchView, resultsView, detailView, contactView];
    const searchTermInput = document.getElementById('search-term');
    const filterToggle = document.getElementById('filter-mediatype-toggle');
    const mediatypeFilterSelect = document.getElementById('mediatype-filter');
    const exactSearchToggle = document.getElementById('exact-search-toggle');
    const searchButton = document.getElementById('search-button');
    const exploreButton = document.getElementById('explore-button');
    const resultsContainer = document.getElementById('results-container');
    const navSearchBtn = document.getElementById('nav-search-btn');
    const navContactBtn = document.getElementById('nav-contact-btn');
    const logoHomeButton = document.getElementById('logo-home-button');
    const backToSearchBtn = document.getElementById('back-to-search-btn');
    const backToResultsBtn = document.getElementById('back-to-results-btn');
    const submitSiteLink = document.getElementById('submit-new-site-link');
    const showFeedbackBtn = document.getElementById('show-feedback-form');
    const showSubmitBtn = document.getElementById('show-submit-form');
    const feedbackForm = document.getElementById('feedback-form');
    const submitForm = document.getElementById('submit-form');
    const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
    const toastContainer = document.getElementById('toast-container');

    // ############ UTILITY FUNCTIONS ############

    /**
     * Sanitizes HTML to prevent XSS attacks
     * @param {string} str - The string to sanitize
     * @returns {string} - Sanitized string
     */
    function sanitizeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Sanitizes URL for use in HTML attributes and CSS
     * Validates URL and properly escapes it
     * @param {string} url - URL to sanitize
     * @returns {string} - Sanitized URL or empty string if invalid
     */
    function sanitizeURL(url) {
        if (!url || typeof url !== 'string') return '';
        
        // Validate URL starts with http:// or https://
        if (!/^https?:\/\//i.test(url)) return '';
        
        try {
            // Use URL constructor to validate and normalize
            const parsed = new URL(url);
            // Only allow http and https protocols
            if (!['http:', 'https:'].includes(parsed.protocol)) return '';
            return parsed.href;
        } catch (e) {
            return '';
        }
    }

    /**
     * Escapes a string for safe use in CSS url() context
     * @param {string} url - URL to escape
     * @returns {string} - Escaped URL safe for CSS
     */
    function escapeCSSUrl(url) {
        const sanitized = sanitizeURL(url);
        if (!sanitized) return '';
        // Escape single quotes, double quotes, parentheses, and backslashes for CSS
        return sanitized.replace(/[\\'"\(\)]/g, '\\$&');
    }

    /**
     * Debounce function to limit rate of function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Delay in milliseconds
     * @returns {Function} - Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Shows a toast notification
     * @param {string} message - Message to display
     * @param {string} type - Type of toast: 'success', 'error', 'info', 'loading'
     * @param {number} duration - Duration in ms (0 for persistent)
     * @returns {HTMLElement} - Toast element for manual removal if needed
     */
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = '';
        switch (type) {
            case 'success': icon = 'check_circle'; break;
            case 'error': icon = 'error'; break;
            case 'loading': icon = 'hourglass_empty'; break;
            default: icon = 'info'; break;
        }
        
        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon">${icon}</span>
            <span class="toast-message">${sanitizeHTML(message)}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Trigger reflow for animation
        toast.offsetHeight;
        toast.classList.add('show');
        
        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
        
        return toast;
    }

    /**
     * Removes a specific toast
     * @param {HTMLElement} toast - Toast element to remove
     */
    function removeToast(toast) {
        if (toast && toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }
    }

    // ############ FAVORITES SYSTEM ############

    /**
     * Toggle favorite status for an app
     * @param {string|number} id - App ID
     */
    function toggleFavorite(id) {
        const idStr = String(id);
        const index = favorites.indexOf(idStr);
        
        if (index === -1) {
            favorites.push(idStr);
            showToast('Added to favorites!', 'success');
        } else {
            favorites.splice(index, 1);
            showToast('Removed from favorites', 'info');
        }
        
        localStorage.setItem(CONFIG.FAVORITES_KEY, JSON.stringify(favorites));
        updateFavoriteButtons();
    }

    /**
     * Check if an app is favorited
     * @param {string|number} id - App ID
     * @returns {boolean}
     */
    function isFavorite(id) {
        return favorites.includes(String(id));
    }

    /**
     * Update all favorite buttons on the page
     */
    function updateFavoriteButtons() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            const id = btn.dataset.id;
            if (isFavorite(id)) {
                btn.classList.add('active');
                btn.querySelector('.material-symbols-outlined').textContent = 'star';
            } else {
                btn.classList.remove('active');
                btn.querySelector('.material-symbols-outlined').textContent = 'star_border';
            }
        });
    }

    // ############ CACHING SYSTEM ############

    /**
     * Get cached database if valid
     * @returns {Array|null} - Cached data or null
     */
    function getCachedDatabase() {
        try {
            const cached = localStorage.getItem(CONFIG.CACHE_KEY);
            if (!cached) return null;
            
            const { data, timestamp } = JSON.parse(cached);
            const now = Date.now();
            
            if (now - timestamp < CONFIG.CACHE_DURATION) {
                console.log('Loading from cache, age:', Math.round((now - timestamp) / 1000), 'seconds');
                return data;
            }
            
            console.log('Cache expired');
            return null;
        } catch (e) {
            console.error('Cache read error:', e);
            return null;
        }
    }

    /**
     * Save database to cache
     * @param {Array} data - Database to cache
     */
    function setCachedDatabase(data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheData));
            console.log('Database cached');
        } catch (e) {
            console.error('Cache write error:', e);
        }
    }

    // ############ FUNKTIONEN ############

    function preloadImage(url) {
        if (!url) return;
        const img = new Image();
        img.src = url;
    }

    /**
     * Initialize Fuse.js for fuzzy searching
     */
    function initFuseSearch() {
        if (typeof Fuse === 'undefined') {
            console.warn('Fuse.js not loaded, falling back to basic search');
            return;
        }
        
        fuse = new Fuse(database, {
            keys: ['Name', 'Desc', 'URL'],
            threshold: 0.4, // Range 0.0-1.0: Lower = stricter. 0.4 means ~60% similarity required
            distance: 100,
            includeScore: true
        });
    }

    // ANGEPASST: Lädt jetzt direkt JSON von der Apps Script API mit Caching
    async function loadDatabase() {
        if (!CONFIG.API_ENDPOINT || !CONFIG.API_ENDPOINT.startsWith('https://')) {
            showToast('Invalid API configuration!', 'error');
            return;
        }

        // Check cache first
        const cachedData = getCachedDatabase();
        if (cachedData) {
            database = cachedData;
            initFuseSearch();
            populateFilterDropdown();
            switchView(searchView);
            showToast('Loaded from cache', 'info', 2000);
            return;
        }

        const loadingToast = showToast('Loading database...', 'loading', 0);
        
        try {
            const response = await fetch(CONFIG.API_ENDPOINT);
            // Wir erwarten direkt JSON, kein CSV mehr! PapaParse wird nicht mehr benötigt.
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            database = data;
            setCachedDatabase(data); // Cache the response
            initFuseSearch();
            console.log('Datenbank von API geladen. Erster Eintrag:', database[0]);
            populateFilterDropdown();
            // Erfolgreich geladen: Ladebildschirm ausblenden, Suche einblenden
            switchView(searchView);
            removeToast(loadingToast);
            showToast('Database loaded successfully!', 'success');
        } catch (error) {
            console.error('Fehler beim Laden der Datenbank von der API:', error);
            removeToast(loadingToast);
            showToast('Failed to load database: ' + error.message, 'error', 5000);
            // Auch bei Fehler: Ladebildschirm ausblenden, damit die Seite nicht hängt
            loadingScreen.innerHTML = '<div class="loading-container"><p style="color: var(--danger-color);">Failed to load database.</p></div>';
        }
    }

    // --- Der Rest des Codes ist identisch, da er bereits mit einem Array von Objekten arbeitet ---
    // --- Du kannst ihn einfach so übernehmen. ---

    function switchView(targetView, scrollPosition = 0) {
        // Alle Ansichten ausblenden, auch den Ladebildschirm
        allViews.forEach(view => {
            view.classList.remove('active-view');
            // Optional: Wenn .hidden-Klasse für sofortiges Ausblenden verwendet wird
            if (!view.classList.contains('hidden')) {
                 view.classList.add('hidden');
            }
        });

        // Zielansicht einblenden
        targetView.classList.remove('hidden');
        // Fade-in Animation auslösen
        targetView.classList.add('active-view');

        window.scrollTo(0, scrollPosition);
    }
    
    function setActiveNav(activeButton) {
        [navSearchBtn, navContactBtn].forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
    }

    function populateFilterDropdown() {
        const mediatypes = [...new Set(database.map(item => item.Medientyp).filter(Boolean))];
        mediatypes.sort();
        mediatypeFilterSelect.innerHTML = '<option value="">-- Alle --</option>';
        mediatypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            mediatypeFilterSelect.appendChild(option);
        });
    }

function handleSearch() {
        const searchTerm = searchTermInput.value.trim().toLowerCase();
        const useFilter = filterToggle.checked;
        const mediatype = mediatypeFilterSelect.value;
        const isExactMatch = exactSearchToggle.checked;

        let filteredData = database;

        if (searchTerm) {
            // Use Fuse.js for fuzzy search if available and not in exact mode
            if (fuse && !isExactMatch) {
                const fuseResults = fuse.search(searchTerm);
                filteredData = fuseResults.map(result => result.item);
            } else {
                filteredData = filteredData.filter(item => {
                    const name = (item.Name || '').toLowerCase();
                    const desc = (item.Desc || '').toLowerCase();
                    const url = (item.URL || '').toLowerCase();

                    if (isExactMatch) {
                        return name === searchTerm;
                    } else {
                        return name.includes(searchTerm) || 
                               desc.includes(searchTerm) || 
                               url.includes(searchTerm);
                    }
                });
            }
        }

        if (useFilter && mediatype) {
            filteredData = filteredData.filter(item => item.Medientyp === mediatype);
        }

        // Hide autocomplete when searching
        autocompleteDropdown.classList.add('hidden');
        displayResults(filteredData);
    }

    /**
     * Handle autocomplete suggestions
     * @param {string} searchTerm - Current search term
     */
    function handleAutocomplete(searchTerm) {
        if (!searchTerm || searchTerm.length < 2) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        let suggestions = [];
        
        if (fuse) {
            // Use Fuse.js for fuzzy matching
            const results = fuse.search(searchTerm);
            suggestions = results.slice(0, 8).map(r => r.item);
        } else {
            // Fallback to basic matching
            suggestions = database.filter(item => {
                const name = (item.Name || '').toLowerCase();
                return name.includes(searchTerm.toLowerCase());
            }).slice(0, 8);
        }

        if (suggestions.length === 0) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        autocompleteDropdown.innerHTML = '';
        suggestions.forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `
                <span class="autocomplete-name">${sanitizeHTML(item.Name)}</span>
                <span class="autocomplete-type">${sanitizeHTML(item.Medientyp || '')}</span>
            `;
            div.addEventListener('click', () => {
                searchTermInput.value = item.Name;
                autocompleteDropdown.classList.add('hidden');
                handleSearch();
            });
            autocompleteDropdown.appendChild(div);
        });
        
        autocompleteDropdown.classList.remove('hidden');
    }

    // Create debounced version of autocomplete handler
    const debouncedAutocomplete = debounce((value) => {
        handleAutocomplete(value);
    }, CONFIG.DEBOUNCE_DELAY);


    function displayResults(data) {
        lastResults = data;
        resultsContainer.innerHTML = '';
        
        if (data.length === 0) {
            resultsContainer.innerHTML = '<p>Keine Ergebnisse gefunden.</p>';
            switchView(resultsView);
            return;
        }

        const groupedResults = data.reduce((acc, item) => {
            const key = item.Medientyp || 'Sonstige';
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});

        const sortedKeys = Object.keys(groupedResults).sort();

        for (const group of sortedKeys) {
            const groupContainer = document.createElement('div');
            groupContainer.className = 'results-group';
            groupContainer.innerHTML = `<h2>${group}</h2>`;

            const grid = document.createElement('div');
            grid.className = 'results-grid';

            groupedResults[group].forEach(item => {
                const card = document.createElement('div');
                card.className = 'result-card glass-effect'; // Added glass-effect class
                card.dataset.id = item.ID;

                let thumbnailHtml;
                const sanitizedImageUrl = escapeCSSUrl(item.ImageURL);
                const sanitizedUrl = sanitizeURL(item.URL);
                
                if (sanitizedImageUrl) {
                    thumbnailHtml = `<div class="thumbnail" style="background-image: url('${sanitizedImageUrl}')"></div>`;
                    preloadImage(item.ImageURL);
                } else if (sanitizedUrl) {
                    const thumUrl = `https://image.thum.io/get/width/400/crop/300/${encodeURIComponent(sanitizedUrl)}`;
                    thumbnailHtml = `<div class="thumbnail" style="background-image: url('${thumUrl}')"></div>`;
                    preloadImage(`https://image.thum.io/get/width/800/${encodeURIComponent(sanitizedUrl)}`);
                } else {
                    thumbnailHtml = `<div class="thumbnail">Kein Bild verfügbar</div>`;
                }

                const favoriteClass = isFavorite(item.ID) ? 'active' : '';
                const favoriteIcon = isFavorite(item.ID) ? 'star' : 'star_border';
                
                card.innerHTML = `
                    ${thumbnailHtml}
                    <button class="favorite-btn ${favoriteClass}" data-id="${item.ID}" title="Add to favorites">
                        <span class="material-symbols-outlined">${favoriteIcon}</span>
                    </button>
                    <div class="card-info">
                        <h3 class="card-title">${sanitizeHTML(item.Name)}</h3>
                        <p class="card-id">ID: ${sanitizeHTML(String(item.ID))}</p>
                    </div>
                `;
                
                // Add favorite button click handler
                const favBtn = card.querySelector('.favorite-btn');
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFavorite(item.ID);
                });
                
                card.addEventListener('click', () => {
                    sessionStorage.setItem('scrollPosition', window.scrollY);
                    showDetails(item.ID);
                });
                grid.appendChild(card);
            });
            groupContainer.appendChild(grid);
            resultsContainer.appendChild(groupContainer);
        }
        switchView(resultsView);
    }
    
    function showDetails(id) {
        const item = database.find(d => String(d.ID) === String(id));
        if (!item) return;

        const detailContent = document.getElementById('detail-content');
        
        const sanitizedImageUrl = sanitizeURL(item.ImageURL);
        const sanitizedUrl = sanitizeURL(item.URL);
        
        let imageHtml;
        if (sanitizedImageUrl) {
            imageHtml = `<img src="${sanitizedImageUrl}" alt="Vorschau von ${sanitizeHTML(item.Name)}">`;
        } else if (sanitizedUrl) {
             const thumUrl = `https://image.thum.io/get/width/800/${encodeURIComponent(sanitizedUrl)}`;
             imageHtml = `<img src="${thumUrl}" alt="Vorschau von ${sanitizeHTML(item.Name)}">`;
        } else {
            imageHtml = '';
        }
        
        let urlHtml = sanitizedUrl 
            ? `<a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer">${sanitizeHTML(item.URL)}</a>`
            : `<span class="unavailable-url">URL nicht verfügbar</span>`;

        const favoriteClass = isFavorite(item.ID) ? 'active' : '';
        const favoriteIcon = isFavorite(item.ID) ? 'star' : 'star_border';

        detailContent.innerHTML = `
            ${imageHtml}
            <div class="detail-header">
                <h2>${sanitizeHTML(item.Name)}</h2>
                <button class="favorite-btn detail-favorite ${favoriteClass}" data-id="${item.ID}" title="Add to favorites">
                    <span class="material-symbols-outlined">${favoriteIcon}</span>
                </button>
            </div>
            <p><strong>Mediatyp:</strong> ${sanitizeHTML(item.Medientyp || 'N/A')}</p>
            <p><strong>Description</strong> ${sanitizeHTML(item.Desc || 'Keine Beschreibung verfügbar.')}</p>
            <p><strong>URL:</strong> ${urlHtml}</p>
        `;

        // Add favorite button click handler
        const favBtn = detailContent.querySelector('.favorite-btn');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                toggleFavorite(item.ID);
            });
        }

        switchView(detailView);
    }
    
    // --- Event Listener ---
    filterToggle.addEventListener('change', () => {
        mediatypeFilterSelect.classList.toggle('hidden', !filterToggle.checked);
    });
    searchButton.addEventListener('click', handleSearch);
    
    // Debounced search input for autocomplete
    searchTermInput.addEventListener('input', (e) => {
        debouncedAutocomplete(e.target.value);
    });
    
    searchTermInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            autocompleteDropdown.classList.add('hidden');
            handleSearch();
        }
    });

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-input-wrapper')) {
            autocompleteDropdown.classList.add('hidden');
        }
    });

    exploreButton.addEventListener('click', () => displayResults(database));
    backToSearchBtn.addEventListener('click', () => switchView(searchView));
    backToResultsBtn.addEventListener('click', () => {
        const storedPosition = sessionStorage.getItem('scrollPosition') || 0;
        switchView(resultsView, parseInt(storedPosition, 10));
    });
    navSearchBtn.addEventListener('click', () => {
        switchView(searchView);
        setActiveNav(navSearchBtn);
    });
    navContactBtn.addEventListener('click', () => {
        switchView(contactView);
        setActiveNav(navContactBtn);
    });
    logoHomeButton.addEventListener('click', () => {
         switchView(searchView);
         setActiveNav(navSearchBtn);
    });
    function showForm(formToShow) {
        feedbackForm.classList.add('hidden');
        submitForm.classList.add('hidden');
        if (formToShow) formToShow.classList.remove('hidden');
    }
    showFeedbackBtn.addEventListener('click', () => showForm(feedbackForm));
    showSubmitBtn.addEventListener('click', () => showForm(submitForm));
    submitSiteLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(contactView);
        setActiveNav(navContactBtn);
        showForm(submitForm);
    });
    feedbackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Feedback-Funktion ist noch nicht implementiert.', 'info');
    });
    submitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Submit-Funktion ist noch nicht implementiert.', 'info');
    });

    // ############ INITIALISIERUNG ############
    loadDatabase();
    setActiveNav(navSearchBtn);
});
