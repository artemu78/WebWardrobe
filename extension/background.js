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
            startTryOnJob(itemUrl, selfieId, token, tab.id);
        }
    });
  } else if (info.menuItemId === "login-required" || info.menuItemId === "no-images") {
      // Open popup or options?
      // We can't programmatically open popup. We can alert or notify.
       chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'WebWardrobe',
          message: 'Please open the extension popup to setup your profile.'
        });
  }
});

async function startTryOnJob(itemUrl, selfieId, token, tabId) {
  try {
    console.log("Starting try-on job...");
    
    const response = await fetch(`${API_BASE_URL}/try-on`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify({ itemUrl, selfieId })
    });

    if (!response.ok) throw new Error("Failed to start job");

    const data = await response.json();
    const jobId = data.jobId;
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Try-On Started',
      message: 'We are processing your request...'
    });

    pollStatus(jobId, itemUrl, tabId);

  } catch (error) {
    console.error("Error starting job:", error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Error',
      message: 'Failed to start try-on.'
    });
  }
}

function pollStatus(jobId, originalUrl, tabId) {
  const intervalId = setInterval(async () => {
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
            iconUrl: 'icon.png',
            title: 'Try-On Complete!',
            message: 'The image has been updated.'
        });

      } else if (data.status === 'FAILED') {
        clearInterval(intervalId);
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Try-On Failed',
            message: 'Something went wrong.'
        });
      }
    } catch (e) {
      console.error("Polling error", e);
    }
  }, 3000);
}
