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

    // Funktion zum Einblenden der nächsten Zeile
    const showNextRow = (currentRow) => {
        if (currentRow.classList.contains('material-row')) {
            const nextRow = currentRow.nextElementSibling;
            if (nextRow && nextRow.classList.contains('material-row') && nextRow.classList.contains('hidden')) {
                nextRow.classList.remove('hidden');
            }
        }
    };

    // Event-Listener für dynamische Zeilen
    document.querySelectorAll('.material-input, .description-field').forEach(input => {
        input.addEventListener('input', (e) => {
            showNextRow(e.target.closest('tr'));
        });
    });
    
    // SAP-Nr.-Eingabe-Event für automatische Beschreibung und Enter-Taste
    document.querySelectorAll('.material-input').forEach(input => {
        input.addEventListener('blur', function() { checkMaterialNumber(this); });
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                checkMaterialNumber(this);
                // Der Fokus wird nun durch checkMaterialNumber() zum ME-Feld gesetzt
            }
        });
    });
    
    // Beschreibungs-Feld-Events
    document.querySelectorAll('.description-field').forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const rowNumber = parseInt(this.name.split('_')[1]);
                document.querySelector(`[name="menge_${rowNumber}"]`).focus();
            }
        });
        
        input.addEventListener('blur', function() {
            if (this.value.trim()) {
                const rowNumber = parseInt(this.name.split('_')[1]);
                const meInput = document.querySelector(`[name="me_${rowNumber}"]`);
                meInput.focus();
                meInput.parentElement.classList.add('show');
            }
        });
    });

    // Mengeneinheit-Dropdown-Funktionalität (per Klick)
    document.querySelectorAll('.me-dropdown-content div').forEach(option => {
        option.addEventListener('click', function() {
            const value = this.getAttribute('data-value');
            const text = this.getAttribute('data-text');
            const dropdown = this.closest('.me-dropdown');
            const inputField = dropdown.querySelector('.me-input');
            inputField.value = text; // Zeigt den Text an
            inputField.setAttribute('data-value', value); // Speichert den Code
            dropdown.classList.remove('show');
            this.parentElement.querySelectorAll('.highlighted').forEach(h => h.classList.remove('highlighted'));
            const rowNumber = parseInt(inputField.name.split('_')[1]);
            document.querySelector(`[name="menge_${rowNumber}"]`).focus();
        });
    });
    
    // Menge-Eingabe-Events
    document.querySelectorAll('.menge-input').forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const rowNumber = parseInt(this.name.split('_')[1]);
                findNextEmptyMaterialRow(rowNumber);
            }
        });
    });

    // Event-Listener für die ME-Eingabefelder (Tastatur & Klick)
    document.querySelectorAll('.me-input').forEach(input => {
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
        input.addEventListener('click', function() {
            const currentDropdown = this.parentElement;
            document.querySelectorAll('.me-dropdown.show').forEach(d => { if (d !== currentDropdown) d.classList.remove('show'); });
            currentDropdown.classList.toggle('show');
        });
        input.addEventListener('keydown', function(e) {
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
                            document.querySelector(`[name="menge_${rowNumber}"]`).focus();
                        }
                    }
                    break;
                case 'Escape': e.preventDefault(); dropdown.classList.remove('show'); break;
            }
        });
        input.addEventListener('blur', function() { handleMEInput(this); setTimeout(() => this.parentElement.classList.remove('show'), 150); });
    });
    
    // Formular zurücksetzen Button
    document.getElementById('clearForm').addEventListener('click', resetForm);
    
    // Formular absenden
    document.getElementById('entnahmeForm').addEventListener('submit', function(e) {
        e.preventDefault();

        // Offline-Prüfung
        if (!navigator.onLine) {
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.textContent = 'Warte auf Internetverbindung...';
            submitBtn.disabled = true;
            return; 
        }

        let hasAtLeastOneValidRow = false;
        for (let i = 1; i <= 8; i++) {
            const materialInput = document.querySelector(`[name="material_${i}"]`);
            const mengeInput = document.querySelector(`[name="menge_${i}"]`);
            const descriptionInput = document.querySelector(`[name="description_${i}"]`);
            if (mengeInput.value.trim() !== '' && (materialInput.value.trim() !== '' || descriptionInput.value.trim() !== '')) {
                hasAtLeastOneValidRow = true;
                break;
            }
        }

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

    // Online/Offline Event Listener
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
    handleOnlineStatus(); // Initial check
    
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
            // Firestore Batch-Löschung
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
            // Firestore Batch-Löschung
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
            setActiveMenuItem('adminMenuItem'); // Already in admin mode, just switch to main admin panel
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

function findNextEmptyMaterialRow(currentRow) {
    let nextRow = currentRow;
    while (nextRow < 8) {
        nextRow++;
        const nextRowElement = document.querySelector(`[name="material_${nextRow}"]`).closest('tr');
        if (nextRowElement.classList.contains('hidden')) {
            nextRowElement.classList.remove('hidden');
        }
        const materialInput = document.querySelector(`[name="material_${nextRow}"]`);
        const mengeInput = document.querySelector(`[name="menge_${nextRow}"]`);
        if (!materialInput.value && !mengeInput.value) { 
            materialInput.focus();
            return;
        }
    }
    document.querySelector('[name="material_1"]').focus();
}

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

// --- ANGEPASST: checkMaterialNumber ---
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
        
        // Springe zum ME-Feld und öffne das Dropdown.
        const meInput = document.querySelector(`[name="me_${rowNumber}"]`);
        meInput.focus();
        meInput.parentElement.classList.add('show');

    } else { 
        primaryField.value = ''; 
        descriptionField.value = ''; 
    }
}
// --- ENDE ANPASSUNG ---

