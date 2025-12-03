window.addEventListener("message", (event) => {
    // We only accept messages from ourselves
    if (event.source != window) return;

    if (event.data.type && (event.data.type == "PAYMENT_SUCCESS")) {
        chrome.runtime.sendMessage({ type: "PAYMENT_SUCCESS" });
    }
});
