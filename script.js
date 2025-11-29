// ############ HTTPS REDIRECT ############
(function() {
    const isLocalDev = ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname);
    if (location.protocol === 'http:' && !isLocalDev) {
        location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    // ############ KONFIGURATION ############
    const CONFIG = {
        API_URL: 'https://script.google.com/macros/s/AKfycbws3rG5E4Q6jzy1bJDzjKSxQH-syVyQ95K2uBNAQeHeuJH76xdLXSg5_eVUO4841h05/exec',
        CACHE_KEY: 'webapp_database',
        CACHE_TIMESTAMP_KEY: 'webapp_database_timestamp',
        CACHE_DURATION_MS: 30 * 60 * 1000, // 30 minutes
        FAVORITES_KEY: 'favorites',
        DEBOUNCE_DELAY: 300
    };

    // ############ SECURITY: HTML SANITIZATION ############
    function sanitizeHTML(str) {
        if (str == null) return '';
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    // Validate and sanitize URL for use in HTML attributes
    function sanitizeURLForAttr(url) {
        if (!url) return '';
        // Block dangerous URL schemes
        const lowerUrl = url.toLowerCase().trim();
        if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:')) {
            return '';
        }
        // Encode the URL and also escape single/double quotes for safe HTML attribute usage
        return encodeURI(url).replace(/'/g, '%27').replace(/"/g, '%22');
    }

    // ############ TOAST NOTIFICATION SYSTEM ############
    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('toast-show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ############ DEBOUNCE UTILITY ############
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

    // ############ VARIABLEN & ELEMENTE ############
    let database = [];
    let lastResults = [];
    let fuseInstance = null;

    // ... (alle anderen Element-Variablen bleiben gleich) ...
    const loadingOverlay = document.getElementById('loading-overlay');
    const header = document.querySelector('header');
    const main = document.querySelector('main');
    const searchView = document.getElementById('search-view');
    const resultsView = document.getElementById('results-view');
    const detailView = document.getElementById('detail-view');
    const contactView = document.getElementById('contact-view');
    const allViews = [searchView, resultsView, detailView, contactView];
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

    // ############ FAVORITES SYSTEM ############
    function getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.FAVORITES_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveFavorites(favorites) {
        localStorage.setItem(CONFIG.FAVORITES_KEY, JSON.stringify(favorites));
    }

    function toggleFavorite(id) {
        const favorites = getFavorites();
        const idStr = String(id);
        const index = favorites.indexOf(idStr);
        if (index > -1) {
            favorites.splice(index, 1);
            showToast('Removed from favorites', 'info');
        } else {
            favorites.push(idStr);
            showToast('Added to favorites!', 'success');
        }
        saveFavorites(favorites);
        return favorites.includes(idStr);
    }

    function isFavorite(id) {
        return getFavorites().includes(String(id));
    }

    // ############ FUNKTIONEN ############

    function preloadImage(url) {
        if (!url) return;
        const img = new Image();
        img.src = url;
    }

    // ############ CACHING FUNCTIONS ############
    function getCachedDatabase() {
        try {
            const cachedData = localStorage.getItem(CONFIG.CACHE_KEY);
            const cachedTimestamp = localStorage.getItem(CONFIG.CACHE_TIMESTAMP_KEY);
            
            if (cachedData && cachedTimestamp) {
                const age = Date.now() - parseInt(cachedTimestamp, 10);
                if (age < CONFIG.CACHE_DURATION_MS) {
                    return JSON.parse(cachedData);
                }
            }
        } catch (e) {
            console.warn('Cache read error:', e);
        }
        return null;
    }

    function setCachedDatabase(data) {
        try {
            localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(CONFIG.CACHE_TIMESTAMP_KEY, String(Date.now()));
        } catch (e) {
            console.warn('Cache write error:', e);
        }
    }

    // ############ FUZZY SEARCH INITIALIZATION ############
    function initFuseSearch() {
        if (typeof Fuse !== 'undefined' && database.length > 0) {
            fuseInstance = new Fuse(database, {
                keys: ['Name', 'Desc', 'URL'],
                threshold: 0.4,
                includeScore: true,
                minMatchCharLength: 2
            });
        }
    }

    // ANGEPASST: Lädt jetzt direkt JSON von der Apps Script API mit Caching
    async function loadDatabase() {
        if (!CONFIG.API_URL || !CONFIG.API_URL.startsWith('https://')) {
            showToast('Please add a valid Apps Script Web-App-URL!', 'error', 5000);
            return;
        }

        // Check cache first
        const cachedData = getCachedDatabase();
        if (cachedData) {
            database = cachedData;
            console.log('Database loaded from cache. First entry:', database[0]);
            populateFilterDropdown();
            initFuseSearch();
            loadingOverlay.style.display = 'none';
            header.classList.remove('content-hidden');
            main.classList.remove('content-hidden');
            showToast('Data loaded from cache', 'info', 2000);
            return;
        }

        try {
            showToast('Loading data...', 'info', 2000);
            const response = await fetch(CONFIG.API_URL);
            // Wir erwarten direkt JSON, kein CSV mehr! PapaParse wird nicht mehr benötigt.
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            database = data;
            setCachedDatabase(data);
            console.log('Datenbank von API geladen. Erster Eintrag:', database[0]);
            populateFilterDropdown();
            initFuseSearch();
            showToast('Data loaded successfully!', 'success');
        } catch (error) {
            console.error('Fehler beim Laden der Datenbank von der API:', error);
            showToast('Could not load database. Error: ' + error.message, 'error', 5000);
        } finally {
            // Lade-Overlay ausblenden und Hauptinhalt einblenden
            loadingOverlay.style.display = 'none';
            header.classList.remove('content-hidden');
            main.classList.remove('content-hidden');
        }
    }

    // --- Der Rest des Codes ist identisch, da er bereits mit einem Array von Objekten arbeitet ---
    // --- Du kannst ihn einfach so übernehmen. ---

    function switchView(targetView, scrollPosition = 0) {
        allViews.forEach(view => view.classList.remove('active-view'));
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
            if (isExactMatch) {
                // Exact match mode
                filteredData = filteredData.filter(item => {
                    const name = (item.Name || '').toLowerCase();
                    return name === searchTerm;
                });
            } else if (fuseInstance) {
                // Use fuzzy search with Fuse.js
                const fuseResults = fuseInstance.search(searchTerm);
                filteredData = fuseResults.map(result => result.item);
            } else {
                // Fallback to simple contains search
                filteredData = filteredData.filter(item => {
                    const name = (item.Name || '').toLowerCase();
                    const desc = (item.Desc || '').toLowerCase();
                    const url = (item.URL || '').toLowerCase();
                    return name.includes(searchTerm) || 
                           desc.includes(searchTerm) || 
                           url.includes(searchTerm);
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
            groupContainer.innerHTML = `<h2>${sanitizeHTML(group)}</h2>`;

            const grid = document.createElement('div');
            grid.className = 'results-grid';

            groupedResults[group].forEach(item => {
                const card = document.createElement('div');
                card.className = 'result-card';
                card.dataset.id = item.ID;

                let thumbnailHtml;
                if (item.ImageURL && item.ImageURL.startsWith('http')) {
                    thumbnailHtml = `<div class="thumbnail" style="background-image: url('${sanitizeURLForAttr(item.ImageURL)}')"></div>`;
                    preloadImage(item.ImageURL);
                } else if (item.URL && item.URL.startsWith('http')) {
                    const thumUrl = `https://image.thum.io/get/width/400/crop/300/${encodeURIComponent(item.URL)}`;
                    thumbnailHtml = `<div class="thumbnail" style="background-image: url('${thumUrl}')"></div>`;
                    preloadImage(`https://image.thum.io/get/width/800/${encodeURIComponent(item.URL)}`);
                } else {
                    thumbnailHtml = `<div class="thumbnail">Kein Bild verfügbar</div>`;
                }
                
                const isFav = isFavorite(item.ID);
                const sanitizedId = sanitizeHTML(String(item.ID));
                
                card.innerHTML = `
                    ${thumbnailHtml}
                    <div class="card-info">
                        <div class="card-header">
                            <h3 class="card-title">${sanitizeHTML(item.Name)}</h3>
                            <button class="favorite-btn ${isFav ? 'active' : ''}" data-id="${sanitizedId}" title="Toggle favorite">
                                ${isFav ? '★' : '☆'}
                            </button>
                        </div>
                        <p class="card-id">ID: ${sanitizedId}</p>
                    </div>
                `;
                
                // Favorite button click handler
                const favBtn = card.querySelector('.favorite-btn');
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isNowFav = toggleFavorite(item.ID);
                    favBtn.classList.toggle('active', isNowFav);
                    favBtn.textContent = isNowFav ? '★' : '☆';
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
        
        let imageHtml;
        if (item.ImageURL && item.ImageURL.startsWith('http')) {
            imageHtml = `<img src="${sanitizeURLForAttr(item.ImageURL)}" alt="Vorschau von ${sanitizeHTML(item.Name)}">`;
        } else if (item.URL && item.URL.startsWith('http')) {
             const thumUrl = `https://image.thum.io/get/width/800/${encodeURIComponent(item.URL)}`;
             imageHtml = `<img src="${thumUrl}" alt="Vorschau von ${sanitizeHTML(item.Name)}">`;
        } else {
            imageHtml = '';
        }
        
        const isValidUrl = item.URL && item.URL.startsWith('http');
        let urlHtml = isValidUrl 
            ? `<a href="${sanitizeURLForAttr(item.URL)}" target="_blank" rel="noopener noreferrer">${sanitizeHTML(item.URL)}</a>`
            : `<span class="unavailable-url">URL nicht verfügbar</span>`;

        const isFav = isFavorite(item.ID);
        const sanitizedId = sanitizeHTML(String(item.ID));

        detailContent.innerHTML = `
            ${imageHtml}
            <div class="detail-header">
                <h2>${sanitizeHTML(item.Name)}</h2>
                <button class="favorite-btn detail-fav ${isFav ? 'active' : ''}" data-id="${sanitizedId}" title="Toggle favorite">
                    ${isFav ? '★' : '☆'}
                </button>
            </div>
            <p><strong>Medientyp:</strong> ${sanitizeHTML(item.Medientyp) || 'N/A'}</p>
            <p><strong>Beschreibung:</strong> ${sanitizeHTML(item.Desc) || 'Keine Beschreibung verfügbar.'}</p>
            <p><strong>URL:</strong> ${urlHtml}</p>
        `;

        // Favorite button in detail view
        const detailFavBtn = detailContent.querySelector('.detail-fav');
        if (detailFavBtn) {
            detailFavBtn.addEventListener('click', () => {
                const isNowFav = toggleFavorite(item.ID);
                detailFavBtn.classList.toggle('active', isNowFav);
                detailFavBtn.textContent = isNowFav ? '★' : '☆';
            });
        }

        switchView(detailView);
    }
    
    // --- Event Listener ---
    filterToggle.addEventListener('change', () => {
        mediatypeFilterSelect.classList.toggle('hidden', !filterToggle.checked);
    });
    searchButton.addEventListener('click', handleSearch);
    searchTermInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            autocompleteDropdown.classList.add('hidden');
            handleSearch();
        }
    });

    // ############ AUTOCOMPLETE FUNCTIONALITY ############
    function showAutocomplete(term) {
        if (!term || term.length < 2 || database.length === 0) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        let suggestions = [];
        
        if (fuseInstance) {
            const fuseResults = fuseInstance.search(term, { limit: 8 });
            suggestions = fuseResults.map(r => r.item);
        } else {
            const lowerTerm = term.toLowerCase();
            suggestions = database
                .filter(item => (item.Name || '').toLowerCase().includes(lowerTerm))
                .slice(0, 8);
        }

        if (suggestions.length === 0) {
            autocompleteDropdown.classList.add('hidden');
            return;
        }

        autocompleteDropdown.innerHTML = '';
        const fragment = document.createDocumentFragment();
        suggestions.forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = item.Name;
            div.addEventListener('click', () => {
                searchTermInput.value = item.Name;
                autocompleteDropdown.classList.add('hidden');
                handleSearch();
            });
            fragment.appendChild(div);
        });
        autocompleteDropdown.appendChild(fragment);
        autocompleteDropdown.classList.remove('hidden');
    }

    // Debounced autocomplete handler
    const debouncedAutocomplete = debounce((value) => {
        showAutocomplete(value);
    }, CONFIG.DEBOUNCE_DELAY);

    searchTermInput.addEventListener('input', (e) => {
        debouncedAutocomplete(e.target.value.trim());
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
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
        showToast('Feedback function is not yet implemented.', 'info');
    });
    submitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Submit function is not yet implemented.', 'info');
    });

    // ############ INITIALISIERUNG ############
    loadDatabase();
    setActiveNav(navSearchBtn);
});
