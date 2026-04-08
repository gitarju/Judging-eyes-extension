document.addEventListener('DOMContentLoaded', () => {
    const enableToggle = document.getElementById('enableToggle');
    const moodSelect = document.getElementById('moodSelect');

    // Load saved settings
    chrome.storage.local.get(['eyesEnabled', 'eyesMood', 'eyesModel'], (result) => {
        if (result.eyesEnabled !== undefined) {
            enableToggle.checked = result.eyesEnabled;
        }
        if (result.eyesMood !== undefined) {
            moodSelect.value = result.eyesMood;
        }
        if (result.eyesModel !== undefined) {
            document.getElementById('modelSelect').value = result.eyesModel;
        }
    });

    // Save on change
    enableToggle.addEventListener('change', () => {
        chrome.storage.local.set({ eyesEnabled: enableToggle.checked });
    });

    moodSelect.addEventListener('change', () => {
        chrome.storage.local.set({ eyesMood: moodSelect.value });
    });

    document.getElementById('modelSelect').addEventListener('change', (e) => {
        chrome.storage.local.set({ eyesModel: e.target.value });
    });
});
