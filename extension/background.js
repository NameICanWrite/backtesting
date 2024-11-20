chrome.commands.onCommand.addListener((command) => {
    if (command === "send_data") {
        // Check if the extension is active before performing any action
        chrome.storage.local.get(['isActive'], (result) => {
            const isActive = result.isActive ?? false; // Default to false if not set

            if (isActive) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0) {
                        // Step 1: Click the download button
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            func: clickDownloadButton
                        }, () => {
                            // Step 2: Wait for the file to start downloading
                            chrome.downloads.onChanged.addListener(monitorDownload);
                        });
                    }
                });
            } else {
                console.log("Extension is deactivated. Skipping command execution.");
            }
        });
    }
});

// Existing code for clickDownloadButton, monitorDownload, and uploadFileToServer remains unchanged
