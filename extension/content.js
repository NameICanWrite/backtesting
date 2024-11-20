chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extract_data") {
        chrome.storage.local.get(['isActive'], (result) => {
            const isActive = result.isActive ?? true; // Default to active if not set

            if (!isActive) {
                console.log("Extension is turned off. Action aborted.");
                return; // Do nothing if the extension is off
            }

            const data = extractTradingDataFromPage();
            chrome.storage.local.set({ tradingData: data }, () => {
                console.log("Data extracted and stored locally");
            });
        });
    }
});

function extractTradingDataFromPage() {
    // Replace this selector to adapt to the TradingView HTML structure.
    const trades = document.querySelectorAll(".tv-trading-data-row");
    let tradingData = [];

    trades.forEach(trade => {
        const type = trade.querySelector(".tv-type")?.innerText;
        const price = trade.querySelector(".tv-price")?.innerText;
        const date = trade.querySelector(".tv-date")?.innerText;

        tradingData.push({ type, price, date });
    });

    return tradingData;
}
