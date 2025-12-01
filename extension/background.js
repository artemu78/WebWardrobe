// background.js
const API_BASE_URL = "https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod";

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  refreshContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  refreshContextMenu();
});

// Listen for refresh requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refreshContextMenu") {
    refreshContextMenu();
  }
});

function refreshContextMenu() {
  chrome.contextMenus.removeAll(() => {
    // Check auth
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
      if (chrome.runtime.lastError || !token) {
        // Not logged in, maybe show a generic "Login to use" item?
        chrome.contextMenus.create({
          id: "login-required",
          title: "Login to WebWardrobe to Try On",
          contexts: ["image"]
        });
        return;
      }

      // Fetch images
      fetch(`${API_BASE_URL}/user/images`, {
        headers: { 'Authorization': token }
      })
      .then(res => res.json())
      .then(data => {
        if (data.images && data.images.length > 0) {
          // Parent item
          chrome.contextMenus.create({
            id: "try-on-root",
            title: "Try On This Item",
            contexts: ["image"]
          });

          data.images.forEach(img => {
            chrome.contextMenus.create({
              id: `try-on-${img.id}`,
              parentId: "try-on-root",
              title: `With ${img.name}`,
              contexts: ["image"]
            });
          });
        } else {
            chrome.contextMenus.create({
                id: "no-images",
                title: "Upload a selfie to Try On",
                contexts: ["image"]
            });
        }
      })
      .catch(err => console.error("Failed to fetch images for menu", err));
    });
  });
}

// Handle Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith("try-on-") && info.menuItemId !== "try-on-root") {
    const selfieId = info.menuItemId.replace("try-on-", "");
    const itemUrl = info.srcUrl;
    
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (token) {
            // Inject content script dynamically
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Script injection failed: " + chrome.runtime.lastError.message);
                    // Optional: Notify user of failure
                } else {
                    startTryOnJob(itemUrl, selfieId, token, tab.id, tab.url);
                }
            });
        }
    });
  } else if (info.menuItemId === "login-required" || info.menuItemId === "no-images") {
      // Open popup or options?
      // We can't programmatically open popup. We can alert or notify.
       chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('logo.jpg'),
          title: 'WebWardrobe',
          message: 'Please open the extension popup to setup your profile.'
        });
  }
});

/**
 * Initiates a server try-on job for an item image using a specified selfie.
 *
 * Sends an authenticated request to create a try-on job for `itemUrl` with `selfieId`. On success it notifies the user, signals the content script to show a processing overlay, and begins polling job status. If the server reports insufficient credits it notifies the user and instructs the tab to show a top-up prompt. On other errors it notifies the user and instructs the tab to show an error state.
 *
 * @param {string} itemUrl - The URL of the item image to try on.
 * @param {string} selfieId - The identifier of the user's selfie to use for the try-on.
 * @param {string} token - Authorization token to include in the request Authorization header.
 * @param {number} tabId - The Chrome tab id where content-script messages and prompts should be sent.
 */
async function startTryOnJob(itemUrl, selfieId, token, tabId, siteUrl) {
  try {
    console.log("Starting try-on job...", { itemUrl, selfieId, siteUrl });
    
    const response = await fetch(`${API_BASE_URL}/try-on`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({ itemUrl, selfieId, siteUrl })
    });

    console.log("Response", response);
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Server Error:", errorData);

        if (response.status === 402 || errorData.code === 'INSUFFICIENT_CREDITS') {
             // Handle Insufficient Credits
             chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('logo.jpg'),
                title: 'Insufficient Credits',
                message: 'You need more credits to generate images.',
                requireInteraction: true
            });

            chrome.tabs.sendMessage(tabId, {
                action: "SHOW_TOPUP_PROMPT",
                originalUrl: itemUrl
            });
            return; // Stop execution
        }

        throw new Error(errorData.error || `Server Error: ${response.status}`);
    }

    const data = await response.json();
    const jobId = data.jobId;
    
    try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('logo.jpg'),
          title: 'Try-On Started',
          message: 'We are processing your request...'
        });
    } catch (e) { console.error("Notification error:", e); }

    // Notify content script to show overlay
    chrome.tabs.sendMessage(tabId, {
        action: "SHOW_PROCESSING",
        originalUrl: itemUrl
    });

    pollStatus(jobId, itemUrl, tabId);

  } catch (error) {
    console.error("Error starting job:", error);
    
    try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('logo.jpg'),
          title: 'Error',
          message: error.message || 'Failed to start try-on.',
          requireInteraction: true
        });
    } catch (e) { console.error("Notification error:", e); }

    chrome.tabs.sendMessage(tabId, {
        action: "SHOW_ERROR",
        originalUrl: itemUrl,
        error: error.message || "Failed to start try-on"
    });
  }
}

function pollStatus(jobId, originalUrl, tabId) {
  let attempts = 0;
  const maxAttempts = 100; // 300 seconds = 5 minutes

  const intervalId = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
        clearInterval(intervalId);
        console.error("Polling timed out");
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('logo.jpg'),
            title: 'Try-On Timed Out',
            message: 'The process took longer than 5 minutes. Please try again.'
        });
        
        chrome.tabs.sendMessage(tabId, {
            action: "SHOW_ERROR",
            originalUrl: originalUrl,
            error: "Timeout: Process took >5m. Please try again."
        });
        return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/status/${jobId}`);
      if (!response.ok) return; // Wait for next poll

      const data = await response.json();
      if (data.status === 'COMPLETED') {
        clearInterval(intervalId);
        
        // Send message to content script to replace image
        chrome.tabs.sendMessage(tabId, {
            action: "REPLACE_IMAGE",
            originalUrl: originalUrl,
            resultUrl: data.resultUrl
        });
        
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('logo.jpg'),
            title: 'Try-On Complete!',
            message: 'The image has been updated.'
        });

      } else if (data.status === 'FAILED') {
        clearInterval(intervalId);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('logo.jpg'),
            title: 'Try-On Failed',
            message: data.error || 'Something went wrong.',
            requireInteraction: true
        });
        
        chrome.tabs.sendMessage(tabId, {
            action: "SHOW_ERROR",
            originalUrl: originalUrl,
            error: data.error || "Try-On Failed"
        });
      }
    } catch (e) {
      console.error("Polling error", e);
    }
  }, 3000);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    startTryOnJob,
    pollStatus,
    refreshContextMenu,
    API_BASE_URL
  };
}