function loadAllData() {
    // KORRIGIERT: CSV-Datei von GitHub laden mit vollständiger URL
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
                complete: processMaterialData // Verwende die ausgelagerte Funktion
            });
        })
        .catch(error => {
            console.error("Fehler beim Laden der Material-CSV von GitHub:", error);
            document.getElementById('databaseStatus').textContent = 'Status: Fehler beim Laden der Materialdatenbank von GitHub. Manuelles Hochladen möglich.';
            alert("Die Materialdatenbank konnte nicht automatisch geladen werden. Bitte laden Sie die CSV-Datei manuell im Admin-Bereich hoch.");
        });

    // Echtzeit-Listener für normale Entnahmen
    db.collection("entnahmen").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        normalHistoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateNormalHistoryTable();
    }, err => {
        console.error("Fehler beim Laden des normalen Verlaufs: ", err);
    });

    // Echtzeit-Listener für Klärungsfälle
    db.collection("klaerungsfaelle").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        clarificationCasesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateClarificationCasesTable();
    }, err => {
        console.error("Fehler beim Laden der Klärungsfälle: ", err);
    });
}

function validateForm() {
    const result = { missingMenge: [], missingKosten: false };
    for (let i = 1; i <= 8; i++) {
        const materialNrInput = document.querySelector(`[name="material_${i}"]`);
        const mengeInput = document.querySelector(`[name="menge_${i}"]`);
        const descriptionInput = document.querySelector(`[name="description_${i}"]`);

        if ((materialNrInput.value.trim() !== '' || descriptionInput.value.trim() !== '') && mengeInput.value.trim() === '') {
            result.missingMenge.push(i);
        }
    }
    const kostenstelle = document.getElementById('kostenstelle').value.trim();
    const auftrag = document.getElementById('auftrag').value.trim();
    const projektnr = document.getElementById('projektnr').value.trim();
    if (!kostenstelle && !auftrag && !projektnr) { result.missingKosten = true; }
    return result;
}

