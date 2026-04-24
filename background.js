const WEATHER_ALARM_NAME = 'fetch_weather_alarm';

chrome.runtime.onInstalled.addListener(() => {
    // Initialize default storage
    chrome.storage.local.get(['eyesWeatherEnabled', 'weatherData'], (res) => {
        if (res.eyesWeatherEnabled === undefined) {
            chrome.storage.local.set({ eyesWeatherEnabled: false });
        }
        if (res.weatherData === undefined) {
            chrome.storage.local.set({ weatherData: null });
        }
    });

    // Fetch weather immediately on install
    fetchWeather();

    // Set alarm to fetch weather every 30 minutes
    chrome.alarms.create(WEATHER_ALARM_NAME, { periodInMinutes: 30 });
});

chrome.runtime.onStartup.addListener(() => {
    fetchWeather();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WEATHER_ALARM_NAME) {
        fetchWeather();
    }
});

// Allow forcing a weather update via message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'forceWeatherUpdate') {
        fetchWeather().then(() => sendResponse({ success: true }));
        return true; // async response
    }
});

async function getLocation() {
    try {
        // 1. Create offscreen document if it doesn't exist
        const OFFSCREEN_URL = 'offscreen.html';
        
        // In MV3, we use chrome.offscreen
        if (chrome.offscreen) {
            const hasDocument = await chrome.offscreen.hasDocument();
            if (!hasDocument) {
                await chrome.offscreen.createDocument({
                    url: OFFSCREEN_URL,
                    reasons: ['GEOLOCATION'],
                    justification: 'Get precise user location for weather reactions'
                });
            }

            // 2. Request geolocation from offscreen document
            const geoResponse = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'getGeolocation' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (!response || !response.success) {
                        reject(new Error(response ? response.error : 'Unknown error'));
                    } else {
                        resolve(response);
                    }
                });
            });

            // 3. Close the offscreen document after use
            await chrome.offscreen.closeDocument();

            return {
                lat: geoResponse.lat,
                lon: geoResponse.lon,
                city: 'Precise Location'
            };
        } else {
            throw new Error("chrome.offscreen API not available");
        }
    } catch (err) {
        console.warn('Precise geolocation failed/denied, falling back to IP:', err.message);
        
        // 4. Fallback to IP Geolocation
        const geoResponse = await fetch('https://get.geojs.io/v1/ip/geo.json');
        if (!geoResponse.ok) throw new Error('Failed to fetch IP location');
        const geoData = await geoResponse.json();
        
        return {
            lat: geoData.latitude,
            lon: geoData.longitude,
            city: geoData.city || 'Unknown Location'
        };
    }
}

async function fetchWeather() {
    try {
        // 1. Get Location
        const loc = await getLocation();
        const lat = loc.lat;
        const lon = loc.lon;
        const city = loc.city;

        // 2. Get Weather
        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if (!weatherResponse.ok) throw new Error('Failed to fetch weather');
        const weatherData = await weatherResponse.json();

        const current = weatherData.current_weather;
        const temp = current.temperature;
        const code = current.weathercode;

        // 3. Determine Weather State
        // WMO Weather interpretation codes:
        // 0: Clear sky
        // 1, 2, 3: Mainly clear, partly cloudy, and overcast
        // 45, 48: Fog and depositing rime fog
        // 51, 53, 55: Drizzle: Light, moderate, and dense intensity
        // 56, 57: Freezing Drizzle: Light and dense intensity
        // 61, 63, 65: Rain: Slight, moderate and heavy intensity
        // 66, 67: Freezing Rain: Light and heavy intensity
        // 71, 73, 75: Snow fall: Slight, moderate, and heavy intensity
        // 77: Snow grains
        // 80, 81, 82: Rain showers: Slight, moderate, and violent
        // 85, 86: Snow showers slight and heavy
        // 95: Thunderstorm: Slight or moderate
        // 96, 99: Thunderstorm with slight and heavy hail
        
        let type = 'clear';
        let desc = 'Clear';

        if ([95, 96, 99].includes(code)) {
            type = 'storm';
            desc = 'Storm';
        } else if ([71, 73, 75, 77, 85, 86].includes(code)) {
            type = 'snow';
            desc = 'Snowing';
        } else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
            type = 'rain';
            desc = 'Raining';
        } else if ([45, 48].includes(code)) {
            type = 'cloudy';
            desc = 'Foggy';
        } else if ([1, 2, 3].includes(code)) {
            type = 'cloudy';
            desc = 'Cloudy';
        }

        // Overwrite type based on extreme temperature if it's not currently precipitating
        if (temp >= 30) {
            type = 'hot';
            desc = type === 'clear' || type === 'cloudy' ? 'Hot' : desc + ' (Hot)';
        } else if (temp <= 10 && type !== 'snow') {
            type = 'cold';
            desc = desc === 'Clear' ? 'Cold' : desc + ' (Cold)';
        }

        const parsedWeather = {
            type: type,
            temp: temp,
            desc: desc,
            city: city,
            timestamp: Date.now()
        };

        // 4. Save to storage
        await chrome.storage.local.set({ weatherData: parsedWeather });
        console.log('Weather updated successfully:', parsedWeather);

    } catch (error) {
        console.error('Error fetching weather:', error);
    }
}
