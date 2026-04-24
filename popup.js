document.addEventListener('DOMContentLoaded', () => {
    const enableToggle = document.getElementById('enableToggle');
    const vishuToggle = document.getElementById('vishuToggle');
    const moodSelect = document.getElementById('moodSelect');
    const sizeSlider = document.getElementById('sizeSlider');
    const weatherToggle = document.getElementById('weatherToggle');
    const weatherInfo = document.getElementById('weatherInfo');

    function updateWeatherInfo(data) {
        if (!data) {
            weatherInfo.innerText = "Fetching weather...";
        } else {
            weatherInfo.innerText = `${data.temp}°C ${data.desc} in ${data.city}`;
        }
    }

    // Load saved settings
    chrome.storage.local.get(['eyesEnabled', 'eyesMood', 'eyesModel', 'eyesScale', 'eyesVishu', 'eyesWeatherEnabled', 'weatherData'], (result) => {
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
        if (result.eyesWeatherEnabled !== undefined) {
            weatherToggle.checked = result.eyesWeatherEnabled;
            if (result.eyesWeatherEnabled) {
                weatherInfo.style.display = 'block';
                updateWeatherInfo(result.weatherData);
            } else {
                weatherInfo.style.display = 'none';
            }
        } else {
            weatherInfo.style.display = 'none';
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

    weatherToggle.addEventListener('change', () => {
        const enabled = weatherToggle.checked;
        chrome.storage.local.set({ eyesWeatherEnabled: enabled });
        
        if (enabled) {
            weatherInfo.style.display = 'block';
            updateWeatherInfo(null);
            // Force fetch weather via background script
            chrome.runtime.sendMessage({ action: 'forceWeatherUpdate' });
        } else {
            weatherInfo.style.display = 'none';
        }
    });

    // Listen for weather updates while popup is open
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.weatherData && weatherToggle.checked) {
            updateWeatherInfo(changes.weatherData.newValue);
        }
    });
});
