document.addEventListener('DOMContentLoaded', () => {
    // ############ KONFIGURATION ############
    // HIER DEINE NEUE WEB-APP-URL EINFÜGEN
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbws3rG5E4Q6jzy1bJDzjKSxQH-syVyQ95K2uBNAQeHeuJH76xdLXSg5_eVUO4841h05/exec';

    // ############ VARIABLEN & ELEMENTE ############
    let database = [];
    let lastResults = [];

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

    // ############ FUNKTIONEN ############

    function preloadImage(url) {
        if (!url) return;
        const img = new Image();
        img.src = url;
    }

    // ANGEPASST: Lädt jetzt direkt JSON von der Apps Script API
    async function loadDatabase() {
        if (!APPS_SCRIPT_URL || !APPS_SCRIPT_URL.startsWith('https://')) {
            alert('Bitte füge deine gültige Apps Script Web-App-URL in der script.js Datei ein!');
            return;
        }
        try {
            const response = await fetch(APPS_SCRIPT_URL);
            // Wir erwarten direkt JSON, kein CSV mehr! PapaParse wird nicht mehr benötigt.
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            database = data;
            console.log('Datenbank von API geladen. Erster Eintrag:', database[0]);
            populateFilterDropdown();
        } catch (error) {
            console.error('Fehler beim Laden der Datenbank von der API:', error);
            alert('Die Datenbank konnte nicht geladen werden. Prüfe die API-URL und die Bereitstellungseinstellungen. Fehlermeldung: ' + error.message);
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
            filteredData = filteredData.filter(item => {
                const name = (item.Name || '').toLowerCase();
                const desc = (item.Beschreibung || '').toLowerCase();
                // NEU: Auch die URL für die Suche vorbereiten
                const url = (item.URL || '').toLowerCase();

                if (isExactMatch) {
                    // Exakte Suche bezieht sich typischerweise nur auf den Namen.
                    return name === searchTerm;
                } else {
                    // NEU: Die URL zur "contains"-Suche hinzufügen
                    return name.includes(searchTerm) || 
                           desc.includes(searchTerm) || 
                           url.includes(searchTerm);
                }
            });
        }

        if (useFilter && mediatype) {
            filteredData = filteredData.filter(item => item.Medientyp === mediatype);
        }

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
            groupContainer.innerHTML = `<h2>${group}</h2>`;

            const grid = document.createElement('div');
            grid.className = 'results-grid';

            groupedResults[group].forEach(item => {
                const card = document.createElement('div');
                card.className = 'result-card';
                card.dataset.id = item.ID;

                let thumbnailHtml;
                if (item.ImageURL && item.ImageURL.startsWith('http')) {
                    thumbnailHtml = `<div class="thumbnail" style="background-image: url('${item.ImageURL}')"></div>`;
                    preloadImage(item.ImageURL);
                } else if (item.URL && item.URL.startsWith('http')) {
                    const thumUrl = `https://image.thum.io/get/width/400/crop/300/${encodeURIComponent(item.URL)}`;
                    thumbnailHtml = `<div class="thumbnail" style="background-image: url('${thumUrl}')"></div>`;
                    preloadImage(`https://image.thum.io/get/width/800/${encodeURIComponent(item.URL)}`);
                } else {
                    thumbnailHtml = `<div class="thumbnail">Kein Bild verfügbar</div>`;
                }
                
                card.innerHTML = `
                    ${thumbnailHtml}
                    <div class="card-info">
                        <h3 class="card-title">${item.Name}</h3>
                        <p class="card-id">ID: ${item.ID}</p>
                    </div>
                `;
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
            imageHtml = `<img src="${item.ImageURL}" alt="Vorschau von ${item.Name}">`;
        } else if (item.URL && item.URL.startsWith('http')) {
             const thumUrl = `https://image.thum.io/get/width/800/${encodeURIComponent(item.URL)}`;
             imageHtml = `<img src="${thumUrl}" alt="Vorschau von ${item.Name}">`;
        } else {
            imageHtml = '';
        }
        
        const isValidUrl = item.URL && item.URL.startsWith('http');
        let urlHtml = isValidUrl 
            ? `<a href="${item.URL}" target="_blank" rel="noopener noreferrer">${item.URL}</a>`
            : `<span class="unavailable-url">URL nicht verfügbar</span>`;

        detailContent.innerHTML = `
            ${imageHtml}
            <h2>${item.Name}</h2>
            <p><strong>Medientyp:</strong> ${item.Medientyp || 'N/A'}</p>
            <p><strong>Beschreibung:</strong> ${item.Beschreibung || 'Keine Beschreibung verfügbar.'}</p>
            <p><strong>URL:</strong> ${urlHtml}</p>
        `;
        switchView(detailView);
    }
    
    // --- Event Listener ---
    filterToggle.addEventListener('change', () => {
        mediatypeFilterSelect.classList.toggle('hidden', !filterToggle.checked);
    });
    searchButton.addEventListener('click', handleSearch);
    searchTermInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch();
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
        alert('Feedback-Funktion ist noch nicht implementiert.');
    });
    submitForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Submit-Funktion ist noch nicht implementiert.');
    });

    // ############ INITIALISIERUNG ############
    loadDatabase();
    setActiveNav(navSearchBtn);
});
