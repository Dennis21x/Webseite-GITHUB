// --- START: FIREBASE INITIALISIERUNG ---
// WICHTIG: Ersetze die Konfigurationswerte durch deine eigenen Firebase-Projektdaten.
const firebaseConfig = {
  apiKey: "AIzaSyCvifDZmGpcTPWgZngCJXySeLC8PzyStmI",
  authDomain: "mobileentnahme.firebaseapp.com",
  projectId: "mobileentnahme",
  storageBucket: "mobileentnahme.firebasestorage.app",
  messagingSenderId: "319547749510",
  appId: "1:319547749510:web:6537d0d47ed460035ecd07",
  measurementId: "G-Q6QSPFFQDH"
};

// Initialisiere Firebase
firebase.initializeApp(firebaseConfig);

// Initialisiere die Firestore-Datenbank und weise sie der globalen 'db' Variable zu.
// Dein restlicher Code kann jetzt auf 'db' zugreifen.
const db = firebase.firestore();
// --- ENDE: FIREBASE INITIALISIERUNG ---


// Globale Variablen
let materialDatabase = {
    primary: {}, // Primäre SAP-Nummern -> {beschreibung, alternativeNr}
    alternative: {} // Alternative SAP-Nummern -> primäreNr
};
let normalHistoryData = []; 
let clarificationCasesData = []; 
const ADMIN_PIN = "100400#x"; // Admin PIN-Code
let pendingSubmitData = null; // Für die Warndialoge
let isInAdminMode = false; // Track admin mode state
const MAX_MATERIAL_ROWS = 100; // Maximale Anzahl an Materialzeilen
let materialRowCount = 0; // Zähler für die aktuellen Materialzeilen


// Barcode Scanner Variablen
let codeReader = null; // Instanz des ZXing CodeReader
let currentMaterialInput = null; // Speichert das Input-Feld, das gerade gescannt werden soll
let localStream = null; // Hält den aktiven Kamera-Stream

// Datum und Uhrzeit aktualisieren
function updateDateTime() {
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('de-DE', dateOptions);
    document.getElementById('current-time').textContent = now.toLocaleTimeString('de-DE');
}

// KORRIGIERT: Funktion zum Verarbeiten der CSV-Daten
function processMaterialData(results) {
    materialDatabase = { primary: {}, alternative: {} };
    // Überspringt die Kopfzeile, falls vorhanden
    const startIndex = (results.data[0] && (results.data[0][0].toLowerCase().includes('material') || results.data[0][0].toLowerCase().includes('nummer'))) ? 1 : 0;
    let materialCount = 0, alternativeCount = 0;
    for (let i = startIndex; i < results.data.length; i++) {
        if (results.data[i].length >= 3) {
            const primaryNr = results.data[i][0] ? results.data[i][0].trim() : '';
            const alternativeNr = results.data[i][1] ? results.data[i][1].trim() : '';
            const beschreibung = results.data[i][2] ? results.data[i][2].trim() : '';
            if (primaryNr && beschreibung) {
                materialDatabase.primary[primaryNr] = { beschreibung: beschreibung, alternativeNr: alternativeNr || null };
                materialCount++;
                if (alternativeNr) { 
                    materialDatabase.alternative[alternativeNr] = primaryNr; 
                    alternativeCount++; 
                }
            }
        }
    }
    document.getElementById('databaseStatus').textContent = `Status: ${materialCount} Materialien geladen (${alternativeCount} mit alternativer Nummer).`;
    console.log("Materialdatenbank erfolgreich verarbeitet.", materialDatabase);
}


// HINZUGEFÜGT: Funktion für den manuellen CSV-Upload
function uploadMaterialDatabase(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('databaseStatus').textContent = 'Status: Lade lokale CSV-Datei...';
        Papa.parse(file, {
            delimiter: ';',
            header: false,
            skipEmptyLines: true,
            complete: function(results) {
                processMaterialData(results);
                alert('Materialdatenbank erfolgreich aus lokaler Datei geladen!');
            },
            error: function(err) {
                 document.getElementById('databaseStatus').textContent = 'Status: Fehler beim Parsen der lokalen CSV.';
                 console.error("Fehler beim Parsen der lokalen CSV:", err);
            }
        });
    }
}

// --- START: DYNAMISCHE ZEILEN FUNKTIONEN ---

