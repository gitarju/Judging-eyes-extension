document.addEventListener('DOMContentLoaded', () => {
    const enableToggle = document.getElementById('enableToggle');
    const vishuToggle = document.getElementById('vishuToggle');
    const moodSelect = document.getElementById('moodSelect');
    const sizeSlider = document.getElementById('sizeSlider');

    // Load saved settings
    chrome.storage.local.get(['eyesEnabled', 'eyesMood', 'eyesModel', 'eyesScale', 'eyesVishu'], (result) => {
        if (result.eyesEnabled !== undefined) {
            enableToggle.checked = result.eyesEnabled;
        }
        if (result.eyesMood !== undefined) {
            moodSelect.value = result.eyesMood;
        }
        if (result.eyesModel !== undefined) {
            document.getElementById('modelSelect').value = result.eyesModel;
        }
        if (result.eyesScale !== undefined) {
            sizeSlider.value = result.eyesScale;
        }
        if (result.eyesVishu !== undefined) {
            vishuToggle.checked = result.eyesVishu;
        }
    });

    // Save on change
    enableToggle.addEventListener('change', () => {
        chrome.storage.local.set({ eyesEnabled: enableToggle.checked });
    });

    vishuToggle.addEventListener('change', () => {
        chrome.storage.local.set({ eyesVishu: vishuToggle.checked });
    });

    moodSelect.addEventListener('change', () => {
        chrome.storage.local.set({ eyesMood: moodSelect.value });
    });

    document.getElementById('modelSelect').addEventListener('change', (e) => {
        chrome.storage.local.set({ eyesModel: e.target.value });
    });

    sizeSlider.addEventListener('input', (e) => {
        chrome.storage.local.set({ eyesScale: parseFloat(e.target.value) });
    });
});
