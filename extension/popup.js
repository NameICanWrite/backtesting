document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleButton');
    const statusMessage = document.getElementById('statusMessage');

    // Get the current activation status from local storage
    chrome.storage.local.get(['isActive'], (result) => {
        const isActive = result.isActive ?? false; // Default to false if not set
        updateUI(isActive);
    });

    // Update UI based on the current status
    function updateUI(isActive) {
        if (isActive) {
            toggleButton.textContent = "Deactivate";
            statusMessage.textContent = "Status: Active";
        } else {
            toggleButton.textContent = "Activate";
            statusMessage.textContent = "Status: Inactive";
        }

        // Set the button's click handler based on the current status
        toggleButton.onclick = () => {
            const newStatus = !isActive;
            chrome.storage.local.set({ isActive: newStatus }, () => {
                updateUI(newStatus);
                console.log(newStatus ? "Extension activated" : "Extension deactivated");
            });
        };
    }
});