// Erstellt eine neue Materialzeile und gibt das TR-Element zurück
function createMaterialRow() {
    if (materialRowCount >= MAX_MATERIAL_ROWS) return null;
    materialRowCount++;

    const row = document.createElement('tr');
    row.classList.add('material-row');
    row.innerHTML = `
        <td class="px-2 py-1" data-label="SAP-Nr.">
            <div class="material-input-group">
                <input autocomplete="off" class="material-input w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" name="material_${materialRowCount}" placeholder="SAP-Nr." type="text"/>
                <button class="barcode-scan-btn" onclick="openBarcodeScanner(${materialRowCount})" type="button"><i class="fas fa-camera"></i></button>
            </div>
            <input name="primary_material_${materialRowCount}" type="hidden"/>
        </td>
        <td class="px-2 py-1" data-label="Nachbestellen?">
             <div class="flex items-center justify-center h-full">
                <input type="checkbox" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" name="nachbestellen_${materialRowCount}">
            </div>
        </td>
        <td class="px-2 py-1" data-label="Beschreibung"><textarea autocomplete="off" class="description-field w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" name="description_${materialRowCount}" placeholder="Beschreibung" rows="2"></textarea></td>
        <td class="px-2 py-1" data-label="ME">
            <div class="me-dropdown">
                <input autocomplete="off" class="me-input w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" name="me_${materialRowCount}" placeholder="ME" type="text"/>
                <div class="me-dropdown-content">
                    <div data-text="Stück" data-value="1">1 - Stück</div><div data-text="Kilogramm" data-value="2">2 - Kilogramm</div><div data-text="Meter" data-value="3">3 - Meter</div><div data-text="Liter" data-value="4">4 - Liter</div><div data-text="Raummeter" data-value="5">5 - Raummeter</div><div data-text="Quadratmeter" data-value="6">6 - Quadratmeter</div><div data-text="Trommel" data-value="7">7 - Trommel</div><div data-text="Gitterbox" data-value="8">8 - Gitterbox</div>
                </div>
            </div>
        </td>
        <td class="px-2 py-1" data-label="Menge"><input autocomplete="off" class="menge-input w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" min="1" name="menge_${materialRowCount}" placeholder="Menge" type="number"/></td>
    `;

    // Füge Event-Listener zu den neuen Elementen hinzu
    addRowEventListeners(row);
    return row;
}

// Fügt eine neue Zeile hinzu, wenn nötig
function addRowIfNeeded() {
    const tbody = document.getElementById('material-tbody');
    const lastRow = tbody.querySelector('tr:last-child');
    if (!lastRow) return; // Sollte nicht passieren, aber sicher ist sicher

    const materialInput = lastRow.querySelector('.material-input');
    const descriptionInput = lastRow.querySelector('.description-field');

    if (materialInput.value.trim() !== '' || descriptionInput.value.trim() !== '') {
        const newRow = createMaterialRow();
        if (newRow) {
            tbody.appendChild(newRow);
        }
    }
}

// Bündelt das Hinzufügen aller Event-Listener für eine Zeile
function addRowEventListeners(rowElement) {
    // Event-Listener, um bei Eingabe eine neue Zeile zu erzeugen
    const materialInput = rowElement.querySelector('.material-input');
    const descriptionField = rowElement.querySelector('.description-field');
    
    materialInput.addEventListener('input', addRowIfNeeded);
    descriptionField.addEventListener('input', addRowIfNeeded);
    
    // Bestehende Event-Listener
    materialInput.addEventListener('blur', function() { checkMaterialNumber(this); });
    materialInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkMaterialNumber(this);
        }
    });

    descriptionField.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const rowNumber = parseInt(this.name.split('_')[1]);
            rowElement.querySelector(`[name="menge_${rowNumber}"]`).focus();
        }
    });
    
    descriptionField.addEventListener('blur', function() {
        if (this.value.trim()) {
            const rowNumber = parseInt(this.name.split('_')[1]);
            const meInput = rowElement.querySelector(`[name="me_${rowNumber}"]`);
            meInput.focus();
            meInput.parentElement.classList.add('show');
        }
    });

    rowElement.querySelectorAll('.me-dropdown-content div').forEach(option => {
        option.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            const text = this.getAttribute('data-text');
            const dropdown = this.closest('.me-dropdown');
            const inputField = dropdown.querySelector('.me-input');
            inputField.value = text;
            inputField.setAttribute('data-value', value);
            dropdown.classList.remove('show');
            this.parentElement.querySelectorAll('.highlighted').forEach(h => h.classList.remove('highlighted'));
            const rowNumber = parseInt(inputField.name.split('_')[1]);
            rowElement.querySelector(`[name="menge_${rowNumber}"]`).focus();
        });
    });

    const mengeInput = rowElement.querySelector('.menge-input');
    mengeInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const lastRowInput = document.querySelector('#material-tbody tr:last-child .material-input');
            if (lastRowInput) {
                lastRowInput.focus();
            }
        }
    });

    const meInput = rowElement.querySelector('.me-input');
    const handleMEInput = (meInputField) => {
        const value = meInputField.value.trim();
        meInputField.classList.remove('error');
        if (value === '') { meInputField.setAttribute('data-value', ''); return true; }
        const option = meInputField.nextElementSibling.querySelector(`[data-value="${value}"], [data-text="${value}"]`);
        if (option) { 
            meInputField.value = option.getAttribute('data-text');
            meInputField.setAttribute('data-value', option.getAttribute('data-value'));
            return true; 
        } else { 
            meInputField.value = ''; 
            meInputField.setAttribute('data-value', ''); 
            meInputField.classList.add('error'); 
            return false; 
        }
    };
    meInput.addEventListener('click', function() {
        const currentDropdown = this.parentElement;
        document.querySelectorAll('.me-dropdown.show').forEach(d => { if (d !== currentDropdown) d.classList.remove('show'); });
        currentDropdown.classList.toggle('show');
    });
    meInput.addEventListener('keydown', function(e) {
        const dropdown = this.parentElement;
        const dropdownContent = dropdown.querySelector('.me-dropdown-content');
        if (e.key !== 'Tab' && !dropdown.classList.contains('show')) {
             if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); dropdown.classList.add('show'); }
        }
        const options = Array.from(dropdownContent.querySelectorAll('div'));
        if (options.length === 0) return;
        const highlightedIndex = options.findIndex(opt => opt.classList.contains('highlighted'));
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (highlightedIndex < options.length - 1) {
                    if (highlightedIndex > -1) options[highlightedIndex].classList.remove('highlighted');
                    const newIndex = highlightedIndex + 1;
                    options[newIndex].classList.add('highlighted');
                    options[newIndex].scrollIntoView({ block: 'nearest' });
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (highlightedIndex > 0) {
                    options[highlightedIndex].classList.remove('highlighted');
                    const newIndex = highlightedIndex - 1;
                    options[newIndex].classList.add('highlighted');
                    options[newIndex].scrollIntoView({ block: 'nearest' });
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex > -1) { 
                    options[highlightedIndex].click(); 
                } else {
                    if (handleMEInput(this)) {
                        dropdown.classList.remove('show');
                        const rowNumber = parseInt(this.name.split('_')[1]);
                        rowElement.querySelector(`[name="menge_${rowNumber}"]`).focus();
                    }
                }
                break;
            case 'Escape': e.preventDefault(); dropdown.classList.remove('show'); break;
        }
    });
    meInput.addEventListener('blur', function() { handleMEInput(this); setTimeout(() => this.parentElement.classList.remove('show'), 150); });
}

