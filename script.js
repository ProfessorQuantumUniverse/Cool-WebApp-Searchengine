// Ersetze den kompletten Inhalt deiner script.js Datei hiermit
document.addEventListener('DOMContentLoaded', () => {
    // ############ KONFIGURATION ############
    // Ersetze dies mit dem Link aus "Datei > Freigeben > Im Web veröffentlichen"
    const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSBBqzOsNzp1-erXm92Vuob7O4UrCluGxUGWQyis7Tag7sOhg2Vroiunhy5Jy0RcYaZF604GJ5IeubV/pub?gid=708853183&single=true&output=csv';

    // ############ VARIABLEN & ELEMENTE ############
    let database = [];
    let lastResults = [];

    // Views
    const searchView = document.getElementById('search-view');
    const resultsView = document.getElementById('results-view');
    const detailView = document.getElementById('detail-view');
    const contactView = document.getElementById('contact-view');
    const allViews = [searchView, resultsView, detailView, contactView];

    // Suchelemente
    const searchTermInput = document.getElementById('search-term');
    const filterToggle = document.getElementById('filter-mediatype-toggle');
    const mediatypeFilterSelect = document.getElementById('mediatype-filter');
    const exactSearchToggle = document.getElementById('exact-search-toggle');
    const searchButton = document.getElementById('search-button');
    const exploreButton = document.getElementById('explore-button');
    
    // Ergebniselemente
    const resultsContainer = document.getElementById('results-container');
    
    // Navigation & Buttons
    const navSearchBtn = document.getElementById('nav-search-btn');
    const navContactBtn = document.getElementById('nav-contact-btn');
    const logoHomeButton = document.getElementById('logo-home-button');
    const backToSearchBtn = document.getElementById('back-to-search-btn');
    const backToResultsBtn = document.getElementById('back-to-results-btn');

    // Kontakt- & Formular-Elemente
    const submitSiteLink = document.getElementById('submit-new-site-link');
    const showFeedbackBtn = document.getElementById('show-feedback-form');
    const showSubmitBtn = document.getElementById('show-submit-form');
    const feedbackForm = document.getElementById('feedback-form');
    const submitForm = document.getElementById('submit-form');


    // ############ FUNKTIONEN ############

    // --- Daten laden ---
    async function loadDatabase() {
        if (!GOOGLE_SHEET_CSV_URL.startsWith('https://')) {
            alert('Bitte füge einen gültigen Google Sheet CSV Link in der script.js Datei ein!');
            return;
        }
        try {
            const response = await fetch(GOOGLE_SHEET_CSV_URL);
            const csvText = await response.text();
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    // WICHTIG: Erwarte jetzt Spalten wie ID, Name, Beschreibung, URL, Medientyp, ImageURL
                    database = results.data;
                    console.log('Datenbank geladen:', database);
                    populateFilterDropdown();
                }
            });
        } catch (error) {
            console.error('Fehler beim Laden der Datenbank:', error);
            alert('Die Datenbank konnte nicht geladen werden. Prüfe den Link und deine Internetverbindung.');
        }
    }

    // --- Ansichten wechseln ---
    function switchView(targetView) {
        allViews.forEach(view => view.classList.remove('active-view'));
        targetView.classList.add('active-view');
        window.scrollTo(0, 0);
    }
    
    function setActiveNav(activeButton) {
        [navSearchBtn, navContactBtn].forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
    }

    // --- Filter-Dropdown füllen ---
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

    // --- Suchlogik ---
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
                if (isExactMatch) {
                    return name === searchTerm;
                } else {
                    return name.includes(searchTerm) || desc.includes(searchTerm);
                }
            });
        }

        if (useFilter && mediatype) {
            filteredData = filteredData.filter(item => item.Medientyp === mediatype);
        }

        displayResults(filteredData);
    }

    // --- Ergebnisse anzeigen ---
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

                // NEU: Logik für Bild-URL aus dem Spreadsheet
                const imageUrl = item.ImageURL && item.ImageURL.startsWith('http') ? item.ImageURL : '';
                
                card.innerHTML = `
                    <div class="thumbnail" style="${imageUrl ? `background-image: url('${imageUrl}')` : ''}">
                        ${!imageUrl ? 'Kein Bild verfügbar' : ''}
                    </div>
                    <div class="card-info">
                        <h3 class="card-title">${item.Name}</h3>
                        <p class="card-id">ID: ${item.ID}</p>
                    </div>
                `;
                card.addEventListener('click', () => showDetails(item.ID));
                grid.appendChild(card);
            });
            groupContainer.appendChild(grid);
            resultsContainer.appendChild(groupContainer);
        }

        switchView(resultsView);
    }
    
    // --- Detailansicht anzeigen ---
    function showDetails(id) {
        const item = database.find(d => d.ID == id);
        if (!item) return;

        const detailContent = document.getElementById('detail-content');
        
        // NEU: Logik für Bild-URL und ungültige URL
        const imageUrl = item.ImageURL && item.ImageURL.startsWith('http') ? item.ImageURL : '';
        const isValidUrl = item.URL && item.URL.startsWith('http');
        
        let urlHtml;
        if (isValidUrl) {
            urlHtml = `<a href="${item.URL}" target="_blank" rel="noopener noreferrer">${item.URL}</a>`;
        } else {
            urlHtml = `<span class="unavailable-url">URL nicht verfügbar</span>`;
        }

        detailContent.innerHTML = `
            ${imageUrl ? `<img src="${imageUrl}" alt="Vorschau von ${item.Name}">` : ''}
            <h2>${item.Name}</h2>
            <p><strong>Medientyp:</strong> ${item.Medientyp || 'N/A'}</p>
            <p><strong>Beschreibung:</strong> ${item.Beschreibung || 'Keine Beschreibung verfügbar.'}</p>
            <p><strong>URL:</strong> ${urlHtml}</p>
        `;
        switchView(detailView);
    }
    
    // --- Event Listener (unverändert) ---
    filterToggle.addEventListener('change', () => {
        mediatypeFilterSelect.classList.toggle('hidden', !filterToggle.checked);
    });

    searchButton.addEventListener('click', handleSearch);
    searchTermInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    exploreButton.addEventListener('click', () => displayResults(database));
    
    backToSearchBtn.addEventListener('click', () => switchView(searchView));
    backToResultsBtn.addEventListener('click', () => displayResults(lastResults));
    
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
        formToShow.classList.remove('hidden');
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