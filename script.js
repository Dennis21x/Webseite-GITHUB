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
const db = firebase.firestore();
// --- ENDE: FIREBASE INITIALISIERUNG ---


// Globale Variablen
let materialDatabase = {
    primary: {},
    alternative: {}
};
let normalHistoryData = []; 
let clarificationCasesData = []; 
const ADMIN_PIN = "100400#x";
let pendingSubmitData = null;
let isInAdminMode = false;
let codeReader = null;
let currentMaterialInput = null;
let localStream = null;
let rowCount = 1; // NEU: Zähler für dynamische Zeilen

// Datum und Uhrzeit aktualisieren
function updateDateTime() {
    const now = new Date();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('de-DE', dateOptions);
    document.getElementById('current-time').textContent = now.toLocaleTimeString('de-DE');
}

function processMaterialData(results) {
    materialDatabase = { primary: {}, alternative: {} };
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

// NEU & ÜBERARBEITET: Fügt alle Event-Listener zu einer bestimmten Zeile hinzu
function attachEventListenersToRow(rowElement) {
    const rowNumber = parseInt(rowElement.querySelector('.material-input').name.split('_')[1]);

    // Event-Listener für dynamische Zeilen
    rowElement.querySelectorAll('.material-input, .description-field').forEach(input => {
        input.addEventListener('input', (e) => {
            showNextRow(e.target.closest('tr'));
        });
    });
    
    // SAP-Nr.-Eingabe-Event
    const materialInput = rowElement.querySelector('.material-input');
    materialInput.addEventListener('blur', function() { checkMaterialNumber(this); });
    materialInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            checkMaterialNumber(this);
        }
    });
    
    // Beschreibungs-Feld-Events
    const descriptionInput = rowElement.querySelector('.description-field');
    descriptionInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            rowElement.querySelector(`[name="menge_${rowNumber}"]`).focus();
        }
    });
    descriptionInput.addEventListener('blur', function() {
        if (this.value.trim()) {
            const meInput = rowElement.querySelector(`[name="me_${rowNumber}"]`);
            meInput.focus();
            meInput.parentElement.classList.add('show');
        }
    });

    // Mengeneinheit-Dropdown-Funktionalität
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
            rowElement.querySelector(`[name="menge_${rowNumber}"]`).focus();
        });
    });
    
    // Menge-Eingabe-Events
    const mengeInput = rowElement.querySelector('.menge-input');
    mengeInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            findNextEmptyMaterialRow(rowElement);
        }
    });

    // Event-Listener für die ME-Eingabefelder
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
                        rowElement.querySelector(`[name="menge_${rowNumber}"]`).focus();
                    }
                }
                break;
            case 'Escape': e.preventDefault(); dropdown.classList.remove('show'); break;
        }
    });
    meInput.addEventListener('blur', function() { handleMEInput(this); setTimeout(() => this.parentElement.classList.remove('show'), 150); });
}

// NEU: Funktion zum Erstellen und Hinzufügen einer neuen Materialzeile
function addNewMaterialRow() {
    const tbody = document.getElementById('material-tbody');
    const firstRow = tbody.querySelector('.material-row');
    const newRow = firstRow.cloneNode(true);
    
    rowCount++;
    
    // Alle IDs, names und onclick-Attribute aktualisieren
    newRow.querySelectorAll('[name]').forEach(el => {
        el.name = el.name.replace('_1', `_${rowCount}`);
    });
    newRow.querySelector('.barcode-scan-btn').setAttribute('onclick', `openBarcodeScanner(${rowCount})`);

    // Werte der neuen Zeile zurücksetzen
    newRow.querySelector('.material-input').value = '';
    newRow.querySelector('[type="hidden"]').value = '';
    newRow.querySelector('.description-field').value = '';
    newRow.querySelector('.me-input').value = '';
    newRow.querySelector('.me-input').removeAttribute('data-value');
    newRow.querySelector('.menge-input').value = '';
    newRow.querySelector('[type="checkbox"]').checked = false;
    newRow.querySelectorAll('.error, .auto-filled').forEach(el => el.classList.remove('error', 'auto-filled'));
    
    tbody.appendChild(newRow);
    attachEventListenersToRow(newRow); // Wichtig: Event-Listener für die neue Zeile anhängen
    
    return newRow;
}