// --- ENDE: DYNAMISCHE ZEILEN FUNKTIONEN ---


// Initialisierung
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    // Heutiges Datum als Standardwert setzen
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entnahmedatum').value = today;
    
    // Gespeicherte Daten laden
    loadAllData();
    
    // Event-Listener für manuellen Upload
    document.getElementById('materialFile').addEventListener('change', uploadMaterialDatabase);

    // Initial eine leere Zeile hinzufügen
    const initialRow = createMaterialRow();
    document.getElementById('material-tbody').appendChild(initialRow);
    
    // Formular zurücksetzen Button
    document.getElementById('clearForm').addEventListener('click', resetForm);
    
    // Formular absenden
    document.getElementById('entnahmeForm').addEventListener('submit', function(e) {
        e.preventDefault();
        let hasAtLeastOneValidRow = false;
        
        document.querySelectorAll('.material-row').forEach(row => {
            const materialInput = row.querySelector('.material-input');
            const mengeInput = row.querySelector('.menge-input');
            const descriptionInput = row.querySelector('.description-field');
            if (mengeInput.value.trim() !== '' && (materialInput.value.trim() !== '' || descriptionInput.value.trim() !== '')) {
                hasAtLeastOneValidRow = true;
            }
        });

        if (!hasAtLeastOneValidRow) {
            alert('Fehler: Es muss mindestens eine Zeile mit SAP-Nr./Beschreibung UND Menge ausgefüllt sein.');
            return;
        }

        const validationResult = validateForm();
        if (validationResult.missingMenge.length > 0) {
            const warningText = `Mengenangabe in Zeile(n) ${validationResult.missingMenge.join(', ')} fehlt! Trotzdem übertragen?`;
            document.getElementById('warningMengeText').textContent = warningText;
            document.getElementById('warningMengeDialog').classList.remove('hidden');
            pendingSubmitData = { type: 'menge', data: collectFormData() };
            return;
        }
        if (validationResult.missingKosten) {
            document.getElementById('warningKostenDialog').classList.remove('hidden');
            pendingSubmitData = { type: 'kosten', data: collectFormData() };
            return;
        }
        submitForm(collectFormData());
    });
    
    // Dialog-Handler
    document.getElementById('closeDialog').addEventListener('click', () => document.getElementById('confirmationDialog').classList.add('hidden'));
    document.getElementById('cancelWarningMenge').addEventListener('click', () => { document.getElementById('warningMengeDialog').classList.add('hidden'); pendingSubmitData = null; });
    document.getElementById('confirmWarningMenge').addEventListener('click', () => {
        document.getElementById('warningMengeDialog').classList.add('hidden');
        if (pendingSubmitData && pendingSubmitData.type === 'menge') { submitForm(pendingSubmitData.data); }
        pendingSubmitData = null;
    });
    document.getElementById('cancelWarningKosten').addEventListener('click', () => { document.getElementById('warningKostenDialog').classList.add('hidden'); pendingSubmitData = null; });
    document.getElementById('confirmWarningKosten').addEventListener('click', () => {
        document.getElementById('warningKostenDialog').classList.add('hidden');
        if (pendingSubmitData && pendingSubmitData.type === 'kosten') { submitForm(pendingSubmitData.data); }
        pendingSubmitData = null;
    });

    // Normal History Buttons
    document.getElementById('exportNormalHistoryBtn').addEventListener('click', exportNormalHistoryToCSV);
    document.getElementById('clearNormalHistoryBtn').addEventListener('click', () => {
        if (confirm('Möchten Sie wirklich den gesamten Entnahme-Verlauf löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            const batch = db.batch();
            normalHistoryData.forEach(entry => {
                const docRef = db.collection("entnahmen").doc(entry.id);
                batch.delete(docRef);
            });
            batch.commit().then(() => console.log("Normaler Verlauf gelöscht.")).catch(e => console.error("Fehler beim Löschen: ", e));
        }
    });

    // Clarification Cases Buttons
    document.getElementById('exportClarificationCasesBtn').addEventListener('click', exportClarificationCasesToCSV);
    document.getElementById('clearClarificationCasesBtn').addEventListener('click', () => {
        if (confirm('Möchten Sie wirklich alle Klärungsfälle löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            const batch = db.batch();
            clarificationCasesData.forEach(entry => {
                const docRef = db.collection("klaerungsfaelle").doc(entry.id);
                batch.delete(docRef);
            });
            batch.commit().then(() => console.log("Klärungsfälle gelöscht.")).catch(e => console.error("Fehler beim Löschen: ", e));
        }
    });

    document.getElementById('cancelDelete').addEventListener('click', () => document.getElementById('deleteConfirmDialog').classList.add('hidden'));
    
    document.getElementById('cancelPin').addEventListener('click', () => {
        document.getElementById('pinDialog').classList.add('hidden');
        document.getElementById('pinInput').value = '';
        document.getElementById('pinError').classList.add('hidden');
    });
    document.getElementById('submitPin').addEventListener('click', checkPin);
    document.getElementById('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkPin(); } });
    
    // Menu Item Listeners
    document.getElementById('terminalMenuItem').addEventListener('click', () => {
        setActiveMenuItem('terminalMenuItem');
    });

    document.getElementById('adminMenuItem').addEventListener('click', () => {
        if (!isInAdminMode) {
            document.getElementById('pinDialog').classList.remove('hidden');
            document.getElementById('pinInput').focus();
        } else {
            setActiveMenuItem('adminMenuItem');
        }
    });

    // Admin panel specific button listeners
    document.getElementById('showNormalHistoryAdminBtn').addEventListener('click', () => {
        document.querySelector('.terminal-container').style.display = 'none'; 
        document.querySelector('.admin-panel').style.display = 'block'; 
        document.querySelector('.admin-panel .p-6').style.display = 'none'; 
        document.querySelector('.history-panel').style.display = 'block';
        document.querySelector('.clarification-cases-panel').style.display = 'none'; 
        document.getElementById('backToAdminPanelBtn').classList.remove('hidden'); 
        updateNormalHistoryTable();
    });

    document.getElementById('showClarificationCasesAdminBtn').addEventListener('click', () => {
        document.querySelector('.terminal-container').style.display = 'none';
        document.querySelector('.admin-panel').style.display = 'block';
        document.querySelector('.admin-panel .p-6').style.display = 'none'; 
        document.querySelector('.clarification-cases-panel').style.display = 'block'; 
        document.querySelector('.history-panel').style.display = 'none'; 
        document.getElementById('backToAdminPanelBtn').classList.remove('hidden');
        updateClarificationCasesTable();
    });

    document.getElementById('backToAdminPanelBtn').addEventListener('click', () => {
        document.querySelector('.admin-panel .p-6').style.display = 'block'; 
        document.querySelector('.history-panel').style.display = 'none'; 
        document.querySelector('.clarification-cases-panel').style.display = 'none'; 
        document.getElementById('backToAdminPanelBtn').classList.add('hidden'); 
    });

    // Default view on load
    setActiveMenuItem('terminalMenuItem');

    // Close scanner dialog
    document.getElementById('closeScannerDialog').addEventListener('click', closeBarcodeScanner);
});

function checkPin() {
    const pinInput = document.getElementById('pinInput');
    if (pinInput.value === ADMIN_PIN) {
        document.getElementById('pinDialog').classList.add('hidden');
        pinInput.value = '';
        document.getElementById('pinError').classList.add('hidden');
        isInAdminMode = true; 
        setActiveMenuItem('adminMenuItem');
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        pinInput.value = '';
        pinInput.focus();
    }
}

function setActiveMenuItem(itemId) {
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById(itemId).classList.add('active');

    const terminalPanel = document.querySelector('.terminal-container');
    const adminPanel = document.querySelector('.admin-panel');
    const historyPanel = document.querySelector('.history-panel');
    const clarificationCasesPanel = document.querySelector('.clarification-cases-panel');
    const backToAdminPanelBtn = document.getElementById('backToAdminPanelBtn');

    terminalPanel.style.display = 'none';
    adminPanel.style.display = 'none';
    historyPanel.style.display = 'none';
    clarificationCasesPanel.style.display = 'none';
    backToAdminPanelBtn.classList.add('hidden');

    if (itemId === 'terminalMenuItem') {
        isInAdminMode = false; 
        terminalPanel.style.display = 'block';
    } else if (itemId === 'adminMenuItem') {
        adminPanel.style.display = 'block';
        adminPanel.querySelector('.p-6').style.display = 'block';
        historyPanel.style.display = 'none'; 
        clarificationCasesPanel.style.display = 'none';
    }
}

function checkMaterialNumber(inputElement) {
    const row = inputElement.closest('.material-row');
    const rowNumber = inputElement.name.split('_')[1];
    const descriptionField = row.querySelector(`[name="description_${rowNumber}"]`);
    const primaryField = row.querySelector(`[name="primary_material_${rowNumber}"]`);
    descriptionField.classList.remove('auto-filled', 'error');
    inputElement.classList.remove('error');

    if (inputElement.value) {
        const materialNr = inputElement.value.trim();
        if (materialDatabase.primary[materialNr]) {
            descriptionField.value = materialDatabase.primary[materialNr].beschreibung;
            descriptionField.classList.add('auto-filled');
            primaryField.value = materialNr;
        } else if (materialDatabase.alternative[materialNr]) {
            const primaryNr = materialDatabase.alternative[materialNr];
            descriptionField.value = materialDatabase.primary[primaryNr].beschreibung;
            descriptionField.classList.add('auto-filled');
            primaryField.value = primaryNr;
        } else {
            descriptionField.value = "SAP Nummer existiert nicht";
            descriptionField.classList.add('error');
            inputElement.classList.add('error');
            primaryField.value = '';
        }
        
        const meInput = row.querySelector(`[name="me_${rowNumber}"]`);
        meInput.focus();
        meInput.parentElement.classList.add('show');

    } else { 
        primaryField.value = ''; 
        descriptionField.value = ''; 
    }
}

function loadAllData() {
    const csvUrl = 'https://raw.githubusercontent.com/Dennis21x/lager-terminal-data/main/Terminaldaten.csv';
    document.getElementById('databaseStatus').textContent = 'Status: Lade Materialdatenbank von GitHub...';
    
    fetch(csvUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Netzwerk-Antwort war nicht ok: ${response.statusText}`);
            }
            return response.text();
        })
        .then(csvText => {
            Papa.parse(csvText, {
                delimiter: ';', 
                header: false, 
                skipEmptyLines: true,
                complete: processMaterialData
            });
        })
        .catch(error => {
            console.error("Fehler beim Laden der Material-CSV von GitHub:", error);
            document.getElementById('databaseStatus').textContent = 'Status: Fehler beim Laden der Materialdatenbank von GitHub. Manuelles Hochladen möglich.';
            alert("Die Materialdatenbank konnte nicht automatisch geladen werden. Bitte laden Sie die CSV-Datei manuell im Admin-Bereich hoch.");
        });

    db.collection("entnahmen").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        normalHistoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateNormalHistoryTable();
    }, err => {
        console.error("Fehler beim Laden des normalen Verlaufs: ", err);
    });

    db.collection("klaerungsfaelle").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        clarificationCasesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateClarificationCasesTable();
    }, err => {
        console.error("Fehler beim Laden der Klärungsfälle: ", err);
    });
}

function validateForm() {
    const result = { missingMenge: [], missingKosten: false };
    document.querySelectorAll('.material-row').forEach((row, index) => {
        const materialNrInput = row.querySelector('.material-input');
        const mengeInput = row.querySelector('.menge-input');
        const descriptionInput = row.querySelector('.description-field');

        if ((materialNrInput.value.trim() !== '' || descriptionInput.value.trim() !== '') && mengeInput.value.trim() === '') {
            result.missingMenge.push(index + 1); // Zeilennummer ist 1-basiert
        }
    });
    
    const kostenstelle = document.getElementById('kostenstelle').value.trim();
    const auftrag = document.getElementById('auftrag').value.trim();
    const projektnr = document.getElementById('projektnr').value.trim();
    if (!kostenstelle && !auftrag && !projektnr) { result.missingKosten = true; }
    return result;
}

function collectFormData() {
    const materialien = [];
    document.querySelectorAll('#material-tbody .material-row').forEach(row => {
        const materialNrInput = row.querySelector('.material-input');
        const primaryNrInput = row.querySelector('input[type="hidden"]');
        const beschreibungInput = row.querySelector('.description-field');
        const mengeInput = row.querySelector('.menge-input');
        const meInput = row.querySelector('.me-input');
        const nachbestellenCheckbox = row.querySelector('input[type="checkbox"]');

        const materialNr = materialNrInput.value.trim();
        const beschreibung = beschreibungInput.value.trim();
        const menge = mengeInput.value.trim();
        
        if (materialNr !== '' || beschreibung !== '' || menge !== '') {
            materialien.push({
                materialNr: primaryNrInput.value.trim(),
                eingabeNr: materialNr,
                beschreibung: beschreibung,
                menge: menge !== '' ? parseFloat(menge) : 0,
                me: { code: meInput.getAttribute('data-value') || '', text: meInput.value || '' },
                nachbestellen: nachbestellenCheckbox.checked
            });
        }
    });
    
    return {
        mitarbeiter: document.getElementById('mitarbeiter').value,
        entnahmedatum: document.getElementById('entnahmedatum').value,
        vorgesetzter: document.getElementById('vorgesetzter').value.trim(),
        kostenstelle: document.getElementById('kostenstelle').value.trim(),
        auftrag: document.getElementById('auftrag').value.trim(),
        projektnr: document.getElementById('projektnr').value.trim(),
        materialien
    };
}


function isClarificationCase(formData) {
    const kostenstelle = formData.kostenstelle;
    const auftrag = formData.auftrag;
    const regex = /[a-zA-Z]/;

    if (regex.test(kostenstelle) || regex.test(auftrag)) {
        return true;
    }

    for (const material of formData.materialien) {
        if (!material.materialNr && (material.eingabeNr || material.beschreibung)) {
            return true;
        }
    }
    return false;
}

function submitForm(formData) {
    const dataToSave = { 
        ...formData,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
    };

    const collectionName = isClarificationCase(formData) ? "klaerungsfaelle" : "entnahmen";
    
    db.collection(collectionName).add(dataToSave)
        .then((docRef) => {
            console.log(`${collectionName} erfolgreich mit ID ${docRef.id} gespeichert.`);
            resetForm();
            document.getElementById('confirmationDialog').classList.remove('hidden');
        })
        .catch(error => console.error(`Fehler beim Speichern von ${collectionName}: `, error));
}

function resetForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entnahmeForm').reset();
    document.getElementById('entnahmedatum').value = today;
    
    const tbody = document.getElementById('material-tbody');
    tbody.innerHTML = '';
    materialRowCount = 0;
    
    const firstRow = createMaterialRow();
    tbody.appendChild(firstRow);
    
    document.getElementById('mitarbeiter').focus();
}

function formatTimestamp(firebaseTimestamp) {
    if (!firebaseTimestamp || !firebaseTimestamp.toDate) {
        return 'Ungültiges Datum';
    }
    return firebaseTimestamp.toDate().toLocaleDateString('de-DE');
}

function updateNormalHistoryTable() {
    const tbody = document.getElementById('normalHistoryList');
    tbody.innerHTML = '';
    const emptyHistory = document.getElementById('emptyNormalHistory');
    if (normalHistoryData.length === 0) {
        emptyHistory.style.display = 'block';
    } else {
        emptyHistory.style.display = 'none';
        normalHistoryData.forEach(entry => {
            const row = document.createElement('tr');
            const materialText = entry.materialien
                .filter(m => m.menge > 0)
                .map(m => {
                    let text = m.materialNr ? `${m.materialNr} - ${m.beschreibung}` : (m.eingabeNr || m.beschreibung);
                    text += ` (${m.menge} ${m.me.text || ''})`;
                    if(m.nachbestellen) {
                        text += ` <span class="text-blue-600 font-bold">[Nachbestellen]</span>`;
                    }
                    return text;
                }).join('<br>');
            
            const kostenText = [
                entry.kostenstelle ? `KST: ${entry.kostenstelle}` : null,
                entry.auftrag ? `Auf: ${entry.auftrag}` : null,
                entry.projektnr ? `Proj: ${entry.projektnr}` : null
            ].filter(Boolean).join(', ');

            row.innerHTML = `
                <td class="px-4 py-3 align-top" data-label="Datum">${formatTimestamp(entry.timestamp)}</td>
                <td class="px-4 py-3 align-top" data-label="Mitarbeiter">${entry.mitarbeiter}<br><small>${kostenText}</small></td>
                <td class="px-4 py-3 align-top" data-label="Materialien">${materialText}</td>
                <td class="px-4 py-3 align-top" data-label="Aktionen">
                    <div class="flex flex-col sm:flex-row gap-2">
                        <button class="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600" onclick="editEntry('${entry.id}', 'normal')">Bearbeiten</button>
                        <button class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700" onclick="deleteEntry('${entry.id}', 'normal')">Löschen</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}

function updateClarificationCasesTable() {
    const tbody = document.getElementById('clarificationCasesList');
    tbody.innerHTML = '';
    const emptyHistory = document.getElementById('emptyClarificationCases');
    if (clarificationCasesData.length === 0) {
        emptyHistory.style.display = 'block';
    } else {
        emptyHistory.style.display = 'none';
        clarificationCasesData.forEach(entry => {
            const row = document.createElement('tr');
            const materialText = entry.materialien
                 .filter(m => m.menge > 0 || m.eingabeNr || m.beschreibung)
                 .map(m => {
                    let text = m.materialNr ? `${m.materialNr} - ${m.beschreibung}` : `<span class="text-red-600 font-bold">${m.eingabeNr || m.beschreibung}</span>`;
                    text += ` (${m.menge || 0} ${m.me.text || ''})`;
                    if(m.nachbestellen) {
                        text += ` <span class="text-blue-600 font-bold">[Nachbestellen]</span>`;
                    }
                    return text;
                }).join('<br>');

            const kostenText = [
                /[a-zA-Z]/.test(entry.kostenstelle) ? `<span class="text-red-600 font-bold">KST: ${entry.kostenstelle}</span>` : (entry.kostenstelle ? `KST: ${entry.kostenstelle}` : null),
                /[a-zA-Z]/.test(entry.auftrag) ? `<span class="text-red-600 font-bold">Auf: ${entry.auftrag}</span>` : (entry.auftrag ? `Auf: ${entry.auftrag}` : null),
                entry.projektnr ? `Proj: ${entry.projektnr}` : null
            ].filter(Boolean).join(', ');
            
            row.innerHTML = `
                <td class="px-4 py-3 align-top" data-label="Datum">${formatTimestamp(entry.timestamp)}</td>
                <td class="px-4 py-3 align-top" data-label="Mitarbeiter">${entry.mitarbeiter}<br><small>${kostenText}</small></td>
                <td class="px-4 py-3 align-top" data-label="Materialien">${materialText}</td>
                <td class="px-4 py-3 align-top" data-label="Aktionen">
                     <div class="flex flex-col sm:flex-row gap-2">
                        <button class="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600" onclick="editEntry('${entry.id}', 'clarification')">Bearbeiten</button>
                        <button class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700" onclick="deleteEntry('${entry.id}', 'clarification')">Löschen</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
}

function editEntry(id, type) {
    const dataSet = type === 'normal' ? normalHistoryData : clarificationCasesData;
    const entry = dataSet.find(item => item.id === id);
    if (!entry) {
        console.error("Eintrag nicht gefunden!");
        return;
    }

    resetForm(); // Leert das Formular und bereitet es für neue Daten vor

    document.getElementById('mitarbeiter').value = entry.mitarbeiter;
    document.getElementById('entnahmedatum').value = entry.entnahmedatum;
    document.getElementById('vorgesetzter').value = entry.vorgesetzter || '';
    document.getElementById('kostenstelle').value = entry.kostenstelle || '';
    document.getElementById('auftrag').value = entry.auftrag || '';
    document.getElementById('projektnr').value = entry.projektnr || '';

    const tbody = document.getElementById('material-tbody');
    tbody.innerHTML = ''; // Alle vorhandenen Zeilen entfernen
    materialRowCount = 0;

    entry.materialien.forEach((material) => {
        const rowElement = createMaterialRow();
        if (!rowElement) return;
        tbody.appendChild(rowElement);

        const rowNum = materialRowCount;
        
        rowElement.querySelector(`[name="material_${rowNum}"]`).value = material.eingabeNr || '';
        rowElement.querySelector(`[name="primary_material_${rowNum}"]`).value = material.materialNr || '';
        rowElement.querySelector(`[name="description_${rowNum}"]`).value = material.beschreibung || '';
        const meInput = rowElement.querySelector(`[name="me_${rowNum}"]`);
        meInput.value = material.me.text || '';
        meInput.setAttribute('data-value', material.me.code || '');
        rowElement.querySelector(`[name="menge_${rowNum}"]`).value = material.menge || '';
        rowElement.querySelector(`[name="nachbestellen_${rowNum}"]`).checked = material.nachbestellen || false;

        checkMaterialNumber(rowElement.querySelector(`[name="material_${rowNum}"]`));
    });

    // Füge am Ende eine leere Zeile hinzu zum Weiterarbeiten
    const finalEmptyRow = createMaterialRow();
    if(finalEmptyRow) tbody.appendChild(finalEmptyRow);

    const collectionName = type === 'normal' ? 'entnahmen' : 'klaerungsfaelle';
    db.collection(collectionName).doc(id).delete()
      .then(() => console.log(`Alter Eintrag ${id} gelöscht. Bereit zum Neuspeichern.`))
      .catch(e => console.error("Fehler beim Löschen des alten Eintrags: ", e));
    
    setActiveMenuItem('terminalMenuItem');
    alert("Der Eintrag wurde zum Bearbeiten in das Formular geladen. Der alte Eintrag wurde gelöscht. Bitte überprüfen und erneut 'Entnahme bestätigen' klicken.");
}

function deleteEntry(id, type) {
    if (confirm('Wollen Sie diesen Eintrag wirklich endgültig löschen?')) {
        const collectionName = type === 'normal' ? 'entnahmen' : 'klaerungsfaelle';
        db.collection(collectionName).doc(id).delete()
            .then(() => console.log("Eintrag erfolgreich gelöscht."))
            .catch(error => console.error("Fehler beim Löschen: ", error));
    }
}

function exportNormalHistoryToCSV() {
    if (normalHistoryData.length === 0) { alert('Keine Daten zum Exportieren vorhanden.'); return; }
    let csvContent = 'Datum;Mitarbeiter;Vorgesetzter;Kostenstelle;Auftrag;Projekt-Nr;Material-Nr;Beschreibung;Nachbestellen;ME;Menge\n';
    normalHistoryData.forEach(entry => {
        const dateStr = new Date(entry.entnahmedatum).toLocaleDateString('de-DE');
        entry.materialien.forEach(m => {
            const meText = m.me && m.me.text ? m.me.text : '';
            const nachbestellenText = m.nachbestellen ? 'Ja' : 'Nein';
            csvContent += `${dateStr};${entry.mitarbeiter};${entry.vorgesetzter || ''};${entry.kostenstelle || ''};${entry.auftrag || ''};${entry.projektnr || ''};${m.materialNr || ''};"${m.beschreibung || ''}";${nachbestellenText};${meText};${m.menge || ''}\n`;
        });
    });
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sap_data.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportClarificationCasesToCSV() {
    if (clarificationCasesData.length === 0) { alert('Keine Klärungsfälle zum Exportieren vorhanden.'); return; }
    let csvContent = 'Datum;Mitarbeiter;Vorgesetzter;Kostenstelle;Auftrag;Projekt-Nr;Material-Nr;Beschreibung;Nachbestellen;ME;Menge\n';
    clarificationCasesData.forEach(entry => {
        const dateStr = new Date(entry.entnahmedatum).toLocaleDateString('de-DE');
        entry.materialien.forEach(m => {
            const meText = m.me && m.me.text ? m.me.text : '';
            const nachbestellenText = m.nachbestellen ? 'Ja' : 'Nein';
            csvContent += `${dateStr};${entry.mitarbeiter};${entry.vorgesetzter || ''};${entry.kostenstelle || ''};${entry.auftrag || ''};${entry.projektnr || ''};${m.materialNr || ''};"${m.beschreibung || ''}";${nachbestellenText};${meText};${m.menge || ''}\n`;
        });
    });
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `klaerungsfaelle.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function openBarcodeScanner(rowNumber) {
    currentMaterialInput = document.querySelector(`[name="material_${rowNumber}"]`);
    const scannerDialog = document.getElementById('barcodeScannerDialog');
    const qrVideo = document.getElementById('qr-video');
    const scannerStatus = document.getElementById('scanner-status');
    
    scannerDialog.classList.remove('hidden');
    scannerStatus.textContent = 'Kamera wird gestartet...';

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            scannerStatus.textContent = 'Fehler: Kamerazugriff nicht unterstützt.';
            alert('Kamerazugriff wird von Ihrem Browser nicht unterstützt.');
            closeBarcodeScannerAndShowFallback(currentMaterialInput);
            return;
        }

        const hints = new Map();
        const formats = [
            ZXing.BarcodeFormat.CODE_128,
            ZXing.BarcodeFormat.CODE_39,
            ZXing.BarcodeFormat.EAN_13,
            ZXing.BarcodeFormat.QR_CODE
        ];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);

        codeReader = new ZXing.BrowserMultiFormatReader(hints);

        codeReader.decodeFromVideoDevice(null, 'qr-video', (result, err) => {
            if (result) {
                const scannedBarcode = result.text;
                console.log('Barcode gescannt:', scannedBarcode);
                if (currentMaterialInput) {
                    currentMaterialInput.value = scannedBarcode;
                    checkMaterialNumber(currentMaterialInput);
                    addRowIfNeeded(); // Prüfen, ob neue Zeile nötig ist
                }
                closeBarcodeScanner();
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('Scan-Fehler:', err);
                scannerStatus.textContent = `Fehler beim Scannen: ${err.message}`;
            }
        });

        scannerStatus.textContent = 'Scannen läuft... Halten Sie den Barcode vor die Kamera.';

    } catch (err) {
        console.error('Zugriff auf die Kamera fehlgeschlagen:', err);
        let errorMessage = 'Unbekannter Fehler beim Kamerazugriff.';
        if (err.name === 'NotAllowedError') {
            errorMessage = 'Kamerazugriff wurde verweigert. Bitte erlauben Sie den Zugriff in Ihren Browsereinstellungen.';
        } else if (err.name === 'NotFoundError') {
            errorMessage = 'Keine Kamera gefunden.';
        }
        
        scannerStatus.textContent = `Fehler: ${errorMessage}`;
        alert(`${errorMessage}\nBitte Materialnummer manuell eingeben.`);
        closeBarcodeScannerAndShowFallback(currentMaterialInput);
    }
}

function closeBarcodeScanner() {
    const scannerDialog = document.getElementById('barcodeScannerDialog');
    const qrVideo = document.getElementById('qr-video');
    
    if (codeReader) {
        codeReader.reset();
    }
    scannerDialog.classList.add('hidden');
    qrVideo.srcObject = null;
    currentMaterialInput = null;
}

function closeBarcodeScannerAndShowFallback(inputElement) {
    closeBarcodeScanner();
    setTimeout(() => {
        const barcode = prompt(`Kamerazugriff fehlgeschlagen. Bitte Materialnummer manuell eingeben:`);
        if (barcode && inputElement) {
            inputElement.value = barcode;
            checkMaterialNumber(inputElement);
            addRowIfNeeded();
        }
    }, 100);
}

async function applyZoomToCamera(stream) {
    const [track] = stream.getVideoTracks();
    const capabilities = track.getCapabilities();
    if ('zoom' in capabilities) {
        const settings = track.getSettings();
        const constraints = {
            advanced: [{ zoom: Math.min(capabilities.zoom.max, 4) }]
        };
        try {
            await track.applyConstraints(constraints);
            console.log("4x zoom applied.");
        } catch (err) {
            console.warn("Zoom could not be applied:", err);
        }
    } else {
        console.log("Zoom not supported on this device.");
    }
}

const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async function(constraints) {
    const stream = await originalGetUserMedia(constraints);
    applyZoomToCamera(stream);
    return stream;
}
