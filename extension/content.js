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

      } else if (action === "SHOW_TOPUP_PROMPT") {
         // Remove previous overlay if exists
         const oldOverlay = img.parentElement.querySelector(`div[id="webwardrobe-overlay-${originalUrl}"]`);
         if (oldOverlay) oldOverlay.remove();

         const wrapper = document.createElement('div');
         if (img.parentElement.tagName !== 'DIV' || img.parentElement.style.position !== 'relative') {
             // Only wrap if not already wrapped or suitably positioned (simplified check)
             // Actually, we should probably check if we already wrapped it in SHOW_PROCESSING.
             // If SHOW_PROCESSING wasn't called (unlikely but possible if fast fail), we might need to wrap.
             // But usually background calls SHOW_PROCESSING first? No, dispatcher checks credits first.
             // So SHOW_PROCESSING might not have been called yet if we failed fast.
             // So we need to ensure wrapper.
             if (img.parentNode.style.position !== 'relative') {
                const w = document.createElement('div');
                w.style.position = 'relative';
                w.style.display = 'inline-block';
                img.parentNode.insertBefore(w, img);
                w.appendChild(img);
             }
         }

         const overlay = document.createElement('div');
         overlay.id = `webwardrobe-overlay-${originalUrl}`;
         overlay.style.position = 'absolute';
         overlay.style.top = '0';
         overlay.style.left = '0';
         overlay.style.width = '100%';
         overlay.style.height = '100%';
         overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
         overlay.style.color = 'white';
         overlay.style.display = 'flex';
         overlay.style.flexDirection = 'column';
         overlay.style.justifyContent = 'center';
         overlay.style.alignItems = 'center';
         overlay.style.fontSize = '14px';
         overlay.style.zIndex = '1000';
         overlay.style.padding = '10px';
         overlay.style.textAlign = 'center';

         const msg = document.createElement('div');
         msg.innerText = "Insufficient Credits";
         msg.style.fontWeight = 'bold';
         msg.style.marginBottom = '10px';
         overlay.appendChild(msg);

         const btn = document.createElement('button');
         btn.innerText = "Top Up Credits";
         btn.style.backgroundColor = '#4285f4';
         btn.style.color = 'white';
         btn.style.border = 'none';
         btn.style.padding = '8px 16px';
         btn.style.borderRadius = '4px';
         btn.style.cursor = 'pointer';
         btn.onclick = (e) => {
             e.stopPropagation();
             alert("Top-up functionality coming soon!");
             overlay.remove();
         };
         overlay.appendChild(btn);

         const close = document.createElement('div');
         close.innerText = "Cancel";
         close.style.fontSize = "12px";
         close.style.marginTop = "10px";
         close.style.cursor = "pointer";
         close.style.textDecoration = "underline";
         close.onclick = (e) => {
             e.stopPropagation();
             overlay.remove();
         }
         overlay.appendChild(close);

         // Append to the wrapper (which is img's parent now)
         img.parentNode.appendChild(overlay);
      }
    }
  }
});
