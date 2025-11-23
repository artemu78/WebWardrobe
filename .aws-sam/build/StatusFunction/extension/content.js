// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "REPLACE_IMAGE") {
    const { originalUrl, resultUrl } = request;
    
    // Find all images with the matching src
    const images = document.querySelectorAll('img');
    for (let img of images) {
      if (img.src === originalUrl) {
        img.src = resultUrl;
        // Optional: Add a border or effect to show it changed
        img.style.border = "2px solid #4285f4";
        img.style.transition = "opacity 0.5s";
        img.style.opacity = "0.5";
        setTimeout(() => img.style.opacity = "1", 100);
      }
    }
  }
});