function collectFormData() {
    const materialien = [];
    for (let i = 1; i <= 8; i++) {
        const materialNrInput = document.querySelector(`[name="material_${i}"]`);
        const primaryNrInput = document.querySelector(`[name="primary_material_${i}"]`);
        const beschreibungInput = document.querySelector(`[name="description_${i}"]`);
        const mengeInput = document.querySelector(`[name="menge_${i}"]`);
        const meInput = document.querySelector(`[name="me_${i}"]`);
        const nachbestellenCheckbox = document.querySelector(`[name="nachbestellen_${i}"]`);

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
    }
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
    document.querySelectorAll('.description-field, .me-input, .material-input').forEach(f => f.classList.remove('auto-filled', 'error'));
    document.querySelectorAll('input[name^="primary_material_"]').forEach(f => { f.value = ''; });
    document.querySelectorAll('.me-input').forEach(f => { f.value = ''; f.removeAttribute('data-value'); });

    // Hide all material rows except the first one
    document.querySelectorAll('.material-row').forEach((row, index) => {
        if (index > 0) {
            row.classList.add('hidden');
        }
    });

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
                        text += ` <span class="font-bold text-blue-600">[Nachbestellen]</span>`;
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
                        text += ` <span class="font-bold text-blue-600">[Nachbestellen]</span>`;
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

    resetForm();

    document.getElementById('mitarbeiter').value = entry.mitarbeiter;
    document.getElementById('entnahmedatum').value = entry.entnahmedatum;
    document.getElementById('vorgesetzter').value = entry.vorgesetzter || '';
    document.getElementById('kostenstelle').value = entry.kostenstelle || '';
    document.getElementById('auftrag').value = entry.auftrag || '';
    document.getElementById('projektnr').value = entry.projektnr || '';

    entry.materialien.forEach((material, i) => {
        const rowNum = i + 1;
        if (rowNum > 8) return; 

        // Make row visible
        const row = document.querySelector(`[name="material_${rowNum}"]`).closest('tr');
        if (row) row.classList.remove('hidden');

        document.querySelector(`[name="material_${rowNum}"]`).value = material.eingabeNr || '';
        document.querySelector(`[name="primary_material_${rowNum}"]`).value = material.materialNr || '';
        document.querySelector(`[name="description_${rowNum}"]`).value = material.beschreibung || '';
        const meInput = document.querySelector(`[name="me_${rowNum}"]`);
        meInput.value = material.me.text || '';
        meInput.setAttribute('data-value', material.me.code || '');
        document.querySelector(`[name="menge_${rowNum}"]`).value = material.menge || '';
        document.querySelector(`[name="nachbestellen_${rowNum}"]`).checked = material.nachbestellen || false;

        checkMaterialNumber(document.querySelector(`[name="material_${rowNum}"]`));
    });

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

function exportToCSV(data, filename) {
    if (data.length === 0) { 
        alert('Keine Daten zum Exportieren vorhanden.'); 
        return; 
    }
    let csvContent = 'Datum;Mitarbeiter;Vorgesetzter;Kostenstelle;Auftrag;Projekt-Nr;Eingegebene Nr.;SAP-Nr.;Beschreibung;ME;Menge;Nachbestellen\n';
    data.forEach(entry => {
        const dateStr = entry.entnahmedatum ? new Date(entry.entnahmedatum).toLocaleDateString('de-DE') : formatTimestamp(entry.timestamp);
        if (entry.materialien && entry.materialien.length > 0) {
            entry.materialien.forEach(m => {
                if (m.menge > 0 || m.eingabeNr || m.beschreibung) { // Nur Zeilen mit Inhalt exportieren
                    const meText = m.me && m.me.text ? m.me.text : '';
                    const nachbestellenText = m.nachbestellen ? 'Ja' : 'Nein';
                    csvContent += `${dateStr};${entry.mitarbeiter || ''};${entry.vorgesetzter || ''};${entry.kostenstelle || ''};${entry.auftrag || ''};${entry.projektnr || ''};${m.eingabeNr || ''};${m.materialNr || ''};"${m.beschreibung || ''}";${meText};${m.menge || ''};${nachbestellenText}\n`;
                }
            });
        } else {
             csvContent += `${dateStr};${entry.mitarbeiter || ''};${entry.vorgesetzter || ''};${entry.kostenstelle || ''};${entry.auftrag || ''};${entry.projektnr || ''};;;;;;\n`;
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


function exportNormalHistoryToCSV() {
    exportToCSV(normalHistoryData, 'entnahme_verlauf.csv');
}

function exportClarificationCasesToCSV() {
    exportToCSV(clarificationCasesData, 'klaerungsfaelle.csv');
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
            closeBarcodeScanner();
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
                    // Event auslösen, um nächste Zeile anzuzeigen
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
        if (err.name === 'NotAllowedError') {
            errorMessage = 'Kamerazugriff wurde verweigert. Bitte erlauben Sie den Zugriff in Ihren Browsereinstellungen.';
        } else if (err.name === 'NotFoundError') {
            errorMessage = 'Keine Kamera gefunden.';
        }
        
        scannerStatus.textContent = `Fehler: ${errorMessage}`;
        alert(errorMessage);
        closeBarcodeScanner();
    }
}

function closeBarcodeScanner() {
    const scannerDialog = document.getElementById('barcodeScannerDialog');
    const qrVideo = document.getElementById('qr-video');
    
    if (codeReader) {
        codeReader.reset(); // Kamera und Stream stoppen
    }
    scannerDialog.classList.add('hidden');
    qrVideo.srcObject = null; // Video-Stream leeren
    currentMaterialInput = null; // Aktuelles Input-Feld zurücksetzen
}

// Optionaler Patch für Kamera-Zoom, kann beibehalten werden
async function applyZoomToCamera(stream) {
    const [track] = stream.getVideoTracks();
    if (!track) return;
    const capabilities = track.getCapabilities();
    if ('zoom' in capabilities) {
        try {
            await track.applyConstraints({ advanced: [{ zoom: Math.min(capabilities.zoom.max, 2) }] }); // Zoom auf 2x reduziert
            console.log("2x zoom applied.");
        } catch (err) {
            console.warn("Zoom could not be applied:", err);
        }
    } else {
        console.log("Zoom not supported on this device.");
    }
}

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
        const stream = await originalGetUserMedia(constraints);
        if (stream.getVideoTracks().length > 0) {
            await applyZoomToCamera(stream);
        }
        return stream;
    }
}