// DOMContentLoaded Event
document.addEventListener('DOMContentLoaded', function() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entnahmedatum').value = today;
    
    loadAllData();
    
    document.getElementById('materialFile').addEventListener('change', uploadMaterialDatabase);

    // Hänge Event-Listener nur an die erste, initiale Zeile
    attachEventListenersToRow(document.querySelector('.material-row'));

    // NEU: Event-Listener für den "Zeile hinzufügen" Button
    document.getElementById('addRowBtn').addEventListener('click', () => {
        const newRow = addNewMaterialRow();
        newRow.querySelector('.material-input').focus();
    });
    
    document.getElementById('clearForm').addEventListener('click', resetForm);
    
    document.getElementById('entnahmeForm').addEventListener('submit', function(e) {
        e.preventDefault();
        if (!navigator.onLine) {
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.textContent = 'Warte auf Internetverbindung...';
            submitBtn.disabled = true;
            return; 
        }

        let hasAtLeastOneValidRow = false;
        // ÜBERARBEITET: Schleife über alle existierenden Zeilen, nicht mehr fix 8
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

    const handleOnlineStatus = () => {
        const submitBtn = document.getElementById('submitBtn');
        if (navigator.onLine) {
            submitBtn.textContent = 'Entnahme bestätigen';
            submitBtn.disabled = false;
        } else {
            submitBtn.textContent = 'Offline - Keine Übertragung möglich';
            submitBtn.disabled = true;
        }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    handleOnlineStatus();
    
    // Dialog-Handler (unverändert)
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
    document.getElementById('exportNormalHistoryBtn').addEventListener('click', exportNormalHistoryToCSV);
    document.getElementById('clearNormalHistoryBtn').addEventListener('click', () => {
        if (confirm('Möchten Sie wirklich den gesamten Entnahme-Verlauf löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            const batch = db.batch();
            normalHistoryData.forEach(entry => { batch.delete(db.collection("entnahmen").doc(entry.id)); });
            batch.commit().then(() => console.log("Normaler Verlauf gelöscht.")).catch(e => console.error("Fehler beim Löschen: ", e));
        }
    });
    document.getElementById('exportClarificationCasesBtn').addEventListener('click', exportClarificationCasesToCSV);
    document.getElementById('clearClarificationCasesBtn').addEventListener('click', () => {
        if (confirm('Möchten Sie wirklich alle Klärungsfälle löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            const batch = db.batch();
            clarificationCasesData.forEach(entry => { batch.delete(db.collection("klaerungsfaelle").doc(entry.id)); });
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
    document.getElementById('terminalMenuItem').addEventListener('click', () => setActiveMenuItem('terminalMenuItem'));
    document.getElementById('adminMenuItem').addEventListener('click', () => {
        if (!isInAdminMode) {
            document.getElementById('pinDialog').classList.remove('hidden');
            document.getElementById('pinInput').focus();
        } else {
            setActiveMenuItem('adminMenuItem');
        }
    });
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
    setActiveMenuItem('terminalMenuItem');
    document.getElementById('closeScannerDialog').addEventListener('click', closeBarcodeScanner);
});

// ÜBERARBEITET: Funktion zum Einblenden der nächsten Zeile
const showNextRow = (currentRow) => {
    // Wenn die aktuelle Zeile die letzte ist, füge eine neue hinzu.
    if (currentRow.isEqualNode(currentRow.parentElement.lastElementChild)) {
        addNewMaterialRow();
    }
};

// ÜBERARBEITET: Funktion zum Springen zur nächsten leeren Zeile
function findNextEmptyMaterialRow(currentRowElement) {
    let nextRow = currentRowElement.nextElementSibling;
    if (nextRow) {
        const materialInput = nextRow.querySelector('.material-input');
        materialInput.focus();
    } else {
        // Wenn es keine nächste Zeile gibt, erstelle eine und setze den Fokus
        const newRow = addNewMaterialRow();
        newRow.querySelector('.material-input').focus();
    }
}

// Unveränderte Funktionen
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
    const rowNumber = inputElement.name.split('_')[1];
    const descriptionField = document.querySelector(`[name="description_${rowNumber}"]`);
    const primaryField = document.querySelector(`[name="primary_material_${rowNumber}"]`);
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
        const meInput = document.querySelector(`[name="me_${rowNumber}"]`);
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
    fetch(csvUrl).then(response => { if (!response.ok) { throw new Error(`Netzwerk-Antwort war nicht ok: ${response.statusText}`); } return response.text(); }).then(csvText => { Papa.parse(csvText, { delimiter: ';', header: false, skipEmptyLines: true, complete: processMaterialData }); }).catch(error => { console.error("Fehler beim Laden der Material-CSV von GitHub:", error); document.getElementById('databaseStatus').textContent = 'Status: Fehler beim Laden. Manuelles Hochladen möglich.'; alert("Materialdatenbank konnte nicht geladen werden. Bitte manuell im Admin-Bereich hochladen."); });
    db.collection("entnahmen").orderBy("timestamp", "desc").onSnapshot(snapshot => { normalHistoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); updateNormalHistoryTable(); }, err => { console.error("Fehler beim Laden des Verlaufs: ", err); });
    db.collection("klaerungsfaelle").orderBy("timestamp", "desc").onSnapshot(snapshot => { clarificationCasesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); updateClarificationCasesTable(); }, err => { console.error("Fehler beim Laden der Klärungsfälle: ", err); });
}

// ÜBERARBEITET: Formularvalidierung für dynamische Zeilen
function validateForm() {
    const result = { missingMenge: [], missingKosten: false };
    document.querySelectorAll('.material-row').forEach((row, index) => {
        const materialNrInput = row.querySelector('.material-input');
        const mengeInput = row.querySelector('.menge-input');
        const descriptionInput = row.querySelector('.description-field');
        if ((materialNrInput.value.trim() !== '' || descriptionInput.value.trim() !== '') && mengeInput.value.trim() === '') {
            result.missingMenge.push(index + 1); // Zeilennummer ist index + 1
        }
    });
    const kostenstelle = document.getElementById('kostenstelle').value.trim();
    const auftrag = document.getElementById('auftrag').value.trim();
    const projektnr = document.getElementById('projektnr').value.trim();
    if (!kostenstelle && !auftrag && !projektnr) { result.missingKosten = true; }
    return result;
}

// ÜBERARBEITET: Datensammlung für dynamische Zeilen
function collectFormData() {
    const materialien = [];
    document.querySelectorAll('.material-row').forEach(row => {
        const materialNrInput = row.querySelector('.material-input');
        const primaryNrInput = row.querySelector('[name^="primary_material_"]');
        const beschreibungInput = row.querySelector('.description-field');
        const mengeInput = row.querySelector('.menge-input');
        const meInput = row.querySelector('.me-input');
        const nachbestellenCheckbox = row.querySelector('[type="checkbox"]');
        const materialNr = materialNrInput.value.trim();
        const primaryNrFromLookup = primaryNrInput.value.trim();
        const beschreibung = beschreibungInput.value.trim();
        const menge = mengeInput.value.trim();
        if (materialNr !== '' || beschreibung !== '' || menge !== '') {
            materialien.push({
                materialNr: primaryNrFromLookup,
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
    const { kostenstelle, auftrag } = formData;
    if (/[a-zA-Z]/.test(kostenstelle) || /[a-zA-Z]/.test(auftrag)) return true;
    for (const material of formData.materialien) {
        if (!material.materialNr && (material.eingabeNr || material.beschreibung)) return true;
    }
    return false;
}
function submitForm(formData) {
    const dataToSave = { ...formData, timestamp: firebase.firestore.FieldValue.serverTimestamp() };
    const collectionName = isClarificationCase(formData) ? "klaerungsfaelle" : "entnahmen";
    db.collection(collectionName).add(dataToSave).then((docRef) => {
        console.log(`${collectionName} erfolgreich mit ID ${docRef.id} gespeichert.`);
        resetForm();
        document.getElementById('confirmationDialog').classList.remove('hidden');
    }).catch(error => console.error(`Fehler beim Speichern von ${collectionName}: `, error));
}

// ÜBERARBEITET: Formular-Reset für dynamische Zeilen
function resetForm() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entnahmeForm').reset();
    document.getElementById('entnahmedatum').value = today;

    // Alle dynamisch hinzugefügten Zeilen entfernen
    const tbody = document.getElementById('material-tbody');
    while (tbody.children.length > 1) {
        tbody.removeChild(tbody.lastChild);
    }
    
    // Die erste (und einzige verbliebene) Zeile zurücksetzen
    const firstRow = tbody.querySelector('.material-row');
    firstRow.querySelectorAll('.description-field, .me-input, .material-input').forEach(f => f.classList.remove('auto-filled', 'error'));
    firstRow.querySelector('input[name^="primary_material_"]').value = '';
    const meInput = firstRow.querySelector('.me-input');
    meInput.value = '';
    meInput.removeAttribute('data-value');

    rowCount = 1; // Zeilenzähler zurücksetzen
    document.getElementById('mitarbeiter').focus();
}

// History und Export Funktionen (unverändert, aber hier für Vollständigkeit)
function formatTimestamp(firebaseTimestamp) {
    if (!firebaseTimestamp || !firebaseTimestamp.toDate) return 'Ungültiges Datum';
    return firebaseTimestamp.toDate().toLocaleDateString('de-DE');
}
function updateNormalHistoryTable() {
    const tbody = document.getElementById('normalHistoryList');
    tbody.innerHTML = '';
    const emptyHistory = document.getElementById('emptyNormalHistory');
    if (normalHistoryData.length === 0) { emptyHistory.style.display = 'block'; } else {
        emptyHistory.style.display = 'none';
        normalHistoryData.forEach(entry => {
            const row = document.createElement('tr');
            const materialText = entry.materialien.filter(m => m.menge > 0).map(m => { let text = m.materialNr ? `${m.materialNr} - ${m.beschreibung}` : (m.eingabeNr || m.beschreibung); text += ` (${m.menge} ${m.me.text || ''})`; if(m.nachbestellen) { text += ` <span class="font-bold text-blue-600">[Nachbestellen]</span>`; } return text; }).join('<br>');
            const kostenText = [entry.kostenstelle ? `KST: ${entry.kostenstelle}`:null, entry.auftrag ? `Auf: ${entry.auftrag}`:null, entry.projektnr ? `Proj: ${entry.projektnr}`:null].filter(Boolean).join(', ');
            row.innerHTML = `<td class="px-4 py-3 align-top" data-label="Datum">${formatTimestamp(entry.timestamp)}</td><td class="px-4 py-3 align-top" data-label="Mitarbeiter">${entry.mitarbeiter}<br><small>${kostenText}</small></td><td class="px-4 py-3 align-top" data-label="Materialien">${materialText}</td><td class="px-4 py-3 align-top" data-label="Aktionen"><div class="flex flex-col sm:flex-row gap-2"><button class="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600" onclick="editEntry('${entry.id}', 'normal')">Bearbeiten</button><button class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700" onclick="deleteEntry('${entry.id}', 'normal')">Löschen</button></div></td>`;
            tbody.appendChild(row);
        });
    }
}
function updateClarificationCasesTable() {
    const tbody = document.getElementById('clarificationCasesList');
    tbody.innerHTML = '';
    const emptyHistory = document.getElementById('emptyClarificationCases');
    if (clarificationCasesData.length === 0) { emptyHistory.style.display = 'block'; } else {
        emptyHistory.style.display = 'none';
        clarificationCasesData.forEach(entry => {
            const row = document.createElement('tr');
            const materialText = entry.materialien.filter(m => m.menge > 0 || m.eingabeNr || m.beschreibung).map(m => { let text = m.materialNr ? `${m.materialNr} - ${m.beschreibung}` : `<span class="text-red-600 font-bold">${m.eingabeNr || m.beschreibung}</span>`; text += ` (${m.menge || 0} ${m.me.text || ''})`; if(m.nachbestellen) { text += ` <span class="font-bold text-blue-600">[Nachbestellen]</span>`; } return text; }).join('<br>');
            const kostenText = [/[a-zA-Z]/.test(entry.kostenstelle) ? `<span class="text-red-600 font-bold">KST: ${entry.kostenstelle}</span>` : (entry.kostenstelle ? `KST: ${entry.kostenstelle}` : null), /[a-zA-Z]/.test(entry.auftrag) ? `<span class="text-red-600 font-bold">Auf: ${entry.auftrag}</span>` : (entry.auftrag ? `Auf: ${entry.auftrag}` : null), entry.projektnr ? `Proj: ${entry.projektnr}` : null].filter(Boolean).join(', ');
            row.innerHTML = `<td class="px-4 py-3 align-top" data-label="Datum">${formatTimestamp(entry.timestamp)}</td><td class="px-4 py-3 align-top" data-label="Mitarbeiter">${entry.mitarbeiter}<br><small>${kostenText}</small></td><td class="px-4 py-3 align-top" data-label="Materialien">${materialText}</td><td class="px-4 py-3 align-top" data-label="Aktionen"><div class="flex flex-col sm:flex-row gap-2"><button class="px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600" onclick="editEntry('${entry.id}', 'clarification')">Bearbeiten</button><button class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700" onclick="deleteEntry('${entry.id}', 'clarification')">Löschen</button></div></td>`;
            tbody.appendChild(row);
        });
    }
}
function editEntry(id, type) {
    const dataSet = type === 'normal' ? normalHistoryData : clarificationCasesData;
    const entry = dataSet.find(item => item.id === id);
    if (!entry) { console.error("Eintrag nicht gefunden!"); return; }
    resetForm();
    document.getElementById('mitarbeiter').value = entry.mitarbeiter;
    document.getElementById('entnahmedatum').value = entry.entnahmedatum;
    document.getElementById('vorgesetzter').value = entry.vorgesetzter || '';
    document.getElementById('kostenstelle').value = entry.kostenstelle || '';
    document.getElementById('auftrag').value = entry.auftrag || '';
    document.getElementById('projektnr').value = entry.projektnr || '';
    
    // Bestehende Zeilen füllen und bei Bedarf neue erstellen
    entry.materialien.forEach((material, i) => {
        let row = document.querySelectorAll('.material-row')[i];
        if (!row) { row = addNewMaterialRow(); }
        const rowNum = i + 1;
        row.querySelector(`[name="material_${rowNum}"]`).value = material.eingabeNr || '';
        row.querySelector(`[name="primary_material_${rowNum}"]`).value = material.materialNr || '';
        row.querySelector(`[name="description_${rowNum}"]`).value = material.beschreibung || '';
        const meInput = row.querySelector(`[name="me_${rowNum}"]`);
        meInput.value = material.me.text || '';
        meInput.setAttribute('data-value', material.me.code || '');
        row.querySelector(`[name="menge_${rowNum}"]`).value = material.menge || '';
        row.querySelector(`[name="nachbestellen_${rowNum}"]`).checked = material.nachbestellen || false;
        checkMaterialNumber(row.querySelector(`[name="material_${rowNum}"]`));
    });

    const collectionName = type === 'normal' ? 'entnahmen' : 'klaerungsfaelle';
    db.collection(collectionName).doc(id).delete().then(() => console.log(`Alter Eintrag ${id} gelöscht.`)).catch(e => console.error("Fehler: ", e));
    setActiveMenuItem('terminalMenuItem');
    alert("Eintrag wurde geladen. Bitte überprüfen und erneut 'Entnahme bestätigen' klicken.");
}
function deleteEntry(id, type) {
    if (confirm('Wollen Sie diesen Eintrag wirklich endgültig löschen?')) {
        const collectionName = type === 'normal' ? 'entnahmen' : 'klaerungsfaelle';
        db.collection(collectionName).doc(id).delete().then(() => console.log("Eintrag gelöscht.")).catch(error => console.error("Fehler: ", error));
    }
}
function exportToCSV(data, filename) {
    if (data.length === 0) { alert('Keine Daten zum Exportieren.'); return; }
    let csvContent = 'Datum;Mitarbeiter;Vorgesetzter;Kostenstelle;Auftrag;Projekt-Nr;Eingegebene Nr.;SAP-Nr.;Beschreibung;ME;Menge;Nachbestellen\n';
    data.forEach(entry => {
        const dateStr = entry.entnahmedatum ? new Date(entry.entnahmedatum).toLocaleDateString('de-DE') : formatTimestamp(entry.timestamp);
        if (entry.materialien && entry.materialien.length > 0) {
            entry.materialien.forEach(m => {
                if (m.menge > 0 || m.eingabeNr || m.beschreibung) {
                    const meText = m.me && m.me.text ? m.me.text : '';
                    const nachbestellenText = m.nachbestellen ? 'Ja' : 'Nein';
                    csvContent += `${dateStr};${entry.mitarbeiter||''};${entry.vorgesetzter||''};${entry.kostenstelle||''};${entry.auftrag||''};${entry.projektnr||''};${m.eingabeNr||''};${m.materialNr||''};"${m.beschreibung||''}";${meText};${m.menge||''};${nachbestellenText}\n`;
                }
            });
        } else {
             csvContent += `${dateStr};${entry.mitarbeiter||''};${entry.vorgesetzter||''};${entry.kostenstelle||''};${entry.auftrag||''};${entry.projektnr||''};;;;;;\n`;
        }
    });
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function exportNormalHistoryToCSV() { exportToCSV(normalHistoryData, 'entnahme_verlauf.csv'); }
function exportClarificationCasesToCSV() { exportToCSV(clarificationCasesData, 'klaerungsfaelle.csv'); }

// Barcode Scanner Funktionen (unverändert)
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
            closeBarcodeScanner();
            return;
        }
        const hints = new Map();
        const formats = [ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.QR_CODE];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        codeReader = new ZXing.BrowserMultiFormatReader(hints);
        codeReader.decodeFromVideoDevice(null, 'qr-video', (result, err) => {
            if (result) {
                console.log('Barcode gescannt:', result.text);
                if (currentMaterialInput) {
                    currentMaterialInput.value = result.text;
                    currentMaterialInput.dispatchEvent(new Event('input', { bubbles: true }));
                    checkMaterialNumber(currentMaterialInput);
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
        if (err.name === 'NotAllowedError') errorMessage = 'Kamerazugriff wurde verweigert.';
        else if (err.name === 'NotFoundError') errorMessage = 'Keine Kamera gefunden.';
        scannerStatus.textContent = `Fehler: ${errorMessage}`;
        alert(errorMessage);
        closeBarcodeScanner();
    }
}
function closeBarcodeScanner() {
    const scannerDialog = document.getElementById('barcodeScannerDialog');
    if (codeReader) codeReader.reset();
    scannerDialog.classList.add('hidden');
    document.getElementById('qr-video').srcObject = null;
    currentMaterialInput = null;
}
