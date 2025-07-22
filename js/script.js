document.addEventListener('DOMContentLoaded', () => {
    // Current date and time display
    const updateDateTime = () => {
        const now = new Date();
        document.getElementById('current-date').textContent = now.toLocaleDateString('de-DE');
        document.getElementById('current-time').textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    };
    setInterval(updateDateTime, 1000);
    updateDateTime(); // Initial call

    // Local Storage Keys
    const LS_KEY_NORMAL_HISTORY = 'lagerEntnahmeHistory';
    const LS_KEY_CLARIFICATION_CASES = 'klarungsfaelle';
    const LS_KEY_ADMIN_PIN = 'adminPin';
    const LS_KEY_MATERIAL_DB = 'materialDatabase';
    const LS_KEY_TAILWIND_CLASSES = 'tailwindClassesLoaded';

    // Elements
    const entnahmeForm = document.getElementById('entnahmeForm');
    const clearFormBtn = document.getElementById('clearForm');
    const confirmationDialog = document.getElementById('confirmationDialog');
    const closeDialogBtn = document.getElementById('closeDialog');
    const normalHistoryList = document.getElementById('normalHistoryList');
    const emptyNormalHistory = document.getElementById('emptyNormalHistory');
    const clarificationCasesList = document.getElementById('clarificationCasesList');
    const emptyClarificationCases = document.getElementById('emptyClarificationCases');

    const terminalMenuItem = document.getElementById('terminalMenuItem');
    const adminMenuItem = document.getElementById('adminMenuItem');
    const historyMenuItem = document.getElementById('historyMenuItem');
    const clarificationCasesMenuItem = document.getElementById('clarificationCasesMenuItem');

    const terminalContainer = document.querySelector('.terminal-container');
    const adminPanel = document.querySelector('.admin-panel');
    const historyPanel = document.querySelector('.history-panel');
    const clarificationCasesPanel = document.querySelector('.clarification-cases-panel');

    const pinDialog = document.getElementById('pinDialog');
    const pinInput = document.getElementById('pinInput');
    const pinError = document.getElementById('pinError');
    const cancelPinBtn = document.getElementById('cancelPin');
    const submitPinBtn = document.getElementById('submitPin');
    const backToAdminPanelBtn = document.getElementById('backToAdminPanelBtn');

    const materialFile = document.getElementById('materialFile');
    const uploadBtn = document.getElementById('uploadBtn');
    const databaseStatus = document.getElementById('databaseStatus');

    const exportNormalHistoryBtn = document.getElementById('exportNormalHistoryBtn');
    const clearNormalHistoryBtn = document.getElementById('clearNormalHistoryBtn');
    const exportClarificationCasesBtn = document.getElementById('exportClarificationCasesBtn');
    const clearClarificationCasesBtn = document.getElementById('clearClarificationCasesBtn');

    const deleteConfirmDialog = document.getElementById('deleteConfirmDialog');
    const cancelDeleteBtn = document.getElementById('cancelDelete');
    const confirmDeleteBtn = document.getElementById('confirmDelete');
    let historyTypeToDelete = ''; // 'normal' or 'clarification'

    const showNormalHistoryAdminBtn = document.getElementById('showNormalHistoryAdminBtn');
    const showClarificationCasesAdminBtn = document.getElementById('showClarificationCasesAdminBtn');

    const warningMengeDialog = document.getElementById('warningMengeDialog');
    const warningMengeText = document.getElementById('warningMengeText');
    const cancelWarningMengeBtn = document.getElementById('cancelWarningMenge');
    const confirmWarningMengeBtn = document.getElementById('confirmWarningMenge');
    let formSubmissionData = null; // Store form data for conditional submission

    const warningKostenDialog = document.getElementById('warningKostenDialog');
    const cancelWarningKostenBtn = document.getElementById('cancelWarningKosten');
    const confirmWarningKostenBtn = document.getElementById('confirmWarningKosten');

    const barcodeScannerDialog = document.getElementById('barcodeScannerDialog');
    const closeScannerBtn = document.getElementById('closeScanner');
    const scanResultSpan = document.getElementById('scan-result');

    // Barcode Scanner
    const codeReader = new ZXing.BrowserQRCodeReader();
    let videoInputDevices = [];
    let selectedVideoDevice = null;
    let currentScannerStream = null;
    let barcodeInputIndex = 0; // To keep track of which input field to fill

    // Material database
    let materialDatabase = JSON.parse(localStorage.getItem(LS_KEY_MATERIAL_DB)) || {};

    const loadMaterialDatabase = () => {
        if (Object.keys(materialDatabase).length > 0) {
            databaseStatus.textContent = `Status: Materialdatenbank geladen (${Object.keys(materialDatabase).length} Einträge)`;
            databaseStatus.classList.remove('text-red-600');
            databaseStatus.classList.add('text-green-600');
        } else {
            databaseStatus.textContent = 'Status: Keine Materialdatenbank geladen';
            databaseStatus.classList.remove('text-green-600');
            databaseStatus.classList.add('text-red-600');
        }
    };

    loadMaterialDatabase(); // Load status on page load

    materialFile.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            PapaParse.parse(file, {
                header: false, // The CSV doesn't have a header row
                delimiter: ';',
                complete: (results) => {
                    const newDatabase = {};
                    let validEntries = 0;
                    results.data.forEach(row => {
                        // Ensure row has at least 3 columns for SAP number, alt SAP number, and description
                        if (row.length >= 3) {
                            const sapNr = row[0].trim();
                            const altSapNr = row[1].trim();
                            const description = row[2] ? row[2].trim() : '';

                            if (sapNr) {
                                newDatabase[sapNr] = description;
                                validEntries++;
                            }
                            if (altSapNr && altSapNr !== sapNr) { // Avoid duplicating if alt is same as primary
                                newDatabase[altSapNr] = description;
                                validEntries++;
                            }
                        }
                    });
                    materialDatabase = newDatabase;
                    localStorage.setItem(LS_KEY_MATERIAL_DB, JSON.stringify(materialDatabase));
                    databaseStatus.textContent = `Status: ${validEntries} Materialdaten erfolgreich geladen!`;
                    databaseStatus.classList.remove('text-red-600');
                    databaseStatus.classList.add('text-green-600');
                },
                error: (error) => {
                    console.error('Error parsing CSV:', error);
                    databaseStatus.textContent = 'Fehler beim Laden der CSV-Datei.';
                    databaseStatus.classList.remove('text-green-600');
                    databaseStatus.classList.add('text-red-600');
                }
            });
        }
    });

    // Handle material input changes
    document.querySelectorAll('.material-input').forEach(input => {
        input.addEventListener('input', (event) => {
            const materialNumber = event.target.value.trim();
            const row = event.target.closest('.material-row');
            const descriptionField = row.querySelector('.description-field');
            const primaryMaterialInput = row.querySelector(`input[name="primary_${event.target.name}"]`);

            if (materialNumber in materialDatabase) {
                descriptionField.value = materialDatabase[materialNumber];
                descriptionField.classList.add('auto-filled');
                descriptionField.classList.remove('error');
                if (primaryMaterialInput) {
                    primaryMaterialInput.value = materialNumber; // Store the original/primary SAP number if found
                }
            } else {
                descriptionField.value = '';
                descriptionField.classList.remove('auto-filled');
                descriptionField.classList.remove('error'); // Remove error if it was there
                if (primaryMaterialInput) {
                    primaryMaterialInput.value = '';
                }
            }
        });
    });

    // Handle ME dropdown
    document.querySelectorAll('.me-input').forEach(input => {
        const dropdown = input.closest('.me-dropdown');
        const dropdownContent = dropdown.querySelector('.me-dropdown-content');

        input.addEventListener('focus', () => {
            dropdown.classList.add('show');
            highlightFirstDropdownItem(dropdownContent);
        });

        input.addEventListener('input', () => {
            const filter = input.value.toUpperCase();
            const items = dropdownContent.querySelectorAll('div');
            items.forEach(item => {
                const text = item.textContent || item.innerText;
                if (text.toUpperCase().indexOf(filter) > -1) {
                    item.style.display = "";
                } else {
                    item.style.display = "none";
                }
            });
            highlightFirstDropdownItem(dropdownContent);
            dropdown.classList.add('show'); // Ensure dropdown stays open while typing
        });

        input.addEventListener('keydown', (e) => {
            const items = Array.from(dropdownContent.querySelectorAll('div[style*="display:"]:not([style*="display:none"])'));
            if (items.length === 0) return;

            let highlighted = dropdownContent.querySelector('.highlighted');
            let nextIndex = -1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (highlighted) {
                    highlighted.classList.remove('highlighted');
                    const currentIndex = items.indexOf(highlighted);
                    nextIndex = (currentIndex + 1) % items.length;
                } else {
                    nextIndex = 0;
                }
                items[nextIndex].classList.add('highlighted');
                items[nextIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (highlighted) {
                    highlighted.classList.remove('highlighted');
                    const currentIndex = items.indexOf(highlighted);
                    nextIndex = (currentIndex - 1 + items.length) % items.length;
                } else {
                    nextIndex = items.length - 1;
                }
                items[nextIndex].classList.add('highlighted');
                items[nextIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlighted) {
                    input.value = highlighted.dataset.text;
                    dropdown.classList.remove('show');
                    input.focus(); // Keep focus on the input after selection
                } else if (items.length > 0) { // If no item is highlighted but there's a visible item
                    input.value = items[0].dataset.text;
                    dropdown.classList.remove('show');
                    input.focus();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                dropdown.classList.remove('show');
                input.blur();
            }
        });

        dropdownContent.addEventListener('click', (event) => {
            if (event.target.tagName === 'DIV') {
                input.value = event.target.dataset.text;
                dropdown.classList.remove('show');
                input.focus(); // Keep focus on the input after selection
            }
        });

        document.addEventListener('click', (event) => {
            if (!dropdown.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });
    });

    function highlightFirstDropdownItem(dropdownContent) {
        dropdownContent.querySelectorAll('div').forEach(item => item.classList.remove('highlighted'));
        const firstVisibleItem = dropdownContent.querySelector('div[style*="display:"]:not([style*="display:none"])');
        if (firstVisibleItem) {
            firstVisibleItem.classList.add('highlighted');
        }
    }


    // Handle form submission
    entnahmeForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(entnahmeForm);
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value.trim();
        });

        const entnahme = {
            mitarbeiter: data.mitarbeiter,
            entnahmedatum: data.entnahmedatum,
            vorgesetzter: data.vorgesetzter,
            kostenstelle: data.kostenstelle,
            auftrag: data.auftrag,
            projektnr: data.projektnr,
            materialien: [],
            timestamp: new Date().toISOString()
        };

        let hasMissingMenge = false;
        let missingMengeLines = [];
        let hasMissingKostenInfo = false;

        document.querySelectorAll('.material-row').forEach((row, index) => {
            const materialInput = row.querySelector('.material-input');
            const descriptionField = row.querySelector('.description-field');
            const meInput = row.querySelector('.me-input');
            const mengeInput = row.querySelector('.menge-input');
            const primaryMaterialInput = row.querySelector(`input[name="primary_material_${index + 1}"]`);

            const materialNr = materialInput.value.trim();
            const description = descriptionField.value.trim();
            const me = meInput.value.trim();
            const menge = mengeInput.value.trim();
            const primaryMaterialNr = primaryMaterialInput.value.trim(); // Get the stored primary material number

            if (materialNr && (description || materialNr in materialDatabase)) { // Only add if material number is present and description is either provided or found in DB
                const materialEntry = {
                    materialnummer: materialNr,
                    beschreibung: description || materialDatabase[materialNr] || 'Nicht in Datenbank', // Fallback for description
                    me: me,
                    menge: menge,
                    primaryMaterialnummer: primaryMaterialNr // Include the primary material number
                };
                entnahme.materialien.push(materialEntry);

                // Check for missing description or quantity
                if (!description && !(materialNr in materialDatabase)) {
                    descriptionField.classList.add('error');
                } else {
                    descriptionField.classList.remove('error');
                }
                if (!me) {
                    meInput.classList.add('error');
                } else {
                    meInput.classList.remove('error');
                }
                if (!menge || parseInt(menge) <= 0) {
                    hasMissingMenge = true;
                    missingMengeLines.push(index + 1);
                }
            } else {
                // Clear any potential errors if the row is now considered empty
                descriptionField.classList.remove('error');
                meInput.classList.remove('error');
            }
        });

        if (entnahme.materialien.length === 0) {
            alert('Bitte geben Sie mindestens eine Materialposition ein.');
            return;
        }

        if (!data.kostenstelle && !data.auftrag && !data.projektnr) {
            hasMissingKostenInfo = true;
        }

        formSubmissionData = entnahme; // Store the data for potential re-submission

        if (hasMissingMenge && !hasMissingKostenInfo) {
            warningMengeText.textContent = `Mengenangabe in Zeile(n) ${missingMengeLines.join(', ')} fehlt! Trotzdem übertragen?`;
            warningMengeDialog.classList.remove('hidden');
        } else if (!hasMissingMenge && hasMissingKostenInfo) {
            warningKostenDialog.classList.remove('hidden');
        } else if (hasMissingMenge && hasMissingKostenInfo) {
            warningMengeText.textContent = `Mengenangabe in Zeile(n) ${missingMengeLines.join(', ')} fehlt! Kostenstelle, Auftrag oder Projekt-Nr. fehlt! Trotzdem übertragen?`;
            warningMengeDialog.classList.remove('hidden'); // Prioritize Menge warning, user will confirm both
        } else {
            saveEntnahme(entnahme, LS_KEY_NORMAL_HISTORY);
            showConfirmationDialog();
            clearForm();
        }
    });

    cancelWarningMengeBtn.addEventListener('click', () => {
        warningMengeDialog.classList.add('hidden');
        formSubmissionData = null; // Clear stored data
    });

    confirmWarningMengeBtn.addEventListener('click', () => {
        warningMengeDialog.classList.add('hidden');
        if (formSubmissionData) {
            let isClarification = false;
            // Check if costs are still missing (if warningKostenDialog was implicitly skipped)
            if (!formSubmissionData.kostenstelle && !formSubmissionData.auftrag && !formSubmissionData.projektnr) {
                isClarification = true;
            }
            // Check for any material with missing description/ME that's not in DB
            formSubmissionData.materialien.forEach(mat => {
                if ((!mat.beschreibung && !(mat.materialnummer in materialDatabase)) || !mat.me) {
                    isClarification = true;
                }
            });

            if (isClarification) {
                saveEntnahme(formSubmissionData, LS_KEY_CLARIFICATION_CASES);
            } else {
                saveEntnahme(formSubmissionData, LS_KEY_NORMAL_HISTORY);
            }

            showConfirmationDialog();
            clearForm();
            formSubmissionData = null; // Clear stored data
        }
    });

    cancelWarningKostenBtn.addEventListener('click', () => {
        warningKostenDialog.classList.add('hidden');
        formSubmissionData = null; // Clear stored data
    });

    confirmWarningKostenBtn.addEventListener('click', () => {
        warningKostenDialog.classList.add('hidden');
        if (formSubmissionData) {
            // If we confirm Kosten warning, it means user is okay with missing cost info,
            // so this entry goes to clarification cases.
            saveEntnahme(formSubmissionData, LS_KEY_CLARIFICATION_CASES);
            showConfirmationDialog();
            clearForm();
            formSubmissionData = null; // Clear stored data
        }
    });


    function saveEntnahme(entnahme, storageKey) {
        const history = JSON.parse(localStorage.getItem(storageKey)) || [];
        history.unshift(entnahme); // Add to the beginning
        localStorage.setItem(storageKey, JSON.stringify(history));
    }

    function showConfirmationDialog() {
        confirmationDialog.classList.remove('hidden');
        setTimeout(() => {
            confirmationDialog.classList.add('hidden');
        }, 3000); // Automatically close after 3 seconds
    }

    closeDialogBtn.addEventListener('click', () => {
        confirmationDialog.classList.add('hidden');
    });

    clearFormBtn.addEventListener('click', clearForm);

    function clearForm() {
        entnahmeForm.reset();
        document.getElementById('entnahmedatum').valueAsDate = new Date(); // Set today's date
        document.querySelectorAll('.description-field').forEach(field => {
            field.value = '';
            field.classList.remove('auto-filled', 'error');
        });
        document.querySelectorAll('.me-input').forEach(field => {
            field.classList.remove('error');
        });
        // Clear hidden primary material number fields
        document.querySelectorAll('input[name^="primary_material_"]').forEach(input => {
            input.value = '';
        });
    }

    // Initialize form with current date
    document.getElementById('entnahmedatum').valueAsDate = new Date();

    // Navigation
    const activateMenuItem = (menuItem) => {
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        menuItem.classList.add('active');
    };

    const showPanel = (panelToShow) => {
        terminalContainer.style.display = 'none';
        adminPanel.style.display = 'none';
        historyPanel.style.display = 'none';
        clarificationCasesPanel.style.display = 'none';
        panelToShow.style.display = 'block';

        backToAdminPanelBtn.classList.add('hidden'); // Hide by default
    };

    terminalMenuItem.addEventListener('click', () => {
        activateMenuItem(terminalMenuItem);
        showPanel(terminalContainer);
    });

    adminMenuItem.addEventListener('click', () => {
        // Show PIN dialog first
        pinInput.value = '';
        pinError.classList.add('hidden');
        pinDialog.classList.remove('hidden');
        pinInput.focus();
    });

    cancelPinBtn.addEventListener('click', () => {
        pinDialog.classList.add('hidden');
    });

    submitPinBtn.addEventListener('click', () => {
        const enteredPin = pinInput.value;
        const storedPin = localStorage.getItem(LS_KEY_ADMIN_PIN) || '1234'; // Default PIN

        if (enteredPin === storedPin) {
            pinDialog.classList.add('hidden');
            activateMenuItem(adminMenuItem);
            showPanel(adminPanel);
        } else {
            pinError.classList.remove('hidden');
            pinInput.value = '';
        }
    });

    // Admin history buttons
    showNormalHistoryAdminBtn.addEventListener('click', () => {
        showPanel(historyPanel);
        loadHistory(LS_KEY_NORMAL_HISTORY, normalHistoryList, emptyNormalHistory, 'normal');
        backToAdminPanelBtn.classList.remove('hidden');
    });

    showClarificationCasesAdminBtn.addEventListener('click', () => {
        showPanel(clarificationCasesPanel);
        loadHistory(LS_KEY_CLARIFICATION_CASES, clarificationCasesList, emptyClarificationCases, 'clarification');
        backToAdminPanelBtn.classList.remove('hidden');
    });

    backToAdminPanelBtn.addEventListener('click', () => {
        showPanel(adminPanel);
        // Keep adminMenuItem active
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        adminMenuItem.classList.add('active');
    });

    // History and Clarification Cases
    historyMenuItem.addEventListener('click', () => {
        activateMenuItem(historyMenuItem);
        showPanel(historyPanel);
        loadHistory(LS_KEY_NORMAL_HISTORY, normalHistoryList, emptyNormalHistory, 'normal');
    });

    clarificationCasesMenuItem.addEventListener('click', () => {
        activateMenuItem(clarificationCasesMenuItem);
        showPanel(clarificationCasesPanel);
        loadHistory(LS_KEY_CLARIFICATION_CASES, clarificationCasesList, emptyClarificationCases, 'clarification');
    });

    function loadHistory(storageKey, listElement, emptyMessageElement, type) {
        const history = JSON.parse(localStorage.getItem(storageKey)) || [];
        listElement.innerHTML = ''; // Clear previous entries

        if (history.length === 0) {
            emptyMessageElement.classList.remove('hidden');
        } else {
            emptyMessageElement.classList.add('hidden');
            history.forEach((entry, index) => {
                const row = document.createElement('tr');
                row.classList.add('hover:bg-gray-50');

                const dateCell = document.createElement('td');
                dateCell.classList.add('px-4', 'py-3', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
                dateCell.textContent = new Date(entry.timestamp).toLocaleString('de-DE');
                dateCell.dataset.label = 'Datum';

                const mitarbeiterCell = document.createElement('td');
                mitarbeiterCell.classList.add('px-4', 'py-3', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
                mitarbeiterCell.textContent = entry.mitarbeiter;
                mitarbeiterCell.dataset.label = 'Mitarbeiter';


                const materialienCell = document.createElement('td');
                materialienCell.classList.add('px-4', 'py-3', 'whitespace-normal', 'text-sm', 'text-gray-900');
                materialienCell.dataset.label = 'Materialien';
                materialienCell.innerHTML = entry.materialien.map(mat => {
                    let desc = mat.beschreibung;
                    // Highlight if description was missing and not found in DB
                    if (!mat.beschreibung && !(mat.materialnummer in materialDatabase)) {
                         desc = `<span class="text-red-600">${mat.materialnummer} (Beschreibung fehlt)</span>`;
                    } else if (mat.beschreibung === 'Nicht in Datenbank') {
                        desc = `<span class="text-red-600">${mat.materialnummer} (Nicht in DB)</span>`;
                    } else {
                        desc = `${mat.materialnummer} - ${mat.beschreibung}`;
                    }
                    let me = mat.me;
                    if (!me) {
                        me = `<span class="text-red-600">(ME fehlt)</span>`;
                    }

                    let menge = mat.menge;
                    if (!menge || parseInt(menge) <= 0) {
                        menge = `<span class="text-red-600">(Menge fehlt)</span>`;
                    }
                    return `<div>${desc} / ${me} / ${menge}</div>`;
                }).join('');

                const actionsCell = document.createElement('td');
                actionsCell.classList.add('px-4', 'py-3', 'whitespace-nowrap', 'text-right', 'text-sm', 'font-medium');
                actionsCell.dataset.label = 'Aktionen';

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Löschen';
                deleteBtn.classList.add('text-red-600', 'hover:text-red-900', 'ml-2');
                deleteBtn.addEventListener('click', () => {
                    openDeleteConfirmation(index, storageKey, type);
                });
                actionsCell.appendChild(deleteBtn);

                row.appendChild(dateCell);
                row.appendChild(mitarbeiterCell);
                row.appendChild(materialienCell);
                row.appendChild(actionsCell);
                listElement.appendChild(row);
            });
        }
    }

    function openDeleteConfirmation(index, storageKey, type) {
        deleteConfirmDialog.classList.remove('hidden');
        historyTypeToDelete = type; // Store the type of history being deleted
        confirmDeleteBtn.onclick = () => {
            deleteEntry(index, storageKey);
            deleteConfirmDialog.classList.add('hidden');
        };
    }

    cancelDeleteBtn.addEventListener('click', () => {
        deleteConfirmDialog.classList.add('hidden');
        confirmDeleteBtn.onclick = null; // Clear the handler
    });

    function deleteEntry(index, storageKey) {
        const history = JSON.parse(localStorage.getItem(storageKey)) || [];
        history.splice(index, 1);
        localStorage.setItem(storageKey, JSON.stringify(history));
        // Reload the correct history list after deletion
        if (historyTypeToDelete === 'normal') {
            loadHistory(LS_KEY_NORMAL_HISTORY, normalHistoryList, emptyNormalHistory, 'normal');
        } else if (historyTypeToDelete === 'clarification') {
            loadHistory(LS_KEY_CLARIFICATION_CASES, clarificationCasesList, emptyClarificationCases, 'clarification');
        }
    }

    // Export to CSV
    exportNormalHistoryBtn.addEventListener('click', () => exportHistory(LS_KEY_NORMAL_HISTORY, 'entnahme_verlauf.csv'));
    exportClarificationCasesBtn.addEventListener('click', () => exportHistory(LS_KEY_CLARIFICATION_CASES, 'klaerungsfaelle.csv'));

    function exportHistory(storageKey, filename) {
        const history = JSON.parse(localStorage.getItem(storageKey)) || [];
        if (history.length === 0) {
            alert('Keine Daten zum Exportieren vorhanden.');
            return;
        }

        let csv = '';
        // Add headers
        csv += 'Datum;Mitarbeiter;Vorgesetzter;Kostenstelle;Auftrag;Projekt-Nr.;Materialnummer;Beschreibung;ME;Menge;Primäre Materialnummer\n';

        history.forEach(entry => {
            entry.materialien.forEach(material => {
                const row = [
                    `"${new Date(entry.timestamp).toLocaleString('de-DE')}"`,
                    `"${entry.mitarbeiter}"`,
                    `"${entry.vorgesetzter || ''}"`,
                    `"${entry.kostenstelle || ''}"`,
                    `"${entry.auftrag || ''}"`,
                    `"${entry.projektnr || ''}"`,
                    `"${material.materialnummer}"`,
                    `"${material.beschreibung}"`,
                    `"${material.me}"`,
                    `"${material.menge}"`,
                    `"${material.primaryMaterialnummer || ''}"`
                ].join(';');
                csv += row + '\n';
            });
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // Clear All History
    clearNormalHistoryBtn.addEventListener('click', () => {
        historyTypeToDelete = 'normal';
        deleteConfirmDialog.classList.remove('hidden');
        confirmDeleteBtn.onclick = () => {
            localStorage.removeItem(LS_KEY_NORMAL_HISTORY);
            loadHistory(LS_KEY_NORMAL_HISTORY, normalHistoryList, emptyNormalHistory, 'normal');
            deleteConfirmDialog.classList.add('hidden');
        };
    });

    clearClarificationCasesBtn.addEventListener('click', () => {
        historyTypeToDelete = 'clarification';
        deleteConfirmDialog.classList.remove('hidden');
        confirmDeleteBtn.onclick = () => {
            localStorage.removeItem(LS_KEY_CLARIFICATION_CASES);
            loadHistory(LS_KEY_CLARIFICATION_CASES, clarificationCasesList, emptyClarificationCases, 'clarification');
            deleteConfirmDialog.classList.add('hidden');
        };
    });

    // Barcode Scanner Logic
    const openBarcodeScanner = (index) => {
        barcodeInputIndex = index;
        barcodeScannerDialog.classList.remove('hidden');
        scanResultSpan.textContent = 'Bereit zum Scannen...';

        codeReader.listVideoInputDevices()
            .then((videoInputDevice) => {
                videoInputDevices = videoInputDevice;
                if (videoInputDevices.length > 0) {
                    // Try to find a back camera, otherwise use the first one
                    selectedVideoDevice = videoInputDevices.find(device => device.label.toLowerCase().includes('back'))?.deviceId || videoInputDevices[0].deviceId;
                    startBarcodeScanning(selectedVideoDevice);
                } else {
                    console.error('No video input devices found.');
                    scanResultSpan.textContent = 'Keine Kamera gefunden.';
                }
            })
            .catch((err) => {
                console.error(err);
                scanResultSpan.textContent = 'Fehler beim Zugriff auf Kamera.';
            });
    };

    const startBarcodeScanning = (deviceId) => {
        codeReader.decodeFromVideoDevice(deviceId, 'qr-video', (result, err) => {
            if (result) {
                console.log(result.text);
                const materialInput = document.getElementById(`material_${barcodeInputIndex}`);
                if (materialInput) {
                    materialInput.value = result.text;
                    // Trigger input event to automatically fill description if applicable
                    const event = new Event('input', { bubbles: true });
                    materialInput.dispatchEvent(event);
                }
                scanResultSpan.textContent = `Erkannt: ${result.text}`;
                closeBarcodeScanner();
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error(err);
                scanResultSpan.textContent = 'Fehler beim Scannen.';
            }
        });
    };

    const closeBarcodeScanner = () => {
        barcodeScannerDialog.classList.add('hidden');
        codeReader.reset();
        // Stop all video tracks from the current stream
        if (codeReader.stream) { // ZXing.BrowserCodeReader stores the stream
            codeReader.stream.getTracks().forEach(track => track.stop());
            codeReader.stream = null;
        }
        scanResultSpan.textContent = 'Bereit zum Scannen...';
    };

    closeScannerBtn.addEventListener('click', closeBarcodeScanner);

    // Attach event listeners to barcode scan buttons
    document.querySelectorAll('.barcode-scan-btn').forEach((button, index) => {
        button.addEventListener('click', () => openBarcodeScanner(index + 1));
    });

    // Initial load for active tab
    showPanel(terminalContainer);
    loadHistory(LS_KEY_NORMAL_HISTORY, normalHistoryList, emptyNormalHistory, 'normal');
    loadHistory(LS_KEY_CLARIFICATION_CASES, clarificationCasesList, emptyClarificationCases, 'clarification');
    clearForm(); // Reset form fields on load
});