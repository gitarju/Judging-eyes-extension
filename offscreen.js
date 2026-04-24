chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getGeolocation') {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                sendResponse({
                    success: true,
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                });
            },
            (error) => {
                sendResponse({
                    success: false,
                    error: error.message
                });
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000 // Accept a cached position up to 1 minute old
            }
        );
        return true; // Keep message channel open for async response
    }
});
