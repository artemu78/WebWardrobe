// content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, originalUrl, resultUrl, error } = request;

  // Find all images with the matching src
  const images = document.querySelectorAll('img');
  
  for (let img of images) {
    if (img.src === originalUrl) {
      
      if (action === "SHOW_PROCESSING") {
        // Add overlay
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);

        const overlay = document.createElement('div');
        overlay.id = `webwardrobe-overlay-${originalUrl}`;
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.color = 'white';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.fontSize = '16px';
        overlay.style.fontWeight = 'bold';
        overlay.style.zIndex = '1000';
        overlay.style.padding = '10px';
        overlay.style.textAlign = 'center';
        overlay.style.wordBreak = 'break-word';
        overlay.style.overflowY = 'auto';
        overlay.innerText = 'Processing Try-On...';
        
        wrapper.appendChild(overlay);

      } else if (action === "REPLACE_IMAGE") {
        // Remove overlay if exists
        const overlay = img.parentElement.querySelector(`div[id="webwardrobe-overlay-${originalUrl}"]`);
        if (overlay) overlay.remove();

        img.src = resultUrl;
        img.style.border = "2px solid #4285f4";
        img.style.transition = "opacity 0.5s";
        img.style.opacity = "0.5";
        setTimeout(() => img.style.opacity = "1", 100);

      } else if (action === "SHOW_ERROR") {
         // Update overlay to show error
         // Use getElementById for robustness
         const overlay = document.getElementById(`webwardrobe-overlay-${originalUrl}`);
         
         if (overlay) {
             overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.9)'; // Darker red
             overlay.innerText = (error || 'Try-On Failed') + '\n(Click to dismiss)';
             overlay.style.cursor = 'pointer';
             overlay.title = "Click to dismiss";
             
             // Make it persistent (remove auto-hide)
             overlay.onclick = () => overlay.remove();
         } else {
             // Fallback if overlay not found (e.g. image removed or ID mismatch)
             alert(`WebWardrobe Error: ${error}`);
         }
      }
    }
  }
});
